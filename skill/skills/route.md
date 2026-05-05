# Speed-to-Lead Routing Skill

> **Skill Name:** `/route`  
> **Purpose:** Route qualified leads to next action (book / follow-up / human handoff / archive)  
> **Input:** Lead + qualification result + tenant config  
> **Output:** Action, channel, booking URL or recipient  

---

## The Core Principle: Speed-to-Lead

**Response time is competitive advantage.**

Industry benchmark: Respond within 5 minutes → 391x more likely to qualify the lead (HubSpot, 2024).

This router implements "speed-to-lead" as the primary optimization: qualified leads are routed to immediate booking; others get rapid follow-up.

---

## Routing Decision Tree

```
START: qualification_score + current_time + tenant_config

├─ Score >= 75 (Perfect/Strong Lead)?
│  ├─ Business hours open right now?
│  │  ├─ YES → BOOK_APPOINTMENT (immediate)
│  │  └─ NO → FOLLOW_UP_SMS (next open time, 15-min cadence)
│  │
│  └─ NO (soft/weak lead)
│
├─ Score 50-74 (Soft Lead)?
│  ├─ Urgency score >= 8 (deadline, pain severity)?
│  │  ├─ YES → ROUTE_TO_OWNER (human, immediate)
│  │  └─ NO → FOLLOW_UP_EMAIL (24-hr nurture sequence)
│  │
│  └─ NO
│
├─ Score 20-49 (Weak Lead)?
│  └─ FOLLOW_UP_SEQUENCE (3-email drip, if not opted-out)
│
└─ Score < 20 (No Qualification)?
   └─ ARCHIVE (add to general nurture mailing list, very low priority)
```

---

## Routing Actions & Implementations

### 1. BOOK_APPOINTMENT (Highest Priority)

**When:** Score >= 75 AND business hours open

**Flow:**
1. Generate booking link (Calendly, Acuity Scheduling, or custom)
2. Pre-fill: service, contact, phone, email
3. Pass to `/respond` for confirmation message
4. Log to `qualified_leads` table with `action: "book_appointment"`
5. Queue callback to tenant's CRM

**Output:**
```json
{
  "action": "book_appointment",
  "channel": "voice_confirmation|sms",
  "booking_url": "https://drivecity.calendly.com/smog-check?name=John&phone=...",
  "booking_duration_minutes": 60,
  "next_available_slot": "2026-05-06T10:00:00-07:00",
  "reason": "Score 85, business hours open, immediate booking intent detected"
}
```

**Success Criteria:**
- Booking URL generated
- CRM callback queued
- Response message sent within 2 seconds

---

### 2. FOLLOW_UP_SMS (High Priority)

**When:** Score >= 75 BUT business hours closed

**Flow:**
1. Calculate next open time
2. Generate SMS with personalized offer ("Hi John, we can get you in tomorrow at 9 AM...")
3. Include booking link in SMS
4. Schedule send for next business hour (not immediately—respect sleep)
5. Log as action: "follow_up_sms" with scheduled send time

**Output:**
```json
{
  "action": "follow_up_sms",
  "channel": "sms",
  "message": "Hi John! Drive City here. Ready to get that smog done? Tomorrow 9 AM works great. Book here: [calendly link]",
  "scheduled_send_time": "2026-05-06T08:00:00-07:00",
  "booking_url": "https://drivecity.calendly.com/smog-check?name=John",
  "reason": "Score 85, after-hours lead, SMS on next open time"
}
```

---

### 3. ROUTE_TO_OWNER (Medium Priority)

**When:** Score 50-74 AND (urgency >= 8 OR complex scenario) OR Score >= 75 but customer history flagged

**Flow:**
1. Look up owner contact (from `tenants.owner_contact`)
2. Send email/SMS alert to owner with lead summary + score + transcript snippet
3. Owner reviews and decides: call prospect directly OR let auto-follow-up handle
4. Log as action: "route_to_owner" with recipient

**Output:**
```json
{
  "action": "route_to_owner",
  "channel": "email|sms",
  "recipient_email": "ted@drivecity.local",
  "recipient_phone": "+1-555-CITY-OIL",
  "alert_subject": "Qualified Lead: Sarah (Score 68, Registration Deadline May 25)",
  "alert_body": "Sarah called about smog check. Her registration expires May 25. She asked about price but didn't book. Recommend calling her at +1-555-0124 within 1 hour.",
  "reason": "Score 68 + deadline urgency = human judgment call"
}
```

**Owner Actions:**
- Call within 5-15 minutes (best conversion window)
- Send custom offer if needed
- Close or escalate back to system

---

### 4. FOLLOW_UP_EMAIL (Lower Priority)

**When:** Score 20-59 AND no extreme urgency

**Flow:**
1. Generate 3-email nurture sequence
2. Email 1: Sent immediately (educational, problem validation)
3. Email 2: 2 days later (social proof, customer success story)
4. Email 3: 5 days later (limited-time offer, CTA)
5. Track opens/clicks, escalate if engagement detected

**Output:**
```json
{
  "action": "follow_up_email",
  "channel": "email",
  "sequence": {
    "email_1": {
      "send_time": "2026-05-05T15:00:00Z",
      "subject": "Your Smog Check Questions Answered",
      "purpose": "educate"
    },
    "email_2": {
      "send_time": "2026-05-07T09:00:00Z",
      "subject": "How One Customer Avoided Registration Lapse",
      "purpose": "social_proof"
    },
    "email_3": {
      "send_time": "2026-05-10T09:00:00Z",
      "subject": "48-Hour Smog Check Special Offer",
      "purpose": "limited_time_offer"
    }
  },
  "reason": "Score 42, no deadline urgency, nurture candidate"
}
```

---

### 5. FOLLOW_UP_SEQUENCE (Lowest Priority)

**When:** Score < 20

**Flow:**
1. Add to general mailing list (long-term nurture)
2. Monthly tip newsletter
3. Seasonal offers (e.g., "Spring maintenance season" in April)
4. Reactivation campaign if no engagement in 90 days

**Output:**
```json
{
  "action": "follow_up_sequence",
  "channel": "email",
  "cadence": "monthly_newsletter",
  "list": "general_nurture",
  "reason": "Score 18, low fit or early-stage awareness",
  "next_action": "Reactivate if engagement detected after 90 days"
}
```

---

### 6. ARCHIVE (No Action)

**When:** Score < 20 AND (opted-out OR competitor-only inquiry OR spam signals)

**Flow:**
1. Mark as `action: "archive"`
2. Do NOT send further communications (respect opt-out)
3. Log reason (opted-out / wrong-fit / competitor-only / spam)
4. Keep in DB for historical analysis only

**Output:**
```json
{
  "action": "archive",
  "reason": "opted_out",
  "archived_at": "2026-05-05T14:32:00Z",
  "note": "Prospect explicitly said 'do not contact'"
}
```

---

## Routing Modifiers

### Time-Based Modifiers

**Weekday 8 AM - 6 PM:** Standard routing applies

**Weekday 6 PM - 10 PM:** 
- Score >= 75 still books if prospect requests, else SMS next morning
- Urgency boost for same-day deadline signals

**Night/Weekend:**
- Never send cold outreach (respect sleep)
- Queue SMS for next 8 AM opening
- Email still queued but scheduled for business hours

### Business Hours Configuration

From tenant config:
```json
{
  "business_hours": {
    "monday": ["08:00", "18:00"],
    "tuesday": ["08:00", "18:00"],
    ...
    "saturday": ["09:00", "15:00"],
    "sunday": "closed"
  }
}
```

Routing evaluates: Is current_time within business_hours? 

---

## Urgency Scoring

Used to escalate soft leads to owner.

```
Urgency Base = qualification_score / 20  (0-5)

Add points for:
+ 2 points if deadline mentioned (date in transcript)
+ 1 point if "ASAP" / "urgent" language
+ 1 point if repeat visitor (second+ inquiry)
+ 1 point if competitor mentioned
+ 0.5 points per escalation language ("can't wait", "desperate", "losing money")

Example:
  Score 60 = base 3
  + deadline (May 30) = +2 → 5
  + "can't afford downtime" = +1 → 6
  + first-time visitor = 0
  = Urgency 6/10 (route to owner? Score 60 alone wouldn't, but urgency 6 adds weight)
```

---

## Multi-Tenant Routing Rules

Each tenant can override defaults via config:

```json
{
  "routing_overrides": {
    "always_route_to_owner_score_threshold": 70,  // Default 50
    "auto_book_threshold": 80,                      // Default 75
    "follow_up_sms_preferred": true,               // Default email
    "owner_alert_on_score": 85                     // Default 50
  }
}
```

Drive City example:
```json
{
  "auto_book_threshold": 75,
  "follow_up_sms_preferred": true,  // They like SMS
  "owner_alert_on_score": 85,       // Ted wants early alerts
  "weekend_hours": ["09:00", "15:00"]  // Saturday open
}
```

---

## Integration

**Called by:** `/speed-to-lead` after `/qualify` completes

**Calls next:** `/respond` with routing decision

**Database tables:**
- `qualified_leads` — action, reason, timestamp
- `lead_events` — routing decision logged as event

**Example flow:**
1. Lead captured
2. `/qualify` returns score 85
3. `/route` looks at time + config → `book_appointment`
4. `/respond` generates confirmation message
5. `/log` writes everything to DB + callbacks to CRM

---

## Error Handling

**Booking system down:**
- Fallback to email + SMS (manual booking instructions)
- Alert owner that auto-booking failed

**Tenant config missing:**
- Default to conservative routing (follow_up_email)
- Log error, alert admin

**No business hours configured:**
- Always route to owner (safer)
- Alert to set up business_hours config

---

## Performance Goals

- Router decision: < 100ms
- Booking link generation: < 200ms
- Total routing + response: < 500ms
- Speed-to-lead time (full pipeline): < 5 minutes from lead capture

---

**Version:** 1.0 | **Updated:** 2026-05-05