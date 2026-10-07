# Personal Finance Tracker

A full-stack, single-user personal finance tracker. Track income, expenses, savings, and liabilities across multiple accounts, with an interactive dashboard, light/dark theme, Spanish/English UI, and full data export/import. Runs entirely on your own machine via Docker.

> **Currency:** COP (Colombian Pesos) — stored as integer cents in the DB, formatted as `$1.250.000` for whole-peso amounts and `$1.250.000,50` when there are cents (es-CO: `,` decimal, `.` thousands).

---

## Stack

- **Backend:** Node.js 20, TypeScript, [Fastify](https://fastify.dev/), [Prisma](https://www.prisma.io/), PostgreSQL 16, Argon2id passwords, JWT access + httpOnly rotating refresh tokens.
- **Frontend:** React 18, TypeScript, [Vite](https://vitejs.dev/), [Mantine 7](https://mantine.dev/), [TanStack Query](https://tanstack.com/query/latest), [React Router 6-data](https://reactrouter.com/), [Recharts](https://recharts.org/), [react-hook-form](https://react-hook-form.com/) + [Zod](https://zod.dev/), [react-i18next](https://react.i18next.com/).
- **Containerization:** docker-compose with named volumes for the database and uploaded avatars.
- **Tests:** [Vitest](https://vitest.dev/) on both workspaces; [@testing-library/react](https://testing-library.com/) for UI tests.

The full architectural rationale and conventions are in `CLAUDE.md`.

---

## Quick start (Docker)

```bash
# 1. Set up environment
cp .env.example .env
# edit .env — at minimum set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to strong random strings

# 2. Boot the stack
docker compose up --build -d

# 3. Open the app
# Frontend: http://localhost:3000
# Backend:  http://localhost:4000/api/v1
```

The backend container runs `prisma migrate deploy` on startup (see `apps/backend/docker/entrypoint.sh`), so no manual migration step is needed.

The first time you load the app, register the single user. After that, log in with that user. To allow multiple users, set `SINGLE_USER_MODE=false` in `.env` and rebuild.

---

## Local development (without Docker)

Run Postgres in Docker and the apps natively for faster HMR and easier debugging:

```bash
# 1. Start the database only
docker compose up -d db

# 2. Install workspace dependencies
npm install

# 3. Adjust DATABASE_URL in .env to use localhost:
#    DATABASE_URL=postgresql://pft:changeme@localhost:5432/pft

# 4. Backend (terminal A)
npm -w apps/backend run prisma:generate
npm -w apps/backend run prisma:migrate     # dev-mode: applies/creates migrations
npm -w apps/backend run dev                # http://localhost:4000

# 5. Frontend (terminal B)
npm -w apps/frontend run dev               # http://localhost:3000
```

Vite proxies `/api` and `/uploads` to `http://localhost:4000`, so no CORS tweaks are required when running this way.

---

## Building for production

```bash
# Build both apps via tsup (backend) and vite (frontend)
npm run build

# Or build the Docker images directly
docker compose build
```

---

## Tests, type-check, lint

All commands work from the repo root and fan out to both workspaces:

```bash
npm run test         # vitest run, in both workspaces
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # tsup + vite
```

Scope to a single workspace:

```bash
npm -w apps/backend run test
npm -w apps/frontend run test
npm -w apps/frontend run test:watch
```

The test layers are:

- **Unit tests:** domain deltas, request schemas, dates, pagination, money formatting and serialization.
- **Component tests:** account, transaction, movement and liability payment forms; English request payloads; Spanish/English labels and validation; read-only views and category preservation while loading.
- **Locale tests:** matching keys and interpolation parameters, all static translation references, language preference changes and translated validation.
- **Integration tests:** real HTTP requests through Fastify injection against disposable PostgreSQL 16, fresh migration installation and Prisma schema drift detection, database constraints and triggers, user isolation, reverse/reapply balance mutations, filtering, dashboard totals and backup restoration.

```bash
npm run test:integration  # fresh temporary PostgreSQL, migrations, HTTP/database tests
npm run test:e2e          # real Chromium, frontend, API and disposable PostgreSQL
npm run test:e2e:ui       # interactive Playwright runner
npm run test:all          # unit/component, integration and browser E2E tests
```

The integration runner uses `embedded-postgres`, pinned to PostgreSQL 16. It requires a non-root OS user and install scripts enabled, but no Docker or existing database. Each run chooses a free local port, creates a temporary cluster and upload directory, and stops/removes them in a `finally` block. It overrides `DATABASE_URL` with its own temporary database; it never resets the development database. Files run sequentially, and each test clears its own test data and builds a fresh API instance. Integration tests and configuration are included in the backend typecheck and lint commands.

CI runs lint, typecheck, all test layers and production builds on every push and pull request. Component tests mock feature API clients; integration tests exercise the real API/database; browser E2E tests exercise the complete application in Chromium.

### Browser E2E workflow (Playwright)

- One-time setup after `npm install`: run `npm -w apps/backend run prisma:generate` and `npx playwright install --with-deps chromium` (browser/system dependencies; Linux package installation may require administrator privileges).
- Run `npm run test:e2e` from the repository root. The runner starts disposable PostgreSQL 16, deploys migrations and starts the real API and Vite on free loopback ports. It overrides database/server settings with test-only values, then stops services and removes the temporary database/uploads. No Docker, `.env` edits or development database reset is needed. Run as a non-root OS user with npm install scripts enabled.
- Use `npm run test:e2e:ui` for interactive debugging, or `npm run test:e2e -- --headed` to watch Chromium. Pass Playwright filters through the runner, for example `npm run test:e2e -- --grep "Spanish expense"`. Do not invoke `npx playwright test` directly: it bypasses isolated environment setup.
- Specs live in `tests/e2e/*.spec.ts`. Start each independent scenario with fresh browser state and create uniquely named users/data if adding scenarios. Tests share a disposable database and run sequentially; do not assume the database is empty after another scenario. The finance scenario verifies Spanish forms, English HTTP payloads, integer cents in PostgreSQL, rendered balances, English translation and preference persistence. The access scenario verifies redirect to login.
- During development, run focused unit/component tests. For changes crossing UI/API boundaries, authentication, balances or translations, run the affected E2E scenarios and update them where behavior changes. Before handing off application changes, run `npm run lint`, `npm run typecheck`, `npm run test:all` and `npm run build`; `test:all` includes unit/component, integration and E2E layers. For documentation-only edits, check affected commands/references without rerunning the application suites.
- Evidence is generated under ignored `test-results/` and `playwright-report/`. Successful finance runs attach `transactions-es.png`, `transactions-en.png`, `accounts-en.png` and a JSON verification summary to the HTML report. Failures preserve screenshots, video and traces; server logs are under `test-results/e2e-server/`. View the report with `npx playwright show-report`. These are evidence captures, not visual snapshot comparisons.
- CI installs Chromium/system dependencies, runs all layers and uploads the report/results as `playwright-results` for 14 days, including on failures. For UI PRs, attach representative current screenshots to the PR description and link the CI artifact/run for reproducible evidence. Do not commit generated images or reports. Creating/publishing a PR still requires the user's authorization.

---

## Repository layout

```
personal-finance-tracker/
├── README.md
├── CLAUDE.md                    # canonical instructions for Claude Code in this repo
├── docker-compose.yml
├── .env.example
├── package.json                 # workspaces root
├── tsconfig.base.json
└── apps/
    ├── backend/                 # Fastify + Prisma
    │   ├── prisma/
    │   │   ├── schema.prisma
    │   │   └── migrations/
    │   └── src/
    │       ├── server.ts
    │       ├── app.ts
    │       ├── plugins/         # prisma, auth, error-handler, bigint
    │       ├── shared/          # errors, locking, pagination, dates, zod
    │       └── modules/
    │           ├── auth/
    │           ├── profile/
    │           ├── accounts/
    │           ├── categories/
    │           ├── transactions/
    │           ├── movements/
    │           ├── liability-payments/
    │           ├── dashboard/
    │           └── backup/      # export/import
    └── frontend/                # Vite + React + Mantine
        └── src/
            ├── main.tsx
            ├── app/             # router, providers, layouts
            ├── features/        # auth, accounts, categories, transactions, movements,
            │                    # liability-payments, dashboard, profile, backup
            ├── shared/          # api client, components, hooks, lib, stores, types
            ├── i18n/            # es, en
            └── styles/
```

---

## Data model

| Entity              | Notes                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `user`              | firstName, lastName, email (unique), avatarPath, preferredLanguage, preferredTheme                          |
| `category`          | type: `income` \| `expense`                                                                                 |
| `account`           | availableBalance, savingsBalance, liabilitiesBalance, total = availableBalance + savingsBalance             |
| `transaction`       | type: `income` \| `expense` \| `liability`. Affects account balance per type                                |
| `movement`          | flow: `INTER_AVAILABLE` \| `INTRA_AVAILABLE_TO_SAVINGS` \| `INTRA_SAVINGS_TO_AVAILABLE`                     |
| `liability_payment` | Reduces both `availableBalance` and `liabilitiesBalance` of one account. Excluded from expense aggregations |

The Postgres schema includes:

- CHECK constraints: `availableBalance >= 0`, `savingsBalance >= 0`, `liabilitiesBalance >= 0`, `total = availableBalance + savingsBalance`, all amounts > 0, movement flow shape.
- Triggers: enforce `transaction.type` ↔ `category.type` coherence; prevent changing `category.type` while transactions reference it.

All balance mutations run inside serializable Prisma transactions with `SELECT ... FOR UPDATE` locks on every touched account row.

---

## Key business rules

- **Income:** `account.availableBalance += amount`. Category must be type `income`.
- **Expense:** `account.availableBalance -= amount`. Category must be type `expense`. Cannot push availableBalance below 0.
- **Liability:** `account.liabilitiesBalance += amount`. Category must be type `expense` (it's a credit-card-like purchase).
- **Liability payment:** `account.availableBalance -= amount` and `account.liabilitiesBalance -= amount`. NOT counted as an expense in totals or charts.
- **Movement (inter-account):** `availableBalance(source) -= amount`, `availableBalance(destination) += amount`.
- **Movement (intra-account):** moves money between `availableBalance` and `savingsBalance` on the same account.
- **Edits & deletes:** apply via _reverse + reapply_ inside one transaction. CHECK constraints reject anything that would push a balance negative.
- **Initial balances:** set only at account creation. `PATCH /accounts/:id` only allows `name`.

---

## Useful commands

```bash
# Logs
docker compose logs -f backend
docker compose logs -f frontend

# Connect to the DB
docker compose exec db psql -U pft -d pft

# Reset the database (DESTROYS LOCAL DATA)
docker compose down -v

# Run a one-off migration
docker compose exec backend npx prisma migrate deploy

# Open Prisma Studio (forward port manually if needed)
docker compose exec backend npx prisma studio
```

---

## Backup / restore

- **Export:** `Backup` page → `Export data`. Downloads a JSON file with all your data.
- **Import:** `Backup` page → upload the JSON.
  - `replace` mode wipes current data and re-creates everything from the file.
  - `merge-fail-on-conflict` aborts on name collisions.
  - `dry run` validates without writing.

Exports use `$schema: "pft-export-v2"`. Keys and enum values are English in every locale; choosing Spanish only changes presentation. Names and descriptions entered by users are preserved as entered. Amounts are integer COP cents (1 COP = 100 cents). The exporter reconstructs initial balances; the importer replays events by date inside a serializable transaction.

The English standardization intentionally starts a new migration history (`20261007000000_init`). It targets a fresh database and does not provide adapters for earlier API fields, URL parameters or backup formats. If a local development database already has the previous migration history, recreate that empty development database before starting the new version. Database reset commands delete data and must only be used on a database you intend to discard.

API and Prisma fields use `camelCase` (`firstName`, `availableBalance`, `sourceAccountId`); mapped PostgreSQL columns use `snake_case` (`first_name`, `available_balance`, `source_account_id`). Filters use `types`, `flows`, `amountMin`, `amountMax`, `sourceAccountIds` and `destinationAccountIds`. Sorts use English fields such as `-date` and `-amount`.

---

## License

MIT — see `LICENSE`.
