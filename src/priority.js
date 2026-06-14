import { readJson } from "./data.js";

export const priorityRules = readJson("../data/priority-rules.json");

function includesAny(text, terms = []) {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

export function calculatePriority(
  { projectInput, callerName, callerPhone, budget, transcript },
  rules = priorityRules
) {
  const combined = [projectInput, callerName, callerPhone, budget, transcript]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (includesAny(combined, rules.high)) return "high";
  if (includesAny(combined, rules.low)) return "low";

  return rules.default || "medium";
}
