# Speed-to-Lead Orchestrator

> **Skill Name:** `/speed-to-lead`  
> **For:** Voice agents, chatbots, and conversational AI  
> **Purpose:** Automate lead qualification, routing, response generation, and logging  
> **Author:** FDC SaaS Architect  
> **Status:** Production-ready  

---

## What This Skill Does

When your AI agent captures a new lead from a conversation (phone, chat, web form), invoke this orchestrator to:

1. **Qualify** the lead using Sandler Pain Funnel (0-100 score)
2. **Route** based on score and business rules (book appointment / follow-up / human handoff / archive)
3. **Respond** with appropriate message (voice confirmation, SMS, email) using Verbal Judo + brand voice
4. **Log** to internal analytics and callback to client's CRM

---

## When to Use This Skill

**Trigger moments:**
- After the agent completes a sales conversation with a prospect
- When a web form captures lead info + conversation transcript
- After a voice call transcription is available
- When re-qualifying an existing lead with new information

**Input data:**
```json
{
  "tenant_slug": "drive-city",
  "lead_source": "voice_agent|web_chat|form|sms",
  "contact_name": "John Smith",
  "contact_email": "john@example.com",
  "contact_phone": "+1-555-0123",
  "conversation_transcript": "Customer mentioned registration expires next month, worried about downtime...",
  "vehicle_info": "2018 Honda Civic, needs smog",
  "service_interest": "smog check",
  "timestamp": "2026-05-05T14:32:00Z"
}
```

---

## The Execution Pipeline

### Step 1: Call `/qualify`

Input: lead object (contact info + transcript + context)
Output: score 0-100, pain identified flag, solution pitched flag, ROI articulated flag, recommended action.

**What it does:** Walks the Sandler Pain Funnel (See `/skills/qualify.md`):
- Does prospect acknowledge a problem?
- How deep is the pain?
- Have you positioned a solution?
- Has ROI been articulated?

**Scoring:** Each positive answer = +25 points. Final score determines next action.

---

### Step 2: Call `/route`

Input: lead + qualify result + tenant config
Output: action (book_appointment|follow_up|human_handoff|archive), channel, booking URL if applicable.

**What it does:** Applies tenant-specific routing rules (See `/skills/route.md`):
- If score >= 75 AND business hours open → book appointment immediately
- If score 50-74 → send follow-up SMS
- If score < 50 OR human judgment needed → route to owner
- Timing rule: respond within 5 minutes (the "speed" in speed-to-lead)

---

### Step 3: Call `/respond`

Input: lead + routing decision + tenant config (brand voice)
Output: message text, channel, messaging plan, sentiment.

**What it does:** Generates appropriate response using (See `/skills/respond.md`):
- Verbal Judo principles (dignity, options, empathy, explanation)
- Tenant brand voice (tone from config.json)
- Context-aware messaging (acknowledge pain, confirm solution, provide next step)

---

### Step 4: Call `/log`

Input: lead + all qualification/routing/response data
Output: event ID, CRM callback status, full audit trail.

**What it does:** (See `/skills/log.md`):
- Writes lead data to internal speed-to-lead database (tenant-isolated)
- Sends callback webhook to tenant's CRM with lead data + qualification score
- Records full audit trail for analytics and debugging
- Queues SMS/email sends via tenant's preferred channels

---

## Usage Pattern

When your agent captures a lead:

```
Agent internal logic:
  1. Gather all available info (contact, transcript, context)
  2. Call /speed-to-lead with tenant_slug + lead data
  3. The orchestrator runs qualify → route → respond → log internally
  4. Receive back: action + message template + booking link (if applicable)
  5. Respond to caller: "Thanks! I've booked you for [time], confirmation text incoming"
  6. Hand off or continue conversation

No agent code changes needed. Just invoke the skill once per lead.
```

---

## Configuration Requirements

Each tenant needs a `config.json` (see `/setup/config.md`):
- tenant_slug, business_name
- brand_voice (tone, tagline, personality)
- business_hours (open/close times per day)
- qualification_criteria (pain triggers, score thresholds)
- crm_webhook_url + hmac_secret
- owner_contact (names, emails, phone)
- notification_channels (booking confirmation, follow-up, alert threshold)

---

## Integration Points

**The service's webhook endpoint:**
```
POST https://fusion-skills.vercel.app/api/webhook/[tenant_slug]
Authorization: HMAC-SHA256 signature
Content-Type: application/json
```

**Response to your agent:**
```json
{
  "lead_id": "uuid",
  "qualified": true,
  "score": 78,
  "action": "book_appointment",
  "booking_link": "https://calendly.com/booking?id=...",
  "response_message": "Hi John! Based on your deadline, I've reserved you a slot tomorrow at 10 AM.",
  "callback_status": "queued",
  "speed_to_lead_ms": 342
}
```

---

## Error Handling

If qualification fails:
- Score defaults to 0, action = "follow_up" (safe fallback)
- All errors logged to audit trail
- Owner notified of unusual patterns

If CRM callback fails:
- Queued for retry (exponential backoff, max 24 hours)
- Agent told "booking confirmed internally; CRM sync in progress"

---

## Full Workflow Example: Drive City Smog Check

Agent talks to John (2018 Honda, registration expires May 30).

Internally calls `/speed-to-lead` with contact + transcript + vehicle info.

QUALIFY: Pain identified (downtime anxiety + registration deadline), solution mentioned, ROI clear. Score: 78/100.

ROUTE: Score 78 >= 75, business hours open. Action: book_appointment immediately.

RESPOND: "Perfect! I've locked you in for tomorrow at 10. You'll get a confirmation text in 30 seconds."

LOG: All data → speed-to-lead DB + callback to Drive City CRM. Audit trail recorded.

Agent speaks response to John. Both systems (voice agent + CRM) now have the lead.

---

## Scaling to Multiple Tenants

The service is multi-tenant. Each client gets:
- Unique tenant_slug (e.g., "drive-city", "northern-roots", "theinsuranceschool")
- Isolated config + qualification criteria
- Isolated lead database
- Separate CRM webhook callbacks
- Own brand voice + response tone

To add a new client:
1. Run setup wizard (see `/setup/config.md`)
2. Get CRM webhook URL + HMAC secret from their backend
3. Deploy speed-to-lead once (shared service)
4. Give them the webhook URL for their agent to call
5. Done

---

## Files in This Skill

```
/speed-to-lead/
├── SKILL.md (this file)
├── skills/
│   ├── qualify.md
│   ├── route.md
│   ├── respond.md
│   └── log.md
├── setup/
│   └── config.md
├── scaffold/ (Next.js service code)
├── README.md
└── INTEGRATION-drive-city.md
```

---

**Version:** 1.0 | **Updated:** 2026-05-05