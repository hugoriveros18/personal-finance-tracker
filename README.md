# Personal Finance Tracker

A full-stack, single-user personal finance tracker. Track income, expenses, savings, and liabilities across multiple accounts, with an interactive dashboard, light/dark theme, Spanish/English UI, and full data export/import. Runs entirely on your own machine via Docker.

> **Currency:** COP (Colombian Pesos) — stored as integer centavos in the DB, formatted as `$1.250.000` for whole-peso amounts and `$1.250.000,50` when there are cents (es-CO: `,` decimal, `.` thousands).

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

What is covered:

- **Backend** — pure delta functions for transactions / movements / liability payments (the heart of the balance model), Zod request schemas, date and pagination helpers, error factories.
- **Frontend** — money formatter (`formatCop`/`parseCop`), date helpers, `useUrlFilters` hook, key components (`<MoneyInput>`, `<EmptyState>`).

What is **not** covered (intentionally — would need an integration harness with a real DB):

- End-to-end HTTP flows against Postgres.
- Full-page rendering with the live API.

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

| Entity | Notes |
|---|---|
| `user` | nombre, apellidos, email (unique), avatarPath, preferredLanguage, preferredTheme |
| `category` | tipo: `ingreso` \| `egreso` |
| `account` | disponible, ahorro, pasivos, total = disponible + ahorro |
| `transaction` | tipo: `ingreso` \| `egreso` \| `pasivo`. Affects account balance per type |
| `movement` | flujo: `INTER_DISPONIBLE` \| `INTRA_DISPONIBLE_TO_AHORRO` \| `INTRA_AHORRO_TO_DISPONIBLE` |
| `liability_payment` | Reduces both `disponible` and `pasivos` of one account. Excluded from expense aggregations |

The Postgres schema includes:
- CHECK constraints: `disponible >= 0`, `ahorro >= 0`, `pasivos >= 0`, `total = disponible + ahorro`, all amounts > 0, movement flow shape.
- Triggers: enforce `transaction.tipo` ↔ `category.tipo` coherence; prevent changing `category.tipo` while transactions reference it.

All balance mutations run inside serializable Prisma transactions with `SELECT ... FOR UPDATE` locks on every touched account row.

---

## Key business rules

- **Ingreso:** `account.disponible += valor`. Category must be tipo `ingreso`.
- **Egreso:** `account.disponible -= valor`. Category must be tipo `egreso`. Cannot push disponible below 0.
- **Pasivo:** `account.pasivos += valor`. Category must be tipo `egreso` (it's a credit-card-like purchase).
- **Liability payment:** `account.disponible -= valor` and `account.pasivos -= valor`. NOT counted as an expense in totals or charts.
- **Movement (inter-account):** `disponible(emisora) -= valor`, `disponible(receptora) += valor`.
- **Movement (intra-account):** moves money between `disponible` and `ahorro` on the same account.
- **Edits & deletes:** apply via *reverse + reapply* inside one transaction. CHECK constraints reject anything that would push a balance negative.
- **Initial balances:** set only at account creation. `PATCH /accounts/:id` only allows `nombre`.

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

- **Export:** `Backup` page → `Exportar`. Downloads a JSON file with all your data.
- **Import:** `Backup` page → upload the JSON.
  - `replace` mode wipes current data and re-creates everything from the file.
  - `merge-fail-on-conflict` aborts on name collisions.
  - `dry run` validates without writing.

The exporter writes events in chronological order so the importer's chronological replay never temporarily violates `disponible >= 0`.

---

## License

MIT — see `LICENSE`.
