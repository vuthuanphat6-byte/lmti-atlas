package thoth

import (
	"fmt"
)

type Router struct {
	Registry Registry
}

func NewRouter(registry Registry) Router {
	return Router{Registry: registry}
}

func (router Router) Route(request string) RouteOutcome {
	if router.Registry.Skills == nil {
		return RouteOutcome{
			Status: StatusError,
			Result: RouteResult{
				Request:       request,
				Intent:        IntentUnknown,
				Decision:      DecisionInvalidRegistry,
				SelectedSkill: nil,
				Reason:        "Thoth cannot route without a loaded skill registry.",
			},
			Errors: []Message{{Code: ErrRegistryMissing, Message: "Skill registry is not loaded."}},
		}
	}
	scored := selectSkills(router.Registry, request)
	if len(scored) == 0 {
		return RouteOutcome{
			Status: StatusWarn,
			Result: RouteResult{
				Request:       request,
				Intent:        IntentUnknown,
				Decision:      DecisionNoSkillFound,
				SelectedSkill: nil,
				Reason:        "No registered skill matched this request.",
			},
			Warnings: []Message{{Code: ErrNoSkillFound, Message: "No suitable skill was found for this request."}},
		}
	}
	selected := scored[0]
	result := RouteResult{
		Request:             request,
		Intent:              selected.Intent,
		Decision:            DecisionSkillSelected,
		SelectedSkill:       selectedSkill(selected.Skill),
		RequiresPolicy:      selected.Skill.RequiresPolicy,
		RequiresMemory:      selected.Skill.RequiresMemory,
		RequiredPolicyGates: policyGates(selected.Skill),
		RecommendedCommands: recommendedCommands(selected.Skill, selected.Intent),
		MemoryRequest:       memoryRequest(selected.Skill, selected.Intent),
		Reason:              selected.Reason,
	}
	status := StatusPass
	var warnings []Message
	if len(scored) > 1 {
		result.Decision = DecisionMultipleCandidates
		status = StatusWarn
		warnings = append(warnings, Message{
			Code:    ErrMultipleSkillsMatched,
			Message: "More than one skill matched the request. Thoth selected the highest-risk relevant skill first.",
		})
		for _, item := range scored {
			result.Candidates = append(result.Candidates, Candidate{
				ID:        item.Skill.ID,
				Score:     float64(item.Score) / 100,
				Intent:    item.Intent,
				RiskLevel: item.Skill.RiskLevel,
				Reason:    item.Reason,
			})
		}
		for _, item := range scored[1:] {
			result.SecondarySkills = append(result.SecondarySkills, SecondarySkill{
				ID:     item.Skill.ID,
				Reason: fmt.Sprintf("%s matched too, but %s has higher risk priority for this request.", item.Skill.ID, selected.Skill.ID),
			})
		}
	}
	return RouteOutcome{Status: status, Result: result, Warnings: warnings}
}

func selectedSkill(skill Skill) *SelectedSkill {
	return &SelectedSkill{
		ID:        skill.ID,
		Name:      skill.Name,
		File:      skill.File,
		RiskLevel: skill.RiskLevel,
	}
}

func policyGates(skill Skill) []string {
	if !skill.RequiresPolicy {
		return nil
	}
	switch skill.ID {
	case "publish-preflight":
		return []string{"GitRemotePolicy", "BranchHistoryPolicy", "ProtectedFilesPolicy", "SecretLeakPolicy"}
	case "security-check":
		return []string{"SecretLeakPolicy", "PrivacyBoundaryPolicy", "ProtectedFilesPolicy"}
	case "migration-from-json":
		return []string{"MigrationDryRunPolicy", "SecretImportPolicy", "StorageBackupPolicy"}
	case "repo-cleanup":
		return []string{"ProtectedFilesPolicy", "BehaviorPreservationPolicy"}
	case "adapter":
		return []string{"AdapterManifestPolicy", "SandboxScopePolicy"}
	default:
		return []string{"DefaultSafetyPolicy"}
	}
}

func recommendedCommands(skill Skill, intent string) []string {
	switch skill.ID {
	case "publish-preflight":
		return []string{"lmti publish preflight"}
	case "repo-cleanup":
		return []string{"lmti thoth show repo-cleanup", "lmti doctor --security"}
	case "security-check":
		return []string{"lmti doctor --security", "lmti publish preflight --json"}
	case "memory-retrieval":
		return []string{fmt.Sprintf("lmti memory retrieve --intent %s --privacy-max internal --json", intent)}
	case "migration-from-json":
		return []string{"lmti migrate from-json --dry-run", "lmti migrate from-json"}
	case "documentation":
		return []string{"lmti thoth show documentation"}
	case "doctor":
		return []string{"lmti doctor --json"}
	case "adapter":
		return []string{"lmti thoth show adapter", "lmti doctor --json"}
	default:
		return []string{"lmti thoth show " + skill.ID}
	}
}

func memoryRequest(skill Skill, intent string) *MemoryRequest {
	if !skill.RequiresMemory {
		return nil
	}
	return &MemoryRequest{
		Intent:              intent,
		PrivacyMax:          "internal",
		IncludeLessons:      true,
		IncludeRelatedFiles: true,
	}
}

