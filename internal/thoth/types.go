package thoth

const (
	SchemaVersion = "lmti.thoth.v1"

	StatusPass    = "pass"
	StatusWarn    = "warn"
	StatusBlocked = "blocked"
	StatusError   = "error"

	DecisionSkillSelected     = "skill_selected"
	DecisionMultipleCandidates = "multiple_candidates"
	DecisionNoSkillFound      = "no_skill_found"
	DecisionPolicyRequired    = "policy_required"
	DecisionMemoryRequired    = "memory_required"
	DecisionBlocked           = "blocked"
	DecisionInvalidRegistry   = "invalid_registry"
)

const (
	ErrRegistryMissing       = "THOTH_REGISTRY_MISSING"
	ErrSkillNotFound         = "THOTH_SKILL_NOT_FOUND"
	ErrSkillInvalid          = "THOTH_SKILL_INVALID"
	ErrMultipleSkillsMatched = "THOTH_MULTIPLE_SKILLS_MATCHED"
	ErrNoSkillFound          = "THOTH_NO_SKILL_FOUND"
	ErrPolicyRequired        = "THOTH_POLICY_REQUIRED"
	ErrMemoryRequired        = "THOTH_MEMORY_REQUIRED"
	ErrSchemaInvalid         = "THOTH_SCHEMA_INVALID"
	ErrUnknown               = "THOTH_UNKNOWN_ERROR"
)

type Message struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type Envelope struct {
	SchemaVersion string    `json:"schemaVersion"`
	Command       string    `json:"command"`
	Status        string    `json:"status"`
	Data          any       `json:"data"`
	Warnings      []Message `json:"warnings"`
	Errors        []Message `json:"errors"`
}

type Skill struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Description    string   `json:"description,omitempty"`
	File           string   `json:"file"`
	Intents        []string `json:"intents"`
	RequiresPolicy bool     `json:"requiresPolicy"`
	RequiresMemory bool     `json:"requiresMemory"`
	RiskLevel      string   `json:"riskLevel"`
}

type Registry struct {
	Path   string  `json:"path"`
	Skills []Skill `json:"skills"`
}

type Candidate struct {
	ID        string  `json:"id"`
	Score     float64 `json:"score"`
	Intent    string  `json:"intent,omitempty"`
	RiskLevel string  `json:"riskLevel,omitempty"`
	Reason    string  `json:"reason,omitempty"`
}

type SelectedSkill struct {
	ID        string `json:"id"`
	Name      string `json:"name,omitempty"`
	File      string `json:"file"`
	RiskLevel string `json:"riskLevel"`
}

type SecondarySkill struct {
	ID     string `json:"id"`
	Reason string `json:"reason"`
}

type MemoryRequest struct {
	Intent              string `json:"intent"`
	PrivacyMax          string `json:"privacyMax"`
	IncludeLessons      bool   `json:"includeLessons"`
	IncludeRelatedFiles bool   `json:"includeRelatedFiles"`
}

type RouteResult struct {
	Request               string           `json:"request"`
	Intent                string           `json:"intent"`
	Decision              string           `json:"decision"`
	SelectedSkill         *SelectedSkill   `json:"selectedSkill"`
	SecondarySkills       []SecondarySkill `json:"secondarySkills,omitempty"`
	Candidates            []Candidate      `json:"candidates,omitempty"`
	RequiresPolicy        bool             `json:"requiresPolicy"`
	RequiresMemory        bool             `json:"requiresMemory"`
	RequiredPolicyGates   []string         `json:"requiredPolicyGates,omitempty"`
	RecommendedCommands   []string         `json:"recommendedCommands,omitempty"`
	MemoryRequest         *MemoryRequest   `json:"memoryRequest,omitempty"`
	Reason                string           `json:"reason"`
}

type RouteOutcome struct {
	Status   string
	Result   RouteResult
	Warnings []Message
	Errors   []Message
}

type SkillContent struct {
	Skill   Skill  `json:"skill"`
	Content string `json:"content"`
}

type SkillInspection struct {
	Skill           Skill     `json:"skill"`
	Status          string    `json:"status"`
	MissingSections []string  `json:"missingSections,omitempty"`
	Warnings        []Message `json:"warnings,omitempty"`
	Errors          []Message `json:"errors,omitempty"`
}

type ValidationCheck struct {
	Check  string `json:"check"`
	Status string `json:"status"`
	Detail string `json:"detail"`
}

type ValidationReport struct {
	Result        string            `json:"result"`
	SkillsChecked int               `json:"skillsChecked"`
	Checks        []ValidationCheck `json:"checks"`
}

