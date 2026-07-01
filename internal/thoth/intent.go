package thoth

import (
	"regexp"
	"strings"
)

const (
	IntentPublish      = "publish"
	IntentRepoCleanup  = "repo_cleanup"
	IntentSecurity     = "security"
	IntentMigration    = "json_to_sqlite_migration"
	IntentDocumentation = "documentation"
	IntentDoctor       = "doctor"
	IntentMemory       = "memory_retrieval"
	IntentAdapter      = "adapter"
	IntentUnknown      = "unknown"
)

var intentKeywords = map[string][]string{
	IntentSecurity: {
		"security", "secret", "secret scan", "token", ".env", "leak", "leak check",
		"privacy", "private", "credential", "password", "api key", "xss",
		"sql injection",
	},
	IntentPublish: {
		"publish", "push", "pull request", "pr", "open source", "release",
		"github", "public",
	},
	IntentMigration: {
		"migrate", "migration", "json", "sqlite", "storage", "storage upgrade",
		"from-json", "json_to_sqlite", "import", "export",
	},
	IntentRepoCleanup: {
		"cleanup", "clean up", "clean", "repo cleanup", "unused",
		"remove_unused", "refactor", "organize", "organize_repo",
	},
	IntentDocumentation: {
		"readme", "docs", "documentation", "document", "publish_docs",
		"architecture", "roadmap",
	},
	IntentDoctor: {
		"doctor", "health", "check health", "validate setup", "diagnose",
		"system check",
	},
	IntentMemory: {
		"memory", "retrieve", "retrieval", "lesson", "context", "remember",
		"project memory", "lesson capture",
	},
	IntentAdapter: {
		"adapter", "agent adapter", "plugin", "mcp", "connector", "driver",
	},
}

var intentAliases = map[string]string{
	"pull_request":       IntentPublish,
	"open_source":        IntentPublish,
	"release":            IntentPublish,
	"push":               IntentPublish,
	"secret_scan":        IntentSecurity,
	"privacy":            IntentSecurity,
	"leak_check":         IntentSecurity,
	"cleanup":            IntentRepoCleanup,
	"remove_unused":      IntentRepoCleanup,
	"organize_repo":      IntentRepoCleanup,
	"refactor":           IntentRepoCleanup,
	"migrate":            IntentMigration,
	"json_to_sqlite":     IntentMigration,
	"storage_upgrade":    IntentMigration,
	"docs":               IntentDocumentation,
	"readme":             IntentDocumentation,
	"publish_docs":       IntentDocumentation,
	"health_check":       IntentDoctor,
	"validate_setup":     IntentDoctor,
	"context":            IntentMemory,
	"lesson":             IntentMemory,
	"memory":             IntentMemory,
	"adapter":            IntentAdapter,
	"agent_adapter":      IntentAdapter,
}

var riskPriority = map[string]int{
	IntentSecurity:      600,
	IntentPublish:       500,
	IntentMigration:     400,
	IntentRepoCleanup:   300,
	IntentDocumentation: 200,
	IntentMemory:        150,
	IntentDoctor:        120,
	IntentAdapter:       100,
	IntentUnknown:       0,
}

func DetectIntents(request string) map[string]int {
	normalized := normalizeText(request)
	scores := map[string]int{}
	for intent, keywords := range intentKeywords {
		for _, keyword := range keywords {
			if containsPhrase(normalized, normalizeText(keyword)) {
				scores[intent] += 10
			}
		}
	}
	return scores
}

func CanonicalIntent(intent string) string {
	normalized := strings.ToLower(strings.TrimSpace(intent))
	normalized = strings.ReplaceAll(normalized, "-", "_")
	normalized = strings.ReplaceAll(normalized, " ", "_")
	if normalized == "" {
		return IntentUnknown
	}
	if canonical, ok := intentAliases[normalized]; ok {
		return canonical
	}
	for known := range intentKeywords {
		if normalized == known {
			return known
		}
	}
	return normalized
}

func normalizeText(value string) string {
	value = strings.ToLower(value)
	value = strings.ReplaceAll(value, "_", " ")
	value = strings.ReplaceAll(value, "-", " ")
	space := regexp.MustCompile(`\s+`)
	return strings.TrimSpace(space.ReplaceAllString(value, " "))
}

func containsPhrase(haystack string, needle string) bool {
	if needle == "" {
		return false
	}
	if strings.Contains(needle, ".") {
		return strings.Contains(haystack, needle)
	}
	if len(needle) <= 3 {
		return wordBoundaryContains(haystack, needle)
	}
	return strings.Contains(haystack, needle)
}

func wordBoundaryContains(haystack string, needle string) bool {
	fields := strings.Fields(haystack)
	for _, field := range fields {
		if strings.Trim(field, `"'.,:;!?()[]{}<>`) == needle {
			return true
		}
	}
	return false
}
