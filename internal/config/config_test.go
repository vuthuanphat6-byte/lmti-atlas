package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEnsureWritesTOMLConfig(t *testing.T) {
	root := t.TempDir()
	cfg, created, err := Ensure(root)
	if err != nil {
		t.Fatalf("Ensure returned error: %v", err)
	}
	if !created {
		t.Fatal("expected config to be created")
	}
	if cfg.Project.Author != "Edgar Vu - Cyno Software" {
		t.Fatalf("author %q", cfg.Project.Author)
	}
	content, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(DefaultPath)))
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	if string(content) == "" || cfg.Thoth.Registry != "skills/registry.toml" {
		t.Fatal("config did not include Thoth defaults")
	}
}

func TestLoadTOMLConfig(t *testing.T) {
	root := t.TempDir()
	if _, _, err := Ensure(root); err != nil {
		t.Fatalf("Ensure returned error: %v", err)
	}
	cfg, err := Load(root)
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.Storage.Engine != "sqlite" {
		t.Fatalf("storage engine %q", cfg.Storage.Engine)
	}
	if !cfg.Privacy.BlockSecret || !cfg.Privacy.BlockDoNotPrompt {
		t.Fatal("privacy blocking defaults were not loaded")
	}
}

