# Speed-to-Lead Service — Fusion Data Company

**Multi-tenant lead qualification, routing, and CRM integration engine for voice agents and chatbots.**

Automates Sandler Pain Funnel qualification + Verbal Judo response generation. Integrates with any ElevenLabs agent via HMAC-verified webhook. Stores all lead data in Neon Postgres.

---

## Architecture

### The Pipeline (< 5 minutes)

Every webhook call goes through four stages:

```
Incoming Webhook
    ↓
[1] Qualify: Score lead 0-100 using Sandler Pain Funnel
    • Extract pain signals from transcript
    • Score: problem, severity, specificity, solving attempts, solution positioning, ROI, action signal
    • Output: score, action_tier, urgency_score, pain_flags
    ↓
[2] Route: Determine action based on score + context
    • Score >= 75: book_appointment
    • Score 50-74: follow_up_sms or follow_up_email
    • Score 20-49: nurture_sequence
    • Score < 20: archive
    • Business hours modifier: escalate after-hours high scores
    ↓
[3] Respond: Generate personalized response
    • Verbal Judo principles: acknowledge, offer options, explain why, show respect
    • Channel selection: voice → SMS → email
    • Brand voice injection: tone, values, personality
    ↓
[4] Log: Store in database + send CRM webhook
    • Insert: qualified_leads, lead_events, lead_responses
    • Queue: CRM callback webhook with HMAC signature
    • Retry: Exponential backoff (max 24 hours)
    ↓
Response: { status, event_id, pipeline, timing_ms }
```

### Multi-Tenant Isolation

- **Tenants table**: Stores business config, brand voice, routing rules, CRM webhook details
- **Idempotency keys**: Prevents duplicate processing (hash of contact + timestamp + source)
- **HMAC verification**: Every webhook must be signed with tenant's secret
- **Separate event trails**: Each tenant's leads isolated in separate rows

### Database Schema

**tenants** → business config, brand voice, webhook secrets, owner contact  
**incoming_leads** → raw webhook payload + contact extraction  
**qualified_leads** → score breakdown, pain flags, action tier  
**lead_events** → audit trail (audit_type: 'qualify', 'route', 'respond', 'callback', 'retry')  
**lead_responses** → generated response text, sentiment, brand compliance  
**lead_callbacks** → webhook delivery tracking, retry history  

---

## Deployment

### 1. Clone the Scaffold

```bash
cd /path/to/your/project
cp -r staging/fusion-skills/speed-to-lead/scaffold .
cd scaffold
npm install
```

### 2. Set Up Neon Database

Create a Neon project at [https://neon.tech](https://neon.tech):

```bash
# Copy DATABASE_URL from Neon dashboard
echo "DATABASE_URL=postgresql://..." >> .env.local
```

### 3. Run Migrations

```bash
npm run db:migrate
```

This creates all tables: tenants, incoming_leads, qualified_leads, lead_events, lead_responses, lead_callbacks.

### 4. Create Admin API Key

```bash
# Generate random key
node -e "console.log(crypto.randomBytes(32).toString('hex'))"

# Add to .env.local
echo "ADMIN_API_KEY=your_generated_key" >> .env.local
```

### 5. Configure Environment

```bash
# .env.local
DATABASE_URL=postgresql://...
OPENROUTER_API_KEY=sk_or_...
HMAC_DEFAULT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
ADMIN_API_KEY=<generate above>
```

### 6. Deploy to Vercel

```bash
npm install -g vercel
vercel --prod

# Follow prompts to link project, confirm environment variables
```

Vercel will:
- Build Next.js app
- Deploy to production URL
- Auto-populate `VERCEL_URL` environment variable
- Enable webhook endpoint: `https://your-deployment.vercel.app/api/webhook/[tenantSlug]`

---

## Creating a Tenant

### Via Admin API

```bash
curl -X POST https://your-deployment.vercel.app/api/tenants \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d @- << 'EOF'
{
  "slug": "drive-city",
  "business_name": "Drive City Lube & Smog",
  "brand_voice": {
    "tone": "friendly-professional",
    "values": ["transparency", "expertise", "community"],
    "personality": "trusted local mechanic"
  },
  "business_hours": {
    "timezone": "America/Los_Angeles",
    "monday_start": "08:00",
    "monday_end": "18:00",
    "tuesday_start": "08:00",
    "tuesday_end": "18:00",
    "wednesday_start": "08:00",
    "wednesday_end": "18:00",
    "thursday_start": "08:00",
    "thursday_end": "18:00",
    "friday_start": "08:00",
    "friday_end": "18:00"
  },
  "qualification_criteria": {
    "pain_triggers": ["smog test", "oil change", "emissions", "check engine", "inspection"],
    "score_thresholds": {
      "immediate": 75,
      "followup": 50,
      "nurture": 20
    }
  },
  "crm_webhook_url": "https://your-crm.com/api/webhooks/drive-city-leads",
  "owner_contact": {
    "name": "Ted Jergensen",
    "phone": "+1-555-0100",
    "email": "ted@drivecity.local"
  },
  "notification_channels": {
    "sms_enabled": true,
    "email_enabled": true,
    "owner_phone": "+1-555-0100",
    "owner_email": "ted@drivecity.local"
  }
}
EOF
```

**Response:**

```json
{
  "status": "created",
  "tenant_id": "uuid-here",
  "slug": "drive-city",
  "webhook_url": "https://your-deployment.vercel.app/api/webhook/drive-city",
  "hmac_secret": "64-character-hex-string",
  "message": "Tenant created. Store hmac_secret securely."
}
```

**Store the `hmac_secret` in your ElevenLabs agent configuration (or CRM).**

---

## Integrating an ElevenLabs Agent

### 1. Configure the Agent Webhook

In your ElevenLabs agent config (via API or dashboard):

```typescript
agent.webhooks.outgoing = {
  url: "https://your-deployment.vercel.app/api/webhook/drive-city",
  events: ["on_message", "on_call_end"],
  auth_type: "hmac",
  auth_secret: "64-character-hex-string-from-tenant-creation"
};
```

### 2. Generate HMAC Signature (Agent Side)

When calling the webhook, sign the payload:

```typescript
import crypto from 'crypto';

const secret = "your-hmac-secret";
const payload = JSON.stringify({
  transcript: "Customer asked about smog test requirements...",
  contact: { name: "John Doe", phone: "+1-555-0123", email: "john@example.com" },
  source: "voice_agent",
  timestamp: Date.now(),
  idempotency_key: "uuid-for-deduplication"
});

const signature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

// Send request
fetch("https://your-deployment.vercel.app/api/webhook/drive-city", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-webhook-signature": signature
  },
  body: payload
});
```

### 3. Handle Response

```json
{
  "status": "success",
  "event_id": "uuid-here",
  "pipeline": {
    "qualify": {
      "score": 82,
      "action_tier": "strong",
      "pain_flags": ["smog_test", "check_engine"]
    },
    "route": {
      "action": "book_appointment",
      "channel": "voice",
      "urgency": 9
    },
    "respond": {
      "channel": "voice",
      "sentiment": "positive"
    },
    "log": {
      "callback_queued": true,
      "audit_trail_id": "uuid-here"
    }
  },
  "timing_ms": 234
}
```

---

## CRM Webhook Callback

After qualifying and responding to a lead, the service sends a callback webhook to your CRM:

### Payload Structure

```json
{
  "event_type": "lead_qualified",
  "timestamp": "2026-05-05T14:23:00Z",
  "lead_id": "uuid-here",
  "tenant_id": "uuid-here",
  "contact": {
    "name": "John Doe",
    "phone": "+1-555-0123",
    "email": "john@example.com"
  },
  "qualification": {
    "score": 82,
    "action_tier": "strong",
    "pain_flags": ["smog_test", "check_engine"],
    "pain_summary": "Customer needs smog test. Engine light on. Concerned about inspection.",
    "urgency_score": 9,
    "recommended_action": "book_appointment"
  },
  "routing": {
    "action": "book_appointment",
    "channel": "voice",
    "reasoning": "Score 82 + business hours open → immediate booking"
  },
  "response_sent": {
    "channel": "voice",
    "message": "Perfect! I've locked you in for Tuesday at 2pm...",
    "sentiment": "positive",
    "brand_compliant": true
  }
}
```

### Signature Verification (CRM Side)

Verify HMAC signature on receipt:

```typescript
import crypto from 'crypto';

const secret = "your-crm-webhook-secret-from-tenant-config";
const signature = request.headers['x-webhook-signature'];
const payload = JSON.stringify(request.body);

const expectedSignature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

if (signature !== expectedSignature) {
  return res.status(401).json({ error: 'Invalid signature' });
}

// Process webhook...
```

---

## Query Examples

### Get All Leads for a Tenant

```typescript
import { db } from '@/lib/db';
import { qualified_leads } from '@/lib/schema';
import { eq } from 'drizzle-orm';

const tenantLeads = await db
  .select()
  .from(qualified_leads)
  .where(eq(qualified_leads.tenant_id, 'tenant-uuid'))
  .orderBy((t) => t.created_at);
```

### Speed-to-Lead Metric (in milliseconds)

```typescript
import { db } from '@/lib/db';
import { lead_events } from '@/lib/schema';
import { sql } from 'drizzle-orm';

const speedMetric = await db
  .select({
    avg_ms: sql`AVG(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) * 1000)`,
    min_ms: sql`MIN(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) * 1000)`,
    max_ms: sql`MAX(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) * 1000)`
  })
  .from(lead_events)
  .where(eq(lead_events.event_type, 'qualify'));
```

### Qualification Rate by Tier

```typescript
const rateByTier = await db
  .select({
    action_tier: qualified_leads.action_tier,
    count: sql`COUNT(*)`
  })
  .from(qualified_leads)
  .where(eq(qualified_leads.tenant_id, 'tenant-uuid'))
  .groupBy((q) => q.action_tier);
```

---

## Troubleshooting

### "Invalid webhook signature"
- Verify `x-webhook-signature` header is present
- Ensure agent is using correct HMAC secret
- Check that request body JSON is not modified after signing

### "Tenant not found"
- Verify URL slug matches tenant slug (e.g., `/api/webhook/drive-city`)
- Confirm tenant was created via admin API
- Check deployment `VERCEL_URL` is correct

### "No HMAC secret configured"
- Tenant must have `crm_webhook_hmac_secret` or `HMAC_DEFAULT_SECRET` env var
- Re-create tenant if secret missing

### Webhook callback not received
- Check `lead_callbacks` table for retry status
- Verify CRM webhook URL is reachable from Vercel
- Check CRM webhook logs for 4xx/5xx responses
- Service retries with exponential backoff (1s, 2s, 4s, 8s, 16s, max 24h)

---

## Project Structure

```
scaffold/
├── .env.example           # Copy to .env.local, fill in credentials
├── package.json           # Dependencies
├── next.config.js         # Next.js config
├── vercel.json            # Vercel deployment config
├── drizzle.config.ts      # Drizzle migration config
├── tsconfig.json          # TypeScript config
│
├── drizzle/
│   ├── schema.ts          # Drizzle ORM schema (all 6 tables)
│   └── migrations/        # Auto-generated Drizzle migrations
│
├── lib/
│   ├── db.ts              # Drizzle DB connection
│   ├── qualify.ts         # Sandler Pain Funnel scoring (206 lines)
│   ├── route.ts           # Lead routing decision logic (175 lines)
│   ├── respond.ts         # Verbal Judo response generation (247 lines)
│   └── log.ts             # Database logging + CRM webhook (332 lines)
│
└── app/
    ├── layout.tsx         # Root layout
    ├── page.tsx           # Health check landing
    └── api/
        ├── webhook/
        │   └── [tenantSlug]/
        │       └── route.ts      # Main webhook orchestrator (366 lines)
        └── tenants/
            └── route.ts          # Admin tenant CRUD (296 lines)
```

---

## License

Fusion Data Company. All rights reserved.

---

## Support

For questions: rob@fusiondataco.com
