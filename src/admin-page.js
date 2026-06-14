export function adminPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Receptionist Admin</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f7f8fa; color: #172033; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 18px 24px; background: #fff; border-bottom: 1px solid #dfe3ea; position: sticky; top: 0; z-index: 2; }
    h1 { font-size: 20px; margin: 0; }
    main { max-width: 1180px; margin: 0 auto; padding: 20px; display: grid; gap: 16px; }
    .toolbar, .status { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .panel { background: #fff; border: 1px solid #dfe3ea; border-radius: 8px; padding: 16px; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
    .panel-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
    label { display: grid; gap: 6px; font-size: 13px; font-weight: 650; color: #3d4758; }
    input, textarea { box-sizing: border-box; width: 100%; border: 1px solid #cfd6e2; border-radius: 6px; padding: 10px; font: inherit; background: #fff; color: #172033; }
    textarea { min-height: 360px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; line-height: 1.45; resize: vertical; }
    textarea.prompt { min-height: 520px; }
    button { border: 1px solid #b9c3d4; background: #fff; color: #172033; border-radius: 6px; padding: 10px 14px; font: inherit; font-weight: 650; cursor: pointer; }
    button.primary { background: #1769e0; border-color: #1769e0; color: #fff; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .hint { margin: 6px 0 0; font-size: 13px; color: #647085; }
    .badge { border-radius: 999px; padding: 4px 8px; font-size: 12px; font-weight: 700; background: #edf2ff; color: #214ea3; }
    .badge.warn { background: #fff4d6; color: #8a5a00; }
    pre { margin: 0; white-space: pre-wrap; font-size: 13px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } header { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>AI Receptionist Admin</h1>
      <p class="hint">Edit business, projects, and priority rules. Save updates Supabase app_config and the local JSON knowledge files.</p>
    </div>
    <div class="toolbar">
      <button id="load">Load</button>
      <button id="save" class="primary">Save Config</button>
    </div>
  </header>
  <main>
    <section class="panel status">
      <span id="source" class="badge">not loaded</span>
      <span id="message" class="hint"></span>
    </section>
    <section class="grid">
      <label>Business JSON
        <textarea id="business" spellcheck="false"></textarea>
      </label>
      <label>Projects JSON
        <textarea id="projects" spellcheck="false"></textarea>
      </label>
      <label>Priority Rules JSON
        <textarea id="priorityRules" spellcheck="false"></textarea>
      </label>
    </section>
    <section class="panel">
      <strong>Config source</strong>
      <p class="hint">Business, projects, and priority rules load from Supabase <code>app_config</code> by default.</p>
      <pre id="details"></pre>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <strong>Generated Retell Prompt</strong>
          <p class="hint">Copy this into Retell for the fastest live-call setup.</p>
        </div>
        <button id="copyPrompt">Copy Prompt</button>
      </div>
      <textarea id="generatedPrompt" class="prompt" spellcheck="false" readonly></textarea>
    </section>
  </main>
  <script>
    const els = {
      load: document.querySelector("#load"),
      save: document.querySelector("#save"),
      business: document.querySelector("#business"),
      projects: document.querySelector("#projects"),
      priorityRules: document.querySelector("#priorityRules"),
      source: document.querySelector("#source"),
      message: document.querySelector("#message"),
      details: document.querySelector("#details"),
      generatedPrompt: document.querySelector("#generatedPrompt"),
      copyPrompt: document.querySelector("#copyPrompt")
    };

    function headers() {
      return {
        "content-type": "application/json"
      };
    }

    function setStatus(text, warn = false) {
      els.message.textContent = text;
      els.source.classList.toggle("warn", warn);
    }

    function sourceDetails(data) {
      const sources = data.sources || {};
      const label = (value) => value === "supabase" ? "Supabase DB" : "JSON fallback";
      const lines = [
        "Business: " + label(sources.business || data.source),
        "Projects: " + label(sources.projects || data.source),
        "Priority rules: " + label(sources.priorityRules || data.source)
      ];
      if (data.fallbackReason) lines.push("", "Fallback note: " + data.fallbackReason);
      return lines.join("\\n");
    }

    function pretty(value) {
      return JSON.stringify(value, null, 2);
    }

    function readEditor(id) {
      try {
        return JSON.parse(els[id].value);
      } catch (error) {
        throw new Error(id + " JSON is invalid: " + error.message);
      }
    }

    function projectListText(projects) {
      if (!Array.isArray(projects) || projects.length === 0) return "No projects configured.";
      return projects
        .map((project, index) => {
          const aliases = Array.isArray(project.aliases) && project.aliases.length
            ? " Aliases: " + project.aliases.join(", ") + "."
            : "";
          return (index + 1) + ". " + project.name + aliases;
        })
        .join("\\n");
    }

    function generateRetellPrompt() {
      try {
        const projects = readEditor("projects");
        els.generatedPrompt.value = [
          "You are the AI receptionist for an Australian real estate sales and project marketing business.",
          "",
          "Your job is to qualify inbound property enquiries and create a lead for the sales team.",
          "",
          "Available projects:",
          projectListText(projects),
          "",
          "Conversation flow:",
          "1. Greet the caller warmly.",
          "2. Ask which project they are interested in, using the available projects above.",
          "3. If the caller is unsure, offer the available project names.",
          "4. Capture their full name.",
          "5. Capture their best callback phone number.",
          "6. Ask their approximate budget or price range.",
          "7. Confirm the details back to the caller.",
          "8. Only after the caller has provided their approximate budget or price range, say: \\"Please wait while I write down your inquiry.\\"",
          "9. Then call the custom function 'capture_lead'.",
          "10. After 'capture_lead' succeeds, tell the caller that the right salesperson has been notified and will follow up shortly.",
          "",
          "Rules:",
          "- Do not call 'get_projects'.",
          "- Use the available project list in this prompt during the live conversation.",
          "- Do not call 'capture_lead' until all required details are collected: project name, caller name, callback phone number, and approximate budget or price range.",
          "- The approximate budget or price range is mandatory. If it has not been captured yet, ask for it before calling 'capture_lead'.",
          "- Before calling 'capture_lead', confirm the collected details back to the caller.",
          "- Always say \\"Please wait while I write down your inquiry.\\" immediately before calling 'capture_lead'.",
          "- Keep questions short and natural.",
          "- If the caller is unsure which project, offer the available project names.",
          "- If the caller names a project that sounds close to one of the available projects or aliases, capture the caller's wording naturally. The backend will match it.",
          "- Read phone numbers back carefully.",
          "- If a caller refuses to provide a detail, politely explain it is needed so the sales team can follow up.",
          "- Never invent property availability, prices, discounts, investment returns, legal advice, or financial advice.",
          "- If the caller asks about something unrelated, such as going out to dinner, restaurants, personal chat, jokes, general advice, or any topic not related to real estate enquiries, respond politely and redirect them back to the property enquiry. Example: \\"I can only help with property project enquiries today. Which project are you interested in?\\"",
          "- If 'capture_lead' is taking a moment, reassure the caller briefly and do not repeat the same message multiple times."
        ].join("\\n");
      } catch (error) {
        els.generatedPrompt.value = "Fix Projects JSON to generate the Retell prompt: " + error.message;
      }
    }

    async function loadConfig() {
      els.load.disabled = true;
      try {
        const response = await fetch("/api/admin/config", { headers: headers() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Load failed");
        els.business.value = pretty(data.business);
        els.projects.value = pretty(data.projects);
        els.priorityRules.value = pretty(data.priorityRules);
        els.source.textContent = data.source;
        els.details.textContent = sourceDetails(data);
        generateRetellPrompt();
        setStatus("Loaded configuration.", data.source !== "supabase");
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        els.load.disabled = false;
      }
    }

    async function saveConfig() {
      els.save.disabled = true;
      try {
        const payload = {
          business: readEditor("business"),
          projects: readEditor("projects"),
          priorityRules: readEditor("priorityRules")
        };
        const response = await fetch("/api/admin/config", {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Save failed");
        els.source.textContent = data.source;
        els.details.textContent = sourceDetails(data);
        generateRetellPrompt();
        setStatus("Saved to Supabase DB and local JSON knowledge files.", false);
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        els.save.disabled = false;
      }
    }

    els.load.addEventListener("click", loadConfig);
    els.save.addEventListener("click", saveConfig);
    els.projects.addEventListener("input", generateRetellPrompt);
    els.copyPrompt.addEventListener("click", async () => {
      await navigator.clipboard.writeText(els.generatedPrompt.value);
      setStatus("Copied generated Retell prompt.", false);
    });
    loadConfig();
  </script>
</body>
</html>`;
}
