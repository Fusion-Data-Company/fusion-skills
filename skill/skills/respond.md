# Verbal Judo Response Generation Skill

> **Skill Name:** `/respond`  
> **Purpose:** Generate lead responses using Verbal Judo + brand voice  
> **Input:** Lead + routing decision + tenant config  
> **Output:** Response message(s) + channel(s) + sentiment  

---

## Verbal Judo Principles (Applied)

From George Thompson's "Gentle Art of Persuasion" — every response must honor the Five Universal Truths:

1. **All people want to be treated with dignity and respect**
2. **All people want to be asked rather than told**
3. **All people want to be informed as to why**
4. **All people want to be given options rather than threats**
5. **All people want a second chance when they make a mistake**

---

## Response by Action Type

### 1. BOOK_APPOINTMENT Response

**Timing:** Immediate (within 2 seconds of confirmed booking)

**Channel:** Voice (if agent on call) → SMS confirmation → Email receipt

**Voice Response Template:**
```
"Perfect! I've locked you in for [DATE] at [TIME] for your [SERVICE]. 
You'll get a confirmation text in just a moment with all the details. 
Any questions before we hang up?"
```

**Why this works:**
- Confirm action taken (dignity: respects their decision)
- Specific time (clarity: no ambiguity)
- Ask for questions (options: gives them chance to clarify)
- SMS follow-up promised (information: concrete next step)

**SMS Confirmation:**
```
Hi [NAME]! Drive City here. Your [SERVICE] is booked for [DAY] [TIME]. 
Confirmation: [BOOKING_URL]. Reply CONFIRM or call [PHONE] with questions. 
We'll see you soon!
```

**Email Receipt:**
```
Subject: Your Appointment Confirmed — Drive City Smog Check

Hi [NAME],

Thanks for booking! Here's your appointment summary:

📅 Date: [DAY], [DATE]
⏰ Time: [TIME] ([DURATION] minutes)
🏪 Location: Drive City Lube & Smog, [ADDRESS]
📞 Phone: [PHONE]

What to bring:
- Current registration
- Proof of insurance
- Vehicle keys

Questions? Reply to this email or call us.

See you soon!
Drive City Team
```

**Sentiment:** Appreciative, confident, helpful

---

### 2. FOLLOW_UP_SMS Response

**Timing:** Next business hour (if after-hours lead)

**Channel:** SMS only (respect: time-sensitive, not intrusive)

**Template:**
```
Hi [NAME]! Drive City here. Ready to get that [SERVICE] done? 
We can fit you in [DAY] at [TIME]. Book here: [CALENDLY_LINK]. 
Reply to confirm or call us!
```

**Variants by context:**

**Deadline urgency:**
```
[NAME], your registration expires [DATE]. We can knock out your smog 
check [DAY] morning. Lock it in: [LINK]. Need a different time? 
Call us at [PHONE].
```

**Price-sensitive lead:**
```
[NAME], smog checks run [PRICE] and take 45 minutes. We fix issues 
same-day if needed. Book now: [LINK]. Questions about cost? 
Call [PHONE].
```

**Second-time visitor:**
```
[NAME], thanks for considering us again! Let's get you scheduled. 
How about [DAY] at [TIME]? [LINK] or call [PHONE].
```

**Sentiment:** Friendly, direct, helpful, no pressure

---

### 3. ROUTE_TO_OWNER Alert Response

**Timing:** Immediate (alert to owner)

**Channel:** Email + SMS (depends on owner preference)

**Owner Email Alert:**
```
Subject: Lead Alert — [NAME] (Score [SCORE])

Hi [OWNER_NAME],

New lead ready for your attention:

📋 Lead: [NAME] | [PHONE]
📊 Score: [SCORE]/100
⚡ Urgency: [URGENCY_DESCRIPTION]
📝 Summary: [PAIN_SUMMARY]

Suggested action: Call within 1 hour for best conversion.

--- TRANSCRIPT SNIPPET ---
[TRANSCRIPT_FIRST_200_CHARS]...
---

Respond within 5 minutes? Link: [DASHBOARD_URL]
```

**Internal note to owner:** What they're doing — they're reviewing the lead summary before deciding whether to call.

---

### 4. FOLLOW_UP_EMAIL Response

**Timing:** Immediately sent + 2-day sequence + 5-day sequence

**Channel:** Email (long-form education)

**Email 1: Problem Validation**
```
Subject: We understand — [SERVICE] can be stressful

Hi [NAME],

You mentioned [PAIN_TRIGGER] in your call with us. That's a real 
concern, and you're not alone.

[PAIN STORY — industry stat or customer example]

The good news: [SOLUTION_BENEFIT]

Next step: When you're ready, we'd love to help. Book a time that 
works for you: [LINK]

Questions? Reply to this email.

— Drive City Team
```

**Email 2: Social Proof**
```
Subject: See how [CUSTOMER] solved their [PROBLEM]

Hi [NAME],

[CUSTOMER_STORY — 100 words about someone who had same pain, solved it]

The result: [ROI — time saved, money saved, peace of mind gained]

Ready to see how we can help you? Book now: [LINK]

Still thinking? No pressure. Reply if you have questions.

— Drive City Team
```

**Email 3: Limited-Time Offer**
```
Subject: [NAME], 48-hour special on [SERVICE]

Hi [NAME],

We're running a limited offer this weekend on [SERVICE]:
- [PRICE_DISCOUNT]
- Priority scheduling
- [BONUS — oil check, etc.]

Expires Sunday 11:59 PM. Lock it in: [LINK]

— Drive City Team
```

**Sentiment:** Educational, warm, social proof, not pushy

---

## Brand Voice Integration

Each tenant provides brand voice config:

```json
{
  "brand_voice": {
    "tone": "friendly_professional",  // e.g., "casual", "formal", "warm"
    "personality": "knowledgeable_trusted",  // e.g., "expert", "buddy", "advisor"
    "tagline": "Get back on the road confident",
    "values": ["local", "honest", "fast", "fair_price"],
    "avoid_phrases": ["too complex", "trust me", "obvious"],
    "prefer_phrases": ["we understand", "let's solve this", "you're in good hands"]
  }
}
```

**Drive City example:**
- Tone: Friendly, professional
- Personality: Local trusted expert
- Values: Fast, fair, local pride
- Tagline: "Get back on the road confident"

**Response adapted to brand:**

Generic: "Hi John. Your appointment is booked for tomorrow at 10 AM."

Drive City voice: "Perfect! I've got you locked in for tomorrow at 10. You'll be back on the road with your registration all squared away. See you then!"

---

## Response Rules (Verbal Judo Encoded)

### Rule 1: Always Acknowledge

Begin by confirming you heard them correctly.

**Bad:** "Book your appointment here."

**Good:** "You mentioned your registration deadline is May 30. I've booked you for tomorrow to get that handled."

*(Verbal Judo: Paraphrasing — shows you understood.)*

---

### Rule 2: Never Command, Always Ask

Offer options, don't give orders.

**Bad:** "You need to come in tomorrow."

**Good:** "Tomorrow at 10 works great. Or if another time fits better, let me know."

*(Verbal Judo: Universal Truth #4 — give options.)*

---

### Rule 3: Explain WHY

Don't just tell them what to do — explain the benefit.

**Bad:** "Bring your registration."

**Good:** "Bring your current registration — it helps us confirm you're all set to renew after we pass the smog check."

*(Verbal Judo: Universal Truth #3 — inform as to why.)*

---

### Rule 4: Treat Them With Respect

Never condescend or minimize their concern.

**Bad:** "It's just a smog check, nothing to worry about."

**Good:** "I understand you're concerned about downtime. The good news — we usually knock it out in 45 minutes, and if we find anything, we fix it same-day."

*(Verbal Judo: Universal Truth #1 — dignity.)*

---

### Rule 5: Close With Empathy

End by showing you're on their side.

**Bad:** "Anything else?"

**Good:** "Looking forward to getting you back on the road. Any questions?"

*(Verbal Judo: Mushin (still center) — calm, present, on their team.)*

---

## Channel Selection Rules

**VOICE (Agent on call):**
- Immediate booking (score >= 75, within hours)
- Complex questions that need 2-way conversation
- Personal touch for high-value leads (score >= 80)

**SMS:**
- Time-sensitive (follow-ups for after-hours leads)
- Appointment confirmations (snappy, quick reference)
- Short urgency messages
- Max 160 characters per message

**EMAIL:**
- Nurture sequences (multi-touch)
- Detailed information (full explanation)
- Social proof stories (longer format)
- Offers / incentives

**WEB CHAT:**
- If lead came from web form
- Follow-up questions from website visitor
- Real-time engagement if chat active

---

## Context Personalization

Every response pulls from the lead's own words/context:

**Lead says:** "My registration expires May 30"
**Response:** "Your registration deadline is May 30"
(not "typical deadline" — use THEIR deadline)

**Lead says:** "I'm worried about downtime"
**Response:** "I understand downtime is a concern"
(acknowledge THEIR specific fear, not generic)

**Lead says:** "Can you do it same-day?"
**Response:** "Yes, same-day is exactly what we do"
(answer THEIR specific question first)

---

## Error Handling

**What if brand voice config is missing?**
- Default to "friendly_professional" tone
- Log warning to admin
- Use generic response template

**What if sentiment analysis fails?**
- Default to "helpful" tone
- Err on side of warmth over formality

**What if contact missing email/phone?**
- Voice/SMS only (don't assume)
- Flag for manual follow-up

---

## Sentiment Guidelines

| Action | Sentiment | Example |
|---|---|---|
| Book Appointment | Confident, appreciative | "Perfect! I've locked you in..." |
| Follow-up SMS | Friendly, direct, no pressure | "Ready to get that smog done?" |
| Route to Owner | Professional, informative | "New lead, score 68, deadline May 25" |
| Follow-up Email | Warm, educational, supportive | "You're not alone in this concern..." |

---

## Integration

**Called by:** `/speed-to-lead` after `/route` decision made

**Calls next:** `/log` with response data

**Database:** All responses logged in `lead_responses` table

**Workflow:**
1. Route returns action (book / follow_up_sms / etc.)
2. Respond generates message(s)
3. Message(s) queued for sending (SMS/email via Twilio/Sendgrid)
4. Log records delivery status + sentiment + brand adherence
5. Dashboard shows response history

---

## Drive City Example Flow

Lead: "Hi, I need a smog check. My registration expires May 30."

**Agent (voice):** "Great, I can help. Registration deadline May 30 — let's get you scheduled. How's tomorrow morning?"

Lead: "Tomorrow at 10 would be perfect."

**Agent runs `/respond` with:**
- action: book_appointment
- tenant: drive-city
- contact_name: John
- channel_priority: voice

**Output - Voice:** "Perfect! I've locked you in for tomorrow at 10. You'll be back on the road confident before that May 30 deadline. Confirmation text coming in 30 seconds."

**Output - SMS:** "Hi John! Your smog check is booked tomorrow at 10 AM. Confirm here: [link]. See you soon!"

**Output - Email:** [Receipt with all details]

**Sentiment:** Confident, helpful, friendly, local-trusted-expert tone ✓

---

**Version:** 1.0 | **Updated:** 2026-05-05