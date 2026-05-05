# Lead Logging & CRM Callback Skill

> **Skill Name:** `/log`  
> **Purpose:** Write leads to internal DB + callback to tenant CRM + queue messaging  
> **Input:** Completed lead pipeline (qualify + route + respond data)  
> **Output:** Event ID, callback status, audit trail  

---

## What Gets Logged

Everything. The `lead_events` table is the audit trail.

For each lead, we capture:

1. **Incoming lead event** — when received, source, raw payload
2. **Qualification event** — score, pain analysis, action recommended
3. **Routing event** — action decided, reason, channel selected
4. **Response event** — message generated, sentiment, brand voice applied
5. **Callback event** — tenant CRM webhook sent, status, response
6. **Delivery event** — SMS/email queued, delivery status updates

---

## Database Tables

### `incoming_leads`
```sql
CREATE TABLE incoming_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  source VARCHAR(50) NOT NULL,  -- "voice_agent|web_chat|form|sms"
  raw_payload JSONB NOT NULL,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(20),
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `qualified_leads`
```sql
CREATE TABLE qualified_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  incoming_lead_id UUID NOT NULL REFERENCES incoming_leads(id),
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  pain_identified BOOLEAN,
  solution_pitched BOOLEAN,
  roi_articulated BOOLEAN,
  pain_summary TEXT,
  action_tier VARCHAR(50),  -- "perfect|strong|soft|weak|none"
  recommended_action VARCHAR(50),  -- "book_appointment|follow_up_sms|..."
  qualified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `lead_events`
```sql
CREATE TABLE lead_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  lead_id UUID NOT NULL REFERENCES qualified_leads(id),
  event_type VARCHAR(50) NOT NULL,  -- "qualified|routed|responded|callback|delivery"
  payload JSONB NOT NULL,
  status VARCHAR(50),  -- "success|pending|failed|queued"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX (tenant_id, created_at),
  INDEX (lead_id, event_type)
);
```

### `lead_responses`
```sql
CREATE TABLE lead_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  lead_id UUID NOT NULL REFERENCES qualified_leads(id),
  channel VARCHAR(50) NOT NULL,  -- "voice|sms|email|web_chat"
  message_text TEXT NOT NULL,
  sentiment VARCHAR(50),  -- "confident|friendly|educational|urgent"
  brand_compliance BOOLEAN,  -- did it match brand voice?
  sent_at TIMESTAMPTZ,
  delivery_status VARCHAR(50),  -- "queued|sent|delivered|failed|bounced"
  delivery_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `lead_callbacks`
```sql
CREATE TABLE lead_callbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  lead_id UUID NOT NULL REFERENCES qualified_leads(id),
  callback_url VARCHAR(2048) NOT NULL,
  payload_sent JSONB NOT NULL,
  http_status INT,
  response_body TEXT,
  callback_timestamp TIMESTAMPTZ DEFAULT NOW(),
  retry_count INT DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  status VARCHAR(50),  -- "delivered|pending|failed"
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Logging Flow

### Step 1: Create Incoming Lead Record

When lead first arrives:

```sql
INSERT INTO incoming_leads (tenant_id, source, raw_payload, ...)
VALUES ($1, $2, $3, ...)
RETURNING id;
```

Log event: `{event_type: "lead_received", status: "success"}`

---

### Step 2: Log Qualification

After `/qualify` completes:

```sql
INSERT INTO qualified_leads (
  tenant_id, incoming_lead_id, score, pain_identified,
  solution_pitched, roi_articulated, pain_summary,
  action_tier, recommended_action
)
VALUES (...);
```

Log event:
```json
{
  "event_type": "qualified",
  "status": "success",
  "payload": {
    "score": 85,
    "action_tier": "perfect_lead",
    "pain_summary": "Registration deadline May 30, downtime anxiety",
    "time_to_qualify_ms": 245
  }
}
```

---

### Step 3: Log Routing

After `/route` decision:

```json
{
  "event_type": "routed",
  "status": "success",
  "payload": {
    "action": "book_appointment",
    "channel": "voice_confirmation",
    "reason": "Score 85, business hours open",
    "booking_url": "https://calendly.com/...",
    "time_to_route_ms": 87
  }
}
```

---

### Step 4: Log Response

After `/respond` generates message(s):

```json
{
  "event_type": "responded",
  "status": "success",
  "payload": {
    "channels": ["voice", "sms", "email"],
    "sentiment": "confident",
    "brand_compliance": true,
    "messages": {
      "voice": "Perfect! I've locked you in...",
      "sms": "Hi John! Drive City here...",
      "email": "Your appointment confirmed..."
    },
    "time_to_respond_ms": 156
  }
}
```

---

### Step 5: Callback to Tenant CRM

**This is critical.** The tenant's CRM (e.g., Drive City's internal system) gets notified that a lead was qualified.

**Webhook payload sent to `crm_webhook_url`:**

```json
{
  "lead_id": "lead_abc123",
  "tenant_id": "tenant_drive_city",
  "event_type": "lead_qualified",
  "contact": {
    "name": "John Smith",
    "email": "john@smith.com",
    "phone": "+1-555-0199"
  },
  "context": {
    "vehicle_info": "2018 Honda Civic",
    "service_interest": "smog check",
    "source": "voice_agent"
  },
  "qualification": {
    "score": 85,
    "pain_summary": "Registration deadline May 30, downtime anxiety",
    "action": "book_appointment",
    "recommended_next_step": "Confirm appointment time"
  },
  "response_sent": {
    "message": "Perfect! I've locked you in for tomorrow at 10...",
    "channels": ["voice", "sms"],
    "timestamp": "2026-05-05T14:32:42Z"
  },
  "timestamp": "2026-05-05T14:32:42Z"
}
```

**HMAC Signature:**

Every callback is signed with the tenant's HMAC secret. Tenant verifies:

```javascript
// Tenant side (pseudo-code)
const signature = req.headers['x-speed-to-lead-signature'];
const payload = JSON.stringify(req.body);
const expectedSignature = hmac_sha256(payload, tenant_hmac_secret);
const isValid = constantTimeEqual(signature, expectedSignature);
```

Service side (generating signature):
```javascript
const payload = JSON.stringify(callbackBody);
const signature = crypto.createHmac('sha256', tenant_hmac_secret)
  .update(payload)
  .digest('hex');
// Include as header: x-speed-to-lead-signature: [signature]
```

---

### Step 6: Retry Logic for Failed Callbacks

If CRM webhook fails (network error, timeout, 5xx):

```sql
INSERT INTO lead_callbacks (
  tenant_id, lead_id, callback_url, payload_sent,
  http_status, status, retry_count, next_retry_at
)
VALUES (...) ON CONFLICT (lead_id) DO UPDATE SET
  retry_count = retry_count + 1,
  next_retry_at = NOW() + INTERVAL '1 minute' * (2 ^ retry_count);
```

**Retry schedule:**
- Attempt 1: Immediate
- Attempt 2: 2 minutes later
- Attempt 3: 4 minutes later
- Attempt 4: 8 minutes later
- Attempt 5: 16 minutes later
- ... exponential backoff up to 24 hours max

**Logging:**
```json
{
  "event_type": "callback_failed",
  "status": "pending_retry",
  "payload": {
    "attempt": 1,
    "http_status": 504,
    "error": "Gateway Timeout",
    "next_retry_at": "2026-05-05T14:33:42Z"
  }
}
```

On final success:
```json
{
  "event_type": "callback_delivered",
  "status": "success",
  "payload": {
    "http_status": 200,
    "attempts": 2,
    "final_delivered_at": "2026-05-05T14:34:23Z"
  }
}
```

---

## Message Queueing (SMS/Email)

After response generation, SMS and email are queued for sending:

```sql
INSERT INTO lead_responses (
  tenant_id, lead_id, channel, message_text,
  sentiment, brand_compliance, delivery_status
)
VALUES (
  'tenant_drive_city',
  'lead_abc123',
  'sms',
  'Hi John! Drive City here. Your smog check is booked tomorrow at 10. [link]',
  'friendly',
  true,
  'queued'
);
```

**Job queue processes:**
- SMS via Twilio API
- Email via Sendgrid API

**Delivery tracking:**
- Twilio webhook → delivery_status: "delivered"
- Email open/click tracking via Sendgrid
- Bounces logged as failures

---

## Analytics & Dashboard Queries

### Real-time Lead Count

```sql
SELECT COUNT(*) as total_leads
FROM incoming_leads
WHERE tenant_id = $1
  AND created_at > NOW() - INTERVAL '24 hours';
```

### Qualification Rate

```sql
SELECT 
  COUNT(CASE WHEN score >= 75 THEN 1 END)::float / COUNT(*) * 100 as perfect_lead_rate,
  COUNT(CASE WHEN score >= 50 AND score < 75 THEN 1 END)::float / COUNT(*) * 100 as soft_lead_rate,
  COUNT(CASE WHEN score < 50 THEN 1 END)::float / COUNT(*) * 100 as weak_lead_rate
FROM qualified_leads
WHERE tenant_id = $1
  AND created_at > NOW() - INTERVAL '7 days';
```

### Speed-to-Lead Metrics

```sql
SELECT 
  AVG((e2.created_at - e1.created_at) * 1000) as avg_response_time_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (e2.created_at - e1.created_at) * 1000) as p95_response_time_ms
FROM lead_events e1
JOIN lead_events e2 ON e1.lead_id = e2.lead_id
WHERE e1.event_type = 'qualified'
  AND e2.event_type = 'responded'
  AND e1.tenant_id = $1;
```

### CRM Callback Success Rate

```sql
SELECT 
  COUNT(CASE WHEN status = 'delivered' THEN 1 END)::float / COUNT(*) * 100 as callback_success_rate
FROM lead_callbacks
WHERE tenant_id = $1
  AND created_at > NOW() - INTERVAL '7 days';
```

---

## Idempotency

**Problem:** Network failure after `/log` sends callback but before response sent. Retry incoming webhook → duplicate lead.

**Solution:** Idempotency key

Every incoming lead gets an idempotency key (hash of contact + timestamp + source):

```sql
SELECT id FROM incoming_leads
WHERE tenant_id = $1
  AND idempotency_key = $2;
```

If exists → skip creation, return existing lead_id.

---

## Data Retention

**Incoming leads & qualified leads:** Keep forever (audit trail, legal)
**Lead events:** Keep 2 years (analytics, debugging)
**Lead responses:** Keep 1 year (marketing compliance)
**Lead callbacks:** Keep 90 days (CRM sync verification)

Archive old records to cold storage (S3) for compliance.

---

## Error Scenarios & Handling

### Scenario 1: Qualification Fails

```json
{
  "event_type": "qualified",
  "status": "failed",
  "payload": {
    "error": "Transcript parsing failed",
    "fallback_action": "follow_up_email",
    "fallback_score": 0
  }
}
```

Default: score = 0, action = "follow_up_email" (safe)

---

### Scenario 2: CRM Webhook URL Invalid

```json
{
  "event_type": "callback_failed",
  "status": "error",
  "payload": {
    "error": "Invalid callback URL format",
    "tenant_url": "invalid@example",
    "admin_alert": true
  }
}
```

Alert owner: "CRM webhook URL configured incorrectly."

---

### Scenario 3: SMS Delivery Failed (Invalid Phone)

```json
{
  "event_type": "delivery_failed",
  "status": "failed",
  "payload": {
    "channel": "sms",
    "error": "Invalid phone number format",
    "phone": "+1-555-INVALID",
    "fallback_action": "email"
  }
}
```

Fallback: Send via email instead.

---

## Integration

**Called by:** `/speed-to-lead` at the END of pipeline

**Database:** All events logged in real-time

**Callbacks:** Tenant CRM notified immediately (with retry queue)

**Dashboard:** Pulls from these tables for real-time analytics

---

**Version:** 1.0 | **Updated:** 2026-05-05