import { business as fallbackBusiness } from "./business.js";
import { env, requiredEnv } from "./config.js";
import { projects as fallbackProjects } from "./projects.js";
import { priorityRules as fallbackPriorityRules } from "./priority.js";

const CONFIG_TABLE = "app_config";
const CONFIG_KEYS = {
  business: "business",
  projects: "projects",
  priorityRules: "priority_rules"
};

let cache = null;
let cacheExpiresAt = 0;

export function resetRuntimeConfigCacheForTests() {
  cache = null;
  cacheExpiresAt = 0;
}

function fallbackConfig(reason = null) {
  return {
    business: fallbackBusiness,
    projects: fallbackProjects,
    priorityRules: fallbackPriorityRules,
    source: "json_fallback",
    sources: {
      business: "json_fallback",
      projects: "json_fallback",
      priorityRules: "json_fallback"
    },
    fallbackReason: reason
  };
}

function configEndpoint(path = "") {
  const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  return `${supabaseUrl}/rest/v1/${CONFIG_TABLE}${path}`;
}

function supabaseHeaders() {
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json"
  };
}

function normalizeConfig(rows) {
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const sources = {
    business: byKey[CONFIG_KEYS.business] ? "supabase" : "json_fallback",
    projects: byKey[CONFIG_KEYS.projects] ? "supabase" : "json_fallback",
    priorityRules: byKey[CONFIG_KEYS.priorityRules] ? "supabase" : "json_fallback"
  };
  const allFromSupabase = Object.values(sources).every((source) => source === "supabase");
  const anyFromSupabase = Object.values(sources).some((source) => source === "supabase");

  return {
    business: byKey[CONFIG_KEYS.business] || fallbackBusiness,
    projects: byKey[CONFIG_KEYS.projects] || fallbackProjects,
    priorityRules: byKey[CONFIG_KEYS.priorityRules] || fallbackPriorityRules,
    source: allFromSupabase ? "supabase" : anyFromSupabase ? "mixed" : "json_fallback",
    sources,
    fallbackReason: allFromSupabase
      ? null
      : anyFromSupabase
        ? "Some app_config rows are missing; missing sections used JSON fallback"
        : "No app_config rows found"
  };
}

export async function loadRuntimeConfig({ refresh = false } = {}) {
  const ttlMs = Number(env("CONFIG_CACHE_TTL_MS", "30000"));
  const now = Date.now();

  if (!refresh && cache && now < cacheExpiresAt) return cache;

  try {
    const response = await fetch(
      configEndpoint("?key=in.(business,projects,priority_rules)&select=key,value"),
      { headers: supabaseHeaders() }
    );

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Config fetch failed (${response.status}): ${text}`);
    }

    cache = normalizeConfig(JSON.parse(text));
  } catch (error) {
    cache = fallbackConfig(error.message);
  }

  cacheExpiresAt = now + ttlMs;
  return cache;
}

export async function saveRuntimeConfig({ business, projects, priorityRules }) {
  const rows = [
    { key: CONFIG_KEYS.business, value: business, updated_at: new Date().toISOString() },
    { key: CONFIG_KEYS.projects, value: projects, updated_at: new Date().toISOString() },
    { key: CONFIG_KEYS.priorityRules, value: priorityRules, updated_at: new Date().toISOString() }
  ];

  const response = await fetch(configEndpoint("?on_conflict=key"), {
    method: "POST",
    headers: {
      ...supabaseHeaders(),
      prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(rows)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Config save failed (${response.status}): ${text}`);
  }

  cache = normalizeConfig(JSON.parse(text));
  cache.source = "supabase";
  cache.fallbackReason = null;
  cacheExpiresAt = Date.now() + Number(env("CONFIG_CACHE_TTL_MS", "30000"));

  return cache;
}

export function validateRuntimeConfig(config) {
  if (!config || typeof config !== "object") throw new Error("Config must be an object");
  if (!config.business || typeof config.business !== "object") throw new Error("business must be an object");
  if (!Array.isArray(config.projects)) throw new Error("projects must be an array");
  if (!config.priorityRules || typeof config.priorityRules !== "object") {
    throw new Error("priorityRules must be an object");
  }

  for (const [index, project] of config.projects.entries()) {
    if (!project.slug || !project.name) {
      throw new Error(`projects[${index}] must include slug and name`);
    }
    if (!Array.isArray(project.aliases)) {
      throw new Error(`projects[${index}].aliases must be an array`);
    }
  }

  for (const key of ["high", "low"]) {
    if (!Array.isArray(config.priorityRules[key])) {
      throw new Error(`priorityRules.${key} must be an array`);
    }
  }
}
