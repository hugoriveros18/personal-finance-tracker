# Local AI transaction experiment

This optional feature interprets one or several Spanish income, expense or credit-purchase records using a local Ollama
model. The backend validates the proposal, and the user reviews an editable form before
explicitly confirming. Interpretation never creates a financial transaction.

## Requirements

- Existing PFT dependencies and PostgreSQL 16.
- Ollama with a downloaded local chat model that supports JSON Schema output.
- Start with `qwen3:4b-instruct` on a 16 GB laptop running inference on CPU; compare models using the
  real evaluation below before choosing one. The lighter `qwen2.5:3b` remains an option.
  Model download size is not runtime RAM usage.
- WSL2: keep the repository in `/home/...`, use Linux Node/npm, and run tests as a non-root user.
  WSL may expose only about half the machine's RAM by default. Check `free -h`; measure usage
  before changing WSL Settings or `%UserProfile%\.wslconfig`.

## Recommended Docker workflow

Use this workflow when you normally start PFT only while managing your finances. Ollama runs
as a fourth CPU-only container on the same private Compose network; no separate Windows or
WSL Ollama installation is needed. Model files persist in `pft_ollama`, independently of the existing `pft_pgdata` database and
`pft_uploads` volumes. The AI and manual screens use the same application and financial data.
The existing `.env` JWT secrets and database settings still apply; do not replace an existing
`.env` when enabling this feature. Use disposable accounts/data for manual financial tests.

From the repository root, build and start all four services:

```bash
npm run compose:ai:up
```

The first time, download the selected model (the default is shown here):

```bash
docker compose -f docker-compose.yml -f docker-compose.ollama.yml exec ollama ollama pull qwen3:4b-instruct
```

The backend retries initial preload every 30 seconds if Ollama or the model is not yet
available. After downloading, either wait for the next retry or restart only the backend:

```bash
docker compose -f docker-compose.yml -f docker-compose.ollama.yml restart backend
docker compose -f docker-compose.yml -f docker-compose.ollama.yml exec ollama ollama ps
```

`ollama ps` shows the selected model once startup loading finishes. Service health means the
API/database and Ollama server are reachable; it does not mean the model has finished loading.
The manual financial screens remain available during preload or provider failures. Open
[http://localhost:3000](http://localhost:3000), sign in and use **Transactions → Register with AI**.

For subsequent sessions:

```bash
npm run compose:ai:up       # Starts the same stack; cached builds and model files are reused.
npm run compose:ai:status   # Lists all four services, including stopped containers.
npm run compose:ai:logs     # Follows logs; Ctrl+C exits the log viewer without stopping services.
npm run compose:ai:stop     # Stops frontend, backend, database and Ollama together.
```

`compose:ai:stop` leaves containers and volumes available for reuse. `compose:ai:down` removes
containers/network while preserving the database, uploads and downloaded models; do not add
`-v`. Always use the `compose:ai:*` commands for this stack: base-only Compose commands may
leave the Ollama service running. Docker Desktop can also start/stop the complete
`personal-finance-tracker` project. The AI override disables automatic restart on all four
services, so Docker daemon startup does not silently start this environment.

To change models, set `OLLAMA_MODEL` in `.env`, pull that exact name inside the Ollama
container, and rerun `npm run compose:ai:up` to recreate the backend with the new setting.
Downloaded files remain on disk after stopping; the model process and its resident memory
exist only while the Ollama container is running. Check `compose:ai:status` after finishing.

## Alternative: install and start Ollama in WSL2

Follow the [official Linux installation instructions](https://docs.ollama.com/linux):

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

For a standalone server, with no existing Ollama service listening on the same port:

```bash
OLLAMA_NO_CLOUD=1 OLLAMA_NUM_PARALLEL=1 OLLAMA_MAX_LOADED_MODELS=1 ollama serve
```

If the installer has already started a systemd service, configure that service instead of
starting a second server. Run `sudo systemctl edit ollama` and add:

```ini
[Service]
Environment="OLLAMA_NO_CLOUD=1"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_KEEP_ALIVE=60s"
```

Then run `sudo systemctl daemon-reload` and `sudo systemctl restart ollama`. Check that the
logs report `Ollama cloud disabled: true`. Disabling cloud on the backend's shell alone does
not configure a separately running Ollama service.

Download the initial model in another WSL terminal:

```bash
ollama pull qwen3:4b-instruct
curl http://127.0.0.1:11434/api/version
```

The installation and download need Internet. Subsequent inference uses the downloaded model
locally, without cloud credentials. CPU inference is supported; do not assume an Intel Iris Xe
GPU will accelerate inference inside WSL. Inspect actual placement with `ollama ps`.

## Configure PFT

Add these values to your existing environment, leaving secrets private:

```dotenv
AI_TRANSACTIONS_ENABLED=true
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b-instruct
OLLAMA_TIMEOUT_MS=120000
OLLAMA_NUM_CTX=4096
OLLAMA_NUM_PREDICT=768
OLLAMA_MODEL_LIFECYCLE=request
OLLAMA_KEEP_ALIVE_SECONDS=60
AI_TRANSACTIONS_TIME_ZONE=America/Bogota
AI_TRANSACTIONS_MAX_MESSAGE_LENGTH=2000
```

These are backend settings. The frontend never connects to Ollama and has no model/provider
credentials. `AI_TRANSACTIONS_ENABLED` defaults to `false`; the panel explains when disabled.
Timeout, context and output limits are validated. URLs must use loopback, a private IPv4
address, `ollama`, or `host.docker.internal`, with no URL credentials or path suffix. Cloud
model tags and remote model aliases reported by Ollama are rejected. Disable Ollama cloud
features too, including when serving local aliases.

### Model memory follows the selected lifecycle

The recommended Compose override sets `OLLAMA_MODEL_LIFECYCLE=application`. The backend
preloads the configured model at startup, in the background, with the same context size used
for interpretation. Preload and generation explicitly send `keep_alive: -1`, retaining that
model for this Docker session. This is scoped to the dedicated Ollama container: stopping the
stack terminates the model process and releases its resident memory. A graceful backend stop
also requests `keep_alive: 0`. Use a dedicated Ollama instance for this mode.

There are no browser heartbeats, focus listeners or inactivity timers. Changing windows,
hiding a tab, reloading, signing out or closing the chat does not unload the model or interrupt
an interpretation. Leaving the containers running intentionally retains the model even with
no browser open; stop the complete stack when finished. Stopping only the frontend is not
sufficient. A forced backend termination cannot send an unload request, so stopping Ollama is
the definitive resource boundary.

Startup preload never creates drafts or financial records and never blocks the API health
check. Failed preload retries every 30 seconds until successful; retries stop on shutdown.
Interpretation waits for an ongoing initial preload and remains subject to the configured
request timeout. Loading and inference still take time: starting containers in advance moves
the cold-load wait before the first chat message, rather than eliminating computation.

Without the override, the default `request` lifecycle does not preload at startup. It releases
the model after the last concurrent interpretation finishes. Each request also sends the
bounded `OLLAMA_KEEP_ALIVE_SECONDS` value (default 60, allowed 45–120 seconds) as a fallback
if the backend cannot complete cleanup. This setting is ignored by `application` residency.
Model name, URL, context and output limits remain independent of lifecycle selection. Neither
mode exposes Ollama to the browser or grants the model access to financial persistence.

For native backend development, export the environment before running the existing scripts.
If your `.env` is shell-compatible, use a dedicated terminal:

```bash
set -a
source .env
set +a
# Native development: DATABASE_URL must point to the local database, not Compose's db hostname.
npm -w apps/backend run prisma:generate
npm -w apps/backend run prisma:deploy
npm -w apps/backend run dev
```

Use the existing README setup for `UPLOAD_DIR`, the database and JWT secrets. In a second
terminal run `npm -w apps/frontend run dev`. The backend does not automatically source `.env`.
The migrations are additive: a nullable user preference, operational drafts, and batch/item metadata. Existing financial records are preserved.
Do not reset an existing database or use `prisma migrate dev` against personal data just to
enable the experiment.

### Compose networking

The AI override enables the experiment and sets the backend URL to `http://ollama:11434`,
regardless of native settings in `.env`. It waits for the Ollama server health check before
starting the backend. Ollama's port is not published, cloud features are disabled, and only
one model/inference slot is configured. The existing backend startup deploys pending Prisma migrations without resetting data. See the recommended workflow above for lifecycle
commands and the initial model download.

If running only the backend in Docker and Ollama outside it, configure a reachable local host
address: `127.0.0.1` inside a container is the container itself. `host.docker.internal` works
with Docker Desktop when the host service is reachable. Linux Docker/WSL configurations vary;
the shared-network override above avoids this host-network dependency.

### Existing databases from earlier releases

Some older installations have Spanish database columns/enums and migrations named
`20260427000000_init` / `20260429000000_money_to_centavos`. This checkout's English schema
starts at `20261007000000_init`. These histories are not interchangeable: applying the new
initial migration to the old database fails with an existing-type error such as
`type "Language" already exists`.

The AI override reuses the standard finance/upload volumes; it does not automatically convert
or reset legacy schemas. Preserving legacy financial data needs a separately reviewed migration;
that conversion is outside this AI experiment. Do not mark the new initial migration applied
to bypass schema differences. If old records are explicitly confirmed disposable, a deliberate
clean database setup is an alternative after taking a private `pg_dump` backup. Routine
`compose:ai:up` / `stop` / `down` commands never reset financial data or remove volumes.

### Ollama installed on Windows

The simplest setup for this experiment keeps Ollama and the native backend in the same WSL
distribution. If you already use Windows Ollama, WSL NAT networking normally requires the
Windows host's private IP; mirrored networking permits `localhost`. Ollama's listening address
and Windows firewall must allow that connection. Keep access restricted to your local machine.
See [Microsoft's WSL networking guide](https://learn.microsoft.com/en-us/windows/wsl/networking).

## Use the feature

1. Create your real accounts and income/expense categories through the existing screens.
2. Optionally use an account's actions menu to set it as the default. You can remove or change
   this preference. Deleting that account clears the preference without choosing another.
3. Open **Transactions → Register with AI** (Spanish: **Transacciones → Registrar con IA**).
4. Enter a message containing one or several transactions, for example:
   - `Gasté 35000 pesos en almuerzo hoy desde Bancolombia`.
   - `Recibí 2500000 de mi salario en la cuenta principal`.
   - `Ayer pagué 85000 de gasolina`.
   - `Compré un café por 7500 pesos`.
5. Review type, amount, date, account, category and description. Missing/ambiguous entities
   use searchable selectors, never an open-ended request for an identifier. Categories are
   suggestions, not guaranteed classifications. Create a suitable category in the normal
   category screen if none exists.
6. Click **Register**, or **Cancel**. Closing the drawer only hides it; it does not
   cancel the pending proposal. Complete/cancel that proposal before sending another message.

Example buttons fill the writing area without submitting. Interpretation errors preserve the
message and offer **Retry** and **Edit message**. A waiting message offers manual entry;
opening that form cancels interpretation, which has no financial side effects. The manual
form is the existing transaction form. On small screens only the history scrolls: the drawer
header and writing area remain visible. New responses do not move the history while reading
older messages; **View latest** returns to the newest card.

Successful registration shows a receipt with type, amount, description, account, date and
category, plus the existing read-only transaction details. If a save response is lost, the
proposal locks the exact submitted values and offers **Retry registration**. It retries the
same draft and payload, without interpreting the message again. Editing, cancelling and
starting another operation remain unavailable until the server acknowledges the outcome;
closing/reopening the drawer preserves this recovery state in browser memory.

Account selection uses explicit source-text names first. When a reference is unknown or
ambiguous, choose manually. Only omitted accounts use the default; without a default, a sole
existing account is preselected. Otherwise the account remains empty.

When no date is supplied, the backend chooses today in the configured time zone. The model
extracts the date phrase; backend code resolves `hoy`, `ayer`, `anteayer`, `mañana`, `pasado
mañana`, `DD/MM/YYYY`, `DD-MM-YYYY`, `hace N días` / `hace N semanas`, ISO calendar dates and qualified weekdays such as `el viernes pasado`, `el último
miércoles` or `viernes de la semana pasada`. A past weekday always precedes today, including
on that same weekday. Calendar weeks start on Monday for `de la semana pasada`. Conflicting
dates, an unqualified weekday such as `el viernes` and unsupported expressions require manual
selection rather than an invented date.
The chosen date is frozen at interpretation, including across midnight. COP expressions such
as `35 mil`, `$35.000`, `35000 pesos`, `35k`, `35K`, `2,5k`, `2,5 millones` and `$7.500,50` are converted using integer
arithmetic. The HTTP contract and database use cents: 35,000 COP becomes `3500000`.

Ordinary purchases default to **Expense**. Explicit credit purchases (`pasivo`, `a crédito`,
`tarjeta de crédito`) select **Liability**, using an existing expense category. The review form
also allows selecting Liability manually. Confirmation reuses the existing transaction service:
liabilities increase and available/savings balances stay unchanged. Paying an existing credit
card bill or debt remains a separate liability-payment operation and is not supported in chat.
A bank name alone (including Nu) never implies a credit purchase.

Descriptions never start empty: the model supplies a short description, with a backend fallback
to `Salario`, an existing category name or a bounded copy of the message when necessary. All
fields remain editable before explicit registration. The chat uses **Send**, then **Register**;
initial-date/account-source metadata is not shown as badges. Cancellation uses a soft red status,
success uses teal, and receipt details use a centered, underlined-on-hover action without a hover fill.
The entry button and drawer heading use the existing Tabler sparkles icon. Account default
badges share the card corner radius; card footer actions align at the bottom of each grid row.

Messages, unsent text, edited fields and registration receipts are saved in this browser tab's
`sessionStorage` and survive closing the drawer, route navigation and page reloads. Recovery
waits for authentication and verifies the saved user ID. Signing out, failed authentication or
switching users clears the saved chat. A separate tab has its own chat; normal tab closure
ends its page session. No access token, password or user profile is stored with chat data.

An interrupted interpretation restores as an error with explicit retry/edit actions, without
automatically calling Ollama. A save interrupted by reload restores as uncertain, locking the
exact submitted fields and preserving the same draft ID/payload for an explicit retry. This
recovery remains available after draft expiry because the server may already have committed;
the server decides whether to replay a saved transaction or reject an expired unused draft.
An expired unsubmitted draft restores as inactive instead of an editable registration form.
Edited calendar dates are revived as local Date objects without shifting their calendar day.

Snapshots are versioned and validated with Zod, with a limit of 1,000 entries / 1,000,000
characters. Entry transitions are saved synchronously for financial recovery. Composer-only
keystrokes are coalesced for 150 ms and flushed on pagehide. If storage is blocked, full or a
snapshot exceeds the limit, the interface explains that it is using memory only and reloads
will lose the chat; older snapshots are removed to avoid stale recovery. Invalid snapshots are
discarded. Storage never causes automatic interpretation, registration or cancellation.

Each message is interpreted independently; the model does not receive earlier messages.
The chat now organizes each message into a batch, retaining the original source text, quoted
shared context, stable item identities, notes and a frozen calendar reference in PostgreSQL.
These are operational recovery data, not a conversation sent back to the model, and are
excluded from financial backups. They can contain sensitive financial text and are not
currently deleted automatically. Batch preparation expires after 90 minutes; each prepared
item has a 90-minute confirmation window. The legacy single-input API without a request ID
still creates a 30-minute draft. Expiry does not delete metadata. Confirmed draft receipts
remain consumed after transaction deletion. Backup import invalidates pending drafts and
unprepared batches without changing their financial confirmation history.

See [measured model results and limitations](ollama-evaluation.md) for the initial CPU evaluation.

## Free-form messages with several transactions

A single transaction retains the existing individual review form. Several recognized operations
open a wider collection review in the same chat. No template, one-item-per-line rule, or input
mode switch is required. Lists, prose and headings can share dates, accounts, categories or
payment methods. For example:

```text
Hoy, todo con Nu:
- Gasté 15000 en Uber
- Compré un café por 7500

El viernes pasado:
- Gasté 35k en un almuerzo desde Bancolombia

20/10/2026
- Recibí un salario por 1000000 en Bancolombia
```

Simple single-action, single-amount messages retain the existing interpretation path to avoid
an extra model call. Other messages use AI organization of source fragments and shared context,
with no database IDs. This internal routing imposes no input template.
The backend verifies source quotes and preserves uncovered numeric information as an item
needing clarification. Each operation is then interpreted independently with its applicable
context and resolved against the current authenticated user's entities. Local explicit values
override inherited context. Ambiguous fields stay empty even if a default exists; absent dates
use today. Dates for all items use the batch's original calendar reference, including after reload.
Totals/subtotals appear as notes and never become additional financial entries.

Preparation runs sequentially, showing actual completed-item counts and the record currently
being prepared. Before the operation count is known, the interface shows a neutral loading
message; an additional waiting notice appears only after 75 seconds. It never invents processing
stages or percentages for an individual model call.

The initial message defaults to a 2,000-character limit and organization to 30 items, with bounded model context/output;
very long/complex messages can exceed the model's capacity and be rejected. This is an input
size limit, not a formatting requirement. Organization uses the same context window and a
minimum output budget of 2,048 tokens. No partial or truncated JSON is accepted. On CPU the
additional organization and per-item calls take time; model accuracy must be evaluated, not assumed.

`AI_TRANSACTIONS_MAX_MESSAGE_LENGTH` accepts 500–6,000 characters. The authenticated capabilities
endpoint publishes the configured limit to the chat. A counter beneath the input and server-side
validation enforce the same limit, including whitespace. Pasted text is never silently truncated:
an oversized message remains editable and sending stays disabled until it fits. Changing model
context size does not automatically raise the character limit.

The default is deliberately conservative for the initial 4,096-token CPU configuration. A
synthetic Spanish-text measurement with the organization prompt produced 1,170 / 1,528 / 1,895 /
2,977 prompt tokens for 1,000 / 2,000 / 3,000 / 6,000 characters respectively. The 2,048-token
organization output budget leaves substantially more margin at 2,000 than at 3,000 characters;
6,000 does not fit that combined budget. Characters do not map uniformly to tokens, and complex
collections can still exceed output capacity below the input limit. Increase the limit only after
evaluating the selected model, context and representative messages.

Named dates such as `26 de Octubre` use the year of the server's configured calendar reference
when no year is supplied. An explicit year takes precedence. Invalid dates and conflicting date
references remain unresolved. Batch items retain the batch's original calendar reference after reload.

Extractor prompt 7 first asks for a short description of the concrete purchase or income source,
then the transaction fields, in one structured response. The provider validates and discards
that additional label; the public API and financial services still receive the same transaction
contract. Category selection compares all compatible names by semantic meaning, with no
product-to-category lookup table and no extra model call. This improves the tested examples but
does not guarantee classification accuracy: suggestions remain editable and require confirmation.

The collection review groups records by date, account or category. Grouping affects only the
presentation: saving follows original source order. Expand one record to edit the shared
transaction form or inspect its source; missing account/category selectors are also available
in the compact row. A group selector can fill only still-missing accounts, without overwriting
explicit choices. Select ready items and choose **Register selected**. Totals distinguish
income, expenses and new liabilities.

The collection drawer is capped at 54rem and adapts to mobile widths. Source fragments and
inherited headings use bordered quotation blocks, distinct from editable transaction data;
the expanded source toggle aligns with the record description and form. Once all records are
registered or discarded, selection controls and the attention filter disappear while receipts
remain visible, including when the filter had been enabled before the final save.

Registration is sequential and may partially succeed: saved records remain read-only,
failed records remain editable and only explicit confirmation writes financial data. A lost
response freezes that item's exact confirmation and stops the queue. Open the record and
choose **Retry registration**; it uses the same draft/payload and never interprets again.
Reload restores all item states without starting requests. Resume preparation or registration
explicitly. Stopping a save queue stops future requests, not a request already in flight, and
does not roll back saved records. Discarding pending items does not affect saved transactions.

Pending drafts block a new message until resolved or discarded; history remains in this tab.
Source messages, grouping metadata, selection, edits and per-item uncertain confirmations
are preserved with the existing versioned session snapshot, without authentication credentials.

### API and durable identities

- `POST /api/v1/ai-transactions/interpret` accepts `{ message, requestId }` for the chat.
  `requestId` is a client-generated UUID retained for retries; reusing it with different text
  is rejected. A single operation returns `{ draft, result }`; several return `{ batch }`.
- `POST /api/v1/ai-transactions/batches/:id/items/:itemId/interpret` prepares or recovers the
  same draft for an owned item. A confirmed item returns its existing transaction. Preparation
  cannot duplicate a draft under concurrent requests, and discarded items cannot be prepared again.
- `POST /api/v1/ai-transactions/batches/:id/items/:itemId/cancel` discards an owned prepared
  or unprepared item. Repeated cancellation is harmless; confirmed records cannot be discarded.
- Each financial confirmation still uses `POST /:draftId/confirm`, with the same strict
  validation, serializable account/draft locking, business service and durable replay behavior.
- Organization is limited to 10 messages/minute/IP; per-item preparation to 40 requests/minute/IP.
  All endpoints require authentication and the enabled experiment. No browser-to-Ollama traffic.

### Manual checks for collections

1. Create disposable Nu/Bancolombia accounts and suitable expense/income categories.
2. Send the grouped example above. Verify dates, separate income/expenses and actual entities.
   Available balances must be unchanged until explicit registration.
3. Change grouping and edit one record. Deselect one ready record, register the others, and
   check exactly the selected amounts against the account balances.
4. Send equivalent operations in a paragraph, groups by category and nested date/account groups.
   Check local exceptions, repeated purchases and totals. No operation should silently disappear.
5. Pause preparation, reload and explicitly resume. Previously prepared/confirmed items must
   retain the same IDs, values and outcomes. Test cancellation without financial changes.
6. Include an ambiguous date, unknown account/category, negative amount and a debt payment.
   Complete missing ordinary-transaction fields manually; use the normal payment/transfer
   screens for excluded operations. No model output can bypass ownership or balance rules.
7. Test both languages, a narrow viewport and the usual single-message form after a collection.
8. Paste more than the displayed character limit. The counter must turn red, sending must stay
   disabled, and the full pasted text must remain available for editing.
9. Include `26 de Octubre` without a year; verify the current reference year. With suitable
   existing categories, compare a named video-game purchase, cinema and groceries; inspect and
   correct the suggestions rather than treating semantic classification as guaranteed.
10. Expand a record's source on desktop and mobile. Verify the quotation styling, alignment and
    readable action buttons. Register all records and verify that selection controls and the
    attention filter disappear while the receipts remain visible.

### Real local-model evaluation for collections

```bash
# Direct local Ollama
npm run test:ai:batch:live

# Existing Docker AI session: uses backend's internal Docker network, no exposed Ollama port
AI_EVALUATION_DOCKER=1 npm run test:ai:batch:live

# A reproducible subset; reports state which cases ran
AI_EVALUATION_DOCKER=1 AI_BATCH_EVALUATION_CASES=1,2 npm run test:ai:batch:live
```

For the category/date regressions, run `AI_EVALUATION_DOCKER=1 npm run test:ai:quality:live`.
The synthetic profile includes twelve category names, reversed-order checks, named dates,
credit/debit purchases and excluded intents. `AI_QUALITY_CASES=1,2` selects cases; set
`AI_EVALUATION_REPORT` to retain separate JSON reports. Add `AI_MEASURE_INPUT_BUDGET=1`
to measure prompt-token counts for several input lengths. Those budget probes deliberately
generate only one token and are not interpretation accuracy tests. Set
`AI_QUALITY_BUDGET_ONLY=1` to run just those measurements. None of these evaluations writes
financial data or requires database access.

The six synthetic scenarios cover the retained single flow, date headings, prose, category/account
groups, local account exceptions and credit/cash purchases. No database or financial writes are
performed. The ignored report `test-results/ai-batch-evaluation.json` records model/version,
organizer/extractor prompt versions, quoted organization, resolved fields, failures and timings.
The Docker bridge executes HTTP calls in the existing backend container and does not expose
Ollama or change service configuration. It requires the AI session to be running. A passing
finite sample is not a guarantee for arbitrary natural-language messages. The six-case run on
2026-10-28 passed with `qwen3:4b-instruct`, extractor prompt 5 and organizer prompt 2. Complete
message preparation took about 39–90 seconds in that CPU/Docker evaluation (including all
model calls; the first single-message case took about 55 seconds). These are observed timings,
not a service guarantee. Earlier organizer prompts had source-quote failures and a timeout;
strict validation rejected them. Sparse-list amount extraction improved after explicit prompt
examples. Keep model quality separate from successful manual completion or backend safeguards.

## Change or compare models

Model names are not embedded in business logic or React components. Any locally installed
chat model supporting the output contract can be selected through configuration:

```bash
ollama pull qwen2.5:3b
export OLLAMA_MODEL=qwen2.5:3b
# Restart the native backend, or recreate the Compose backend after editing its environment.
```

The adapter discovers supported thinking controls through `/api/show` and requests no thinking
when the model explicitly supports disabling it. Models that require reasoning may consume
the output budget and return a rejected/truncated response; compare actual behavior and adjust
limits deliberately. There is no automatic fallback to another model or cloud service.

## Automated verification without Ollama

```bash
npm run lint
npm run typecheck
npm run test:all
npm run build
```

Unit tests simulate HTTP responses, connection failures, invalid JSON and timeouts. Integration
tests inject a provider into `buildApp` and use disposable PostgreSQL. Browser tests start a
separate HTTP Ollama fixture while exercising the real frontend, adapter, API and disposable
database. The fixture is never imported by application code or enabled by a production flag.
All suites work without Ollama or Docker. The existing Playwright installation requirements
still apply. Integration/E2E runners never use the development database.
Lifecycle tests also cover startup preload, retention across requests and idle time, bounded
startup retries, request-mode cleanup, cancelled warmup and graceful-shutdown interruption. Browser regressions
cover mobile scrolling and a lost response after an actual committed transaction, proving
that retrying creates one financial record and one balance delta.

## Real-model evaluation

With Ollama running and the selected model downloaded, execute from the repository root:

```bash
OLLAMA_MODEL=qwen3:4b-instruct npm run test:ai:live
```

This runs 36 synthetic Spanish cases against the real model. It uses a fixed calendar date,
synthetic accounts/categories, no Prisma connection and no financial writes. The report at
`test-results/ai-evaluation.json` includes raw model output, validated/resolved proposals,
model contract issues, local guard results, latency, prompt version, Ollama version, model
digest, settings and per-case expectations. The command exits nonzero for any failed case;
failures are useful evidence of model limitations, not a reason to bypass validation.

The report separates model intent accuracy from application outcomes after local guards.
Every case calls the model, including excluded operations, so local rejection guards cannot
hide model classification failures. A correct backend default does not imply the model
extracted that field correctly: inspect the raw output and contract issues too.

Compare another model with a separate report:

```bash
OLLAMA_MODEL=qwen2.5:3b AI_EVALUATION_REPORT=test-results/qwen2.5.json npm run test:ai:live
```

For a quick model compatibility check, select case numbers explicitly (the report records the
subset; it is not a full-model evaluation):

```bash
AI_EVALUATION_CASES=1,17,21 OLLAMA_MODEL=qwen3:4b-instruct npm run test:ai:live
```

Run the full browser workflow with real Ollama and a temporary database:

```bash
PFT_AI_LIVE=1 OLLAMA_MODEL=qwen3:4b-instruct npm run test:e2e -- --grep '@ai-live'
```

The scenario creates disposable users/accounts/categories, checks no financial writes before
confirmation, edits the amount, confirms, retries the same confirmation, checks cents and
balances in PostgreSQL, verifies session history and cancels a second proposal. In live mode it
also checks `/api/ps` from the test runner (never from the browser) for startup preload before
sign-in and retained residency after sign-out, with lifecycle evidence in the HTML report.
Unit/integration tests verify shutdown unloading; for a manual Docker check, stop only the
backend and check `ollama ps`, then restart the backend and observe preload. Finally stop the
complete stack to terminate Ollama itself. No existing
application stack needs to be running. Add `OLLAMA_BASE_URL` if using a non-default local port.
The live HTML report is written to `test-results/live-playwright-report/`; inspect it with
`npx playwright show-report test-results/live-playwright-report`. Live server logs are in
`test-results/e2e-server-live/`. The normal regression report remains in `playwright-report/`.

The focused browser regression covers the reported Uber/last-Friday, salary-description and
`35k` messages, a credit purchase, cancellation, receipt hover and account-card layout:

```bash
PFT_AI_LIVE=1 npm run test:e2e -- --grep '@ai-refinements-live'
```

It uses disposable accounts and verifies credit creation leaves available balance unchanged.
If the real model leaves the credit category empty, the test selects an existing expense
category through the review form and attaches `credit-category-selection.json`. That is
evidence of safe manual completion, not perfect model category accuracy. The corresponding
automated fixture scenario and unit tests also cover manual type/category selection.

### Host-side live tests against Docker Ollama

The normal stack deliberately does not publish Ollama's port. Its private container IP may
also be unreachable from the WSL host. To run the live browser suite from the host against
the downloaded Docker model, stop the application and temporarily publish only loopback:

```bash
npm run compose:ai:stop
cat > /tmp/pft-ollama-live-port.yml <<'YAML'
services:
  ollama:
    ports:
      - '127.0.0.1:11435:11434'
YAML
docker compose -f docker-compose.yml -f docker-compose.ollama.yml -f /tmp/pft-ollama-live-port.yml up -d --wait ollama
PFT_AI_LIVE=1 OLLAMA_BASE_URL=http://127.0.0.1:11435 npm run test:e2e -- --grep '@ai-live'
npm run compose:ai:up
```

The test runner still creates its own disposable database and backend; it does not use the
application database. Stopping the main backend first avoids two owners sharing one resident
model. The final normal `compose:ai:up` recreates Ollama without the temporary port mapping,
starts the application again and preloads the model. Inference remains local throughout.

For a manual test in an isolated browser, append `--headed` or use `npm run test:e2e:ui -- --grep
'@ai-live'` with `PFT_AI_LIVE=1`. Avoid experimenting with balances in personal accounts. After
normal local-app testing, verify the transaction list and account balance; if a save response
is lost, retry the same proposal instead of re-entering the message as a new operation.

## Integrity and limitations

- The provider receives only names/types, calendar context and interpretation rules. It has no
  Prisma client, SQL tool or persistence capability. It cannot confirm a transaction.
- Final input is validated again. Ownership/category coherence and account balance invariants
  remain in `TransactionsService`, with account locks, established delta helpers and
  serializable transactions. Draft consumption and financial creation commit atomically.
- Repeated confirmations of the same draft/payload return the existing transaction. Changed
  payloads conflict. This does not deduplicate genuinely separate messages that describe the
  same purchase; check the history before sending the same instruction again.
- Clear unsupported commands are guarded locally. General natural-language classification is
  fallible; model instructions and JSON validity cannot prove correct financial meaning.
- Transfers, savings movements, debt repayments, loans, analytics, and commands
  to edit/delete are outside the MVP. They use the existing normal screens instead.
- The context is bounded. Very large sets of account/category names return a clear error rather
  than silently truncating choices. The UI remains usable through the manual form.
- Native/base Compose setups can disable the experiment with `AI_TRANSACTIONS_ENABLED=false`
  and a backend restart. The AI Compose override explicitly enables it; to disable that setup,
  stop the AI stack and return to base-only Compose. Existing financial records and the manual
  workflow remain available. Keep the additive
  migration applied; no destructive rollback or data reset is needed.
- Backup v2 now carries an optional `defaultAccountExportId`. Old backups remain readable.
  Restore maps this reference to the newly created account and invalidates pending AI drafts.

References: [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs),
[local-only configuration](https://docs.ollama.com/faq),
[model context](https://docs.ollama.com/context-length).
