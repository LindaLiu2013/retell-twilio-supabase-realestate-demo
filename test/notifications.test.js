import assert from "node:assert/strict";
import test from "node:test";
import { sendEmailNotification } from "../src/notifications.js";

test("email notifications always use NOTIFY_EMAIL_TO from env", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  let requestBody;

  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.EMAIL_FROM = "AI Receptionist <notify@example.com>";
  process.env.NOTIFY_EMAIL_TO = "central-sales@example.com";

  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
  };

  try {
    await sendEmailNotification(
      {
        project_name: "Harbour View Residences",
        caller_name: "Test Caller",
        caller_phone: "0405547481",
        budget: "$1.2m to $1.5m"
      },
      {
        salesperson: "Ava Chen",
        notifyEmail: "project-salesperson@example.com"
      }
    );

    assert.equal(requestBody.to, "central-sales@example.com");
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});
