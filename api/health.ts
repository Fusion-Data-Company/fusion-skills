import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  let dbOk = false;
  try {
    if (process.env.DATABASE_URL) {
      const sql = neon(process.env.DATABASE_URL);
      const r = (await sql`SELECT count(*)::int AS c FROM fs_tenants`) as any[];
      dbOk = r.length >= 0;
    }
  } catch (e) {
    dbOk = false;
  }
  res.status(200).json({
    success: true,
    service: "fusion-skills",
    db_connected: dbOk,
    ts: new Date().toISOString(),
  });
}
