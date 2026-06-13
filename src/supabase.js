import { env, requiredEnv } from "./config.js";

export async function insertLead(lead) {
  const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const table = env("SUPABASE_LEADS_TABLE", "leads");

  const response = await fetch(`${supabaseUrl}/rest/v1/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=representation"
    },
    body: JSON.stringify(lead)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase insert failed (${response.status}): ${text}`);
  }

  return JSON.parse(text)[0];
}
