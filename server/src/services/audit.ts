import { pool } from "../db/db";

export interface AuditContext {
  userId?: number;
  email?: string;
  role?: string;
}

export async function audit(
  ctx: AuditContext,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>
) {
  await pool.query(
    `INSERT INTO audit_log (user_id, email, role, action, entity_type, entity_id, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      ctx.userId ?? null,
      ctx.email ?? null,
      ctx.role ?? null,
      action,
      entityType ?? null,
      entityId ?? null,
      details ? JSON.stringify(details) : null,
    ]
  );
}