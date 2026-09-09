/**
 * Idempotent admin provisioning for role-based access (admin/institution).
 *
 * Run:  npm run create-admin -- admin@nirf.app admin12345 "NIRF Admin"
 */
import bcrypt from "bcryptjs";
import { pool } from "../db/db";

const email = process.argv[2] ?? "admin@nirf.app";
const password = process.argv[3] ?? "admin12345";
const institutionName = process.argv[4] ?? "NIRF Admin";

async function main() {
  const existing = await pool.query(`SELECT id, role FROM users WHERE lower(email) = lower($1)`, [email]);
  if (existing.rows.length > 0) {
    if (existing.rows[0].role !== "admin") {
      await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [existing.rows[0].id]);
      console.log(`promoted ${email} to admin`);
    } else {
      console.log(`admin already exists: ${email}`);
    }
    await pool.end();
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (email, password_hash, institution_name, role)
     VALUES ($1,$2,$3,'admin')`,
    [email, hash, institutionName]
  );
  console.log(`created admin ${email}`);
  await pool.end();
}

main().catch((e) => {
  console.error("failed to create admin", e);
  process.exit(1);
});