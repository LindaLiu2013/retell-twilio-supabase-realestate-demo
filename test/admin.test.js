import assert from "node:assert/strict";
import test from "node:test";
import { adminPage } from "../src/admin-page.js";

test("admin UI edits business, projects, and priority rules JSON", () => {
  const html = adminPage();

  assert.match(html, /AI Receptionist Admin/);
  assert.match(html, /id="business"/);
  assert.match(html, /id="projects"/);
  assert.match(html, /id="priorityRules"/);
  assert.match(html, /id="generatedPrompt"/);
  assert.match(html, /id="copyPrompt"/);
  assert.match(html, /Save Config/);
  assert.match(html, /Generated Retell Prompt/);
  assert.match(html, /Copy this into Retell for the fastest live-call setup\./);
  assert.doesNotMatch(html, /It uses the Projects JSON directly/);
  assert.match(html, /Do not call 'get_projects'/);
  assert.match(html, /\/api\/admin\/config/);
  assert.match(html, /Business, projects, and priority rules load from Supabase <code>app_config<\/code> by default\./);
  assert.doesNotMatch(html, /Retell Knowledge URL/);
  assert.doesNotMatch(html, /Saving also writes data\/projects\.json/);
  assert.doesNotMatch(html, /query Knowledge Base/);
  assert.match(html, /Business: /);
  assert.doesNotMatch(html, /password/i);
});
