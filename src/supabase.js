import { env, requiredEnv } from "./config.js";

export async function insertLead(lead) {
  const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const table = env("SUPABASE_LEADS_TABLE", "leads");
  const endpoint = `${supabaseUrl}/rest/v1/${encodeURIComponent(table)}`;

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=representation"
      },
      body: JSON.stringify(lead)
    });
  } catch (error) {
    const host = new URL(supabaseUrl).host;
    const cause = error.cause?.code || error.cause?.message || error.message;
    throw new Error(`Supabase request failed for ${host}: ${cause}`);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase insert failed (${response.status}): ${text}`);
  }

  return JSON.parse(text)[0];
}
