import http from "node:http";
import { env } from "./config.js";
import { adminPage } from "./admin-page.js";
import { loadRuntimeConfig, saveRuntimeConfig, validateRuntimeConfig } from "./config-store.js";
import { escapeXml, parseForm, parseJson, readBody, sendHtml, sendJson, sendXml } from "./http.js";
import { normalizeLead } from "./lead.js";
import { sendEmailNotification, sendSmsNotification } from "./notifications.js";
import { enrichLeadWithOpenAI } from "./openai-enrichment.js";
import { verifyRetellSignature } from "./retell.js";
import { insertLead } from "./supabase.js";

const port = Number(env("PORT", "3000"));

async function captureLead(payload) {
  const runtimeConfig = await loadRuntimeConfig();
  const { lead, project } = normalizeLead(payload, runtimeConfig);
  const enrichment = await enrichLeadWithOpenAI(lead, project, runtimeConfig);
  const inserted = await insertLead(enrichment.lead);

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
    },
    enrichmentSource: enrichment.source
  };
}

async function getProjects() {
  const runtimeConfig = await loadRuntimeConfig();
  return {
    projects: runtimeConfig.projects.map((project) => ({
      name: project.name,
      aliases: project.aliases || [],
      salesperson: project.salesperson || null
    })),
    source: runtimeConfig.source,
    fallbackReason: runtimeConfig.fallbackReason
  };
}

async function getProjectsKnowledge() {
  const runtimeConfig = await loadRuntimeConfig({ refresh: true });
  return {
    knowledge_type: "real_estate_project_marketing_projects",
    updated_at: new Date().toISOString(),
    instructions: [
      "Use these projects as the current available projects.",
      "Do not call get_projects during the live conversation.",
      "If a caller says an alias, capture the official project name when possible.",
      "Never invent availability, prices, discounts, legal advice, or financial advice."
    ],
    projects: runtimeConfig.projects.map((project) => ({
      name: project.name,
      aliases: project.aliases || [],
      salesperson: project.salesperson || null
    })),
    source: runtimeConfig.source,
    fallbackReason: runtimeConfig.fallbackReason
  };
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { ok: true, service: "retell-real-estate-ai-receptionist-demo" });
  }

  if (req.method === "GET" && url.pathname === "/projects") {
    return sendJson(res, 200, await getProjects());
  }

  if (req.method === "GET" && url.pathname === "/knowledge/projects.json") {
    return sendJson(res, 200, await getProjectsKnowledge());
  }

  if (req.method === "GET" && url.pathname === "/config") {
    return sendJson(res, 200, await loadRuntimeConfig());
  }

  if (req.method === "GET" && url.pathname === "/admin") {
    return sendHtml(res, 200, adminPage());
  }

  if (req.method === "GET" && url.pathname === "/api/admin/config") {
    return sendJson(res, 200, await loadRuntimeConfig({ refresh: true }));
  }

  if (req.method === "POST" && url.pathname === "/api/admin/config") {
    const payload = parseJson(await readBody(req));
    validateRuntimeConfig(payload);
    return sendJson(res, 200, await saveRuntimeConfig(payload));
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
      priority: result.lead.priority,
      handoff_summary: result.lead.handoff_summary,
      qualification_reason: result.lead.qualification_reason,
      enrichment_source: result.enrichmentSource,
      notifications: result.notifications
    });
  }

  if (req.method === "POST" && url.pathname === "/retell/functions/get-projects") {
    const rawBody = await readBody(req);
    const signature = req.headers["x-retell-signature"];
    const verification = verifyRetellSignature(rawBody, signature);

    if (!verification.ok) {
      return sendJson(res, 401, { ok: false, error: verification.reason || "Invalid Retell signature" });
    }

    const result = await getProjects();
    const projectNames = result.projects.map((project) => project.name);

    return sendJson(res, 200, {
      ok: true,
      projects: result.projects,
      project_names: projectNames,
      message: `Available projects: ${projectNames.join(", ")}.`,
      source: result.source,
      fallbackReason: result.fallbackReason
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
      enrichment_source: result.enrichmentSource,
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
