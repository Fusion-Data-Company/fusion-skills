/**
 * Speed-to-Lead — main webhook receiver.
 *
 * Any client agent (Andy, future RoofTech agent, etc.) POSTs here when they
 * surface a new lead. We:
 *   1. Verify HMAC signature (per-tenant secret)
 *   2. Lookup tenant config by slug from URL
 *   3. Idempotency check
 *   4. Qualify (Sandler Pain Funnel scoring 0-100)
 *   5. Route (immediate / followup / nurture / archive)
 *   6. Respond (Verbal Judo + tenant brand voice)
 *   7. Log + callback to tenant's CRM webhook
 *
 * URL: POST /api/webhook?slug=<tenant_slug>
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon, Pool } from "@neondatabase/serverless";
import crypto from "crypto";

const sql = neon(process.env.DATABASE_URL!);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================================================
// Helpers
// ============================================================================
function rawString(req: VercelRequest): string {
  return typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
}
function readBody(req: VercelRequest): any {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body || {};
}
function verifyHmac(secret: string, ts: string, raw: string, sig: string): boolean {
  const tsNum = parseInt(ts, 10);
  if (Number.isNaN(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
function idempotencyKey(payload: any): string {
  const phone = payload.contact?.phone || payload.customer_phone || "";
  const email = payload.contact?.email || payload.customer_email || "";
  const src = payload.source || "unknown";
  const hour = Math.floor(Date.now() / 3600_000);
  return crypto.createHash("sha256").update(`${phone}|${email}|${src}|${hour}`).digest("hex").slice(0, 32);
}

// ============================================================================
// Sandler Pain Funnel scoring (0-100)
// ============================================================================
function qualifyLead(payload: any): {
  score: number;
  pain_identified: string;
  solution_pitched: string;
  roi_articulated: string;
  factors: Record<string, number>;
} {
  const transcript = (payload.transcript || payload.notes || "").toLowerCase();
  const explicit = {
    pain: payload.pain_identified || payload.pain || "",
    solution: payload.solution_pitched || payload.solution || "",
    roi: payload.roi_articulated || payload.roi || "",
    score_hint: typeof payload.qualification_score === "number" ? payload.qualification_score : null,
  };

  const factors: Record<string, number> = {};
  // 1. Problem acknowledged (15)
  factors.problem_ack = explicit.pain ? 15 : /problem|issue|trouble|hurt|frustrat|broken|stuck|can'?t/i.test(transcript) ? 12 : 0;
  // 2. Pain severity (15)
  factors.pain_severity = /urgent|emergency|deadline|today|asap|right now|critical/i.test(transcript) ? 15 :
                          /soon|this week|need to/i.test(transcript) ? 10 : 5;
  // 3. Pain specificity (15)
  const specWords = (transcript.match(/\b(because|since|when|every time|costs|charges|spent|wasted)\b/gi) || []).length;
  factors.pain_specificity = Math.min(specWords * 3, 15);
  // 4. Prior attempts (10)
  factors.prior_attempts = /tried|attempted|already|other shop|elsewhere|last time/i.test(transcript) ? 10 : 0;
  // 5. Solution positioned (15)
  factors.solution_pitched = explicit.solution ? 15 : /combo|service|appointment|book/i.test(transcript) ? 10 : 0;
  // 6. ROI articulated (15)
  factors.roi_articulated = explicit.roi ? 15 : /save|cost|deadline|registration|fine|fee/i.test(transcript) ? 10 : 0;
  // 7. Action signal (10)
  factors.action_signal = /book|schedule|come in|stop by|tomorrow|tuesday|wednesday|today/i.test(transcript) ||
                          payload.requested_appointment ? 10 : 5;

  let score = Object.values(factors).reduce((a, b) => a + b, 0);
  if (explicit.score_hint !== null) {
    score = Math.round(0.6 * score + 0.4 * explicit.score_hint);
  }
  return {
    score: Math.min(score, 100),
    pain_identified: explicit.pain || (transcript ? transcript.slice(0, 200) : ""),
    solution_pitched: explicit.solution,
    roi_articulated: explicit.roi,
    factors,
  };
}

// ============================================================================
// Routing logic
// ============================================================================
type Route = "book_now" | "followup_sms" | "followup_email" | "nurture" | "archive" | "owner_alert";
function routeLead(score: number, payload: any, hours: any): { action: Route; reason: string } {
  const inHours = isInBusinessHours(hours);
  const urgency = payload.urgency_score ?? (score >= 75 ? 8 : 5);

  if (urgency >= 8 && !inHours) return { action: "owner_alert", reason: "high urgency outside hours" };
  if (score >= 75) return { action: "book_now", reason: "qualified for immediate booking" };
  if (score >= 50) return inHours ? { action: "followup_sms", reason: "warm lead, prompt followup" } : { action: "followup_email", reason: "warm lead, async followup" };
  if (score >= 20) return { action: "nurture", reason: "early-stage, drip campaign" };
  return { action: "archive", reason: "low intent" };
}
function isInBusinessHours(hours: any): boolean {
  // hours: { monday: ["08:00","18:00"], ... } — defaults to true if not set
  if (!hours || typeof hours !== "object") return true;
  const now = new Date();
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const day = days[now.getDay()];
  const slot = hours[day];
  if (!slot || !Array.isArray(slot) || slot.length !== 2) return false;
  const [open, close] = slot;
  const t = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  return t >= open && t <= close;
}

// ============================================================================
// Response generation (Verbal Judo + tenant brand voice)
// ============================================================================
function generateResponse(action: Route, tenant: any, payload: any, qualResult: any): string {
  const brand = tenant.brand_voice || {};
  const tone = brand.tone || "friendly-professional";
  const businessName = tenant.business_name;
  const name = payload.contact?.name || payload.customer_name || "there";

  switch (action) {
    case "book_now":
      return `Hey ${name}, thanks for reaching out to ${businessName}. Sounds like a good fit — let's get you on the schedule. I'll text you a couple of slot options in the next minute.`;
    case "followup_sms":
      return `Hi ${name}, quick note from ${businessName}. We can definitely help with what you described. I'll have someone reach out shortly to walk you through options.`;
    case "followup_email":
      return `Hi ${name}, thanks for getting in touch with ${businessName}. We're closed for the day but I've put you at the top of the list — you'll hear from us first thing tomorrow morning.`;
    case "nurture":
      return `Thanks for the inquiry, ${name}. We'll keep you in the loop with relevant info from ${businessName}. If anything changes and you want to chat sooner, just reply.`;
    case "owner_alert":
      return `${name}, I've flagged this as urgent for the owner. Someone will reach out personally within the hour.`;
    case "archive":
    default:
      return `Thanks, ${name}. We've noted your interest and will be in touch if relevant.`;
  }
}

// ============================================================================
// Send callback to tenant's CRM webhook
// ============================================================================
async function sendCrmCallback(tenant: any, lead: any, qualResult: any, route: any, response: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = tenant.crm_webhook_url;
  if (!url) return { ok: false, error: "no_crm_webhook_url" };

  const body = {
    event: "lead.qualified",
    tenant_slug: tenant.slug,
    lead_id: lead.id,
    contact: { name: lead.contact_name, email: lead.contact_email, phone: lead.contact_phone },
    qualification: qualResult,
    routing: route,
    response_sent: response,
    timestamp: new Date().toISOString(),
  };
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (tenant.crm_webhook_hmac_secret) {
    const sig = crypto.createHmac("sha256", tenant.crm_webhook_hmac_secret).update(`${ts}.${raw}`).digest("hex");
    headers["X-FusionSkills-Timestamp"] = ts;
    headers["X-FusionSkills-Signature"] = sig;
  }
  try {
    const r = await fetch(url, { method: "POST", headers, body: raw });
    return { ok: r.ok, status: r.status };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-fusion-signature, x-fusion-timestamp");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });

  // Tenant slug from URL query OR path
  const slug = (req.query.slug as string) || (req.url || "").split("/").filter(Boolean).pop();
  if (!slug || slug === "webhook") return res.status(400).json({ success: false, error: "missing_tenant_slug" });

  // Lookup tenant
  let tenant: any;
  try {
    const rows = (await sql`SELECT * FROM fs_tenants WHERE slug=${slug} LIMIT 1`) as any[];
    if (!rows.length) return res.status(404).json({ success: false, error: "tenant_not_found" });
    tenant = rows[0];
  } catch (e: any) {
    return res.status(500).json({ success: false, error: "tenant_lookup_failed", message: e?.message });
  }

  // Verify HMAC (using tenant's incoming HMAC secret)
  const sig = (req.headers["x-fusion-signature"] as string) || "";
  const ts = (req.headers["x-fusion-timestamp"] as string) || "";
  const raw = rawString(req);
  if (sig && ts) {
    if (!verifyHmac(tenant.incoming_hmac_secret || tenant.crm_webhook_hmac_secret, ts, raw, sig)) {
      return res.status(401).json({ success: false, error: "invalid_signature" });
    }
  }
  // If no signature provided, allow during early rollout. Phase 7 will require it.

  const payload = readBody(req);

  try {
    // Idempotency — return cached response if we've seen this exact lead recently
    const idemKey = payload.idempotency_key || idempotencyKey(payload);
    const dup = (await sql`
      SELECT id, qualification_score, action FROM fs_qualified_leads
      WHERE tenant_id=${tenant.id} AND idempotency_key=${idemKey}
        AND created_at > now() - interval '10 minutes'
      LIMIT 1
    `) as any[];
    if (dup.length) {
      return res.status(200).json({ success: true, dedup: true, lead_id: dup[0].id });
    }

    // 1. Insert incoming lead
    const lead = (await sql`
      INSERT INTO fs_incoming_leads (tenant_id, source, raw_payload, contact_name, contact_email, contact_phone, idempotency_key)
      VALUES (
        ${tenant.id},
        ${payload.source || "voice_agent"},
        ${JSON.stringify(payload)}::jsonb,
        ${payload.contact?.name || payload.customer_name || null},
        ${payload.contact?.email || payload.customer_email || null},
        ${payload.contact?.phone || payload.customer_phone || null},
        ${idemKey}
      )
      RETURNING id
    `) as any[];
    const leadId = lead[0].id;

    // 2. Qualify
    const qualResult = qualifyLead(payload);

    // 3. Route
    const route = routeLead(qualResult.score, payload, tenant.business_hours);

    // 4. Respond
    const response = generateResponse(route.action, tenant, payload, qualResult);

    // 5. Persist qualified lead
    await sql`
      INSERT INTO fs_qualified_leads
        (tenant_id, incoming_lead_id, idempotency_key, qualification_score, score_breakdown,
         pain_identified, solution_pitched, roi_articulated, action, reason, response_sent)
      VALUES (
        ${tenant.id}, ${leadId}, ${idemKey}, ${qualResult.score},
        ${JSON.stringify(qualResult.factors)}::jsonb,
        ${qualResult.pain_identified}, ${qualResult.solution_pitched}, ${qualResult.roi_articulated},
        ${route.action}, ${route.reason}, ${response}
      )
    `;

    // 6. Event
    await sql`
      INSERT INTO fs_lead_events (tenant_id, lead_id, event_type, payload)
      VALUES (${tenant.id}, ${leadId}, 'qualified', ${JSON.stringify({ score: qualResult.score, action: route.action })}::jsonb)
    `;

    // 7. CRM callback (best effort)
    const callback = await sendCrmCallback(tenant, {
      id: leadId,
      contact_name: payload.contact?.name || payload.customer_name,
      contact_email: payload.contact?.email || payload.customer_email,
      contact_phone: payload.contact?.phone || payload.customer_phone,
    }, qualResult, route, response);

    await sql`
      INSERT INTO fs_lead_events (tenant_id, lead_id, event_type, payload)
      VALUES (${tenant.id}, ${leadId}, 'crm_callback', ${JSON.stringify(callback)}::jsonb)
    `;

    return res.status(200).json({
      success: true,
      lead_id: leadId,
      qualification: qualResult,
      routing: route,
      response_sent: response,
      crm_callback: callback,
    });
  } catch (e: any) {
    console.error("[fusion-skills/webhook] error:", e);
    return res.status(500).json({ success: false, error: "handler_error", message: e?.message });
  }
}
