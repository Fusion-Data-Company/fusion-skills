# Sandler Pain Funnel Qualification Skill

> **Skill Name:** `/qualify`  
> **Purpose:** Score leads using Sandler Pain Funnel methodology (0-100)  
> **Input:** Lead object with contact info + transcript  
> **Output:** Qualification score + pain analysis  

---

## The Sandler Pain Funnel

The Sandler Sales Institute identifies 7 critical questions that separate qualified prospects from tire-kickers. This skill walks through each one and scores the lead.

### The 7 Pain Questions

1. **Do they acknowledge a problem?**
   - Red flag: "Everything's fine, no real issues"
   - Green flag: "We're losing registration deadlines" / "Downtime worries us"
   - Score: +15 if yes

2. **How deep is the pain?** (Severity)
   - Red flag: "It's a minor inconvenience"
   - Green flag: "We're hemorrhaging customers" / "It's costing us thousands"
   - Score: +15 if acknowledged as significant

3. **How specific is the pain?** (Clarity)
   - Red flag: Vague complaints ("things aren't working")
   - Green flag: Specific problem ("registration expires May 30, need smog by then")
   - Score: +15 if specific and quantifiable

4. **Have they tried solving it?** (Pain depth proof)
   - Red flag: "We haven't really looked into it"
   - Green flag: "We've been trying band-aids" / "Other vendors didn't work"
   - Score: +10 if yes (shows real commitment)

5. **Have you positioned a solution?** (Solution awareness)
   - Red flag: No mention of how your service helps
   - Green flag: "We handle smog checks in 45 minutes, same-day repairs"
   - Score: +15 if solution clearly communicated

6. **Did they understand the ROI?** (Value clarity)
   - Red flag: "Yeah, sounds good" (no actual understanding)
   - Green flag: "So I avoid registration lapse and get back on road same day"
   - Score: +15 if they can articulate the benefit back to you

7. **Are they willing to buy?** (Commitment signal)
   - Red flag: "Let me think about it" / "I'll call you next month"
   - Green flag: "I can come in tomorrow" / "Book me now"
   - Score: +15 if yes (action signal)

**Total Possible:** 100 points

---

## Scoring Rules

### Perfect Lead (80-100)
- Acknowledges problem, pain is deep and specific
- Has tried solving it elsewhere
- You've positioned solution + they understand ROI
- Ready to act (books appointment, requests pricing)
- **Action:** Book immediately if business hours allow, else follow-up SMS within 1 hour
- **Example:** John admits downtime anxiety, registration deadline looming, understands 45-min smog fix solves it, books tomorrow

### Strong Lead (60-79)
- Problem and pain acknowledged, somewhat specific
- Solution positioned but understanding unclear
- Shows intent but hesitant on timing
- **Action:** Follow-up sequence via SMS or email, escalate to owner if urgent trigger (deadline, recurring issue)
- **Example:** Sarah mentions inspection needed, understands you do smog checks, asks "how much?" but doesn't book yet

### Soft Lead (40-59)
- Acknowledges problem but pain is unclear
- Solution positioned but low engagement
- Curious but no action signal
- **Action:** Educational follow-up, nurture sequence, schedule callback
- **Example:** Mike says "maybe I should check my smog status," doesn't know his deadline, no booking

### Weak Lead (20-39)
- Minimal problem acknowledgment
- No clear solution fit
- Vague interest only
- **Action:** Add to drip sequence, route to junior follow-up, not immediate priority
- **Example:** Browsing visitor asks "do you offer oil changes?" — wrong service, no pain

### No Qualification (<20)
- No real problem, no fit, no intent
- **Action:** Archive or very long nurture (if any)
- **Example:** Looker asking general trivia about smog requirements with no vehicle

---

## Qualification Algorithm

### Input Example

```json
{
  "tenant_slug": "drive-city",
  "contact_name": "John Smith",
  "contact_phone": "+1-555-0199",
  "contact_email": "john@smith.com",
  "conversation_transcript": "Agent: Hi John, what brings you to us today? John: My registration is expiring May 30 and I'm worried about getting the smog check done before my appointment is too late... Agent: I understand. Your registration deadline is May 30. John: Yeah, and I can't afford downtime on my 2018 Honda. Agent: Great, so avoiding downtime while getting your smog done is important. We usually handle smog checks in 45 minutes while you wait. John: That's perfect! Book me for tomorrow at 10. Agent: Perfect, locked you in!",
  "vehicle_info": "2018 Honda Civic",
  "service_interest": "smog check",
  "pain_triggers": ["registration_expiry", "downtime_anxiety"],
  "timestamp": "2026-05-05T14:32:00Z"
}
```

### Processing Steps

**Step 1: Extract Pain Signals**

Parse transcript for keywords:
- Problem acknowledgment: "registration is expiring", "need smog check"
- Severity: "worried about", "can't afford downtime"
- Specificity: "May 30", "2018 Honda", "45 minutes"
- Prior attempts: Not mentioned (no points)
- Solution recognition: "45 minutes while you wait" → understood
- ROI articulation: "That's perfect" (confirmed benefit)
- Action signal: "Book me tomorrow at 10" (strongest signal)

**Step 2: Score Each Dimension**

| Dimension | Signal | Score |
|---|---|---|
| Problem acknowledgment | "Registration expiring" | +15 |
| Pain severity | "worried about", "can't afford downtime" | +15 |
| Pain specificity | "May 30", "2018 Honda" | +15 |
| Prior solving attempts | Not mentioned | 0 |
| Solution positioned | "45 minutes, while you wait" | +15 |
| ROI understood | "That's perfect" + explicit confirmation | +15 |
| Action signal | "Book me tomorrow at 10" | +10 |
| **TOTAL** | | **85** |

**Step 3: Determine Action**

Score 85 → "Perfect Lead" tier → Action: `book_appointment`

### Output

```json
{
  "lead_id": "lead_abc123",
  "qualified": true,
  "score": 85,
  "score_breakdown": {
    "problem_acknowledgment": 15,
    "pain_severity": 15,
    "pain_specificity": 15,
    "prior_solving_attempts": 0,
    "solution_positioned": 15,
    "roi_articulated": 15,
    "action_signal": 10
  },
  "pain_summary": "Registration deadline May 30, downtime anxiety on 2018 Honda, needs quick smog check",
  "pain_identified": true,
  "solution_pitched": true,
  "roi_articulated": true,
  "action_signal_strength": "strong",
  "recommended_action": "book_appointment",
  "action_tier": "perfect_lead",
  "urgency_score": 9,
  "reasoning": "Clear deadline, specific pain, solution understood, immediate booking intent"
}
```

---

## Industry-Specific Pain Triggers

### Drive City Lube & Smog

**Registration/Compliance Pain:**
- "Registration expires [DATE]"
- "Smog check overdue"
- "DMV letter came in"
- "Can't renew until..."

**Vehicle Maintenance Pain:**
- "Check engine light is on"
- "Failed smog test"
- "Oil change overdue"
- "Haven't serviced in..."

**Time/Convenience Pain:**
- "Can't afford downtime"
- "Need it done same-day"
- "Can't take car to dealer"
- "In a rush"

**Cost Pain:**
- "Other place charged too much"
- "Can't afford dealer prices"
- "Need affordable option"

### Template for Other Industries

For insurance, dental, HVAC, etc., customize the pain triggers:

```json
{
  "industry": "insurance",
  "pain_triggers": [
    "policy_expiring",
    "rate_increase_frustration",
    "coverage_gap_awareness",
    "claim_denied_recently",
    "switching_from_competitor"
  ]
}
```

---

## Handling Edge Cases

### Transcript Too Short
- If less than 20 words: default to score 0, action "follow_up"
- Reason: Insufficient data to qualify (can revisit after longer interaction)

### Transcript Mentions Competitor
- +5 bonus points (they're comparing, showing buying intent)
- Higher urgency flag (route faster)

### Multiple Decision-Makers Mentioned
- Score same as single person but flag "stakeholder_alignment_risk"
- Recommended action may need human escalation

### Prospect Has Negative History with Company
- Flag in output: "prior_negative_experience: true"
- Route to owner even if score high (relationship repair needed)

### Extreme Urgency Signals (same-day deadline)
- +10 urgency bonus
- Route to `book_immediately` if score >= 60 (lower threshold)

### No Pain Signals Despite Long Conversation
- Score stays low (0-20)
- Flag: "lack_of_engagement: true"
- Action: archive or very long nurture

---

## Integration Notes

**Called by:** `/speed-to-lead` orchestrator (SKILL.md)

**Calls next:** `/route` with qualify result

**Database:** Logs to `qualified_leads` table with full breakdown

**Audit:** Every qualification attempt logged regardless of score (for pattern detection)

---

## Drive City Smog: Worked Example

**John calls in:** "Hi, my registration is expiring May 30 and I haven't gotten my smog done yet."

Score: +15 (acknowledgment) +15 (severity: deadline creates urgency) +15 (specificity: May 30) = 45 so far

Agent: "I see. How long has it been since your last smog?"

John: "About 2 years, so it's due. I'm worried I'll fail and then can't get my tags."

Score: +15 (prior solve attempt implied: "2 years" shows regular pattern) = 60

Agent: "Good news—we usually catch issues and fix them same-day. You're in and out in under an hour."

John: "That sounds great. Can I come in tomorrow morning?"

Score: +15 (solution understood) +15 (ROI articulated: quick fix, avoids tag lapse) +10 (action signal) = 100

**Final Score: 100** — Perfect lead, book immediately.

---

**Version:** 1.0 | **Updated:** 2026-05-05