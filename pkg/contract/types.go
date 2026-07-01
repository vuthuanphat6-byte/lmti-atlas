package contract

import (
	"context"
	"time"
)

const CLISchemaVersion = "lmti.cli.v1"

type PrivacyLevel string

const (
	PrivacyPublic      PrivacyLevel = "public"
	PrivacyInternal    PrivacyLevel = "internal"
	PrivacyPrivate     PrivacyLevel = "private"
	PrivacySecret      PrivacyLevel = "secret"
	PrivacyDoNotPrompt PrivacyLevel = "do_not_prompt"
)

type Intent string

const (
	IntentCodingTask     Intent = "coding_task"
	IntentBugFix         Intent = "bug_fix"
	IntentPublish        Intent = "publish"
	IntentDeploy         Intent = "deploy"
	IntentSecurity       Intent = "security"
	IntentArchitecture   Intent = "architecture"
	IntentRefactor       Intent = "refactor"
	IntentDocumentation  Intent = "documentation"
	IntentClientDelivery Intent = "client_delivery"
	IntentUnknown        Intent = "unknown"
)

type PolicyDecision string

const (
	DecisionAllow               PolicyDecision = "allow"
	DecisionWarn                PolicyDecision = "warn"
	DecisionBlock               PolicyDecision = "block"
	DecisionRequireUserApproval PolicyDecision = "require_user_approval"
)

type ErrorCode string

const (
	StatusPass    = "pass"
	StatusWarn    = "warn"
	StatusBlocked = "blocked"
	StatusError   = "error"
)

const (
	ErrorConfigInvalid              ErrorCode = "CONFIG_INVALID"
	ErrorStorageUnavailable         ErrorCode = "STORAGE_UNAVAILABLE"
	ErrorMigrationRequired          ErrorCode = "MIGRATION_REQUIRED"
	ErrorPrivacyBlocked             ErrorCode = "PRIVACY_BLOCKED"
	ErrorSecretDetected             ErrorCode = "SECRET_DETECTED"
	ErrorPublishTargetMissing       ErrorCode = "PUBLISH_TARGET_MISSING"
	ErrorRemoteOriginMismatch       ErrorCode = "REMOTE_ORIGIN_MISMATCH"
	ErrorGitHistoryNoCommonAncestor ErrorCode = "GIT_HISTORY_NO_COMMON_ANCESTOR"
	ErrorBranchNotAllowed           ErrorCode = "BRANCH_NOT_ALLOWED"
	ErrorWorkingTreeDirty           ErrorCode = "WORKING_TREE_DIRTY"
	ErrorProtectedFileDetected      ErrorCode = "PROTECTED_FILE_DETECTED"
	ErrorAdapterNotFound            ErrorCode = "ADAPTER_NOT_FOUND"
	ErrorThothRegistryMissing       ErrorCode = "THOTH_REGISTRY_MISSING"
	ErrorThothSkillNotFound         ErrorCode = "THOTH_SKILL_NOT_FOUND"
	ErrorThothSkillInvalid          ErrorCode = "THOTH_SKILL_INVALID"
	ErrorThothMultipleSkillsMatched ErrorCode = "THOTH_MULTIPLE_SKILLS_MATCHED"
	ErrorThothNoSkillFound          ErrorCode = "THOTH_NO_SKILL_FOUND"
	ErrorThothPolicyRequired        ErrorCode = "THOTH_POLICY_REQUIRED"
	ErrorThothMemoryRequired        ErrorCode = "THOTH_MEMORY_REQUIRED"
	ErrorThothSchemaInvalid         ErrorCode = "THOTH_SCHEMA_INVALID"
	ErrorUnknown                    ErrorCode = "UNKNOWN_ERROR"
)

type MemoryRecord struct {
	ID            string            `json:"id"`
	SchemaVersion string            `json:"schemaVersion"`
	ProjectID     string            `json:"projectID"`
	Kind          string            `json:"kind"`
	Title         string            `json:"title"`
	Content       string            `json:"content"`
	Privacy       PrivacyLevel      `json:"privacy"`
	Confidence    float64           `json:"confidence"`
	Importance    float64           `json:"importance"`
	SourceAgent   string            `json:"sourceAgent"`
	Tags          []string          `json:"tags"`
	RelatedFiles  []string          `json:"relatedFiles"`
	CreatedAt     time.Time         `json:"createdAt"`
	UpdatedAt     time.Time         `json:"updatedAt"`
	Metadata      map[string]string `json:"metadata"`
	ContentHash   string            `json:"contentHash"`
}

type ActionRequest struct {
	ID            string            `json:"id"`
	SchemaVersion string            `json:"schemaVersion"`
	ProjectID     string            `json:"projectID"`
	AgentID       string            `json:"agentID"`
	Action        string            `json:"action"`
	Intent        Intent            `json:"intent"`
	Paths         []string          `json:"paths"`
	Metadata      map[string]string `json:"metadata"`
}

type PolicyResult struct {
	Decision PolicyDecision   `json:"decision"`
	Warnings []BoundaryMessage `json:"warnings"`
	Errors   []BoundaryMessage `json:"errors"`
}

type BoundaryMessage struct {
	Code       ErrorCode `json:"code"`
	Message    string    `json:"message"`
	Suggestion string    `json:"suggestion,omitempty"`
}

type PolicyGate interface {
	Evaluate(ctx context.Context, action ActionRequest) (PolicyResult, error)
}

type CLIEnvelope struct {
	SchemaVersion string            `json:"schemaVersion"`
	Command       string            `json:"command"`
	Status        string            `json:"status"`
	Warnings      []BoundaryMessage `json:"warnings"`
	Errors        []BoundaryMessage `json:"errors"`
	Data          any               `json:"data"`
}
