# Personal Finance Tracker — Development Plan

> **Tech-lead synthesis (Phase 1 deliverable)**
> Date: 2026-04-26
> Status: Approved by tech-lead. Phase 2 begins after this section.

This plan consolidates the backend-architect and frontend-architect proposals (`.planning/backend-proposal.md`, `.planning/frontend-proposal.md`) and codifies the final decisions where they disagreed. References to the proposals appear inline when the long form is preserved there.

---

## 1. Technology decisions (final)

| Concern | Decision | Why |
|---|---|---|
| Backend framework | **Fastify** (TS, ESM) | Schema-first via Zod + type provider; lighter than NestJS, sturdier than Express |
| Database | **PostgreSQL 16** | CHECKs, BIGINT, generated columns, transactional DDL |
| ORM | **Prisma 5** | Best DX for small CRUD-heavy domain; mature migrations; `$transaction` |
| Money storage | **`BIGINT` integer pesos** | COP has no decimals; one CPU instruction; no float bugs |
| Auth | **Argon2id** + **JWT access (15m)** + **httpOnly rotating refresh cookie (30d)** | OWASP-current; access in memory only; refresh hashed at rest |
| Frontend tooling | **Vite + React 18 + TS** | Local-only SPA needs no Next features |
| UI library | **Mantine v7** | Production DataTable, modals, forms, dates, notifications, theme tokens |
| Charts | **Recharts** | Declarative, themeable, mature, ~90 KB gz |
| Server state | **TanStack Query v5** | Standard |
| Client UI state | **Zustand** | 3 slices, persistent, no provider tree |
| Routing | **React Router v7** (data router) | Loaders, ecosystem, low surprises |
| Forms | **React Hook Form** + **Zod** | RHF perf; Zod schemas double as runtime parsers |
| i18n | **react-i18next** | Largest ecosystem |
| Date/time | **dayjs** (via `@mantine/dates`) | Small, locale-aware |
| Avatar processing | **sharp** | Backend resizes to 512×512 webp |
| Avatar cropping | **react-easy-crop** | Tiny, returns Blob |
| Containerization | **docker-compose** with named volumes | Single-command boot |
| Dev tooling | ESLint, Prettier, Vitest, `tsx`, `tsup` | |

---

## 2. Tech-lead decisions on open questions

### 2.1 Liability payment modeling

The two architects diverged here. **Final call: a dedicated `liability_payment` entity with its own table, service, and API**, but with a **dedicated UI surface** (the `Pagar pasivo` button on each `AccountCard` opens a focused modal). Rationale:

- Reporting clarity — expense aggregations stay free of magic filters.
- Different shape — one `accountId`, no emisora/receptora.
- The frontend's argument was "reuse the movements table" but the entry point is already a separate modal anyway, and movement filters/types stay tighter.

History visibility: liability payments appear in the account detail page on a third tab ("Pagos de pasivo"), and on a top-level "Pagos de pasivo" view that is just a filtered list. Not in the `Movements` view.

### 2.2 Negative balances — **blocked**

Server enforces via CHECK constraints (`disponible >= 0`, `ahorro >= 0`, `pasivos >= 0`). Service maps the violation to 422 `INSUFFICIENT_DISPONIBLE` (or analogous). Real-life "float windows" are modeled as `pasivo` transactions (credit-card-like) — that's exactly the model.

### 2.3 Auth tokens

- Access JWT: in-memory only, sent as `Authorization: Bearer`.
- Refresh: httpOnly `Secure` (in deployed profile) `SameSite=Strict` cookie, path-scoped to `/api/v1/auth`.
- Frontend `axios` instance: `withCredentials: true`. Vite dev proxy mounts the backend at the SPA origin to keep cookies same-origin during dev.

### 2.4 Backup format

JSON, gzip-compressed. Versioned envelope with `exportId` opaque keys; UUIDs regenerated on import. `replace` is the default mode for v1 (the realistic restore use case); `merge-fail-on-conflict` available; `dryRun=1` always available.

### 2.5 Pasivo categories

Pasivo transactions take **egreso categories** (already in spec). Top-4 expense category charts include the union of `egreso` + `pasivo` transactions, broken down by their (egreso) category. Liability-payment records are **excluded** from those charts.

### 2.6 Initial balances on accounts

Set only on creation. `PATCH /accounts/:id` allows only `nombre`. Balance fields in the body → 422 `IMMUTABLE_BALANCE`. UI's edit form does not render them.

### 2.7 Date semantics

The "month" on dashboard, monthly summaries, and filters refers to the user-entered `fecha` field (transaction/movement/payment date), not `created_at`.

### 2.8 Year selector on dashboard

Both `month` and `year` pickers. Defaults: current month, current year. Year-context charts (monthly trends, top-categories-of-year) respect the picked year.

### 2.9 Future-dated `fecha`

Allow. Backdating and (light) scheduling are normal user flows.

### 2.10 Search field on transactions

Ship it. ILIKE on `descripcion`, parameter `q`.

### 2.11 Theme default

Follow `prefers-color-scheme` when the user has no saved preference.

### 2.12 Single-user lock

Env flag `SINGLE_USER_MODE=true` (default). After the first successful register, subsequent return 403. Login still works for that user. Schema supports many users; this is just a runtime gate.

### 2.13 Account deletion

`RESTRICT` if any history exists. UI shows "delete" only when there are no transactions/movements/liability payments referencing the account. Otherwise the action is replaced by guidance.

### 2.14 Dashboard caching

Skip for v1 (single user, low load). The `$transaction` of parallel queries is fast and atomic. Add LRU cache by `(userId, month, year)` later if needed, with mutation-driven invalidation.

### 2.15 Avatar processing

Limits: 2 MB upload, png/jpg/webp, max 1024×1024. Resized server-side with `sharp` to 512×512 webp. Stored as `{userId}_{sha256}.webp`. Served behind auth guard.

---

## 3. Monorepo structure

```
personal-finance-tracker/
├── LICENSE
├── README.md
├── development-plan.md          ← this file
├── docker-compose.yml
├── .env.example
├── .gitignore
├── package.json                 (npm workspaces root)
├── tsconfig.base.json
├── .planning/
│   ├── backend-proposal.md
│   └── frontend-proposal.md
└── apps/
    ├── backend/                 (Fastify + Prisma)
    │   ├── Dockerfile
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── prisma/
    │   │   ├── schema.prisma
    │   │   └── migrations/
    │   └── src/
    │       ├── server.ts
    │       ├── app.ts
    │       ├── config.ts
    │       ├── plugins/
    │       │   ├── prisma.ts
    │       │   ├── auth.ts
    │       │   ├── error-handler.ts
    │       │   ├── bigint.ts
    │       │   └── upload.ts
    │       ├── modules/
    │       │   ├── auth/
    │       │   ├── profile/
    │       │   ├── accounts/
    │       │   ├── categories/
    │       │   ├── transactions/
    │       │   ├── movements/
    │       │   ├── liability-payments/
    │       │   ├── dashboard/
    │       │   └── backup/        (export/import)
    │       └── shared/
    │           ├── errors.ts
    │           ├── pagination.ts
    │           ├── money.ts
    │           ├── locking.ts
    │           └── zod.ts
    └── frontend/                 (Vite + React)
        ├── Dockerfile
        ├── package.json
        ├── tsconfig.json
        ├── vite.config.ts
        ├── index.html
        ├── public/
        └── src/                  (see §6)
```

Each module in `apps/backend/src/modules/<name>/` follows: `routes.ts`, `service.ts`, `repository.ts`, `schemas.ts` (Zod), `types.ts`. Controllers are thin; services own DB transactions.

---

## 4. Database schema

Final canonical schema is in `.planning/backend-proposal.md` §5. Summary of tables and the most important constraints:

- **user** (with email unique, language/theme enums).
- **category** (userId, nombre, tipo, unique by `(userId, nombre, tipo)`).
- **account** (userId, disponible, ahorro, pasivos, total = disponible + ahorro). CHECKs: every balance ≥ 0; total = disponible + ahorro.
- **transaction** (userId, accountId, categoryId, categoryTipo denormalized, descripcion, fecha, tipo, valor). Triggers enforce `tipo`/`categoryTipo` coherence.
- **movement** (userId, cuentaEmisoraId, cuentaReceptoraId, flujo enum, descripcion, fecha, valor). CHECK enforces `flujo` shape.
- **liability_payment** (userId, accountId, descripcion, fecha, valor).
- **refresh_token** (userId, hashed token, expiresAt, revokedAt, userAgent).

Indexes are listed in the backend proposal. Money columns are `BIGINT`. ON DELETE policy: user → CASCADE; account/category → RESTRICT (history blocks deletion).

---

## 5. API design (REST, `/api/v1`)

Final endpoint inventory in `.planning/backend-proposal.md` §6. Highlights:

- **Auth:** `/auth/{register,login,refresh,logout,me}` with rate-limited login.
- **Profile:** `/me`, `/me/password`, `/me/avatar`.
- **Accounts/Categories:** standard CRUD; immutability rules enforced server-side.
- **Transactions/Movements/LiabilityPayments:** CRUD with paginated/filtered list; reverse+reapply on edit/delete.
- **Dashboard:** one aggregate `GET /dashboard?month=YYYY-MM&year=YYYY`.
- **Category trend:** `GET /categories/:id/trend?year=YYYY`.
- **Backup:** `GET /export`, `POST /import` (multipart, with `mode` and `dryRun` query params).
- **Health:** `GET /health` for Docker healthchecks.

Errors: `{ error: { code, message, details? } }`. Mapped: 23505 → 409, 23503 → 409/422, 23514 → 422 with specific code, serialization_failure → retry-then-503.

---

## 6. Frontend architecture

Folder structure per `.planning/frontend-proposal.md` §9. Key decisions baked in:

- **Routing:** RR v7 nested layouts. Public layout (login/register), AuthGuardLayout for `/app/*`.
- **Providers** in `src/main.tsx` (top to bottom): ErrorBoundary → QueryClientProvider → I18nProvider → MantineProvider (color scheme) → ModalsProvider (Mantine modals) → Notifications → RouterProvider.
- **Shared components:** `MoneyInput`, `MoneyDisplay`, `DateInput`, `DataTable`, `EmptyState`, `ChartShell`, `FilterChips`, `ConfirmDialog`, `Page`.
- **Hooks:** `useFormatters`, `useUrlFilters`, `useDebounced`, `useMediaQuery`.
- **Stores:** `authStore`, `preferencesStore`, `uiStore`. Preferences persisted; `prefers-color-scheme` fallback resolved by inline script.
- **Modals:** centralized helpers `appModals.openTransactionForm(initial?)`, etc., wrapping `@mantine/modals`.
- **Filters:** toolbar dropdowns + chips, URL-synced via `useUrlFilters<TFilters>(schema)`. URL drives both UI and React Query keys.
- **Tables:** `mantine-datatable` server-side pagination; row click → detail modal; dots menu (View / Edit / Delete).
- **Money display/input:** integer-only; `formatCop` uses `Intl.formatToParts` to strip the NBSP so output is exactly `$1.250.000`. Mantine `NumberInput` with `prefix="$" thousandSeparator="." decimalSeparator="," decimalScale={0}`.

---

## 7. Dashboard layout

Wireframe in `.planning/frontend-proposal.md` §10. Two summary cards on top (Monthly Summary, Global Snapshot — today), then 2×2 grid of charts (Income/Expenses month bars, Savings month bars, Top-4 categories of selected month), then a full-width Top-4 categories of year. Mobile: single column, sidebar drawer, tables collapse to card lists.

---

## 8. Business rules — final consolidated matrix

> Source: `.planning/backend-proposal.md` §9 (full validation matrix). Restated here as the single source of truth for the implementation.

### 8.1 Account invariants (DB-enforced)
- `disponible >= 0`
- `ahorro >= 0`
- `pasivos >= 0`
- `total = disponible + ahorro`

### 8.2 Transaction
- `valor > 0`.
- `tipo='ingreso'` requires category `tipo='ingreso'`; `tipo='egreso'` or `tipo='pasivo'` requires category `tipo='egreso'`. Trigger-enforced.
- Balance impact:
  - `ingreso` → `account.disponible += valor`
  - `egreso` → `account.disponible -= valor`
  - `pasivo` → `account.pasivos += valor`
- Edits use **reverse + reapply** inside a serializable Prisma `$transaction` with `SELECT ... FOR UPDATE` on the affected accounts (sorted by id).
- Deletion = reverse only. May fail with 409 `WOULD_VIOLATE_INVARIANT` if reversal would push a balance negative.

### 8.3 Movement
| flujo | Source impact | Target impact |
|---|---|---|
| `INTER_DISPONIBLE` | emisora.disponible −valor | receptora.disponible +valor |
| `INTRA_DISPONIBLE_TO_AHORRO` | self.disponible −valor | self.ahorro +valor |
| `INTRA_AHORRO_TO_DISPONIBLE` | self.ahorro −valor | self.disponible +valor |

- `valor > 0`. CHECK enforces `flujo`/account-pair shape.
- Edits = reverse + reapply across (up to four) account rows, locked in id order.

### 8.4 LiabilityPayment
- `valor > 0`.
- Impact: `account.disponible -= valor`; `account.pasivos -= valor`.
- Constraint enforced by CHECKs: a payment that exceeds either `disponible` or `pasivos` → 422.
- **Excluded from expense totals and from byCategory egreso aggregations.**

### 8.5 Universal rules
1. Every mutation is wrapped in `prisma.$transaction(..., { isolationLevel: 'Serializable' })`.
2. Account rows touched are locked `FOR UPDATE` in deterministic id-sorted order.
3. CHECK constraints are the final defense.
4. Reverse + reapply pattern keeps all edits to a single mental model.

---

## 9. Docker setup

Per `.planning/backend-proposal.md` §11.

Services:
- `db` — `postgres:16-alpine`, named volume `pft_pgdata`, healthcheck via `pg_isready`.
- `backend` — multistage Node 20 build, runs `prisma migrate deploy` then `node dist/server.js`. Volume `pft_uploads` at `/data/uploads`. Healthcheck on `/api/v1/health`.
- `frontend` — multistage build (Vite → static dist) served by `nginx:alpine`. Reverse-proxies `/api/v1` to backend if configured; otherwise the SPA hits `http://localhost:4000` directly.

Single command: `docker compose up --build -d` (after copying `.env.example` → `.env` and setting JWT secrets).

---

## 10. Phase 2 — execution order

1. **Monorepo scaffold** — workspaces, tsconfigs, lint/format, env handling, `.gitignore`.
2. **Docker baseline** — compose, Dockerfiles, healthchecks, volumes, entrypoint.
3. **Backend foundation** — Fastify bootstrap, Zod type provider, Prisma schema, initial migration, raw SQL constraints/triggers, BigInt JSON serializer, error mapper, `/health`.
4. **Auth + profile** — register/login/refresh/logout/me, single-user lock, password change, avatar upload (sharp resize), `@fastify/static` guard.
5. **Categories + Accounts** — CRUDs with type/immutability rules.
6. **Transactions** — CRUD with reverse+reapply, FOR UPDATE locking, full validation matrix; paginated/filtered list.
7. **Movements + LiabilityPayments** — CRUDs with three flujos and dedicated payment entity; full validation matrix.
8. **Dashboard endpoint** — one aggregate query of parallel SQL.
9. **Export / Import** — JSON envelope; replace + dry-run.
10. **Frontend foundation** — Vite scaffold, Mantine, no-flash script, Zustand, RR v7, i18n, axios client, shared components (MoneyInput, DataTable, ChartShell, etc.).
11. **Auth pages + AppLayout** — login/register, app shell, profile page (avatar, theme, language).
12. **Accounts + Categories UI** — list/detail/forms; "Pagar pasivo" button.
13. **Transactions + Movements UI** — tables with combinable filters, pagination, modals.
14. **Dashboard + Charts** — summary cards, all five charts, categories page (pie + trend).
15. **Backup UI + Polish** — export/import flow, mobile pass, error/loading polish, README, smoke test the full `docker compose up`.

---

## 11. UX recommendations & spec gaps surfaced

1. **`Pagar pasivo` lives on the account card** (only when `pasivos > 0`). Centers the action in context. A separate "Pagos de pasivo" tab on account detail shows history; a top-level filtered list view is also available.
2. **Top-4 yearly chart** is added (year-aggregated equivalent of the monthly chart). Spec implied it; making it explicit.
3. **Search** added to transactions table (server-side ILIKE on description).
4. **Filter chips below toolbar** so the user can see active filters at a glance and dismiss them individually.
5. **URL-synced filters** so reload and back/forward preserve table state.
6. **Initial balances are immutable** — UI's edit form does not render them; if a user wants to "fix" a balance, they record a correcting transaction (this matches the ledger metaphor).
7. **Empty states** in every table/chart when no data exists for the filter set.
8. **Skeletons** rather than spinners on first paint to reduce perceived latency.
9. **Mobile**: tables collapse to card lists, sidebar to drawer, modals to fullscreen.
10. **Initial balance UX**: account creation form labels these clearly as "Saldos iniciales (no se podrán modificar luego)".

---

## 12. Notes for future iteration (out of scope for v1)

- Multi-currency: schema is integer-minor-units-friendly; add `currency` column.
- Recurring transactions: trivial extension (a `recurrence_rule` table + cron).
- Budgets per category per month: `budget(userId, categoryId, month, amount)`.
- Mobile native app: API is REST so Expo or native consumers fit.
- Multi-user / shared budgets: `userId` is already present everywhere; flip `SINGLE_USER_MODE`.

---

**Phase 1 complete.** Phase 2 begins immediately.
