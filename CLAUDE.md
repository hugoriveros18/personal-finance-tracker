# CLAUDE.md

Instructions for Claude when working in this repository. Read this first whenever you join a new session.

---

## Project at a glance

**Personal Finance Tracker (PFT)** — a single-user, full-stack personal-finance webapp that runs entirely on the user's machine via Docker. Tracks income, expenses, savings, and liabilities across multiple accounts. Currency is **COP** (Colombian Pesos), formatted as `$1.250.000` (no decimals, dot thousands).

- **Backend**: Node.js 20 + TypeScript (ESM) + Fastify v4 + Prisma 5 + PostgreSQL 16. Argon2id passwords + JWT access (in-memory) + httpOnly rotating refresh cookie.
- **Frontend**: Vite + React 18 + Mantine v7 + TanStack Query v5 + React Router v6.27 (data router) + react-hook-form + Zod + react-i18next + Recharts.
- **Mono-repo**: npm workspaces, two packages — `apps/backend`, `apps/frontend`.
- **Containerization**: docker compose; named volumes for db data and uploaded avatars.

Architecture rationale and conventions are documented in this file.

---

## Common requests → exact commands

When the user asks something like the natural-language phrase on the left, run the command on the right. Never invent a higher-level wrapper that does not exist in `package.json`.

| Request | What to do |
|---|---|
| "Run the project" / "Start the app" / "Boot the stack" | `docker compose up --build -d`. Frontend at http://localhost:3000, API at http://localhost:4000/api/v1. |
| "Stop the project" | `docker compose down` (preserves data). For a hard reset that **destroys local data**, ask first, then run `docker compose down -v`. |
| "Show me logs" | `docker compose logs -f backend` or `docker compose logs -f frontend` — pick by what the user is debugging. |
| "Run dev mode" / "Run locally without Docker" | See **Local development without Docker** below. |
| "Run the tests" | `npm -ws --if-present run test` (workspace-wide), or `npm -w apps/backend run test` / `npm -w apps/frontend run test` to scope. |
| "Typecheck" | `npm run typecheck` (workspace-wide). |
| "Lint" | `npm run lint`. |
| "Build for production" | `npm run build` (workspace-wide). For Docker images: `docker compose build`. |
| "Run a migration" | `docker compose exec backend npx prisma migrate deploy` (production-style apply). For dev migrations, see below. |
| "Open Prisma Studio" | `docker compose exec backend npx prisma studio` and forward port 5555. |
| "Reset the database" | **DESTRUCTIVE** — confirm first. Then `docker compose down -v && docker compose up --build -d`. |
| "Connect to the DB" | `docker compose exec db psql -U pft -d pft`. |

---

## First-time setup

```bash
# 1. Create the env file
cp .env.example .env
#   At minimum, replace JWT_ACCESS_SECRET and JWT_REFRESH_SECRET with strong
#   random strings (16+ chars). The placeholders in .env.example are flagged
#   by the backend on startup.

# 2. Boot the stack (this also runs `prisma migrate deploy` inside the backend container)
docker compose up --build -d

# 3. Open the app
#    Frontend: http://localhost:3000
#    API:      http://localhost:4000/api/v1
```

The first time you load the frontend, you register the single user. After that, you log in with that user. To allow multiple users, set `SINGLE_USER_MODE=false` in `.env` and rebuild.

> The backend exits on startup with a clear `Invalid environment configuration` log if `.env` is missing or secrets are too short. Do not attempt to hardcode fallback secrets.

---

## Repository layout

```
personal-finance-tracker/
├── README.md
├── CLAUDE.md                    ← you are here
├── docker-compose.yml
├── .env.example
├── package.json                 ← workspaces root
├── tsconfig.base.json
└── apps/
    ├── backend/                 ← Fastify + Prisma
    │   ├── prisma/
    │   │   ├── schema.prisma
    │   │   └── migrations/
    │   ├── src/
    │   │   ├── server.ts        ← entry point
    │   │   ├── app.ts           ← Fastify app builder (importable from tests)
    │   │   ├── config.ts        ← Zod-validated env loading
    │   │   ├── plugins/         ← prisma, auth, error-handler, bigint
    │   │   ├── shared/          ← errors, locking, pagination, dates, zod
    │   │   └── modules/         ← auth, profile, accounts, categories,
    │   │                           transactions, movements, liability-payments,
    │   │                           dashboard, backup
    │   └── docker/
    │       └── entrypoint.sh    ← runs `prisma migrate deploy` then starts node
    └── frontend/                ← Vite + React + Mantine
        └── src/
            ├── main.tsx
            ├── app/             ← router, providers, layouts
            ├── features/        ← one folder per business module
            ├── shared/          ← api client, components, hooks, lib, stores, types
            ├── i18n/            ← es, en
            └── styles/
```

---

## Backend essentials

### Scripts (`apps/backend/package.json`)

| Script | Command |
|---|---|
| `dev` | `tsx watch src/server.ts` |
| `build` | `tsup` (outputs to `dist/`) |
| `start` | `node dist/server.js` |
| `test` | `vitest run` |
| `typecheck` | `tsc --noEmit` |
| `prisma:generate` | `prisma generate` |
| `prisma:migrate` | `prisma migrate dev` (dev-only — uses `DATABASE_URL`, generates a migration if the schema diverged) |
| `prisma:deploy` | `prisma migrate deploy` (used in production / inside the container) |
| `prisma:studio` | `prisma studio` |

### Money is stored as BIGINT centavos

- All monetary columns are PostgreSQL `BIGINT`, with the unit being **centavos** (1 COP = 100 centavos). This lets us support amounts with up to 2 decimals while keeping pure integer arithmetic.
- The Prisma client maps `BIGINT` to JS `bigint`. The `bigint` plugin (`apps/backend/src/plugins/bigint.ts`) converts `bigint → number` in the Fastify pre-serialization hook and **throws** if a value exceeds `Number.MAX_SAFE_INTEGER`.
- The frontend treats every `valor`/`disponible`/`ahorro`/`pasivos`/`total` field as **integer centavos**. Display goes through `formatCop()` (divides by 100, hides decimals when `% 100 === 0`); user input goes through `<MoneyInput>` which displays pesos+decimals and emits centavos.
- Never introduce a `Decimal` or float for money on the wire. The DB CHECK constraints assume integer arithmetic and they keep working post-multiply because every term scales by the same factor.

### Concurrency model — non-negotiable invariants

Every mutation that touches `account` balances **must**:

1. Run inside `prisma.$transaction(..., { isolationLevel: 'Serializable' })`.
2. Call `lockAccountsForUpdate(tx, userId, ids)` (sorted, deduped `SELECT ... FOR UPDATE`) **before** any read of those accounts.
3. Apply impact via `applyDeltaToAccount(tx, accountId, delta)` so PostgreSQL CHECK constraints fire (`disponible >= 0`, `ahorro >= 0`, `pasivos >= 0`, `total = disponible + ahorro`).
4. For edits/deletes, follow the **reverse + reapply** pattern (revert old impact, apply new impact in one transaction).

If you find yourself updating an account balance outside this scaffolding, **stop and ask** — you are almost certainly introducing a race or invariant violation.

### Business-rule cheatsheet

- **ingreso**: `disponible += valor` — category must be tipo `ingreso`.
- **egreso**: `disponible -= valor` — category must be tipo `egreso`.
- **pasivo** (credit-card-like purchase): `pasivos += valor` — category must be tipo `egreso`.
- **liability_payment**: `disponible -= valor && pasivos -= valor` — **never counted as an expense** in totals or charts. Distinct entity, not a movement variant.
- **movement INTER_DISPONIBLE**: emisora.disponible -= valor, receptora.disponible += valor.
- **movement INTRA_DISPONIBLE_TO_AHORRO**: same account, disponible -= valor && ahorro += valor.
- **movement INTRA_AHORRO_TO_DISPONIBLE**: inverse.
- **Initial account balances** (disponible/ahorro/pasivos) are immutable after creation. `PATCH /accounts/:id` only allows `nombre`.

### Error mapping (`error-handler.ts`)

| Source | HTTP | Code |
|---|---|---|
| Zod validation (request schema or thrown ZodError) | 422 | `VALIDATION_ERROR` |
| `AppError` instance | its `statusCode` | its `code` |
| Prisma P2002 (unique violation) | 409 | `CONFLICT` |
| Prisma P2003 (FK insert) | 422 | `INVALID_REFERENCE` |
| Prisma P2014 (FK restrict on delete) | 409 | `IN_USE` |
| Prisma P2025 (not found) | 404 | `NOT_FOUND` |
| Postgres `23514` (CHECK violation) | 422 | `WOULD_VIOLATE_INVARIANT` |
| Postgres `P0001` (raise) | 422 | `GUARD_REJECTED` |

When raising new errors prefer `AppError` from `shared/errors.ts` so the response shape stays consistent.

---

## Frontend essentials

### Scripts (`apps/frontend/package.json`)

| Script | Command |
|---|---|
| `dev` | `vite` (port 3000, proxies `/api` and `/uploads` to `http://localhost:4000`) |
| `build` | `tsc -b && vite build` |
| `preview` | `vite preview --host 0.0.0.0 --port 3000` |
| `test` | `vitest run` (jsdom env, see `vitest.config.ts`) |
| `test:watch` | `vitest` |
| `typecheck` | `tsc -b --noEmit` |
| `lint` | `eslint src --ext .ts,.tsx` |

### Conventions

- **Money formatting** lives in `shared/lib/money.ts` — always go through `formatCop()` / `parseCop()`. Input is integer centavos; output hides decimals when the value is a whole peso (`$1.250.000`) and shows them when not (`$1.250.000,50`). The formatter strips the NBSP literal that `Intl.NumberFormat('es-CO')` injects.
- **Money inputs** must use `<MoneyInput>` from `shared/components/MoneyInput.tsx` (NumberInput configured with dot thousands, `,` decimal, up to 2 decimals, no negatives). `value` and `onChange` work in **centavos** so consumers don't worry about unit conversion.
- **Filters in tables** use the `useUrlFilters<TFilters>(schema)` hook — keeps filter state in the URL and drives React Query keys, so back/forward and shareable links work for free.
- **Auth state** lives in `shared/stores/authStore.ts` (Zustand). Access tokens are kept **in memory only**; the refresh token is set as an httpOnly cookie by the backend and rotated on `/auth/refresh`.
- **Theme no-flash**: an inline script in `index.html` reads `pft.preferences` from `localStorage` and sets `data-mantine-color-scheme` before paint. Don't move this — it must run before the first React render.
- **Default language is Spanish**. New copy goes into both `i18n/locales/es.json` and `i18n/locales/en.json` (do not introduce keys to only one).
- **Zod validation messages are translated globally** by `shared/lib/zodErrorMap.ts`, registered from `i18n/index.ts` and re-bound on `languageChanged`. Schemas just write `z.string().min(1)` — the user-visible message comes from `validation.required` / `validation.stringMin` / etc. Inline `.min(1, '...')` overrides are only for domain-specific messages (e.g. `'Excede el disponible'`).
- **Charts** use Recharts and `<ChartShell>` from `shared/components/` for consistent margins/heights. The shell takes a `footer` prop for control rows (MonthPicker, Select, etc.) — putting controls there keeps them outside the fixed-height chart area so they don't get clipped. Chart series colors come from `colorAt(i)` in `shared/lib/chartColors.ts`; tooltip styling from `chartTooltipProps` in `shared/components/chartTooltip.ts` (both honor light/dark theme).
- **Form-level "view" mode**: `MovementFormModal` and `TransactionFormModal` accept `mode: 'view' | 'edit' | 'create'`. In `'view'` every input is `disabled` and the Save button is hidden — used by the `Ver detalle` row action. New form modals that share the edit/view dropdown UX should follow the same shape.
- **Movements API filtering**: there are three independent filters on `GET /movements`:
  - `cuentaEmisoraIds` — only rows where the source account is in the list.
  - `cuentaReceptoraIds` — only rows where the destination account is.
  - `accountIds` — OR semantics: rows where the account is **either** emisora or receptora. Used by `AccountDetailPage` to show all movements that touch a given account. Don't pass the same value to `cuentaEmisoraIds` and `cuentaReceptoraIds` — that's an AND and silently hides INTER movements.

---

## Local development without Docker

You can run the database in Docker and the apps natively (faster HMR, easier debugging):

```bash
# 1. Start only the database
docker compose up -d db

# 2. From repo root, install dependencies (npm workspaces — runs once)
npm install

# 3. In one terminal — backend
cd apps/backend
cp ../../.env.example .env       # then edit secrets
export $(grep -v '^#' .env | xargs)
# Note: DATABASE_URL must point to localhost:5432 instead of db:5432 when running outside Docker.
# Adjust .env accordingly:
#   DATABASE_URL=postgresql://pft:changeme@localhost:5432/pft
npm run prisma:generate
npm run prisma:migrate           # dev-mode migration (creates if needed)
npm run dev

# 4. In a second terminal — frontend
cd apps/frontend
npm run dev
```

`vite` proxies `/api` and `/uploads` to `http://localhost:4000`, so the frontend works against the locally-running backend without CORS configuration changes.

---

## Tests

### Layout

- Backend: tests sit next to the file under test as `*.test.ts` (e.g., `src/shared/dates.test.ts`, `src/modules/transactions/service.test.ts`). Pure functions are tested directly; functions that need a real DB connection are out of scope for unit tests and would need an integration harness with a throwaway Postgres container — not configured here yet.
- Frontend: tests sit next to the file under test as `*.test.ts` / `*.test.tsx`. Component tests use `@testing-library/react` via the `renderWithProviders` helper in `src/test/render.tsx`, which wraps components in `MantineProvider`, `QueryClientProvider`, and `MemoryRouter`.

### Running

```bash
# All tests across both workspaces
npm -ws --if-present run test

# Backend only
npm -w apps/backend run test

# Frontend only
npm -w apps/frontend run test

# Watch mode (frontend)
npm -w apps/frontend run test:watch
```

### What's covered today

- **Backend**: pure delta functions for transactions / movements / liability-payments (the heart of the balance model), date helpers, pagination + zod helpers, Zod schemas for transactions / accounts / movements, error factories, the `bigint` preSerialization plugin (regression guard against the bug that flattened `Date` to `{}`).
- **Frontend**: money formatter (`formatCop`/`parseCop`) — including round-trips for fractional centavos, date formatter, `useUrlFilters` hook, `<EmptyState>` / `<MoneyInput>` components, and the i18n Zod error map (`zodErrorMap.test.ts`).

### What's intentionally NOT covered

- End-to-end HTTP flows that require a Postgres instance — would belong in an `apps/backend/tests/integration` folder running against a Docker-managed test DB.
- Full page renders that depend on i18n + auth + react-query data — these would couple tightly to the API surface and add little signal over the per-feature unit tests above.

If a regression slips past these tests, prefer adding the missing case to the existing test file rather than introducing a new harness.

---

## Workflow guardrails for Claude

1. **Don't introduce `Decimal` or floats for money** — bigint pesos only.
2. **Don't write directly to `account.disponible/ahorro/pasivos`** — go through `applyDeltaToAccount` inside a serializable transaction with `lockAccountsForUpdate`.
3. **Don't conflate liability payments with egreso transactions** — they are separate entities and aggregated separately on the dashboard.
4. **Don't mutate `account.disponible/ahorro/pasivos` via PATCH /accounts/:id** — only `nombre` is editable. The schema rejects extra fields strictly.
5. **Don't skip migrations** — schema changes go through `npm -w apps/backend run prisma:migrate` (dev) which produces a SQL file in `apps/backend/prisma/migrations/`. Commit that file.
6. **Don't leak access tokens to localStorage** — they live in memory in `authStore`. The refresh cookie is httpOnly by design.
7. **Don't add a translation key to only one locale** — both `es.json` and `en.json` must be in sync.
8. **Don't run `docker compose down -v` without confirming first** — it deletes the database volume.
