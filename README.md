# Retell + Twilio + Supabase Real Estate AI Receptionist Demo

Tiny deployable demo for the SEEK-style system:

Inbound call -> Retell agent asks which project the caller is interested in -> captures name, phone, and budget -> writes the lead to Supabase -> fires SMS/email notification -> deployed on Render.

## Architecture

```mermaid
flowchart LR
  Caller["Inbound caller"] --> Twilio["Twilio phone number"]
  Twilio --> Retell["Retell AI receptionist"]
  Retell -->|"capture_lead custom function"| API["Render Node service"]
  Admin["Business owner admin portal"] -->|"edit config and copy prompt"| API
  API --> Config["Supabase app_config table"]
  Config -. "offline or missing" .-> JSON["JSON fallback config"]
  JSON --> API
  API --> OpenAI["OpenAI lead enrichment optional"]
  API --> Supabase["Supabase leads table"]
  API --> SMS["Twilio SMS notification"]
  API --> Email["Resend email notification"]
  API --> RetellResult["Lead saved response to Retell"]
```

The current system has two data paths:

- Runtime config: business settings, projects, and priority rules are loaded from Supabase `app_config` first, with local JSON files as fallback.
- Lead capture: Retell collects caller details, the backend matches the project, enriches priority/handoff notes with OpenAI when configured, writes to Supabase `leads`, then sends notifications.

This repo contains the API service and a lightweight admin portal. You still configure the actual Retell voice agent and Twilio number in their dashboards.

Config files used as fallback/defaults:

- `data/business.json`
- `data/projects.json`
- `data/priority-rules.json`

Retell schema files:

- `prompts/get-projects.schema.json`
- `prompts/capture-lead.schema.json`

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Render health check |
| `GET /projects` | Returns current project list from Supabase config or JSON fallback |
| `GET /config` | Returns current business, projects, and priority rules config |
| `GET /admin` | Lightweight admin portal for business/project/priority config |
| `GET /api/admin/config` | Admin API to load config from Supabase or JSON fallback |
| `POST /api/admin/config` | Admin API to save config into Supabase `app_config` |
| `POST /twilio/inbound` | Twilio Voice webhook that returns TwiML to dial Retell SIP |
| `POST /retell/functions/get-projects` | Retell custom function endpoint for dynamic project options |
| `POST /retell/functions/capture-lead` | Retell custom function endpoint |
| `POST /demo/lead` | Local/manual test endpoint without Retell signature |

## 1. Supabase

Run `supabase/schema.sql` in the Supabase SQL editor.

If your `leads` table already exists from an earlier version, run `supabase/add-openai-enrichment-columns.sql` as well to add:

- `handoff_summary`
- `qualification_reason`

The demo uses:

- `public.leads` for captured lead records.
- `public.app_config` for business-owner editable JSON config.

The service talks to Supabase through the REST API with the service role key. Keep the service role key server-side only.

`app_config` stores three rows:

| Key | Value |
|---|---|
| `business` | Business name, timezone, handoff message, notification config references |
| `projects` | Project list, aliases, salesperson routing |
| `priority_rules` | High/low priority keyword rules and default priority |

If Supabase config is missing or offline, the service falls back to the JSON files in `data/`.

## 2. Environment

Copy `.env.example` to `.env` locally, then set the same values in Render.

Required for the core Retell -> Supabase flow:

```bash
RETELL_API_KEY=...
RETELL_AGENT_ID=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Required for the admin portal:

```bash
CONFIG_CACHE_TTL_MS=30000
```

Optional for SMS lead notifications:

```bash
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...
NOTIFY_SMS_TO=...
```

Optional for email lead notifications:

```bash
RESEND_API_KEY=...
EMAIL_FROM=...
NOTIFY_EMAIL_TO=...
```

Optional for OpenAI lead enrichment:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

Use `gpt-4.1-mini` unless you have confirmed another model is available to your OpenAI API key. Model names must be exact.

When `OPENAI_API_KEY` is set, the backend asks OpenAI to return structured JSON for:

- `priority`: `high`, `medium`, or `low`
- `qualification_reason`: why the lead was classified that way
- `handoff_summary`: a concise salesperson handoff note

If OpenAI is not configured, the model is unavailable, or the API call fails, the app falls back to the local priority rules so lead capture still works.

For local testing of `/demo/lead`, Supabase is required. SMS/email are skipped if their env vars are missing. This means the demo works in both cases:

- no Twilio number yet: lead is saved to Supabase, SMS is skipped, email is sent if configured
- Twilio SMS-capable number provided: lead is saved to Supabase and SMS notification is sent

## 3. Retell Agent Setup

Retell custom functions send a POST request to your endpoint with `name`, `call`, and `args`. This demo also supports Retell's "Payload: args only" mode.

Create a **Single prompt** Retell voice agent with this function attached:

- `capture_lead`

Agent name:

```text
Real Estate AI Receptionist
```

Retell agent prompt:

Use the **Generated Retell Prompt** in the admin portal. The admin page builds a fresh prompt from the current Projects JSON, so a business owner can update project names, aliases, routing, and priority rules in one place, save the config to Supabase, then copy and paste the updated prompt into Retell AI.

This avoids slow live project lookups during a call. The live Retell agent should only call `capture_lead` after it has collected the required lead details.

Add a Retell custom function for lead capture:

```json
{
  "name": "capture_lead",
  "description": "Save a qualified real estate project enquiry lead after project, name, phone and budget have been collected.",
  "method": "POST",
  "url": "https://retell-twilio-supabase-realestate-demo.onrender.com/retell/functions/capture-lead",
  "headers": {
    "Content-Type": "application/json"
  },
  "parameters": {
    "type": "object",
    "required": ["project_name", "caller_name", "caller_phone", "budget"],
    "properties": {
      "project_name": {
        "type": "string",
        "description": "The real estate project the caller is interested in."
      },
      "caller_name": {
        "type": "string",
        "description": "The caller's full name."
      },
      "caller_phone": {
        "type": "string",
        "description": "The caller's best callback phone number."
      },
      "budget": {
        "type": "string",
        "description": "The caller's approximate budget or price range."
      }
    }
  }
}
```

JSON in the custom function parameter schema:

```json
{
  "type": "object",
  "required": [
    "project_name",
    "caller_name",
    "caller_phone",
    "budget"
  ],
  "properties": {
    "caller_name": {
      "type": "string",
      "description": "The caller's full name."
    },
    "caller_phone": {
      "type": "string",
      "description": "The caller's best callback phone number."
    },
    "project_name": {
      "type": "string",
      "description": "The real estate project the caller is interested in."
    },
    "budget": {
      "type": "string",
      "description": "The caller's approximate budget or price range."
    }
  }
}
```

Recommended custom function speech behavior:

- Speak during execution: off, or a short "Let me save that for the sales team."
- Speak after execution: on.

Signature verification is enabled by default using `X-Retell-Signature`. For quick local testing only, set:

```bash
RETELL_VERIFY_SIGNATURE=false
```

## 4. Twilio Inbound Call Setup

Twilio is optional for the first backend version. If you do not have a Twilio number yet, test the Retell agent through Retell's own test tools and use the Retell custom function endpoint to save leads.

When you are ready for public inbound calls, there are two practical patterns.

### Option A: Retell SIP trunk / imported number

Use Retell's custom telephony setup with Twilio Elastic SIP Trunking and import/bind the number in Retell. This is the cleaner production approach.

### Option B: Twilio webhook returns TwiML that dials Retell SIP

Set your Twilio number's Voice webhook to:

```text
https://retell-twilio-supabase-realestate-demo.onrender.com/twilio/inbound
```

The endpoint returns:

```xml
<Response>
  <Say voice="alice">Connecting you to our AI property receptionist.</Say>
  <Dial>
    <Sip>sip:sip.retellai.com;transport=tcp</Sip>
  </Dial>
</Response>
```

If your Retell/Twilio setup needs a different SIP URI, set:

```bash
RETELL_SIP_URI=sip:your-configured-retell-or-trunk-uri
```

## 5. Render Deployment

1. Push this folder to GitHub.
2. In Render, create a new Web Service from the repo.
3. Use:
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/health`
4. Add the env vars from `.env.example`.
5. Use the Render URL in Retell and Twilio.

`render.yaml` is included if you prefer Render Blueprint deployment.

## 6. Admin Portal

After deployment, open:

```text
https://retell-twilio-supabase-realestate-demo.onrender.com/admin
```

The page loads the current business, projects, and priority-rules JSON automatically. Click **Load** to refresh it manually.

The admin portal lets a business owner edit:

- Business JSON: business name, timezone, handoff message, notification env references
- Projects JSON: project names, aliases, salesperson routing
- Priority Rules JSON: high/low intent keywords and default priority

Click **Save Config** to write the editable config to Supabase `public.app_config`. The app uses that database config for project matching, lead routing, priority rules, and notification behavior.

The admin portal also generates an updated Retell prompt from the current Projects JSON. After changing projects or aliases, the business owner can:

1. Click **Save Config**.
2. Review the **Generated Retell Prompt**.
3. Click **Copy Prompt**.
4. Paste the prompt into the Retell AI agent.

This is the fastest live-call setup because the Retell agent uses a static prompt during the call and only calls `capture_lead` after collecting project name, caller name, phone number, and budget.

Admin config and generated prompt:

![Admin page config editor](assets/admin-generated-retell-prompt.png)

Fallback behavior:

- Normal operation: load config from Supabase `app_config`.
- Missing/offline config: use `data/business.json`, `data/projects.json`, and `data/priority-rules.json`.
- Retell lead capture still works during fallback because `capture_lead` uses the same runtime config loader.

## 7. OpenAI Lead Enrichment

OpenAI enrichment happens inside the backend after the Retell function payload is normalized and before the lead is inserted into Supabase.

Flow:

```text
Retell args -> normalize lead -> match project -> OpenAI enrichment -> Supabase insert -> SMS/email notification
```

The OpenAI request uses the Responses API with a strict JSON schema. The response must contain:

```json
{
  "priority": "high",
  "qualification_reason": "Caller has a strong budget and wants to inspect this week.",
  "handoff_summary": "High-priority Bondi lead. Call today to arrange an inspection."
}
```

Stored Supabase fields:

| Field | Purpose |
|---|---|
| `priority` | Sales follow-up priority: `high`, `medium`, or `low` |
| `qualification_reason` | Explanation generated by OpenAI or fallback rules |
| `handoff_summary` | Short handoff note for the salesperson |

Existing Supabase projects should run:

```sql
alter table public.leads
add column if not exists handoff_summary text;

alter table public.leads
add column if not exists qualification_reason text;
```

Expected behavior:

- With `OPENAI_API_KEY`: response includes `enrichment_source: "openai"` when enrichment succeeds.
- Without `OPENAI_API_KEY`: response includes `enrichment_source: "rules"`.
- If OpenAI returns an invalid priority, the backend keeps the existing calculated priority.
- If OpenAI returns an error, such as an unavailable model, lead capture still succeeds using fallback rules.

Run the OpenAI test suite:

```bash
npm test
```

The tests cover structured JSON output, model selection via `OPENAI_MODEL`, API failure fallback, invalid priority fallback, and nested Responses API output parsing.

## 8. Local Run

```bash
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

Manual lead test:

```bash
curl -X POST http://localhost:3000/demo/lead \
  -H 'Content-Type: application/json' \
  -d '{
    "project_name": "Harbour View",
    "caller_name": "Linda Liu",
    "caller_phone": "0405 547 481",
    "budget": "$1.2m to $1.5m"
  }'
```

Example `/demo/lead` response showing a lead written to Supabase:

![Successful demo lead curl response](assets/demo-lead-curl-response.png)

With OpenAI configured, the `/demo/lead` response should include fields like:

```json
{
  "ok": true,
  "lead_id": "uuid-here",
  "enrichment_source": "openai",
  "lead": {
    "priority": "high",
    "qualification_reason": "Caller has a strong budget and clear project interest.",
    "handoff_summary": "Call Linda today about Harbour View Residences and confirm inspection timing."
  }
}
```

Example Resend email notification received after lead capture:

![Successful Resend lead email notification](assets/resend-lead-email-response.png)

Twilio webhook shape test:

```bash
curl -X POST http://localhost:3000/twilio/inbound \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'CallSid=CA123&From=%2B61405547481&To=%2B61280000000'
```

## Production Hardening Notes

- Add Twilio request signature validation before trusting Twilio webhooks.
- Keep `RETELL_VERIFY_SIGNATURE=true` outside local development.
- Add authentication before exposing the admin portal beyond a controlled demo environment.
- Add RLS policies if you expose Supabase data directly to a frontend.
- Consider an audit log for admin config changes before using this with multiple staff.
- Add duplicate lead handling by caller phone and project within a time window.
- Add call-ended webhook processing to reconcile transcript, recording URL, and final call outcome.
