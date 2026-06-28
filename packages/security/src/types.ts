export type PermissionLevel = "read" | "write" | "execute" | "network" | "filesystem" | "database" | "admin";

export interface ToolPermission {
  toolName: string;
  permission: PermissionLevel;
  reason?: string;
}

export type SecurityDecision = "allow" | "deny";

export interface SecurityPolicy {
  id: string;
  name: string;
  description?: string;
  permissions: PermissionLevel[];
  toolPermissions?: Record<string, PermissionLevel[]>;
  deniedTools?: string[];
  defaultDecision?: SecurityDecision;
}

export interface SecurityCheck {
  action: string;
  toolName: string;
  permissionRequired: PermissionLevel;
}

export interface SecurityCheckResult {
  decision: SecurityDecision;
  allowed: boolean;
  reason: string;
}

export interface AuditLog {
  action: string;
  toolName: string;
  permissionRequired: PermissionLevel;
  allowed: boolean;
  reason: string;
  timestamp: string;
}
