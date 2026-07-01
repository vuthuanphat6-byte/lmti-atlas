package thoth

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const DefaultRegistryPath = "skills/registry.toml"

func LoadRegistry(root string) (Registry, error) {
	if root == "" {
		root = "."
	}
	path, err := safeJoin(root, DefaultRegistryPath)
	if err != nil {
		return Registry{}, err
	}
	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return Registry{}, fmt.Errorf("%s: %s not found", ErrRegistryMissing, DefaultRegistryPath)
		}
		return Registry{}, err
	}
	skills, err := parseRegistry(string(content))
	if err != nil {
		return Registry{}, err
	}
	return Registry{Path: DefaultRegistryPath, Skills: skills}, nil
}

func FindSkill(registry Registry, id string) (Skill, bool) {
	for _, skill := range registry.Skills {
		if skill.ID == id {
			return skill, true
		}
	}
	return Skill{}, false
}

func parseRegistry(content string) ([]Skill, error) {
	var skills []Skill
	var current *Skill
	lines := strings.Split(content, "\n")
	for lineNumber, raw := range lines {
		line := stripTOMLComment(strings.TrimSpace(raw))
		if line == "" {
			continue
		}
		if line == "[[skills]]" {
			if current != nil {
				skills = append(skills, *current)
			}
			current = &Skill{}
			continue
		}
		if current == nil {
			return nil, fmt.Errorf("%s: entry outside [[skills]] at line %d", ErrSkillInvalid, lineNumber+1)
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			return nil, fmt.Errorf("%s: invalid registry line %d", ErrSkillInvalid, lineNumber+1)
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		var err error
		switch key {
		case "id":
			current.ID, err = parseTOMLString(value)
		case "name":
			current.Name, err = parseTOMLString(value)
		case "description":
			current.Description, err = parseTOMLString(value)
		case "file":
			current.File, err = parseTOMLString(value)
		case "intents":
			current.Intents, err = parseTOMLStringArray(value)
		case "requires_policy":
			current.RequiresPolicy, err = parseTOMLBool(value)
		case "requires_memory":
			current.RequiresMemory, err = parseTOMLBool(value)
		case "risk_level":
			current.RiskLevel, err = parseTOMLString(value)
		default:
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("%s: %s at line %d", ErrSkillInvalid, err.Error(), lineNumber+1)
		}
	}
	if current != nil {
		skills = append(skills, *current)
	}
	if len(skills) == 0 {
		return nil, fmt.Errorf("%s: no skills registered", ErrSkillInvalid)
	}
	for _, skill := range skills {
		if skill.ID == "" || skill.Name == "" || skill.File == "" || len(skill.Intents) == 0 || skill.RiskLevel == "" {
			return nil, fmt.Errorf("%s: every skill requires id, name, file, intents, and risk_level", ErrSkillInvalid)
		}
	}
	return skills, nil
}

func stripTOMLComment(line string) string {
	inString := false
	escaped := false
	for index, char := range line {
		switch {
		case escaped:
			escaped = false
		case char == '\\':
			escaped = true
		case char == '"':
			inString = !inString
		case char == '#' && !inString:
			return strings.TrimSpace(line[:index])
		}
	}
	return strings.TrimSpace(line)
}

func parseTOMLString(value string) (string, error) {
	value = strings.TrimSpace(value)
	if len(value) < 2 || value[0] != '"' || value[len(value)-1] != '"' {
		return "", fmt.Errorf("expected quoted string")
	}
	inner := value[1 : len(value)-1]
	inner = strings.ReplaceAll(inner, `\"`, `"`)
	inner = strings.ReplaceAll(inner, `\\`, `\`)
	return inner, nil
}

func parseTOMLStringArray(value string) ([]string, error) {
	value = strings.TrimSpace(value)
	if len(value) < 2 || value[0] != '[' || value[len(value)-1] != ']' {
		return nil, fmt.Errorf("expected string array")
	}
	inner := strings.TrimSpace(value[1 : len(value)-1])
	if inner == "" {
		return []string{}, nil
	}
	parts := splitTOMLArray(inner)
	items := make([]string, 0, len(parts))
	for _, part := range parts {
		item, err := parseTOMLString(strings.TrimSpace(part))
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func splitTOMLArray(value string) []string {
	var parts []string
	start := 0
	inString := false
	escaped := false
	for index, char := range value {
		switch {
		case escaped:
			escaped = false
		case char == '\\':
			escaped = true
		case char == '"':
			inString = !inString
		case char == ',' && !inString:
			parts = append(parts, value[start:index])
			start = index + 1
		}
	}
	parts = append(parts, value[start:])
	return parts
}

func parseTOMLBool(value string) (bool, error) {
	switch strings.TrimSpace(value) {
	case "true":
		return true, nil
	case "false":
		return false, nil
	default:
		return false, fmt.Errorf("expected boolean")
	}
}

func safeJoin(root string, relative string) (string, error) {
	if relative == "" {
		return "", fmt.Errorf("%s: empty path", ErrSkillInvalid)
	}
	if filepath.IsAbs(relative) {
		return "", fmt.Errorf("%s: absolute paths are not allowed", ErrSkillInvalid)
	}
	cleanRelative := filepath.Clean(filepath.FromSlash(relative))
	if cleanRelative == "." || strings.HasPrefix(cleanRelative, ".."+string(filepath.Separator)) || cleanRelative == ".." {
		return "", fmt.Errorf("%s: path escapes project root", ErrSkillInvalid)
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	joined, err := filepath.Abs(filepath.Join(absRoot, cleanRelative))
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(absRoot, joined)
	if err != nil {
		return "", err
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("%s: path escapes project root", ErrSkillInvalid)
	}
	return joined, nil
}

