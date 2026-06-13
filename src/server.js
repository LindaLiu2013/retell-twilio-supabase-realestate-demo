import http from "node:http";
import { env } from "./config.js";
import { escapeXml, parseForm, parseJson, readBody, sendJson, sendXml } from "./http.js";
import { normalizeLead } from "./lead.js";
import { sendEmailNotification, sendSmsNotification } from "./notifications.js";
import { projects } from "./projects.js";
import { verifyRetellSignature } from "./retell.js";
import { insertLead } from "./supabase.js";

const port = Number(env("PORT", "3000"));

async function captureLead(payload) {
  const { lead, project } = normalizeLead(payload);
  const inserted = await insertLead(lead);

  const [sms, email] = await Promise.allSettled([
    sendSmsNotification(inserted, project),
    sendEmailNotification(inserted, project)
  ]);

  return {
    lead: inserted,
    project,
    notifications: {
      sms: sms.status === "fulfilled" ? sms.value : { error: sms.reason.message },
      email: email.status === "fulfilled" ? email.value : { error: email.reason.message }
    }
  };
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { ok: true, service: "retell-real-estate-ai-receptionist-demo" });
  }

  if (req.method === "GET" && url.pathname === "/projects") {
    return sendJson(res, 200, { projects });
  }

  if (req.method === "POST" && url.pathname === "/twilio/inbound") {
    const rawBody = await readBody(req);
    const form = parseForm(rawBody);
    const sipUri = env("RETELL_SIP_URI", "sip:sip.retellai.com;transport=tcp");

    const twiml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      '<Say voice="alice">Connecting you to our AI property receptionist.</Say>',
      "<Dial>",
      `<Sip>${escapeXml(sipUri)}</Sip>`,
      "</Dial>",
      "</Response>"
    ].join("");

    console.info("Inbound Twilio call", {
      callSid: form.CallSid,
      from: form.From,
      to: form.To,
      sipUri
    });

    return sendXml(res, 200, twiml);
  }

  if (req.method === "POST" && url.pathname === "/retell/functions/capture-lead") {
    const rawBody = await readBody(req);
    const signature = req.headers["x-retell-signature"];
    const verification = verifyRetellSignature(rawBody, signature);

    if (!verification.ok) {
      return sendJson(res, 401, { ok: false, error: verification.reason || "Invalid Retell signature" });
    }

    const payload = parseJson(rawBody);
    const result = await captureLead(payload);

    return sendJson(res, 200, {
      ok: true,
      message: `Lead saved for ${result.lead.project_name}. Notify ${result.lead.matched_salesperson || "sales team"} for follow-up.`,
      lead_id: result.lead.id,
      matched_salesperson: result.lead.matched_salesperson,
      notifications: result.notifications
    });
  }

  if (req.method === "POST" && url.pathname === "/demo/lead") {
    const rawBody = await readBody(req);
    const payload = parseJson(rawBody);
    const result = await captureLead({ args: payload });

    return sendJson(res, 200, {
      ok: true,
      lead_id: result.lead.id,
      lead: result.lead,
      notifications: result.notifications
    });
  }

  return sendJson(res, 404, { ok: false, error: "Not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, error.status || 500, { ok: false, error: error.message });
  }
});

server.listen(port, () => {
  console.log(`AI receptionist demo listening on :${port}`);
});
