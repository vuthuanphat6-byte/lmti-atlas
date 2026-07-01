package gitcheck

import (
	"bytes"
	"context"
	"os/exec"
	"strings"
)

type Client struct {
	Root string
}

func (client Client) Run(ctx context.Context, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = client.Root
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	output := strings.TrimSpace(stdout.String())
	if output == "" {
		output = strings.TrimSpace(stderr.String())
	}
	return output, err
}

func (client Client) RootPath(ctx context.Context) (string, error) {
	return client.Run(ctx, "rev-parse", "--show-toplevel")
}

func (client Client) Origin(ctx context.Context) (string, error) {
	return client.Run(ctx, "remote", "get-url", "origin")
}

func (client Client) Branch(ctx context.Context) (string, error) {
	return client.Run(ctx, "branch", "--show-current")
}

func (client Client) StatusPorcelain(ctx context.Context) (string, error) {
	return client.Run(ctx, "status", "--porcelain")
}

func (client Client) MergeBase(ctx context.Context, target string) (string, error) {
	return client.Run(ctx, "merge-base", "HEAD", target)
}

func (client Client) AheadBehind(ctx context.Context, target string) (string, error) {
	return client.Run(ctx, "rev-list", "--left-right", "--count", "HEAD..."+target)
}

func (client Client) TrackedFiles(ctx context.Context) (string, error) {
	return client.Run(ctx, "ls-files")
}
