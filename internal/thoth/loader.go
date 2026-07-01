package thoth

import (
	"fmt"
	"os"
	"strings"
)

const maxSkillBytes = 24 * 1024

var requiredSections = []string{
	"## Purpose",
	"## When to use",
	"## Inputs needed",
	"## Required commands",
	"## Safety rules",
	"## Block conditions",
	"## Output expected",
	"## Notes",
}

func LoadSkill(root string, registry Registry, id string) (SkillContent, []Message, []Message) {
	skill, ok := FindSkill(registry, id)
	if !ok {
		return SkillContent{}, nil, []Message{{Code: ErrSkillNotFound, Message: "Skill id was not found in skills/registry.toml."}}
	}
	content, warnings, errors := readSkillFile(root, skill)
	if len(errors) > 0 {
		return SkillContent{}, warnings, errors
	}
	return SkillContent{Skill: skill, Content: content}, warnings, nil
}

func InspectSkill(root string, registry Registry, id string) SkillInspection {
	skill, ok := FindSkill(registry, id)
	if !ok {
		return SkillInspection{
			Status: "invalid",
			Errors: []Message{{Code: ErrSkillNotFound, Message: "Skill id was not found in skills/registry.toml."}},
		}
	}
	content, warnings, errors := readSkillFile(root, skill)
	missing := missingRequiredSections(content)
	status := "valid"
	if len(warnings) > 0 || len(missing) > 0 {
		status = "warn"
	}
	if len(errors) > 0 {
		status = "invalid"
	}
	return SkillInspection{
		Skill:           skill,
		Status:          status,
		MissingSections: missing,
		Warnings:        warnings,
		Errors:          errors,
	}
}

func readSkillFile(root string, skill Skill) (string, []Message, []Message) {
	path, err := safeJoin(root, skill.File)
	if err != nil {
		return "", nil, []Message{{Code: ErrSkillInvalid, Message: err.Error()}}
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil, []Message{{Code: ErrSkillNotFound, Message: fmt.Sprintf("%s not found.", skill.File)}}
		}
		return "", nil, []Message{{Code: ErrUnknown, Message: err.Error()}}
	}
	if info.Size() > maxSkillBytes {
		return "", nil, []Message{{Code: ErrSkillInvalid, Message: fmt.Sprintf("%s is unusually large for a skill.md file.", skill.File)}}
	}
	bytes, err := os.ReadFile(path)
	if err != nil {
		return "", nil, []Message{{Code: ErrUnknown, Message: err.Error()}}
	}
	content := string(bytes)
	if hasSecretLikeContent(content) {
		return "", nil, []Message{{Code: ErrSkillInvalid, Message: fmt.Sprintf("%s contains secret-like material and will not be printed.", skill.File)}}
	}
	var warnings []Message
	if missing := missingRequiredSections(content); len(missing) > 0 {
		warnings = append(warnings, Message{
			Code:    ErrSkillInvalid,
			Message: fmt.Sprintf("%s is missing required sections: %s.", skill.File, strings.Join(missing, ", ")),
		})
	}
	return content, warnings, nil
}

func missingRequiredSections(content string) []string {
	normalized := strings.ToLower(content)
	var missing []string
	for _, section := range requiredSections {
		if !strings.Contains(normalized, strings.ToLower(section)) {
			missing = append(missing, section)
		}
	}
	return missing
}

