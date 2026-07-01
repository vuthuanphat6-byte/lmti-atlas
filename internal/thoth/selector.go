package thoth

import (
	"sort"
	"strings"
)

type scoredSkill struct {
	Skill  Skill
	Intent string
	Score  int
	Reason string
}

func selectSkills(registry Registry, request string) []scoredSkill {
	intentScores := DetectIntents(request)
	var scored []scoredSkill
	for _, skill := range registry.Skills {
		bestIntent := IntentUnknown
		bestScore := 0
		for _, skillIntent := range skill.Intents {
			canonical := CanonicalIntent(skillIntent)
			score := intentScores[canonical]
			if score == 0 && exactIntentPhraseMatch(request, skillIntent) {
				score = 8
			}
			if canonical == skillCategory(skill) && score > 0 {
				score += 4
			}
			if score > bestScore {
				bestScore = score
				bestIntent = canonical
			}
		}
		if bestScore == 0 {
			continue
		}
		bestScore += riskPriority[bestIntent]
		scored = append(scored, scoredSkill{
			Skill:  skill,
			Intent: bestIntent,
			Score:  bestScore,
			Reason: routeReason(bestIntent, skill),
		})
	}
	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].Score != scored[j].Score {
			return scored[i].Score > scored[j].Score
		}
		leftRisk := riskLevelRank(scored[i].Skill.RiskLevel)
		rightRisk := riskLevelRank(scored[j].Skill.RiskLevel)
		if leftRisk != rightRisk {
			return leftRisk > rightRisk
		}
		return scored[i].Skill.ID < scored[j].Skill.ID
	})
	return scored
}

func exactIntentPhraseMatch(request string, intent string) bool {
	normalizedRequest := normalizeText(request)
	normalizedIntent := normalizeText(intent)
	if normalizedIntent == "" {
		return false
	}
	return strings.Contains(normalizedRequest, normalizedIntent)
}

func skillCategory(skill Skill) string {
	for _, intent := range skill.Intents {
		canonical := CanonicalIntent(intent)
		if canonical != IntentUnknown {
			return canonical
		}
	}
	return IntentUnknown
}

func riskLevelRank(risk string) int {
	switch strings.ToLower(risk) {
	case "high":
		return 3
	case "medium":
		return 2
	case "low":
		return 1
	default:
		return 0
	}
}

func routeReason(intent string, skill Skill) string {
	switch intent {
	case IntentSecurity:
		return "Security or secret-handling wording has highest priority because unsafe context can leak data."
	case IntentPublish:
		return "Publishing, pushing, PR, open-source, or release work requires preflight before any external action."
	case IntentMigration:
		return "The request involves JSON, SQLite, storage, or migration behavior."
	case IntentRepoCleanup:
		return "The request is about cleanup or refactoring while preserving behavior."
	case IntentDocumentation:
		return "The request is documentation-oriented and can use the documentation skill."
	case IntentDoctor:
		return "The request is a system health or validation check."
	case IntentMemory:
		return "The request asks for memory/context retrieval guidance, not raw memory dumping."
	case IntentAdapter:
		return "The request concerns adapter or plugin integration boundaries."
	default:
		return "The request matched registered skill metadata."
	}
}

