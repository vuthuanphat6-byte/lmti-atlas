export type {
  AuditLog,
  PermissionLevel,
  SecurityCheck,
  SecurityCheckResult,
  SecurityDecision,
  SecurityPolicy,
  ToolPermission
} from "./types";

import type { AuditLog, PermissionLevel, SecurityCheck, SecurityCheckResult, SecurityPolicy } from "./types";

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  id: "default-local-runtime",
  name: "Default Local Runtime Policy",
  description: "Allows local read and execution only. Blocks network, filesystem, database and admin permissions.",
  permissions: ["read", "execute"],
  defaultDecision: "deny"
};

export class SecurityGuard {
  private policy: SecurityPolicy;
  private readonly auditLogs: AuditLog[] = [];

  constructor(policy: SecurityPolicy = DEFAULT_SECURITY_POLICY) {
    this.policy = normalizePolicy(policy);
  }

  attachPolicy(policy: SecurityPolicy): void {
    this.policy = normalizePolicy(policy);
  }

  getPolicy(): SecurityPolicy {
    return this.policy;
  }

  checkToolExecution(check: SecurityCheck): SecurityCheckResult {
    const result = this.evaluate(check);
    this.audit(check, result);
    return result;
  }

  assertToolExecution(check: SecurityCheck): void {
    const result = this.checkToolExecution(check);
    if (!result.allowed) {
      throw new Error(result.reason);
    }
  }

  getAuditLogs(limit?: number): AuditLog[] {
    const logs = [...this.auditLogs].reverse();
    return typeof limit === "number" ? logs.slice(0, Math.max(0, limit)) : logs;
  }

  clearAuditLogs(): void {
    this.auditLogs.length = 0;
  }

  private evaluate(check: SecurityCheck): SecurityCheckResult {
    if (this.policy.deniedTools?.includes(check.toolName)) {
      return {
        decision: "deny",
        allowed: false,
        reason: `Tool '${check.toolName}' is explicitly denied by security policy.`
      };
    }

    const toolPermissions = this.policy.toolPermissions?.[check.toolName];
    const allowedByTool = toolPermissions?.includes(check.permissionRequired) ?? false;
    const allowedGlobally = this.policy.permissions.includes(check.permissionRequired);

    if (allowedByTool || allowedGlobally) {
      return {
        decision: "allow",
        allowed: true,
        reason: `Permission '${check.permissionRequired}' is allowed.`
      };
    }

    if (this.policy.defaultDecision === "allow") {
      return {
        decision: "allow",
        allowed: true,
        reason: `Allowed by default policy decision.`
      };
    }

    return {
      decision: "deny",
      allowed: false,
      reason: `Permission '${check.permissionRequired}' is not allowed for tool '${check.toolName}'.`
    };
  }

  private audit(check: SecurityCheck, result: SecurityCheckResult): void {
    this.auditLogs.push({
      action: check.action,
      toolName: check.toolName,
      permissionRequired: check.permissionRequired,
      allowed: result.allowed,
      reason: result.reason,
      timestamp: new Date().toISOString()
    });
  }
}

function normalizePolicy(policy: SecurityPolicy): SecurityPolicy {
  return {
    ...policy,
    permissions: Array.from(new Set(policy.permissions)),
    defaultDecision: policy.defaultDecision ?? "deny"
  };
}
