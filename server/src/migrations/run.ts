import { pool } from "../db/db";
import fs from "fs";
import path from "path";

async function migrate() {
  const files = fs
    .readdirSync(__dirname)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  for (const file of files) {
    const applied = await pool.query(
      `SELECT 1 FROM schema_migrations WHERE name = $1`,
      [file]
    );
    if (applied.rowCount && applied.rowCount > 0) {
      console.log(`skip ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(__dirname, file), "utf8");
    console.log(`applying ${file}...`);
    await pool.query(sql);
    await pool.query(`INSERT INTO schema_migrations(name) VALUES ($1)`, [file]);
    console.log(`done ${file}`);
  }
  console.log("migrations complete");
  await pool.end();
}

migrate().catch((e) => {
  console.error("migration failed", e);
  process.exit(1);
});
