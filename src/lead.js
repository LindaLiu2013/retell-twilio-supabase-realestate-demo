import { matchProject } from "./projects.js";
import { calculatePriority } from "./priority.js";

function compactPhone(phone) {
  return String(phone ?? "").replace(/[^\d+]/g, "");
}

export function extractRetellArgs(payload) {
  if (payload && typeof payload === "object" && payload.args) return payload.args;
  return payload ?? {};
}

export function normalizeLead(payload, runtimeConfig = {}) {
  const args = extractRetellArgs(payload);
  const projectInput = args.project_name || args.project || args.interested_project;
  const project = matchProject(projectInput, runtimeConfig.projects);

  const callerName = args.caller_name || args.name || args.full_name;
  const callerPhone = compactPhone(args.caller_phone || args.phone || args.mobile);
  const budget = args.budget || args.price_range || args.budget_range;

  const missing = [];
  if (!projectInput) missing.push("project_name");
  if (!callerName) missing.push("caller_name");
  if (!callerPhone) missing.push("caller_phone");
  if (!budget) missing.push("budget");

  if (missing.length) {
    const error = new Error(`Missing required lead fields: ${missing.join(", ")}`);
    error.status = 422;
    throw error;
  }

  const call = payload.call ?? {};
  const twilioCallSid = call.telephony_identifier?.twilio_call_sid || args.twilio_call_sid;
  const transcript = call.transcript || args.transcript || null;
  const priority =
    args.priority ||
    calculatePriority(
      { projectInput, callerName, callerPhone, budget, transcript },
      runtimeConfig.priorityRules
    );

  return {
    project,
    lead: {
      source: "retell_ai_receptionist",
      project_name: project?.name || projectInput,
      caller_name: String(callerName).trim(),
      caller_phone: callerPhone,
      budget: String(budget).trim(),
      priority,
      matched_salesperson: project?.salesperson ?? null,
      call_id: call.call_id || args.call_id || null,
      twilio_call_sid: twilioCallSid || null,
      transcript,
      raw_payload: payload
    }
  };
}
