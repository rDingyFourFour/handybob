// utils/audit/log.ts
// Minimal helper to standardize audit log writes.
import type { SupabaseClient } from "@supabase/supabase-js";

type AuditArgs = {
  supabase: SupabaseClient;
  workspaceId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function logAuditEvent({
  supabase,
  workspaceId,
  action,
  entityType,
  entityId,
  actorUserId,
  metadata,
}: AuditArgs) {
  const payload = {
    workspace_id: workspaceId,
    actor_user_id: actorUserId ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata: metadata ?? null,
  };

  const { error } = await supabase.from("audit_logs").insert(payload);
  if (error) {
    console.warn("[audit] Failed to write audit log", action, entityType, entityId, error.message);
  }
}
