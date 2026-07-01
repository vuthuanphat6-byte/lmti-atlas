package app

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunThothRouteJSON(t *testing.T) {
	withProjectRoot(t)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exit := Run([]string{"thoth", "route", "publish repo open source", "--json"}, &stdout, &stderr)
	if exit != 0 {
		t.Fatalf("exit %d stderr %s", exit, stderr.String())
	}
	var envelope struct {
		SchemaVersion string `json:"schemaVersion"`
		Command       string `json:"command"`
		Status        string `json:"status"`
		Data          struct {
			SelectedSkill struct {
				ID string `json:"id"`
			} `json:"selectedSkill"`
		} `json:"data"`
	}
	if err := json.Unmarshal(stdout.Bytes(), &envelope); err != nil {
		t.Fatalf("invalid json: %v\n%s", err, stdout.String())
	}
	if envelope.SchemaVersion != "lmti.thoth.v1" {
		t.Fatalf("schema %s, want lmti.thoth.v1", envelope.SchemaVersion)
	}
	if envelope.Command != "lmti.thoth.route" {
		t.Fatalf("command %s, want lmti.thoth.route", envelope.Command)
	}
	if envelope.Data.SelectedSkill.ID != "publish-preflight" {
		t.Fatalf("selected %s, want publish-preflight", envelope.Data.SelectedSkill.ID)
	}
}

func TestRunSkillListAlias(t *testing.T) {
	withProjectRoot(t)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exit := Run([]string{"skill", "list"}, &stdout, &stderr)
	if exit != 0 {
		t.Fatalf("exit %d stderr %s", exit, stderr.String())
	}
	if !strings.Contains(stdout.String(), "publish-preflight") {
		t.Fatal("skill list alias did not print registered skills")
	}
}

func withProjectRoot(t *testing.T) {
	t.Helper()
	old, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("project root: %v", err)
	}
	if err := os.Chdir(root); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(old)
	})
}

