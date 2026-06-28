export type SensitivityLevel = "public" | "internal" | "confidential" | "secret";

export type AccessRole = "owner" | "maintainer" | "developer" | "agent" | "readonly" | "external_model";

export type AccessDecision = "allow" | "deny" | "redact" | "summarize";

export interface PrivacyPolicy {
  id: string;
  name: string;
  description: string;
  sensitivity: SensitivityLevel;
  allowedRoles: AccessRole[];
  defaultDecision: AccessDecision;
  allowRawExport: boolean;
  allowContextExport: boolean;
  requireAudit: boolean;
  requireExplicitFlag: boolean;
}

export interface PrivacyContext {
  role: AccessRole;
  projectId: string;
  purpose: string;
  includeSecret: boolean;
  includeRaw: boolean;
  command: string;
  timestamp: string;
}

export interface PrivacyProtectedRecord {
  id: string;
  sensitivity: SensitivityLevel;
  title?: string;
  content?: string;
}

export interface PrivacyEvaluation {
  decision: AccessDecision;
  reason: string;
  policy: PrivacyPolicy;
}

export interface AuditEvent {
  id: string;
  sequence?: number;
  timestamp: string;
  action: string;
  recordId: string;
  sensitivity: SensitivityLevel;
  role: AccessRole;
  decision: AccessDecision;
  command: string;
  reason: string;
  previousHash?: string;
  hash?: string;
}

export interface AuditIntegrityReport {
  valid: boolean;
  checked: number;
  failures: Array<{
    sequence?: number;
    id?: string;
    reason: string;
  }>;
  checkpointPreviousHash?: string;
}

export interface AuditRetentionResult {
  retained: number;
  archived: number;
  archivePath?: string;
}
