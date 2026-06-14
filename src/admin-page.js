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
    label { display: grid; gap: 6px; font-size: 13px; font-weight: 650; color: #3d4758; }
    input, textarea { box-sizing: border-box; width: 100%; border: 1px solid #cfd6e2; border-radius: 6px; padding: 10px; font: inherit; background: #fff; color: #172033; }
    textarea { min-height: 360px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; line-height: 1.45; resize: vertical; }
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
      <p class="hint">Business, projects, and priority rules load from Supabase <code>app_config</code> by default. Saving also writes <code>data/projects.json</code>, which can be uploaded to Retell Knowledge Base or exposed at <code>/knowledge/projects.json</code>.</p>
      <p class="hint">Retell Knowledge URL: <code id="knowledgeUrl"></code></p>
      <pre id="details"></pre>
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
      knowledgeUrl: document.querySelector("#knowledgeUrl")
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
        setStatus("Saved to Supabase DB and local JSON knowledge files.", false);
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        els.save.disabled = false;
      }
    }

    els.load.addEventListener("click", loadConfig);
    els.save.addEventListener("click", saveConfig);
    els.knowledgeUrl.textContent = window.location.origin + "/knowledge/projects.json";
    loadConfig();
  </script>
</body>
</html>`;
}
