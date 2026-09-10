/**
 * Speed-to-Lead — admin endpoint for tenant CRUD.
 *
 * Auth: Bearer token in Authorization header (env ADMIN_API_KEY).
 *
 * GET    /api/tenants        — list all tenants
 * POST   /api/tenants        — create new tenant
 * GET    /api/tenants/<slug> — single tenant detail
 * PATCH  /api/tenants/<slug> — update tenant config
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

const sql = neon(process.env.DATABASE_URL!);
const ADMIN_KEY = process.env.ADMIN_API_KEY;

function authed(req: VercelRequest): boolean {
  const h = (req.headers.authorization as string) || "";
  if (!h.startsWith("Bearer ")) return false;
  return !!ADMIN_KEY && h.slice(7) === ADMIN_KEY;
}
function readBody(req: VercelRequest): any {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body || {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (!authed(req)) return res.status(401).json({ success: false, error: "unauthorized" });

  const url = (req.url || "").split("?")[0];
  const slugMatch = url.match(/\/tenants\/([a-z0-9-]+)$/);
  const slug = typeof req.query.slug === "string" ? req.query.slug : slugMatch ? slugMatch[1] : null;

  try {
    // GET /tenants — list
    if (req.method === "GET" && !slug) {
      const rows = (await sql`SELECT id, slug, business_name, crm_webhook_url, created_at FROM fs_tenants ORDER BY created_at DESC`) as any[];
      return res.status(200).json({ success: true, tenants: rows });
    }

    // GET /tenants/<slug>
    if (req.method === "GET" && slug) {
      const rows = (await sql`SELECT * FROM fs_tenants WHERE slug=${slug} LIMIT 1`) as any[];
      if (!rows.length) return res.status(404).json({ success: false, error: "tenant_not_found" });
      return res.status(200).json({ success: true, tenant: rows[0] });
    }

    // POST /tenants — create
    if (req.method === "POST") {
      const b = readBody(req);
      if (!b.slug || !b.business_name || !b.crm_webhook_url) {
        return res.status(400).json({ success: false, error: "need_slug_business_name_crm_webhook_url" });
      }
      // Generate HMAC secrets (one for incoming from agent → us, one for our callback → tenant CRM)
      const incomingSecret = "fs_in_" + crypto.randomBytes(24).toString("hex");
      const crmSecret = b.crm_webhook_hmac_secret || ("fs_out_" + crypto.randomBytes(24).toString("hex"));

      const rows = (await sql`
        INSERT INTO fs_tenants
          (slug, business_name, brand_voice, business_hours, qualification_criteria,
           crm_webhook_url, crm_webhook_hmac_secret, incoming_hmac_secret, owner_contact, notification_channels)
        VALUES (
          ${b.slug}, ${b.business_name},
          ${JSON.stringify(b.brand_voice || {})}::jsonb,
          ${JSON.stringify(b.business_hours || {})}::jsonb,
          ${JSON.stringify(b.qualification_criteria || {})}::jsonb,
          ${b.crm_webhook_url}, ${crmSecret}, ${incomingSecret},
          ${JSON.stringify(b.owner_contact || {})}::jsonb,
          ${JSON.stringify(b.notification_channels || {})}::jsonb
        )
        RETURNING id, slug, business_name, incoming_hmac_secret, crm_webhook_hmac_secret
      `) as any[];
      return res.status(201).json({ success: true, tenant: rows[0] });
    }

    // PATCH /tenants/<slug>
    if (req.method === "PATCH" && slug) {
      const b = readBody(req);
      const updates: string[] = [];
      const vals: any[] = [];
      const fields: Record<string, "text" | "jsonb"> = {
        business_name: "text",
        brand_voice: "jsonb",
        business_hours: "jsonb",
        qualification_criteria: "jsonb",
        crm_webhook_url: "text",
        crm_webhook_hmac_secret: "text",
        owner_contact: "jsonb",
        notification_channels: "jsonb",
      };
      for (const [k, t] of Object.entries(fields)) {
        if (b[k] !== undefined) {
          updates.push(`${k} = $${vals.length + 1}${t === "jsonb" ? "::jsonb" : ""}`);
          vals.push(t === "jsonb" ? JSON.stringify(b[k]) : b[k]);
        }
      }
      if (!updates.length) return res.status(400).json({ success: false, error: "no_fields" });
      vals.push(slug);
      // Use Pool for parameterized — neon-tagged doesn't expose .query
      const { Pool } = await import("@neondatabase/serverless");
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const r = await pool.query(
        `UPDATE fs_tenants SET ${updates.join(", ")}, updated_at = now() WHERE slug = $${vals.length} RETURNING *`,
        vals
      );
      return res.status(200).json({ success: true, tenant: r.rows[0] });
    }

    return res.status(404).json({ success: false, error: "unknown_route" });
  } catch (e: any) {
    console.error("[fusion-skills/tenants] error:", e);
    return res.status(500).json({ success: false, error: "handler_error", message: e?.message });
  }
}
