# Fusion Skills — Universal Speed-to-Lead Service

Multi-tenant lead qualification + routing + response + CRM callback service. Any client website's voice agent (or chat, or form) POSTs new leads here; we score them via Sandler Pain Funnel, decide the next action, generate a Verbal Judo response, and call back to the tenant's CRM.

**Live URL (after Vercel deploy):** `https://fusion-skills.vercel.app`

## Architecture

```
   Client Agent (Andy / RoofTech / etc.)
          │ POST /api/webhook/<tenant_slug>
          │ x-fusion-signature: hmac
          ▼
   ┌──────────────────────────┐
   │  fusion-skills           │
   │  (Vercel serverless)     │
   │                          │
   │  1. Verify HMAC          │
   │  2. Lookup tenant        │
   │  3. Idempotency check    │
   │  4. Qualify (Sandler)    │
   │  5. Route                │
   │  6. Respond (Verbal Judo)│
   │  7. Persist + callback   │
   └──────────────────────────┘
          │ POST callback to tenant.crm_webhook_url
          │ X-FusionSkills-Signature: hmac
          ▼
   Tenant's CRM (Drive City / RoofTech / etc.)
```

## Database (single Neon instance, `fs_*` table prefix)

- `fs_tenants` — one row per client business
- `fs_incoming_leads` — raw payloads as they arrive
- `fs_qualified_leads` — score, action, response
- `fs_lead_events` — audit log
- `fs_lead_responses` — generated messages
- `fs_lead_callbacks` — CRM webhook delivery tracking

Schema lives in `migrations/001_fusion_skills_tables.sql` (applied directly to Neon by the Capo).

## Endpoints

| Method | Path                                   | Purpose                                    | Auth                       |
|--------|----------------------------------------|--------------------------------------------|----------------------------|
| POST   | /api/webhook/<tenant_slug>             | Submit a new lead                          | HMAC (per-tenant secret)   |
| POST   | /api/tenants                           | Create a new tenant                        | Bearer ADMIN_API_KEY       |
| GET    | /api/tenants                           | List tenants                               | Bearer ADMIN_API_KEY       |
| GET    | /api/tenants/<slug>                    | Get tenant detail                          | Bearer ADMIN_API_KEY       |
| PATCH  | /api/tenants/<slug>                    | Update tenant config                       | Bearer ADMIN_API_KEY       |
| GET    | /api/health                            | Health check                               | None                       |

## Required env vars (set in Vercel dashboard)

```
DATABASE_URL=postgresql://...        # The same Neon DB Drive City uses (we share with fs_* prefix)
ADMIN_API_KEY=<random 32+ chars>     # For /api/tenants admin
```

## Skill docs

The `/skill/` folder (in the parent staging area) holds the SKILL.md + qualify/route/respond/log markdown that any Claude-powered agent can read to understand how to call this service. Drop those skill files into your client agent's context to teach it the protocol.

## Integration script for new clients

See `INTEGRATION-template.md` (next to this README) — the copy-paste guide Rob hands to other companies' agents.

---

*Fusion Data Company | rob@fusiondataco.com*
