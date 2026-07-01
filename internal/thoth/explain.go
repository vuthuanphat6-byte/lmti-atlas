package thoth

type Explanation struct {
	Request         string   `json:"request"`
	DetectedIntent  string   `json:"detectedIntent"`
	SelectedSkill   string   `json:"selectedSkill,omitempty"`
	Why             string   `json:"why"`
	RecommendedFlow []string `json:"recommendedFlow"`
}

func Explain(outcome RouteOutcome) Explanation {
	result := outcome.Result
	selected := ""
	if result.SelectedSkill != nil {
		selected = result.SelectedSkill.ID
	}
	return Explanation{
		Request:         result.Request,
		DetectedIntent:  result.Intent,
		SelectedSkill:   selected,
		Why:             result.Reason,
		RecommendedFlow: recommendedFlow(selected, result.Intent),
	}
}

func recommendedFlow(skillID string, intent string) []string {
	switch skillID {
	case "publish-preflight":
		return []string{
			"Run publish preflight before push, PR, release, or remote changes.",
			"Verify repository identity, branch history, protected files, and secret leakage risk.",
			"Continue only after the safety gate is pass or warnings are accepted deliberately.",
		}
	case "repo-cleanup":
		return []string{
			"Create a cleanup report before deleting or moving files.",
			"Classify legacy, unused, generated, risky, and protected paths.",
			"Apply small behavior-preserving changes and run tests.",
		}
	case "security-check":
		return []string{
			"Inspect metadata and paths first; do not print raw secret content.",
			"Run security doctor or publish preflight when repository exposure is possible.",
			"Block or rotate any confirmed exposed secret outside the agent prompt.",
		}
	case "migration-from-json":
		return []string{
			"Run a dry-run migration first.",
			"Validate fields, preserve unknown metadata, and block raw secret imports.",
			"Only apply migration after backup and privacy checks pass.",
		}
	case "documentation":
		return []string{
			"Verify current source behavior before documenting it.",
			"Keep product claims local-alpha and evidence-based.",
			"Use LMTI naming consistently.",
		}
	case "doctor":
		return []string{
			"Run diagnostics without changing project state unless an explicit fix flag is used.",
			"Treat warnings as review items before publish or release work.",
		}
	case "memory-retrieval":
		return []string{
			"Request policy-safe memory by intent.",
			"Never retrieve secret or do_not_prompt memory for model context.",
			"Treat memory as prior belief and verify against source code.",
		}
	case "adapter":
		return []string{
			"Validate adapter manifests and scopes before integration.",
			"Keep adapters behind CLI/API contracts and away from direct memory storage reads.",
			"Use sandboxed, audited adapter calls.",
		}
	default:
		if intent == IntentUnknown {
			return []string{"Clarify the task or add a specific skill to the registry."}
		}
		return []string{"Open the selected skill and follow its safety rules."}
	}
}

