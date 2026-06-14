import { env } from "./config.js";
import { calculatePriority } from "./priority.js";

const VALID_PRIORITIES = new Set(["high", "medium", "low"]);

function fallbackSummary(lead) {
  return [
    `${lead.caller_name} is interested in ${lead.project_name}.`,
    `Budget: ${lead.budget}.`,
    lead.matched_salesperson ? `Suggested handoff: ${lead.matched_salesperson}.` : "Suggested handoff: sales team."
  ].join(" ");
}

function fallbackReason(lead) {
  if (lead.priority === "high") return "Rule-based priority: urgent or ready-to-proceed buying intent detected.";
  if (lead.priority === "low") return "Rule-based priority: browsing, vague, or lower-fit intent detected.";
  return "Rule-based priority: complete lead with plausible interest; no high or low priority signal detected.";
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("OpenAI response did not contain JSON.");
    return JSON.parse(match[0]);
  }
}

export function fallbackLeadEnrichment(lead, priorityRules) {
  const priority =
    lead.priority ||
    calculatePriority(
      {
        projectInput: lead.project_name,
        callerName: lead.caller_name,
        callerPhone: lead.caller_phone,
        budget: lead.budget,
        transcript: lead.transcript
      },
      priorityRules
    );

  const enrichedLead = {
    ...lead,
    priority,
    handoff_summary: lead.handoff_summary || fallbackSummary({ ...lead, priority }),
    qualification_reason: lead.qualification_reason || fallbackReason({ ...lead, priority })
  };

  return {
    lead: enrichedLead,
    source: "rules"
  };
}

export async function enrichLeadWithOpenAI(lead, project, runtimeConfig = {}) {
  const apiKey = env("OPENAI_API_KEY");
  const model = env("OPENAI_MODEL", "gpt-4.1-mini");

  if (!apiKey) return fallbackLeadEnrichment(lead, runtimeConfig.priorityRules);

  const systemPrompt = [
    "You enrich inbound real estate project leads for a sales team.",
    "Return only valid JSON with keys: priority, qualification_reason, handoff_summary.",
    "priority must be one of: high, medium, low.",
    "High means ready to inspect/book soon, strong budget fit, urgent follow-up, or finance-ready intent.",
    "Medium means complete qualified lead with plausible interest but unclear urgency.",
    "Low means browsing only, vague/low budget, poor fit, or weak intent.",
    "handoff_summary must be concise and useful for a salesperson."
  ].join(" ");

  const input = {
    project_name: lead.project_name,
    caller_name: lead.caller_name,
    caller_phone: lead.caller_phone,
    budget: lead.budget,
    matched_salesperson: lead.matched_salesperson,
    project_aliases: project?.aliases || [],
    transcript: lead.transcript,
    raw_args: lead.raw_payload?.args || lead.raw_payload
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Lead data:\n${JSON.stringify(input, null, 2)}`
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "lead_enrichment",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["priority", "qualification_reason", "handoff_summary"],
              properties: {
                priority: {
                  type: "string",
                  enum: ["high", "medium", "low"]
                },
                qualification_reason: {
                  type: "string"
                },
                handoff_summary: {
                  type: "string"
                }
              }
            }
          }
        }
      })
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI enrichment failed (${response.status}): ${text}`);
    }

    const payload = JSON.parse(text);
    const outputText =
      payload.output_text ||
      payload.output?.flatMap((item) => item.content || []).find((part) => part.type === "output_text")?.text;

    if (!outputText) throw new Error("OpenAI response did not include output_text.");

    const enrichment = safeJsonParse(outputText);
    const priority = VALID_PRIORITIES.has(enrichment.priority) ? enrichment.priority : lead.priority || "medium";

    return {
      lead: {
        ...lead,
        priority,
        qualification_reason: String(enrichment.qualification_reason || "").trim() || fallbackReason({ ...lead, priority }),
        handoff_summary: String(enrichment.handoff_summary || "").trim() || fallbackSummary({ ...lead, priority })
      },
      source: "openai"
    };
  } catch (error) {
    console.warn("OpenAI enrichment fallback:", error.message);
    return fallbackLeadEnrichment(lead, runtimeConfig.priorityRules);
  }
}
