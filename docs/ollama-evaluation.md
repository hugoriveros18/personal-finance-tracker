> Historical baseline: the results below use prompt version 3 and the original 30-case scope.
> Prompt version 4 adds credit purchases, qualified past weekdays, compact `k` amounts and
> nonempty-description fallbacks. Prompt version 5 adds sparse list-item guidance; the collection
> organizer has a separately versioned prompt and evaluation. Prompt version 7 uses a focused
> purchase label before extraction in the same model response. The single evaluation has 36 cases; rerun it for current
> behavior rather than treating the earlier scores as evidence for the new scope.

# Initial local-model evaluation

Measured on October 27, 2026 with Ollama 0.40.11, prompt version 3, CPU-only inference
on an Intel Core i5-12500H, 16 GB physical RAM and about 7.6 GiB exposed to WSL2.
These are observations from a small synthetic development set, not general accuracy guarantees.

## Method

- The same 30 Spanish messages in `apps/backend/tests/ai-evaluation/cases.json`.
- Fixed reference date `2026-10-27`, `America/Bogota`, synthetic accounts/categories and a
  default account. No database connection or financial writes during model evaluation.
- The actual production Ollama adapter, extraction schema and resolution helpers.
- Temperature 0, 4096-token context, 768-token output limit, one request at a time.
- Every case calls the model, including unsupported operations that the application would
  reject before calling Ollama. This exposes actual model classification mistakes.
- Normalized proposal checks are reported alongside raw extraction and contract issues.

## Results

| Measurement                                                |   `qwen2.5:3b` | `qwen3:4b-instruct` |
| ---------------------------------------------------------- | -------------: | ------------------: |
| Cases satisfying expected model intent and proposal fields |        22 / 30 |             25 / 30 |
| Correct model intent classifications                       |        23 / 30 |             25 / 30 |
| Correct application outcomes after local guards/resolution |        29 / 30 |             30 / 30 |
| Cases with non-verbatim model account/date text            |        12 / 30 |              0 / 30 |
| Median response time in these runs                         |         6.11 s |              8.33 s |
| Minimum / maximum response time in these runs              | 4.72 / 19.91 s |      6.52 / 14.12 s |

The runs shared the machine with development checks and do not constitute an isolated speed
benchmark. The first separate cold-start smoke request for `qwen3:4b-instruct` took about
46 seconds. Do not interpret the full-run maximum above as a cold-start bound. A configurable
120-second timeout permits initial model loading without assuming instantaneous responses.

Model digests:

- `qwen2.5:3b`: `357c53fb659c5076de1d65ccb0b397446227b71a42be9d1603d46168015c9e4b`.
- `qwen3:4b-instruct`: `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`.

The raw reports are generated under ignored `test-results/`:
`ai-evaluation-qwen2.5-final.json` and `ai-evaluation-qwen3-full.json`. Do not commit generated
reports/screenshots. Reproduce them using `npm run test:ai:live` and an explicit model/report
path as described in [the experiment guide](ollama-experiment.md).

## Interpretation and model choice

`qwen3:4b-instruct` is the initial configurable default. It fits this CPU/WSL setup, handles
the tested ordinary transactions and avoids several account/date/category mistakes observed
with the smaller model. `qwen2.5:3b` remains a lighter alternative for comparison.

The 4B model still misclassified five excluded requests: savings, debt payments, credit-card
purchases and two multiple-transaction messages. Local guards rejected all five. This
difference between model accuracy and application behavior is intentional and visible in the
evaluation; it is not evidence that the model understood those requests correctly.

The 3B model additionally suggested the food category for a telescope purchase. This was a
real semantic error despite a valid schema and an existing category. The 4B model left that
category unresolved as expected. Categories always remain editable suggestions.

Neither model's result permits automatic saving. Unseen wording can defeat classification
or local lexical guards; the user must inspect the proposal and explicitly confirm. The
fixed suite should grow with new examples, and repeated/held-out evaluations are appropriate
before making broader quality claims.

## Full-stack live check

The real Chromium → frontend → Fastify → Ollama → PostgreSQL workflow also passed with both
`qwen2.5:3b` and `qwen3:4b-instruct`, using disposable users and a disposable PostgreSQL cluster. It verified no financial
writes before confirmation, amount editing, integer cents, the expected balance, idempotent
replay, session history, cancellation and Spanish/English presentation.

Use `PFT_AI_LIVE=1 OLLAMA_MODEL=qwen3:4b-instruct npm run test:e2e -- --grep '@ai-live'`
to repeat the same full-stack check with the initial default. The normal regression suite
uses an HTTP provider fixture and does not require Ollama.

The completed regression run passed 144 backend unit tests, 67 frontend unit/component tests,
26 HTTP/database integration tests and 3 browser E2E scenarios (240 total). Lint, typecheck and
production builds also passed. Migrations were applied and schema drift checked only against
new disposable databases; no personal development database was migrated or reset.

Offline browser evidence remains in `playwright-report/` and `test-results/e2e/`. Live browser
evidence uses `test-results/live-playwright-report/` and `test-results/e2e-live/`, so running the
real provider does not replace the complete regression report.

## Category and named-date regressions: October 28, 2026

`test:ai:quality:live` uses a synthetic twelve-category profile rather than a minimal choice
between food and transport. With `qwen3:4b-instruct`, extractor prompt 7 passed all eight
category/date cases in `test-results/ai-quality-final.json`: the PS5 purchase in both normal and
reversed category order, groceries, cinema, Uber, electricity, rent and salary on `26 de Octubre`.
The named date resolved to `2026-10-26` using a fixed server reference of `2026-10-28`.
Observed full interpretation times were about 14–29 seconds on the local CPU setup with other
development checks running. These timings do not define a cold-start or service-level bound.

The adapter first receives a short purchase label and the extracted transaction in one JSON
object. It validates both and discards the label. This keeps the public financial contract and
number of model calls unchanged. No product/category mapping was added. The finite test set
demonstrates these regressions only; categories remain suggestions, and raw model fields can
still be wrong even when backend resolution yields the correct final value.

The five additional raw-provider checks passed credit purchases, debit purchases and transfers,
but failed to identify a credit-card repayment and a two-purchase message (3/5, report
`ai-quality-safety-final.json`). These failures are recorded rather than counted as model
successes. The API rejects the explicit repayment before calling the provider; multi-operation
chat messages go through the organizer instead of the single-extraction fast path. Both routes
retain server-side validation and explicit confirmation. Do not use raw provider classification
as authorization to write financial data.

The production organization → per-item extraction → resolution path also passed two real-model
collection regressions with extractor prompt 7 and organizer prompt 2: inherited date headings,
and separate credit/cash purchases. The report is `ai-batch-refinements-final.json`; the command
was `AI_EVALUATION_DOCKER=1 AI_BATCH_EVALUATION_CASES=2,6 npm run test:ai:batch:live`.
These synthetic evaluations did not connect to the database or write financial records.

Separate organization-prompt measurements produced 1,170, 1,528, 1,895 and 2,977 input tokens
for synthetic Spanish messages of 1,000, 2,000, 3,000 and 6,000 characters. With a 4,096-token
context and a 2,048-token organization output budget, the initial input cap is now 2,000
characters. This is a conservative measured starting point, not a universal character/token
conversion or a guarantee that every 30-item response fits. The limit remains configurable.
