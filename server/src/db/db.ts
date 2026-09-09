import pg, { Pool } from "pg";
import { config } from "dotenv";
import path from "path";

// Parse NUMERIC (oid 1700) as float so calculations and toFixed work seamlessly
pg.types.setTypeParser(1700, (val: string) => (val === null ? null : parseFloat(val)));

config({ path: path.resolve(__dirname, "../../.env") });

export const pool = new Pool({
  user: process.env.PGUSER || "nirf_app",
  password: process.env.PGPASSWORD || "nirf_app_pw123",
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "nirf_db",
  max: 10,
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
