# Speed-to-Lead Integration Guide — Drive City Lube & Smog

**Complete setup instructions for Drive City's Andy agent.**

---

## Overview

Andy (ElevenLabs agent ID: `agent_2901k288p253fd091z70181n2m4f`) will call the Speed-to-Lead webhook after every customer conversation. The service will:

1. Score the lead using Sandler Pain Funnel (smog test, oil change, emissions focus)
2. Decide routing: book immediately, SMS follow-up, email nurture, or archive
3. Generate Verbal Judo response via Andy's voice channel
4. Send lead data + response to Drive City's CRM webhook

---

## Step 1: Deploy Speed-to-Lead Service

See **README.md** → "Deployment" section. Complete these steps:

- [ ] Clone scaffold to your Next.js project
- [ ] Set up Neon PostgreSQL database
- [ ] Run migrations
- [ ] Configure `.env.local` with: `DATABASE_URL`, `OPENROUTER_API_KEY`, `HMAC_DEFAULT_SECRET`
- [ ] Deploy to Vercel
- [ ] Record deployment URL (e.g., `https://speed-to-lead-service.vercel.app`)

---

## Step 2: Create Drive City Tenant

Run the admin API call to register Drive City as a tenant:

```bash
ADMIN_API_KEY="your-admin-key"
DEPLOYMENT_URL="https://speed-to-lead-service.vercel.app"

curl -X POST "${DEPLOYMENT_URL}/api/tenants" \
  -H "Authorization: Bearer ${ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @- << 'EOF'
{
  "slug": "drive-city",
  "business_name": "Drive City Lube & Smog",
  "brand_voice": {
    "tone": "friendly-professional",
    "values": ["transparency", "expertise", "community"],
    "personality": "trusted local mechanic who cares"
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
    "friday_end": "18:00",
    "saturday_start": "09:00",
    "saturday_end": "14:00"
  },
  "qualification_criteria": {
    "pain_triggers": [
      "smog test",
      "smog check",
      "emissions",
      "check engine",
      "engine light",
      "inspection",
      "oil change",
      "transmission",
      "battery",
      "emissions inspection"
    ],
    "score_thresholds": {
      "immediate": 75,
      "followup": 50,
      "nurture": 20
    }
  },
  "crm_webhook_url": "https://drive-city-connect.vercel.app/api/elevenlabs/webhook/lead-qualified",
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
  "tenant_id": "12345678-1234-1234-1234-123456789012",
  "slug": "drive-city",
  "webhook_url": "https://speed-to-lead-service.vercel.app/api/webhook/drive-city",
  "hmac_secret": "abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234yzab5678cdef90",
  "message": "Tenant created. Store hmac_secret securely."
}
```

**IMPORTANT:** Copy the `hmac_secret`. This is needed in Step 3.

---

## Step 3: Configure Andy's Webhook

In the **drive-city-connect** repository, update Andy's agent configuration to call Speed-to-Lead:

### Via ElevenLabs API (TypeScript):

```typescript
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY
});

const hmacSecret = "abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234yzab5678cdef90"; // From Step 2
const webhookUrl = "https://speed-to-lead-service.vercel.app/api/webhook/drive-city";

// Create/update Andy's webhook config
await client.conversationalAi.webhooks.create({
  settings: {
    authType: "hmac",
    secret: hmacSecret,
    name: "Speed-to-Lead Service",
    webhookUrl: webhookUrl
  }
});

// Configure post-call webhook events
await client.conversationalAi.settings.update({
  webhooks: {
    post_call_webhook_id: "webhook-id-from-above",
    events: ["transcript", "audio"]
  }
});
```

### Via ElevenLabs Dashboard (Manual):

1. Go to **Agents** → **Andy** → **Settings**
2. Under "Webhooks", click **Add Webhook**
3. **Webhook URL:** `https://speed-to-lead-service.vercel.app/api/webhook/drive-city`
4. **Auth Type:** HMAC-SHA256
5. **Secret:** `abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234yzab5678cdef90`
6. **Events:** `on_call_end` (or: transcript completed)
7. **Save**

---

## Step 4: Prepare Andy's Outgoing Webhook Payload

Andy needs to send transcript + contact info to Speed-to-Lead. Update Andy's post-call handler in **drive-city-connect/server/ai-routes.ts**:

```typescript
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export async function callSpeedToLeadService(
  transcript: string,
  contactName: string | null,
  contactPhone: string | null,
  contactEmail: string | null
) {
  const hmacSecret = "abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234yzab5678cdef90";
  const speedToLeadUrl = "https://speed-to-lead-service.vercel.app/api/webhook/drive-city";

  const payload = {
    transcript: transcript,
    contact: {
      name: contactName,
      phone: contactPhone,
      email: contactEmail
    },
    source: "voice_agent",
    timestamp: Date.now(),
    idempotency_key: uuidv4()
  };

  const payloadStr = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', hmacSecret)
    .update(payloadStr)
    .digest('hex');

  const response = await fetch(speedToLeadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-signature': signature
    },
    body: payloadStr
  });

  const result = await response.json();
  return result;
}
```

Call this after every conversation ends:

```typescript
// In conversation end handler
const speedToLeadResult = await callSpeedToLeadService(
  conversation.transcript,
  conversation.contact?.name || null,
  conversation.contact?.phone || null,
  conversation.contact?.email || null
);

console.log('Speed-to-Lead response:', speedToLeadResult);
// Log to database or monitoring
```

---

## Step 5: Implement Drive City's CRM Webhook Receiver

The Speed-to-Lead service will POST to: `https://drive-city-connect.vercel.app/api/elevenlabs/webhook/lead-qualified`

Create this endpoint in **drive-city-connect/server/crm-routes.ts**:

```typescript
import crypto from 'crypto';
import { Router, Request, Response } from 'express';

const router = Router();

router.post('/api/elevenlabs/webhook/lead-qualified', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-webhook-signature'] as string;
    const crm_webhook_secret = "your-crm-webhook-secret"; // Store in .env or tenants config

    // Verify signature
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', crm_webhook_secret)
      .update(payload)
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Extract lead data
    const {
      lead_id,
      contact,
      qualification,
      routing,
      response_sent
    } = req.body;

    // Log to Drive City's database
    const lead = await db.leads.create({
      external_lead_id: lead_id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      qualification_score: qualification.score,
      pain_flags: qualification.pain_flags,
      pain_summary: qualification.pain_summary,
      action_tier: qualification.action_tier,
      recommended_action: routing.action,
      routing_channel: routing.channel,
      response_message: response_sent.message,
      response_sentiment: response_sent.sentiment,
      lead_source: 'voice_agent',
      created_at: new Date()
    });

    // Trigger downstream actions
    if (routing.action === 'book_appointment') {
      // Create calendar event, send booking confirmation
      await createBookingEvent(contact, lead);
    } else if (routing.action === 'follow_up_sms') {
      // Queue SMS campaign
      await queueSMSFollowUp(contact, lead);
    } else if (routing.action === 'follow_up_email') {
      // Queue email campaign
      await queueEmailFollowUp(contact, lead);
    }

    // Notify Ted/Jazzy if high-priority
    if (qualification.urgency_score >= 8) {
      await sendOwnerNotification(contact, qualification);
    }

    return res.status(200).json({
      status: 'processed',
      lead_id: lead.id,
      action: routing.action
    });
  } catch (error) {
    console.error('CRM webhook error:', error);
    return res.status(500).json({ error: 'Failed to process webhook' });
  }
});

export default router;
```

Register in **server/index.ts**:

```typescript
import crmRoutes from './crm-routes';

app.use(crmRoutes);
```

---

## Step 6: Test the Integration

### Test 1: Manual Webhook Call

```bash
HMAC_SECRET="abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234yzab5678cdef90"
WEBHOOK_URL="https://speed-to-lead-service.vercel.app/api/webhook/drive-city"

PAYLOAD='{
  "transcript": "Customer: I need a smog check. Agent: I can help with that. Customer: My check engine light is on too.",
  "contact": {
    "name": "John Doe",
    "phone": "+1-555-0123",
    "email": "john@example.com"
  },
  "source": "voice_agent",
  "timestamp": 1672531200000,
  "idempotency_key": "test-key-1"
}'

SIGNATURE=$(echo -n "${PAYLOAD}" | openssl dgst -sha256 -hmac "${HMAC_SECRET}" | sed 's/^.* //')

curl -X POST "${WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: ${SIGNATURE}" \
  -d "${PAYLOAD}"
```

Expected response:

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

### Test 2: Verify CRM Webhook Received

Check **drive-city-connect** logs for the incoming webhook:

```bash
# Tail Vercel logs
vercel logs drive-city-connect --follow

# Look for: "CRM webhook received: lead_id=..."
```

### Test 3: Check Database

Query the Speed-to-Lead service database:

```bash
# List all Drive City leads
curl -X GET "https://speed-to-lead-service.vercel.app/api/tenants" \
  -H "Authorization: Bearer ${ADMIN_API_KEY}"
```

---

## Operational Checklist

- [ ] Speed-to-Lead service deployed to Vercel
- [ ] Neon database created and migrations run
- [ ] Drive City tenant created with HMAC secret
- [ ] Andy's webhook configured (ElevenLabs dashboard or API)
- [ ] Drive City's CRM webhook receiver implemented
- [ ] Manual test call succeeds
- [ ] CRM webhook verification passes
- [ ] Monitoring/logging set up
- [ ] Andy re-deployed with Speed-to-Lead integration

---

## Monitoring & Debugging

### Metrics to Track

- **Speed-to-Lead time:** `pipeline.timing_ms` (target: < 300ms)
- **Qualification distribution:** % strong/soft/weak scores
- **Routing actions:** % book/SMS/email/archive
- **CRM webhook success:** % delivered vs. retry vs. failed
- **Urgency alerts:** Count of high-urgency leads (sent to Ted/Jazzy)

### Common Issues

**"Invalid webhook signature"**
- Verify HMAC secret matches between ElevenLabs config and Speed-to-Lead tenant
- Check that payload is not modified after signing

**"Tenant not found"**
- Confirm URL slug is exactly `drive-city`
- Verify tenant was created successfully in Step 2

**"CRM webhook not received"**
- Check Speed-to-Lead logs for webhook send attempt
- Verify Drive City CRM endpoint URL is reachable
- Check Drive City server logs for incoming request

**"Duplicate leads in database"**
- Idempotency keys prevent this; check `incoming_leads.idempotency_key` for collisions
- If duplicates occur, investigate transcript + contact + timestamp extraction in Andy's handler

---

## Next Steps

1. **Daily monitoring:** Set up Sentry/DataDog to alert on webhook failures
2. **Performance optimization:** Track `timing_ms` and adjust LLM/router thresholds
3. **Scale:** Once stable, promote Speed-to-Lead to standalone `Fusion-Data-Company/fusion-skills` repo
4. **Multi-client:** Create templates for future clients (Northern Roots, etc.)

---

## Contact

Questions? Rob Yeager: rob@fusiondataco.com
