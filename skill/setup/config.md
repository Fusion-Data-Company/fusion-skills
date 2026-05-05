# First-Run Setup Wizard

> **Purpose:** Configure a new tenant for Speed-to-Lead service  
> **For:** Business owners, agents, ops managers  
> **Output:** `config.json` (saved locally and in service DB)  

---

## Introduction

Speed-to-Lead is now deployed. Each business ("tenant") needs a configuration file that tells the service:
- Your business name and brand voice
- When you're open
- What qualifies a good lead for YOUR business
- How to reach you (CRM webhook URL + HMAC secret)
- Who to notify when leads come in

This wizard asks 10 questions and generates your `config.json`.

---

## Question 1: Tenant Slug

**What's a short identifier for your business? (lowercase, no spaces)**

Examples:
- `drive-city` (Drive City Lube & Smog)
- `northern-roots` (Northern Roots Wellness)
- `theinsuranceschool` (The Insurance School)

This becomes part of your webhook URL:
`https://fusion-skills.vercel.app/api/webhook/[YOUR_SLUG]`

**Your answer:** ___________________

---

## Question 2: Business Name

**What's the official name of your business?**

Example: `Drive City Lube & Smog`

This appears in SMS/email messages to customers.

**Your answer:** ___________________

---

## Question 3: Brand Voice — Tone

**How would you describe your communication style?**

Pick one (or describe your own):
- [ ] Friendly & Professional (local, trustworthy, knowledgeable)
- [ ] Casual & Fun (young, energetic, relatable)
- [ ] Formal & Expert (professional, authoritative, prestigious)
- [ ] Warm & Personal (caring, empathetic, individual attention)
- [ ] Custom: ___________________

**Your answer:** ___________________

---

## Question 4: Brand Voice — Tagline

**What's your core promise or tagline?**

Examples:
- "Get back on the road confident" (Drive City)
- "Your health. Our mission." (Wellness)
- "Smart insurance, done simple" (Insurance)

This appears in your SMS/email signatures.

**Your answer:** ___________________

---

## Question 5: Business Hours

**When are you open?**

```json
{
  "monday": ["08:00", "18:00"],
  "tuesday": ["08:00", "18:00"],
  "wednesday": ["08:00", "18:00"],
  "thursday": ["08:00", "18:00"],
  "friday": ["08:00", "18:00"],
  "saturday": ["09:00", "15:00"],
  "sunday": "closed"
}
```

Replace with your actual hours. Format: 24-hour time (HH:MM).

**Your answer:**
```json
{
  "monday": ["_____", "_____"],
  "tuesday": ["_____", "_____"],
  "wednesday": ["_____", "_____"],
  "thursday": ["_____", "_____"],
  "friday": ["_____", "_____"],
  "saturday": ["_____", "_____"],
  "sunday": "_______"
}
```

---

## Question 6: Qualification Criteria

**What problems do your customers typically come to you with?**

List 3-5 pain triggers specific to your business.

For Drive City:
- `registration_expiry` — "My registration expires..."
- `smog_fail` — "I failed my last smog test"
- `downtime_anxiety` — "I can't afford to be without my car"
- `cost_concern` — "Other places charged too much"

For your business:
- Pain trigger 1: ___________________
- Pain trigger 2: ___________________
- Pain trigger 3: ___________________
- Pain trigger 4: ___________________
- Pain trigger 5: ___________________

---

## Question 7: Lead Score Thresholds

**Which scores mean "book immediately" vs "follow up later"?**

Default thresholds (adjust if needed):
```json
{
  "book_immediately": 75,      // Score >= this → auto-book
  "follow_up": 50,             // Score 50-74 → SMS/email follow-up
  "human_handoff": 0,          // Score < 50 → send to owner
  "owner_alert_above": 85      // Score >= this → alert owner immediately
}
```

**Your answer:**
```json
{
  "book_immediately": ___,
  "follow_up": ___,
  "human_handoff": ___,
  "owner_alert_above": ___
}
```

---

## Question 8: CRM Integration

**Where does the speed-to-lead service send lead data?**

You need:
1. **CRM webhook URL** — the endpoint on YOUR system that accepts qualified leads
2. **HMAC secret** — a shared secret key for signature verification

Example Drive City setup:
- Webhook URL: `https://drivecitylubeandsmog.com/api/agent/leads/upsert`
- HMAC secret: `sk_live_abc123def456...` (generate a random secret)

Ask your developer or CRM provider for these.

**Your answer:**

Webhook URL: `_________________________`

HMAC secret: `_________________________`

---

## Question 9: Owner Contact Info

**Who should Speed-to-Lead notify when leads come in?**

Name(s): ___________________

Email(s):
- `_______________________`
- `_______________________`

Phone(s):
- `_______________________`

---

## Question 10: Notification Channels

**How do you prefer to be notified?**

When a new lead arrives, how should the service reach you?

- [ ] SMS (for high-scoring leads)
- [ ] Email (for all new leads)
- [ ] Both
- [ ] Owner will check dashboard manually

**Your answer:** ___________________

---

## Generated Configuration

Save this `config.json` to your project root (or wherever your speed-to-lead service expects it):

```json
{
  "tenant_slug": "[ANSWER_1]",
  "business_name": "[ANSWER_2]",
  "brand_voice": {
    "tone": "[ANSWER_3]",
    "tagline": "[ANSWER_4]",
    "personality": "knowledgeable_trusted"
  },
  "business_hours": {
    "monday": ["[ANSWER_5_MON_START]", "[ANSWER_5_MON_END]"],
    "tuesday": ["[ANSWER_5_TUE_START]", "[ANSWER_5_TUE_END]"],
    "wednesday": ["[ANSWER_5_WED_START]", "[ANSWER_5_WED_END]"],
    "thursday": ["[ANSWER_5_THU_START]", "[ANSWER_5_THU_END]"],
    "friday": ["[ANSWER_5_FRI_START]", "[ANSWER_5_FRI_END]"],
    "saturday": ["[ANSWER_5_SAT_START]", "[ANSWER_5_SAT_END]"],
    "sunday": "[ANSWER_5_SUN]"
  },
  "qualification_criteria": {
    "pain_triggers": [
      "[ANSWER_6_1]",
      "[ANSWER_6_2]",
      "[ANSWER_6_3]",
      "[ANSWER_6_4]",
      "[ANSWER_6_5]"
    ],
    "score_thresholds": {
      "book_immediately": [ANSWER_7_BOOK],
      "follow_up": [ANSWER_7_FOLLOWUP],
      "human_handoff": [ANSWER_7_HUMAN],
      "owner_alert_above": [ANSWER_7_ALERT]
    }
  },
  "crm_webhook_url": "[ANSWER_8_URL]",
  "crm_webhook_hmac_secret": "[ANSWER_8_SECRET]",
  "owner_contact": {
    "names": ["[ANSWER_9_NAME_1]", "[ANSWER_9_NAME_2]"],
    "emails": ["[ANSWER_9_EMAIL_1]", "[ANSWER_9_EMAIL_2]"],
    "phones": ["[ANSWER_9_PHONE_1]"]
  },
  "notification_channels": {
    "booking_confirmation": "sms",
    "follow_up_sequence": "email",
    "owner_alert_method": "[ANSWER_10]",
    "owner_alert_threshold": 85
  },
  "created_at": "2026-05-05T14:32:42Z",
  "version": "1.0"
}
```

---

## Drive City Example (Filled)

```json
{
  "tenant_slug": "drive-city",
  "business_name": "Drive City Lube & Smog",
  "brand_voice": {
    "tone": "friendly_professional",
    "tagline": "Get back on the road confident",
    "personality": "knowledgeable_trusted"
  },
  "business_hours": {
    "monday": ["08:00", "18:00"],
    "tuesday": ["08:00", "18:00"],
    "wednesday": ["08:00", "18:00"],
    "thursday": ["08:00", "18:00"],
    "friday": ["08:00", "18:00"],
    "saturday": ["09:00", "15:00"],
    "sunday": "closed"
  },
  "qualification_criteria": {
    "pain_triggers": [
      "registration_expiry",
      "smog_fail",
      "downtime_anxiety",
      "cost_concern",
      "inspection_overdue"
    ],
    "score_thresholds": {
      "book_immediately": 75,
      "follow_up": 50,
      "human_handoff": 0,
      "owner_alert_above": 85
    }
  },
  "crm_webhook_url": "https://drivecitylubeandsmog.com/api/agent/leads/upsert",
  "crm_webhook_hmac_secret": "sk_live_drive_city_ab12cd34ef56",
  "owner_contact": {
    "names": ["Ted Jergensen", "Jazzy Jergensen"],
    "emails": ["ted@drivecity.local", "jazzy@drivecity.local"],
    "phones": ["+1-555-CITY-OIL"]
  },
  "notification_channels": {
    "booking_confirmation": "sms",
    "follow_up_sequence": "email",
    "owner_alert_method": "email",
    "owner_alert_threshold": 85
  },
  "created_at": "2026-05-05T14:32:42Z",
  "version": "1.0"
}
```

---

## Next Steps

1. **Save config.json** to your project
2. **Register with Speed-to-Lead** — send your `config.json` to FDC ops (rob@fusiondataco.com)
3. **Get your webhook URL** — you'll be given: `https://fusion-skills.vercel.app/api/webhook/[your-slug]`
4. **Give webhook URL to your agent** — your voice agent or chatbot calls this URL for each lead
5. **Done!** Leads start flowing through qualification → routing → response → CRM callback

---

## Troubleshooting

**Q: What if I don't have a CRM webhook URL yet?**
A: You can deploy without one. Leave it blank, and leads will still be qualified and routed. Just set up the CRM callback later.

**Q: Can I change my config after deployment?**
A: Yes. Update your `config.json` and redeploy. The service picks up changes within 5 minutes.

**Q: What if my business hours vary by season?**
A: Contact FDC ops. We can add holiday/seasonal overrides.

**Q: How do I test that leads are flowing correctly?**
A: Use the admin dashboard at `https://fusion-skills.vercel.app/dashboard/[tenant-slug]`. View incoming leads, qualification scores, routing decisions, and CRM callback status in real-time.

---

**Version:** 1.0 | **Updated:** 2026-05-05