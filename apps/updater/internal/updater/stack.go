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
