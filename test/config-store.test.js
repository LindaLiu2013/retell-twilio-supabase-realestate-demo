import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadRuntimeConfig,
  resetRuntimeConfigCacheForTests,
  saveRuntimeConfig,
  validateRuntimeConfig
} from "../src/config-store.js";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const jsonFiles = [
  fileURLToPath(new URL("../data/business.json", import.meta.url)),
  fileURLToPath(new URL("../data/projects.json", import.meta.url)),
  fileURLToPath(new URL("../data/priority-rules.json", import.meta.url))
];
const originalJsonFiles = new Map(jsonFiles.map((path) => [path, readFileSync(path, "utf8")]));

function restore() {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
  for (const [path, content] of originalJsonFiles) {
    writeFileSync(path, content, "utf8");
  }
  resetRuntimeConfigCacheForTests();
}

function setSupabaseEnv() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.CONFIG_CACHE_TTL_MS = "1";
}

test.afterEach(restore);

test("loads business, projects, and priority rules from app_config first", async () => {
  setSupabaseEnv();
  globalThis.fetch = async (url, options) => {
    assert.equal(
      url,
      "https://example.supabase.co/rest/v1/app_config?key=in.(business,projects,priority_rules)&select=key,value"
    );
    assert.equal(options.headers.apikey, "service-role-key");

    return new Response(
      JSON.stringify([
        { key: "business", value: { businessName: "Database Agency" } },
        {
          key: "projects",
          value: [
            {
              slug: "db-project",
              name: "Database Project",
              aliases: ["db"],
              salesperson: "Sam"
            }
          ]
        },
        { key: "priority_rules", value: { high: ["urgent"], low: ["browsing"], default: "medium" } }
      ]),
      { status: 200 }
    );
  };

  const config = await loadRuntimeConfig({ refresh: true });

  assert.equal(config.source, "supabase");
  assert.deepEqual(config.sources, {
    business: "supabase",
    projects: "supabase",
    priorityRules: "supabase"
  });
  assert.equal(config.business.businessName, "Database Agency");
  assert.equal(config.projects[0].name, "Database Project");
  assert.deepEqual(config.priorityRules.high, ["urgent"]);
});

test("falls back to JSON config when app_config cannot be loaded", async () => {
  setSupabaseEnv();
  globalThis.fetch = async () => {
    throw new Error("database offline");
  };

  const config = await loadRuntimeConfig({ refresh: true });

  assert.equal(config.source, "json_fallback");
  assert.deepEqual(config.sources, {
    business: "json_fallback",
    projects: "json_fallback",
    priorityRules: "json_fallback"
  });
  assert.match(config.fallbackReason, /database offline/);
  assert.equal(config.business.businessName, "ABC Project Marketing");
  assert.equal(config.projects[0].name, "Harbour View Residences");
  assert.equal(config.priorityRules.default, "medium");
});

test("saves admin JSON config into app_config rows and local JSON files", async () => {
  setSupabaseEnv();
  const payload = {
    business: { businessName: "Saved Agency" },
    projects: [{ slug: "saved-project", name: "Saved Project", aliases: [] }],
    priorityRules: { high: ["today"], low: ["later"], default: "medium" }
  };

  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://example.supabase.co/rest/v1/app_config?on_conflict=key");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.prefer, "resolution=merge-duplicates,return=representation");

    const rows = JSON.parse(options.body);
    assert.deepEqual(
      rows.map((row) => row.key),
      ["business", "projects", "priority_rules"]
    );
    assert.deepEqual(rows[0].value, payload.business);
    assert.deepEqual(rows[1].value, payload.projects);
    assert.deepEqual(rows[2].value, payload.priorityRules);

    return new Response(JSON.stringify(rows), { status: 200 });
  };

  const config = await saveRuntimeConfig(payload);

  assert.equal(config.source, "supabase");
  assert.deepEqual(config.sources, {
    business: "supabase",
    projects: "supabase",
    priorityRules: "supabase"
  });
  assert.equal(config.business.businessName, "Saved Agency");
  assert.equal(config.projects[0].name, "Saved Project");
  assert.deepEqual(JSON.parse(readFileSync(jsonFiles[0], "utf8")), payload.business);
  assert.deepEqual(JSON.parse(readFileSync(jsonFiles[1], "utf8")), payload.projects);
  assert.deepEqual(JSON.parse(readFileSync(jsonFiles[2], "utf8")), payload.priorityRules);
});

test("validates admin config before saving", () => {
  assert.throws(
    () => validateRuntimeConfig({ business: {}, projects: [{ slug: "missing-name" }], priorityRules: {} }),
    /projects\[0\] must include slug and name/
  );

  assert.throws(
    () =>
      validateRuntimeConfig({
        business: {},
        projects: [{ slug: "project", name: "Project", aliases: [] }],
        priorityRules: { high: "urgent", low: [] }
      }),
    /priorityRules.high must be an array/
  );
});
