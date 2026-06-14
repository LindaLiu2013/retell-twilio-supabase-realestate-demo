import assert from "node:assert/strict";
import test from "node:test";
import { adminPage } from "../src/admin-page.js";

test("admin UI edits business, projects, and priority rules JSON", () => {
  const html = adminPage();

  assert.match(html, /AI Receptionist Admin/);
  assert.match(html, /id="business"/);
  assert.match(html, /id="projects"/);
  assert.match(html, /id="priorityRules"/);
  assert.match(html, /Save Config/);
  assert.match(html, /\/api\/admin\/config/);
  assert.match(html, /Save updates Supabase app_config/);
  assert.match(html, /\/knowledge\/projects\.json/);
  assert.match(html, /Business: /);
  assert.doesNotMatch(html, /password/i);
});
