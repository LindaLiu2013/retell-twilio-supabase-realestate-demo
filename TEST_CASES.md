# MVP Test Cases: Intake -> Qualification -> Structured Data -> Priority -> Agent Handoff

Use these cases to test the Retell agent conversation and the backend lead workflow. For local backend-only checks, call `/demo/lead`. For end-to-end voice checks, call the Retell/Twilio number and confirm the same database and notification outcomes.

## Preconditions

- `.env` has a valid `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_LEADS_TABLE=leads`.
- `NOTIFY_EMAIL_TO` is set to the central recipient that should always receive lead emails.
- If SMS is being tested, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, and `NOTIFY_SMS_TO` are set.
- The `public.leads` table exists using `supabase/schema.sql`.
- Retell agent has the `capture_lead` custom function configured.

## Priority Rules For MVP Testing

The current backend stores the lead and salesperson handoff. Priority is assessed by the agent during qualification and can be included in the transcript or future schema. Use these MVP priority labels during manual QA:

| Priority | Criteria |
|---|---|
| High | Ready to inspect/book this week, budget fits the project, has finance/pre-approval or cash buyer signal |
| Medium | Interested and budget is plausible, but timing or finance is unclear |
| Low | Browsing only, budget is vague/outside likely range, or refuses key contact details |

## Test Cases

### TC01: Happy Path Qualified Buyer

Intake:
- Caller says: "I am interested in Harbour View."

Qualification:
- Agent asks name, phone, and budget.
- Caller provides: Test Caller, 0405 547 481, $1.2m to $1.5m.

Structured data:
```json
{
  "project_name": "Harbour View",
  "caller_name": "Test Caller",
  "caller_phone": "0405 547 481",
  "budget": "$1.2m to $1.5m"
}
```

Priority:
- Medium by default.
- High if caller also says they want an inspection this week or are ready to proceed.

Expected backend:
- Inserts one row into `public.leads`.
- Normalizes project to `Harbour View Residences`.
- Normalizes phone to `0405547481`.
- Sets `matched_salesperson` to `Ava Chen`.
- Sends email to `NOTIFY_EMAIL_TO`, not the project email.
- Sends SMS only if Twilio SMS env vars are complete.

### TC02: Project Alias Matching

Intake:
- Caller says: "I'm calling about the North Sydney apartments."

Qualification:
- Agent maps the caller to the closest project.

Structured data:
```json
{
  "project_name": "north sydney apartments",
  "caller_name": "Alias Caller",
  "caller_phone": "0411 111 111",
  "budget": "around $1.4m"
}
```

Priority:
- Medium if budget is plausible and contact details are provided.

Expected backend:
- Project is matched to `Harbour View Residences`.
- Salesperson is `Ava Chen`.
- Lead is saved and central email notification is attempted.

### TC03: High Priority Inspection Request

Intake:
- Caller says: "I want to inspect Bondi Beach Collection this weekend."

Qualification:
- Agent captures name, phone, budget, and timing.

Structured data:
```json
{
  "project_name": "Bondi Beach",
  "caller_name": "Urgent Buyer",
  "caller_phone": "+61 400 000 000",
  "budget": "$2m to $2.5m"
}
```

Priority:
- High because the caller is requesting an inspection soon.

Expected backend:
- Project is matched to `Bondi Beach Collection`.
- Salesperson is `Sophie Nguyen`.
- Lead is saved.
- Handoff message should make urgency obvious in transcript or follow-up notes.

### TC04: Caller Unsure Which Project

Intake:
- Caller says: "I'm not sure. I saw one of your western Sydney apartments."

Qualification:
- Agent asks a clarifying question.
- Caller confirms Parramatta.

Structured data:
```json
{
  "project_name": "Parramatta apartments",
  "caller_name": "Clarified Caller",
  "caller_phone": "0422 222 222",
  "budget": "$850k to $950k"
}
```

Priority:
- Medium if all required details are captured.

Expected backend:
- Project is matched to `Parramatta Square Living`.
- Salesperson is `Marcus Lee`.
- Lead is saved only after all four required fields are known.

### TC05: Missing Phone Number

Intake:
- Caller gives project, name, and budget but refuses phone number.

Qualification:
- Agent politely explains phone is needed for follow-up.

Structured data:
```json
{
  "project_name": "Harbour View",
  "caller_name": "No Phone Caller",
  "budget": "$1.3m"
}
```

Priority:
- Low because handoff cannot happen cleanly.

Expected backend:
- Retell should not call `capture_lead` until phone is collected.
- If `/demo/lead` is called manually without phone, backend returns validation error mentioning `caller_phone`.

### TC06: Budget Outside Range Or Vague

Intake:
- Caller says: "I like Bondi but my budget is maybe $500k."

Qualification:
- Agent still captures details and avoids giving financial advice.

Structured data:
```json
{
  "project_name": "Bondi",
  "caller_name": "Budget Concern Caller",
  "caller_phone": "0433 333 333",
  "budget": "$500k"
}
```

Priority:
- Low or Medium depending on business rules.

Expected backend:
- Lead is saved.
- Handoff notes/transcript should preserve the budget concern.
- Sales team can decide whether to follow up or redirect.

### TC07: Duplicate Lead

Intake:
- Same caller calls twice about the same project.

Qualification:
- Agent captures same phone and project.

Structured data:
```json
{
  "project_name": "Harbour View",
  "caller_name": "Repeat Caller",
  "caller_phone": "0405 547 481",
  "budget": "$1.2m to $1.5m"
}
```

Priority:
- Medium unless urgency is stated.

Expected backend:
- Current MVP inserts a second row.
- Future V2 should detect duplicate phone + project within a time window and update existing lead or mark as duplicate.

### TC08: Notification Fallback

Intake:
- Valid lead is captured.

Qualification:
- Caller provides all required details.

Structured data:
```json
{
  "project_name": "Parramatta Square",
  "caller_name": "Notification Test",
  "caller_phone": "0444 444 444",
  "budget": "$900k"
}
```

Priority:
- Medium.

Expected backend:
- Lead save succeeds even if SMS is skipped.
- Email goes to `NOTIFY_EMAIL_TO`.
- If Resend rejects the message, API response includes an email error but still returns `ok: true` because the lead was saved.

## Local Curl Examples

Happy path:
```bash
curl -X POST http://localhost:3000/demo/lead \
  -H 'Content-Type: application/json' \
  -d '{
    "project_name": "Harbour View",
    "caller_name": "Test Caller",
    "caller_phone": "0405 547 481",
    "budget": "$1.2m to $1.5m"
  }'
```

Missing phone validation:
```bash
curl -X POST http://localhost:3000/demo/lead \
  -H 'Content-Type: application/json' \
  -d '{
    "project_name": "Harbour View",
    "caller_name": "No Phone Caller",
    "budget": "$1.3m"
  }'
```

Alias matching:
```bash
curl -X POST http://localhost:3000/demo/lead \
  -H 'Content-Type: application/json' \
  -d '{
    "project_name": "north sydney apartments",
    "caller_name": "Alias Caller",
    "caller_phone": "0411 111 111",
    "budget": "around $1.4m"
  }'
```
