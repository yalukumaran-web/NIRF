import bcrypt from "bcryptjs";
import { pool } from "../db/db";

const resets: [string, string][] = [
  ["demo@institution.edu", "demo12345"],
  ["admin@nirf.app", "admin12345"],
];

(async () => {
  for (const [email, pw] of resets) {
    const hash = await bcrypt.hash(pw, 10);
    await pool.query("UPDATE users SET password_hash = $2 WHERE lower(email) = lower($1)", [email, hash]);
    const r = await pool.query("SELECT id, email, role FROM users WHERE lower(email) = lower($1)", [email]);
    console.log(`reset ${r.rows[0]?.email} (${r.rows[0]?.role})`);
  }
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});