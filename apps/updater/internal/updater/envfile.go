package updater

import (
	"fmt"
	"maps"
	"os"
	"slices"
	"strings"
)

type EnvFile struct {
	Path string
}

func (file EnvFile) Read() (map[string]string, error) {
	data, err := os.ReadFile(file.Path)
	if err != nil {
		return nil, err
	}
	values := map[string]string{}
	for line := range strings.SplitSeq(string(data), "\n") {
		key, value, ok := strings.Cut(line, "=")
		if !ok || strings.HasPrefix(strings.TrimSpace(key), "#") {
			continue
		}
		values[strings.TrimSpace(key)] = value
	}
	return values, nil
}

func (file EnvFile) Set(values map[string]string) error {
	info, err := os.Stat(file.Path)
	if err != nil {
		return err
	}
	data, err := os.ReadFile(file.Path)
	if err != nil {
		return err
	}

	written := map[string]bool{}
	lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
	out := make([]string, 0, len(lines)+len(values))
	for _, line := range lines {
		raw, _, ok := strings.Cut(line, "=")
		key := strings.TrimSpace(raw)
		value, managed := values[key]
		if !ok || !managed {
			out = append(out, line)
			continue
		}
		if value != "" && !written[key] {
			out = append(out, key+"="+value)
		}
		written[key] = true
	}
	for _, key := range slices.Sorted(maps.Keys(values)) {
		if value := values[key]; value != "" && !written[key] {
			out = append(out, key+"="+value)
		}
	}

	tmp := file.Path + ".updater-tmp"
	if err := os.WriteFile(tmp, []byte(strings.Join(out, "\n")+"\n"), info.Mode().Perm()); err != nil {
		return err
	}
	if err := os.Rename(tmp, file.Path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("replacing %s: %w", file.Path, err)
	}
	return nil
}
