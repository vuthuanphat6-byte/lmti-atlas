package thoth

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRegistryLoadsProjectSkills(t *testing.T) {
	registry, err := LoadRegistry(projectRoot(t))
	if err != nil {
		t.Fatalf("LoadRegistry returned error: %v", err)
	}
	if len(registry.Skills) < 8 {
		t.Fatalf("expected at least 8 skills, got %d", len(registry.Skills))
	}
	if _, ok := FindSkill(registry, "publish-preflight"); !ok {
		t.Fatal("publish-preflight skill was not registered")
	}
}

func TestRouterRoutesCoreSkills(t *testing.T) {
	registry, err := LoadRegistry(projectRoot(t))
	if err != nil {
		t.Fatalf("LoadRegistry returned error: %v", err)
	}
	router := NewRouter(registry)
	tests := []struct {
		name    string
		request string
		want    string
	}{
		{name: "publish", request: "publish repo to open source GitHub", want: "publish-preflight"},
		{name: "cleanup", request: "clean unused code and refactor lightly", want: "repo-cleanup"},
		{name: "security", request: "check .env secret leak before commit", want: "security-check"},
		{name: "migration", request: "migrate JSON memory to SQLite", want: "migration-from-json"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			outcome := router.Route(test.request)
			if outcome.Result.SelectedSkill == nil {
				t.Fatalf("expected selected skill for %q", test.request)
			}
			if outcome.Result.SelectedSkill.ID != test.want {
				t.Fatalf("selected %s, want %s", outcome.Result.SelectedSkill.ID, test.want)
			}
		})
	}
}

func TestRouterPrioritizesHighRiskSafety(t *testing.T) {
	registry, err := LoadRegistry(projectRoot(t))
	if err != nil {
		t.Fatalf("LoadRegistry returned error: %v", err)
	}
	outcome := NewRouter(registry).Route("publish repo and clean .env token before release")
	if outcome.Result.SelectedSkill == nil {
		t.Fatal("expected selected skill")
	}
	if outcome.Result.SelectedSkill.ID != "security-check" {
		t.Fatalf("selected %s, want security-check", outcome.Result.SelectedSkill.ID)
	}
	if outcome.Result.Decision != DecisionMultipleCandidates {
		t.Fatalf("decision %s, want %s", outcome.Result.Decision, DecisionMultipleCandidates)
	}
	if len(outcome.Warnings) == 0 {
		t.Fatal("expected multiple candidate warning")
	}
}

func TestRouterUnknownRequest(t *testing.T) {
	registry, err := LoadRegistry(projectRoot(t))
	if err != nil {
		t.Fatalf("LoadRegistry returned error: %v", err)
	}
	outcome := NewRouter(registry).Route("make the sidebar sparkle")
	if outcome.Result.Decision != DecisionNoSkillFound {
		t.Fatalf("decision %s, want %s", outcome.Result.Decision, DecisionNoSkillFound)
	}
	if outcome.Result.SelectedSkill != nil {
		t.Fatal("unknown request should not select a skill")
	}
}

func TestLoadSkillOnlyReturnsRequestedSkill(t *testing.T) {
	root := t.TempDir()
	writeFile(t, root, "skills/registry.toml", `[[skills]]
id = "one"
name = "One"
file = "skills/one/skill.md"
intents = ["docs"]
requires_policy = false
requires_memory = false
risk_level = "low"

[[skills]]
id = "two"
name = "Two"
file = "skills/two/skill.md"
intents = ["publish"]
requires_policy = true
requires_memory = false
risk_level = "high"
`)
	writeFile(t, root, "skills/one/skill.md", validSkill("One"))
	writeFile(t, root, "skills/two/skill.md", validSkill("Two"))
	registry, err := LoadRegistry(root)
	if err != nil {
		t.Fatalf("LoadRegistry returned error: %v", err)
	}
	content, _, errors := LoadSkill(root, registry, "one")
	if len(errors) > 0 {
		t.Fatalf("LoadSkill returned errors: %#v", errors)
	}
	if !strings.Contains(content.Content, "# Skill: One") {
		t.Fatal("requested skill content was not returned")
	}
	if strings.Contains(content.Content, "# Skill: Two") {
		t.Fatal("loader returned another skill content")
	}
}

func TestValidateDetectsMissingSectionAndMissingFile(t *testing.T) {
	root := t.TempDir()
	writeFile(t, root, "schemas/lmti.thoth.schema.json", "{}")
	writeFile(t, root, "schemas/lmti.skill.schema.json", "{}")
	writeFile(t, root, "schemas/lmti.cli.schema.json", "{}")
	writeFile(t, root, "skills/registry.toml", `[[skills]]
id = "broken"
name = "Broken"
file = "skills/broken/skill.md"
intents = ["docs"]
requires_policy = false
requires_memory = false
risk_level = "low"

[[skills]]
id = "missing"
name = "Missing"
file = "skills/missing/skill.md"
intents = ["publish"]
requires_policy = true
requires_memory = false
risk_level = "high"
`)
	writeFile(t, root, "skills/broken/skill.md", "# Skill: Broken\n\n## Purpose\nOnly purpose is present.\n")
	report := Validate(root)
	if report.Result != "ERROR" {
		t.Fatalf("result %s, want ERROR", report.Result)
	}
	if !reportHasStatus(report, "Required sections", "WARN") {
		t.Fatal("expected required sections warning")
	}
	if !reportHasStatus(report, "Skill files", "ERROR") {
		t.Fatal("expected missing skill file error")
	}
}

func projectRoot(t *testing.T) string {
	t.Helper()
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("project root: %v", err)
	}
	return root
}

func writeFile(t *testing.T, root string, relative string, content string) {
	t.Helper()
	path := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write file: %v", err)
	}
}

func validSkill(name string) string {
	return "# Skill: " + name + `

## Purpose
Purpose text.

## When to use
When text.

## Inputs needed
Input text.

## Required commands
Command text.

## Safety rules
Safety text.

## Block conditions
Block text.

## Output expected
Output text.

## Notes
Notes text.
`
}

func reportHasStatus(report ValidationReport, check string, status string) bool {
	for _, item := range report.Checks {
		if item.Check == check && item.Status == status {
			return true
		}
	}
	return false
}
