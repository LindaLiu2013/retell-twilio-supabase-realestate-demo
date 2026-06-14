import assert from "node:assert/strict";
import test from "node:test";
import { enrichLeadWithOpenAI, fallbackLeadEnrichment } from "../src/openai-enrichment.js";

const baseLead = {
  project_name: "Bondi Beach Collection",
  caller_name: "Urgent Buyer",
  caller_phone: "0405547481",
  budget: "above $1,000,000",
  priority: "high",
  matched_salesperson: "Sophie Nguyen",
  transcript: "Caller wants an inspection this week and is ready to proceed.",
  raw_payload: { args: { project_name: "Bondi Beach" } }
};

test("fallback enrichment adds handoff summary and qualification reason", () => {
  const { lead, source } = fallbackLeadEnrichment(baseLead);

  assert.equal(source, "rules");
  assert.equal(lead.priority, "high");
  assert.match(lead.handoff_summary, /Urgent Buyer/);
  assert.match(lead.qualification_reason, /urgent|ready/i);
});

test("OpenAI enrichment falls back when no API key is configured", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const { lead, source } = await enrichLeadWithOpenAI(baseLead, null, {});

    assert.equal(source, "rules");
    assert.equal(lead.priority, "high");
    assert.ok(lead.handoff_summary);
    assert.ok(lead.qualification_reason);
  } finally {
    if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
  }
});

test("OpenAI enrichment uses structured output when API key is configured", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;
  const originalFetch = globalThis.fetch;
  let requestBody;

  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_MODEL = "gpt-4.1-mini";
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        output_text: JSON.stringify({
          priority: "high",
          qualification_reason: "Caller has strong budget and wants inspection this week.",
          handoff_summary: "HIGH priority Bondi lead: call today to arrange inspection."
        })
      }),
      { status: 200 }
    );
  };

  try {
    const { lead, source } = await enrichLeadWithOpenAI(baseLead, null, {});

    assert.equal(source, "openai");
    assert.equal(lead.priority, "high");
    assert.equal(lead.handoff_summary, "HIGH priority Bondi lead: call today to arrange inspection.");
    assert.equal(requestBody.text.format.type, "json_schema");
    assert.equal(requestBody.model, "gpt-4.1-mini");
    assert.equal(requestBody.text.format.name, "lead_enrichment");
    assert.deepEqual(requestBody.text.format.schema.required, [
      "priority",
      "qualification_reason",
      "handoff_summary"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
    else delete process.env.OPENAI_API_KEY;
    if (originalModel) process.env.OPENAI_MODEL = originalModel;
    else delete process.env.OPENAI_MODEL;
  }
});

test("OpenAI enrichment falls back to rules when the OpenAI API fails", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;

  process.env.OPENAI_API_KEY = "test-openai-key";
  console.warn = () => {};
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: "model not found" } }), { status: 404 });

  try {
    const { lead, source } = await enrichLeadWithOpenAI(baseLead, null, {});

    assert.equal(source, "rules");
    assert.equal(lead.priority, "high");
    assert.match(lead.handoff_summary, /Urgent Buyer/);
    assert.match(lead.qualification_reason, /urgent|ready/i);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("OpenAI enrichment falls back to existing priority when model returns an invalid priority", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.OPENAI_API_KEY = "test-openai-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        output_text: JSON.stringify({
          priority: "vip",
          qualification_reason: "Strong enquiry, but priority label is invalid.",
          handoff_summary: "Call this buyer today."
        })
      }),
      { status: 200 }
    );

  try {
    const { lead, source } = await enrichLeadWithOpenAI(baseLead, null, {});

    assert.equal(source, "openai");
    assert.equal(lead.priority, "high");
    assert.equal(lead.qualification_reason, "Strong enquiry, but priority label is invalid.");
    assert.equal(lead.handoff_summary, "Call this buyer today.");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("OpenAI enrichment reads nested Responses API output text", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.OPENAI_API_KEY = "test-openai-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  priority: "medium",
                  qualification_reason: "Complete lead but no immediate urgency.",
                  handoff_summary: "Follow up with the caller and confirm inspection timing."
                })
              }
            ]
          }
        ]
      }),
      { status: 200 }
    );

  try {
    const { lead, source } = await enrichLeadWithOpenAI(baseLead, null, {});

    assert.equal(source, "openai");
    assert.equal(lead.priority, "medium");
    assert.equal(lead.qualification_reason, "Complete lead but no immediate urgency.");
    assert.equal(lead.handoff_summary, "Follow up with the caller and confirm inspection timing.");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
    else delete process.env.OPENAI_API_KEY;
  }
});
