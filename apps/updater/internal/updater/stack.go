package updater

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	outputTailBytes   = 2000
	readyPollInterval = 2 * time.Second
	readyProbeTimeout = 5 * time.Second
)

type Stack struct {
	Dir string
}

func tail(output []byte) string {
	text := strings.TrimSpace(string(output))
	if len(text) > outputTailBytes {
		text = "…" + text[len(text)-outputTailBytes:]
	}
	return text
}

func run(ctx context.Context, env map[string]string, args ...string) error {
	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Env = os.Environ()
	for key, value := range env {
		cmd.Env = append(cmd.Env, key+"="+value)
	}
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker %s: %w\n%s", strings.Join(args, " "), err, tail(output))
	}
	return nil
}

func (stack Stack) compose(ctx context.Context, env map[string]string, args ...string) error {
	base := []string{
		"compose",
		"--project-directory", stack.Dir,
		"-f", filepath.Join(stack.Dir, "compose.yml"),
		"--env-file", filepath.Join(stack.Dir, ".env"),
	}
	return run(ctx, env, append(base, args...)...)
}

func (stack Stack) Pull(ctx context.Context, images Images) error {
	for _, image := range []string{images.App, images.Preflight} {
		if err := run(ctx, nil, "pull", "--quiet", image); err != nil {
			return err
		}
	}
	return nil
}

func (stack Stack) Preflight(ctx context.Context, images Images) error {
	return stack.compose(ctx, images.Env(), "run", "--rm", "--no-deps", "preflight")
}

func (stack Stack) Switch(ctx context.Context) error {
	if err := stack.compose(ctx, nil, "up", "--no-start", "--no-deps", "preflight"); err != nil {
		return err
	}
	return stack.compose(ctx, nil, "up", "-d", "--no-deps", "app")
}

func (stack Stack) StopApp(ctx context.Context) error {
	return stack.compose(ctx, nil, "stop", "app")
}

func (stack Stack) StartApp(ctx context.Context) error {
	return stack.compose(ctx, nil, "up", "-d", "--no-deps", "app")
}

var sqldProfile = map[string]string{"COMPOSE_PROFILES": "sqld"}

func (stack Stack) stopSqld(ctx context.Context) error {
	return stack.compose(ctx, sqldProfile, "stop", "sqld")
}

func (stack Stack) StartSqld(ctx context.Context) error {
	return stack.compose(ctx, sqldProfile, "up", "-d", "--wait", "--no-deps", "sqld")
}

func (stack Stack) SnapshotDir() string {
	return filepath.Join(stack.Dir, ".updater-snapshot")
}

func (stack Stack) sqldShell(ctx context.Context, script string) error {
	if err := os.MkdirAll(stack.SnapshotDir(), 0o700); err != nil {
		return err
	}
	return stack.compose(ctx, sqldProfile,
		"run", "--rm", "--no-deps", "--user", "0:0", "--entrypoint", "/bin/bash",
		"-v", stack.SnapshotDir()+":/snapshot",
		"sqld", "-c", "set -euo pipefail; "+script,
	)
}

func (stack Stack) SaveSnapshot(ctx context.Context, name string) error {
	if err := stack.stopSqld(ctx); err != nil {
		return err
	}
	err := stack.sqldShell(ctx, fmt.Sprintf(
		"rm -rf /snapshot/%[1]s; mkdir /snapshot/%[1]s; cp -a /var/lib/sqld/. /snapshot/%[1]s/", name,
	))
	if startErr := stack.StartSqld(ctx); err == nil {
		err = startErr
	}
	return err
}

func (stack Stack) RestoreSnapshot(ctx context.Context, name string) error {
	if err := stack.stopSqld(ctx); err != nil {
		return err
	}
	if err := stack.sqldShell(ctx, fmt.Sprintf(
		"test -d /snapshot/%[1]s; shopt -s dotglob; rm -rf /var/lib/sqld/*; cp -a /snapshot/%[1]s/. /var/lib/sqld/", name,
	)); err != nil {
		return err
	}
	return stack.StartSqld(ctx)
}

func (stack Stack) HasSnapshot(name string) bool {
	info, err := os.Stat(filepath.Join(stack.SnapshotDir(), name))
	return err == nil && info.IsDir()
}

func (stack Stack) PromoteSnapshot(from, to string) error {
	target := filepath.Join(stack.SnapshotDir(), to)
	if err := os.RemoveAll(target); err != nil {
		return err
	}
	return os.Rename(filepath.Join(stack.SnapshotDir(), from), target)
}

func (stack Stack) DropSnapshot(name string) error {
	return os.RemoveAll(filepath.Join(stack.SnapshotDir(), name))
}

func WaitReady(ctx context.Context, url string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: readyProbeTimeout}
	last := "no answer yet"
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return err
		}
		res, err := client.Do(req)
		if err == nil {
			_ = res.Body.Close()
			if res.StatusCode == http.StatusOK {
				return nil
			}
			last = fmt.Sprintf("answered %d", res.StatusCode)
		} else {
			last = err.Error()
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("%s was not ready within %s (last: %s)", url, timeout, last)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(readyPollInterval):
		}
	}
}
