export function qualifyLead(payload: any): {
  score: number;
  pain_identified: string;
  solution_pitched: string;
  roi_articulated: string;
  factors: Record<string, number>;
} {
  const transcript = String(payload.transcript || payload.notes || "").toLowerCase();
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
    score: Math.max(0, Math.min(score, 100)),
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
export function routeLead(score: number, payload: any, hours: any): { action: Route; reason: string } {
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
export function generateResponse(action: Route, tenant: any, payload: any, qualResult: any): string {
  return `Thanks for contacting ${tenant.business_name}. Your inquiry has been received for review.`;
}
