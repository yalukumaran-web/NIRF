import { pool, query } from "../db/db";

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  institution_name: string;
  role: string;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await query<UserRow>(
    `SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

export async function createInstitution(
  email: string,
  passwordHash: string,
  institutionName: string,
  category: string
): Promise<UserRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const u = await client.query<UserRow>(
      `INSERT INTO users(email, password_hash, institution_name)
       VALUES($1,$2,$3) RETURNING *`,
      [email, passwordHash, institutionName]
    );
    await client.query(
      `INSERT INTO institutions(user_id, name, category) VALUES($1,$2,$3)`,
      [u.rows[0].id, institutionName, category]
    );
    await client.query("COMMIT");
    return u.rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getInstitution(userId: number) {
  const rows = await query<{ id: number; name: string; category: string }>(
    `SELECT id, name, category FROM institutions WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

export async function updateCategory(userId: number, category: string) {
  await pool.query(`UPDATE institutions SET category = $1 WHERE user_id = $2`, [
    category,
    userId,
  ]);
}
