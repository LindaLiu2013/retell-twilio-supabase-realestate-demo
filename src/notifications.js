import { env } from "./config.js";

function leadMessage(lead, project) {
  return [
    "New AI receptionist lead",
    lead.priority ? `Priority: ${lead.priority.toUpperCase()}` : null,
    `Project: ${lead.project_name}`,
    `Name: ${lead.caller_name}`,
    `Phone: ${lead.caller_phone}`,
    `Budget: ${lead.budget}`,
    lead.handoff_summary ? `Summary: ${lead.handoff_summary}` : null,
    lead.qualification_reason ? `Reason: ${lead.qualification_reason}` : null,
    project?.salesperson ? `Salesperson: ${project.salesperson}` : null,
    lead.call_id ? `Retell call: ${lead.call_id}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

export async function sendSmsNotification(lead, project) {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_FROM_NUMBER");
  const to = project?.notifySms || env("NOTIFY_SMS_TO");

  if (!accountSid || !authToken || !from || !to) {
    return { skipped: true, reason: "Twilio SMS env vars are not fully configured." };
  }

  const params = new URLSearchParams({
    From: from,
    To: to,
    Body: leadMessage(lead, project)
  });

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: params
    }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Twilio SMS failed (${response.status}): ${text}`);
  }

  return { skipped: false, provider: "twilio", response: JSON.parse(text) };
}

export async function sendEmailNotification(lead, project) {
  const apiKey = env("RESEND_API_KEY");
  const from = env("EMAIL_FROM");
  // Testing-stage behavior: send all Resend emails to the central inbox in NOTIFY_EMAIL_TO.
  // In production, this can be changed to route to project-specific salesperson emails.
  const to = env("NOTIFY_EMAIL_TO");

  if (!apiKey || !from || !to) {
    return { skipped: true, reason: "Resend email env vars are not fully configured." };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject: `New ${lead.project_name} lead from ${lead.caller_name}`,
      text: leadMessage(lead, project)
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Email notification failed (${response.status}): ${text}`);
  }

  return { skipped: false, provider: "resend", response: JSON.parse(text) };
}
