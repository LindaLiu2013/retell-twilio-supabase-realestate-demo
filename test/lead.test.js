import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLead } from "../src/lead.js";
import { matchProject } from "../src/projects.js";

test("matches real estate project aliases", () => {
  assert.equal(matchProject("I am interested in Bondi")?.name, "Bondi Beach Collection");
  assert.equal(matchProject("parramatta apartments")?.name, "Parramatta Square Living");
});

test("normalizes Retell wrapped custom function payload", () => {
  const { lead, project } = normalizeLead({
    name: "capture_lead",
    call: {
      call_id: "call_123",
      telephony_identifier: { twilio_call_sid: "CA123" },
      transcript: "Agent: Which project? User: Harbour View..."
    },
    args: {
      project_name: "Harbour View",
      caller_name: "Linda Liu",
      caller_phone: "0405 547 481",
      budget: "$1.2m"
    }
  });

  assert.equal(project.name, "Harbour View Residences");
  assert.equal(lead.project_name, "Harbour View Residences");
  assert.equal(lead.caller_phone, "0405547481");
  assert.equal(lead.priority, "medium");
  assert.equal(lead.call_id, "call_123");
  assert.equal(lead.twilio_call_sid, "CA123");
});

test("accepts Retell args-only payload shape", () => {
  const { lead } = normalizeLead({
    project_name: "Bondi Beach",
    caller_name: "Alex Smith",
    caller_phone: "+61 400 000 000",
    budget: "2m to 2.5m"
  });

  assert.equal(lead.project_name, "Bondi Beach Collection");
  assert.equal(lead.caller_phone, "+61400000000");
});

test("calculates high priority from urgent inspection intent", () => {
  const { lead } = normalizeLead({
    project_name: "Bondi Beach",
    caller_name: "Urgent Buyer",
    caller_phone: "+61 400 000 000",
    budget: "above $1,000,000",
    transcript: "Caller wants an inspection this week and is ready to proceed."
  });

  assert.equal(lead.priority, "high");
});

test("calculates low priority from browsing intent", () => {
  const { lead } = normalizeLead({
    project_name: "Bondi Beach",
    caller_name: "Browsing Buyer",
    caller_phone: "+61 400 000 000",
    budget: "$500k",
    transcript: "Caller is just browsing."
  });

  assert.equal(lead.priority, "low");
});

test("throws clear validation errors", () => {
  assert.throws(
    () => normalizeLead({ args: { caller_name: "Alex" } }),
    /project_name, caller_phone, budget/
  );
});
