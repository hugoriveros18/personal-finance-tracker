# Backend Architecture Proposal — Personal Finance Tracker

> **Author:** backend-architect
> **For:** tech-lead synthesis
> **Date:** 2026-04-26
> **Scope:** Backend-only.

---

## 1. Backend framework — **Fastify**

**Recommendation: Fastify (TypeScript, ESM).**

Rationale:
- **DX & type safety:** Fastify's first-party TypeScript support combined with `fastify-type-provider-zod` (or TypeBox) lets every route declare a Zod schema once and get both runtime validation and inferred request/reply types. That covers ~80% of the boilerplate that NestJS pipes/DTOs solve, without the decorator/IoC weight.
- **Clear structure without ceremony:** Fastify's plugin/encapsulation model gives us natural module boundaries (auth plugin, accounts plugin, transactions plugin) without forcing the Angular-style DI container that NestJS imposes — overkill for a single-binary, single-user local app.
- **Why not Express:** Express has zero opinions, no schema-first validation, weak TS ergonomics, and async error handling is famously brittle. We'd end up rebuilding what Fastify gives us.
- **Why not NestJS:** Excellent for large teams and microservices, but the decorator + module + provider machinery is mass for a 4-resource CRUD app. Slower cold starts in Docker, more test setup, more files per feature.

Stack add-ons:
- `@fastify/cors`, `@fastify/helmet`, `@fastify/cookie`, `@fastify/jwt`, `@fastify/multipart`, `@fastify/static` (avatar serving), `@fastify/rate-limit` (login), `pino` (built-in logger).
- `zod` + `fastify-type-provider-zod` for schemas.
- `vitest` for tests, `tsx` for dev hot-reload, `tsup` for build.

---

## 2. Database engine — **PostgreSQL 16**

**Recommendation: PostgreSQL 16 in Docker with a named volume.**

Rationale:
- Default expectation; no reason to deviate. Postgres gives us `BIGINT`, `CHECK` constraints, partial indexes, generated columns, real `ENUM` types, `SERIALIZABLE` transactions, and `pgcrypto`/`gen_random_uuid()` for UUIDs.
- **vs SQLite:** Tempting for a local app, but loses concurrent writers and migration tooling parity with most ORMs is weaker. Backups/exports more awkward when you eventually want to run on a real server.
- **vs MySQL:** Postgres `CHECK` constraints, partial indexes, transactional DDL, and `RETURNING` are all stronger.

Volume strategy: a single named volume `pft_pgdata` mounted at `/var/lib/postgresql/data`. Avatars live on a separate `pft_uploads` volume — never in the DB.

---

## 3. ORM / query layer — **Prisma 5**

Rationale:
- Small data model (6 entities), CRUD-heavy. Prisma's schema-first approach + generated typed client gives the fastest path with the best DX.
- `prisma migrate` is mature, transactional, reproducible.
- `$transaction` (interactive transactions) wraps the multi-step balance updates we need.
- Prisma represents `BIGINT` as JS `bigint` — we serialize bigints explicitly via a single response hook and never let `JSON.stringify` see one raw. Cost of correct money math.

---

## 4. Money storage — **`BIGINT` storing pesos**

- COP has no decimal subdivision. **Store as integer pesos** (`1` = `$1`).
- `BIGINT` range (±9.2 × 10¹⁸) handles any realistic personal balance.
- All money columns: `BIGINT NOT NULL` with appropriate CHECK constraints.
- API serializes money as integer JSON numbers (safe up to 2^53; for COP that's 9 × 10¹⁵ — fine for a personal tracker).
- Multi-currency future: add `currency CHAR(3)` per row and switch convention to "minor units" — `BIGINT` strategy generalizes cleanly.

---

## 5. Database schema

### 5.1 Conventions
- **IDs:** UUID via `gen_random_uuid()` (pgcrypto). Sortable, no info leak.
- **Timestamps:** `created_at`, `updated_at` (`TIMESTAMPTZ DEFAULT now()`). Trigger maintains `updated_at`.
- **No soft delete.** Real deletes; export covers backup needs.
- **Enums:** Postgres native `ENUM` types.
- **`userId` everywhere** from day one.

### 5.2 Liability payment — recommended modeling

**Recommendation: dedicated `liability_payment` entity** (NOT a 4th movement variant, NOT a transaction).

1. **Separation of concerns at the type level.** Movements are "money I had, moved between my buckets." A liability payment moves money from `disponible` (asset) to `pasivos` (debt reduction) — semantically different.
2. **"Expense totals must not filter a magic transaction."** Modeling as a transaction would force every aggregation to `WHERE NOT (special_flag)`. A separate table makes expense queries naturally correct.
3. **Reporting clarity.** Future "debt paydown over time" chart = single-table query.
4. **Movement schema stays tight.** Movements always have both `cuentaEmisora` and `cuentaReceptora` accounts; liability payments target one account's `pasivos` bucket.

### 5.3 Movements modeling

**Single `movement` table** with `cuenta_emisora_id`, `cuenta_receptora_id`, `flujo` enum (`INTER_DISPONIBLE`, `INTRA_DISPONIBLE_TO_AHORRO`, `INTRA_AHORRO_TO_DISPONIBLE`).

CHECK enforces:
- `INTER_DISPONIBLE`: emisora ≠ receptora.
- `INTRA_*`: emisora = receptora.

### 5.4 Category-type vs transaction-type rule

**Enforce in BOTH layers:**
- App layer (primary): service validates on insert/update; returns 422 with clear message.
- DB layer (defense): denormalized `category_tipo` on `transaction`, populated by `BEFORE INSERT/UPDATE` trigger that copies it from the joined category, plus a CHECK.

### 5.5 Prisma schema (canonical)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Language { es en }
enum Theme    { light dark }
enum CategoryTipo     { ingreso egreso }
enum TransactionTipo  { ingreso egreso pasivo }
enum MovementFlujo {
  INTER_DISPONIBLE
  INTRA_DISPONIBLE_TO_AHORRO
  INTRA_AHORRO_TO_DISPONIBLE
}

model User {
  id                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  nombre             String   @db.VarChar(80)
  apellidos          String   @db.VarChar(120)
  email              String   @unique @db.VarChar(254)
  passwordHash       String   @map("password_hash") @db.Text
  avatarPath         String?  @map("avatar_path") @db.Text
  preferredLanguage  Language @default(es) @map("preferred_language")
  preferredTheme     Theme    @default(light) @map("preferred_theme")
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  categories         Category[]
  accounts           Account[]
  transactions       Transaction[]
  movements          Movement[]
  liabilityPayments  LiabilityPayment[]
  refreshTokens      RefreshToken[]

  @@map("user")
}

model Category {
  id        String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String        @map("user_id") @db.Uuid
  nombre    String        @db.VarChar(80)
  tipo      CategoryTipo
  createdAt DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime      @updatedAt      @map("updated_at") @db.Timestamptz(6)

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions Transaction[]

  @@unique([userId, nombre, tipo])
  @@index([userId, tipo])
  @@map("category")
}

model Account {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  nombre     String   @db.VarChar(80)
  disponible BigInt   @default(0)
  ahorro     BigInt   @default(0)
  pasivos    BigInt   @default(0)
  total      BigInt
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  user                  User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions          Transaction[]
  movementsAsEmisora    Movement[]         @relation("MovementEmisora")
  movementsAsReceptora  Movement[]         @relation("MovementReceptora")
  liabilityPayments     LiabilityPayment[]

  @@unique([userId, nombre])
  @@index([userId])
  @@map("account")
}

model Transaction {
  id           String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId       String           @map("user_id") @db.Uuid
  accountId    String           @map("account_id") @db.Uuid
  categoryId   String           @map("category_id") @db.Uuid
  categoryTipo CategoryTipo     @map("category_tipo")
  descripcion  String           @db.VarChar(200)
  fecha        DateTime         @db.Date
  tipo         TransactionTipo
  valor        BigInt

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  account  Account  @relation(fields: [accountId], references: [id], onDelete: Restrict)
  category Category @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  @@index([userId, fecha])
  @@index([userId, accountId, fecha])
  @@index([userId, categoryId, fecha])
  @@index([userId, tipo, fecha])
  @@map("transaction")
}

model Movement {
  id                 String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId             String         @map("user_id") @db.Uuid
  cuentaEmisoraId    String         @map("cuenta_emisora_id") @db.Uuid
  cuentaReceptoraId  String         @map("cuenta_receptora_id") @db.Uuid
  flujo              MovementFlujo
  descripcion        String         @db.VarChar(200)
  fecha              DateTime       @db.Date
  valor              BigInt

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  user             User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  cuentaEmisora    Account @relation("MovementEmisora",   fields: [cuentaEmisoraId],   references: [id], onDelete: Restrict)
  cuentaReceptora  Account @relation("MovementReceptora", fields: [cuentaReceptoraId], references: [id], onDelete: Restrict)

  @@index([userId, fecha])
  @@index([userId, cuentaEmisoraId, fecha])
  @@index([userId, cuentaReceptoraId, fecha])
  @@index([userId, flujo, fecha])
  @@map("movement")
}

model LiabilityPayment {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String   @map("user_id") @db.Uuid
  accountId   String   @map("account_id") @db.Uuid
  descripcion String   @db.VarChar(200)
  fecha       DateTime @db.Date
  valor       BigInt

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  account Account @relation(fields: [accountId], references: [id], onDelete: Restrict)

  @@index([userId, fecha])
  @@index([userId, accountId, fecha])
  @@map("liability_payment")
}

model RefreshToken {
  id         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId     String    @map("user_id") @db.Uuid
  tokenHash  String    @unique @map("token_hash") @db.Text
  expiresAt  DateTime  @map("expires_at") @db.Timestamptz(6)
  revokedAt  DateTime? @map("revoked_at") @db.Timestamptz(6)
  userAgent  String?   @map("user_agent") @db.Text
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("refresh_token")
}
```

### 5.6 Raw DDL additions

```sql
-- Money non-negativity
ALTER TABLE account
  ADD CONSTRAINT account_disponible_nonneg CHECK (disponible >= 0),
  ADD CONSTRAINT account_ahorro_nonneg     CHECK (ahorro     >= 0),
  ADD CONSTRAINT account_pasivos_nonneg    CHECK (pasivos    >= 0),
  ADD CONSTRAINT account_total_eq          CHECK (total = disponible + ahorro);

-- Positive amounts
ALTER TABLE "transaction"      ADD CONSTRAINT tx_valor_pos  CHECK (valor > 0);
ALTER TABLE movement           ADD CONSTRAINT mov_valor_pos CHECK (valor > 0);
ALTER TABLE liability_payment  ADD CONSTRAINT lp_valor_pos  CHECK (valor > 0);

-- Movement flow shape
ALTER TABLE movement
  ADD CONSTRAINT mov_flujo_shape CHECK (
    (flujo = 'INTER_DISPONIBLE'           AND cuenta_emisora_id <> cuenta_receptora_id) OR
    (flujo = 'INTRA_DISPONIBLE_TO_AHORRO' AND cuenta_emisora_id  = cuenta_receptora_id) OR
    (flujo = 'INTRA_AHORRO_TO_DISPONIBLE' AND cuenta_emisora_id  = cuenta_receptora_id)
  );

-- Transaction.tipo vs Category.tipo coherence
CREATE OR REPLACE FUNCTION sync_transaction_category_tipo() RETURNS TRIGGER AS $$
BEGIN
  SELECT tipo INTO NEW.category_tipo FROM category WHERE id = NEW.category_id;
  IF NEW.category_tipo IS NULL THEN
    RAISE EXCEPTION 'Category % not found', NEW.category_id;
  END IF;
  IF (NEW.tipo = 'ingreso' AND NEW.category_tipo <> 'ingreso')
     OR (NEW.tipo IN ('egreso','pasivo') AND NEW.category_tipo <> 'egreso') THEN
    RAISE EXCEPTION 'Transaction tipo % incompatible with category tipo %', NEW.tipo, NEW.category_tipo;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transaction_category_tipo
  BEFORE INSERT OR UPDATE OF category_id, tipo ON "transaction"
  FOR EACH ROW EXECUTE FUNCTION sync_transaction_category_tipo();

-- Prevent changing category.tipo while transactions reference it
CREATE OR REPLACE FUNCTION guard_category_tipo_change() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo <> OLD.tipo AND EXISTS (SELECT 1 FROM "transaction" WHERE category_id = NEW.id) THEN
    RAISE EXCEPTION 'Cannot change category tipo while transactions reference it';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_category_tipo_immutable
  BEFORE UPDATE ON category
  FOR EACH ROW EXECUTE FUNCTION guard_category_tipo_change();
```

### 5.7 ON DELETE policy

| FK | ON DELETE | Why |
|---|---|---|
| `category.user_id` → user.id | CASCADE | User deletion wipes everything |
| `account.user_id` → user.id | CASCADE | Same |
| `transaction.user_id` → user.id | CASCADE | Same |
| `transaction.account_id` → account.id | RESTRICT | History blocks account deletion |
| `transaction.category_id` → category.id | RESTRICT | Force reassignment |
| `movement.cuenta_*_id` → account.id | RESTRICT | Same |
| `liability_payment.account_id` → account.id | RESTRICT | Same |
| `refresh_token.user_id` → user.id | CASCADE | Tokens follow user |

---

## 6. API design (REST)

### 6.1 Conventions
- Base path: `/api/v1`.
- Auth: `Authorization: Bearer <accessJwt>` for everything except `/auth/*` and `/health`.
- All list endpoints support `?page=1&pageSize=25` (max 100), return `{ items, page, pageSize, total }`.
- Date filters: `month=YYYY-MM` (canonical) or `from=YYYY-MM-DD&to=YYYY-MM-DD` (inclusive).
- Money in JSON: integer numbers (COP).
- Errors: `{ error: { code, message, details? } }`.

### 6.2 Endpoint inventory

#### Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | Single-user lock (env-gated) |
| POST | `/auth/login` | Rate-limited 5/min/IP |
| POST | `/auth/refresh` | Rotates refresh token |
| POST | `/auth/logout` | Revokes refresh, clears cookie |
| GET  | `/auth/me` | Reads from access token |

#### Profile
| Method | Path | Notes |
|---|---|---|
| GET | `/me` | Full user |
| PATCH | `/me` | nombre, apellidos, email, preferredLanguage, preferredTheme |
| POST | `/me/password` | currentPassword, newPassword; revokes all refresh |
| POST | `/me/avatar` | multipart, max 2 MB, png/jpg/webp, resized to 512×512 webp |
| DELETE | `/me/avatar` | Removes file + nulls path |

#### Accounts
| Method | Path | Notes |
|---|---|---|
| GET | `/accounts` | All accounts |
| GET | `/accounts/:id` | One |
| POST | `/accounts` | nombre + initial disponible/ahorro/pasivos |
| PATCH | `/accounts/:id` | **Only `nombre` is mutable**; balance fields → 422 IMMUTABLE_BALANCE |
| DELETE | `/accounts/:id` | 409 if any history references it |

#### Categories
| Method | Path | Notes |
|---|---|---|
| GET | `/categories?tipo=` | All / filtered |
| POST | `/categories` | nombre, tipo |
| PATCH | `/categories/:id` | `tipo` immutable once transactions exist |
| DELETE | `/categories/:id` | 409 if used |

#### Transactions
| Method | Path | Notes |
|---|---|---|
| GET | `/transactions` | filters: page,pageSize,month,from,to,accountId,categoryId,tipo,valorMin,valorMax,q |
| GET | `/transactions/:id` |  |
| POST | `/transactions` | descripcion, fecha, tipo, valor, accountId, categoryId |
| PATCH | `/transactions/:id` | reverse + reapply |
| DELETE | `/transactions/:id` | reverses |

#### Movements
| Method | Path | Notes |
|---|---|---|
| GET | `/movements` | filters: page,pageSize,month,from,to,cuentaEmisoraId,cuentaReceptoraId,flujo,valorMin,valorMax |
| GET | `/movements/:id` |  |
| POST | `/movements` | descripcion, fecha, flujo, valor, cuentaEmisoraId, cuentaReceptoraId |
| PATCH | `/movements/:id` | reverse + reapply |
| DELETE | `/movements/:id` | reverses |

#### Liability payments
| Method | Path | Notes |
|---|---|---|
| GET | `/liability-payments` | filters: month,from,to,accountId,valorMin,valorMax |
| POST | `/liability-payments` | descripcion, fecha, valor, accountId |
| PATCH | `/liability-payments/:id` | reverse + reapply |
| DELETE | `/liability-payments/:id` | reverses |

#### Dashboard
**ONE aggregate endpoint** `GET /dashboard?month=YYYY-MM&year=YYYY`.

Response:
```ts
{
  month: "2026-04",
  year: 2026,
  accounts: { id, nombre, disponible, ahorro, pasivos, total }[],
  totals: { disponibleTotal, ahorroTotal, pasivosTotal, netWorth },
  monthSummary: {
    ingresos, egresos, pasivosNuevos, liabilityPayments,
    movementsCount, ahorroDelta, flow
  },
  byCategory: {
    ingreso: { categoryId, nombre, total }[],
    egreso:  { categoryId, nombre, total }[],
  },
  byAccount: { accountId, nombre, ingresos, egresos, pasivosNuevos, liabilityPayments }[],
  trendYear: {
    months: ["2026-01", ..., "2026-12"],
    ingresos: number[],
    egresos: number[],
    pasivosNuevos: number[],
    liabilityPayments: number[],
    ahorroDelta: number[]
  },
  topCategoriesYear: { ingreso: [...], egreso: [...] },
  recent: { transactions, movements, liabilityPayments }
}
```

#### Categories analytics
- `GET /categories/:id/trend?year=YYYY` → monthly totals for one category across the year (for the trend chart).

#### Export / Import
| Method | Path | Notes |
|---|---|---|
| GET | `/export` | application/json attachment |
| POST | `/import` | multipart, validates with Zod, dry-run + commit modes |

#### Health
| Method | Path | Response |
|---|---|---|
| GET | `/health` | `{ status: "ok", db: "ok", uptime }` — Docker healthcheck |

---

## 7. Authentication

**JWT access (15 min, header) + httpOnly refresh cookie (30 days, rotating, hashed at rest).**

- Access token: `Authorization: Bearer`, in-memory only on the client.
- Refresh token: httpOnly + SameSite=Strict cookie at path `/api/v1/auth`. Server stores SHA-256 hash. Rotated each refresh.
- `@fastify/jwt` for sign/verify; custom plugin for refresh issuance & rotation.
- Password hashing: **argon2id** (`memoryCost=19456 (19 MiB), timeCost=2, parallelism=1`).
- Single-user lock: `SINGLE_USER_MODE=true` env. After first register, subsequent return 403 unless flipped.

---

## 8. Business logic layer

**Pattern:** every service method that mutates account balances runs inside `prisma.$transaction(async (tx) => { ... })` with `isolationLevel: 'Serializable'`.

- `SELECT ... FOR UPDATE` on every account row touched, in deterministic id-sorted order to prevent deadlocks.
- CHECK constraints are the final defense — service bugs fail loudly.
- Generated `total = disponible + ahorro` invariant maintained service-side; CHECK enforces.
- **Edits as "reverse + reapply"** globally adopted — eliminates ad-hoc diff code paths.

---

## 9. Edit/Delete validation matrix

### 9.1 Transaction

| Field changed | Service must enforce |
|---|---|
| `descripcion` | length ≤ 200; trim |
| `fecha` | valid date |
| `valor` | > 0; reverse old delta then reapply new on same account |
| `categoryId` | category belongs to user; trigger enforces tipo coherence |
| `accountId` | reverse on old account, reapply on new (lock both, sorted by id) |
| `tipo` (ingreso↔egreso↔pasivo) | category must match new tipo; reverse old impact, reapply new impact |
| `userId`, `id`, timestamps | not mutable |

**Compound case** (change accountId AND tipo AND valor AND categoryId): reverse on (oldAccount, oldTipo, oldValor); apply on (newAccount, newTipo, newValor); lock both accounts in id order; trigger validates category coherence.

**Delete:** reverse the original impact. CHECK violation if reversal would push any balance negative → 409 WOULD_VIOLATE_INVARIANT.

### 9.2 Movement

| flujo | emisora.disponible | emisora.ahorro | receptora.disponible | receptora.ahorro |
|---|---|---|---|---|
| `INTER_DISPONIBLE` | −valor | — | +valor | — |
| `INTRA_DISPONIBLE_TO_AHORRO` | −valor | +valor (same row) | (n/a) | (n/a) |
| `INTRA_AHORRO_TO_DISPONIBLE` | +valor (same row) | −valor (same row) | (n/a) | (n/a) |

| Field changed | Service must enforce |
|---|---|
| `descripcion`, `fecha` | length ≤ 200, valid date |
| `valor` | > 0; reverse + reapply; up-edit may exceed source balance → 422 |
| `flujo` | (emisora, receptora) must match shape; reverse using old flujo, reapply new |
| `cuentaEmisoraId`, `cuentaReceptoraId` | lock 4 (or fewer) account rows in id order; reverse on old pair, reapply on new |

**Delete:** reverse. May fail if subsequent activity has consumed the moved funds.

### 9.3 LiabilityPayment

Impact: `account.disponible -= valor`, `account.pasivos -= valor`.

| Field changed | Notes |
|---|---|
| `descripcion`, `fecha` | no balance impact |
| `valor` | reverse + reapply on same account; up-edit may exceed disponible or pasivos |
| `accountId` | reverse on old, reapply on new (both locked, id order) |

**Delete:** reverse — disponible and pasivos both increase. Always valid.

### 9.4 Universal rules

1. Mutating handlers run inside serializable Prisma `$transaction`.
2. Touched account rows `SELECT ... FOR UPDATE` in deterministic id-sorted order.
3. CHECK constraints are the final defense.
4. Errors mapped:
   - 23505 unique → 409 CONFLICT
   - 23503 FK → 409 IN_USE on delete; 422 INVALID_REFERENCE on insert
   - 23514 check → 422 with specific code (INSUFFICIENT_DISPONIBLE, WOULD_VIOLATE_INVARIANT)
   - serialization_failure → retry once with backoff, then 503

---

## 10. Export / Import format — **JSON**

JSON, gzip-compressed download with a versioned envelope.

### 10.1 Envelope shape

```json
{
  "$schema": "pft-export-v1",
  "exportedAt": "2026-04-26T17:30:00Z",
  "appVersion": "1.0.0",
  "user": {
    "nombre": "...",
    "apellidos": "...",
    "email": "...",
    "preferredLanguage": "es",
    "preferredTheme": "light",
    "passwordHashImport": null,
    "avatarBase64": null
  },
  "categories": [
    { "exportId": "c-001", "nombre": "Salario", "tipo": "ingreso" }
  ],
  "accounts": [
    {
      "exportId": "a-001",
      "nombre": "Bancolombia",
      "initial": { "disponible": 1500000, "ahorro": 0, "pasivos": 0 }
    }
  ],
  "transactions": [
    {
      "exportId": "t-0001",
      "accountExportId": "a-001",
      "categoryExportId": "c-001",
      "descripcion": "Pago abril",
      "fecha": "2026-04-15",
      "tipo": "ingreso",
      "valor": 5000000
    }
  ],
  "movements": [
    {
      "exportId": "m-0001",
      "cuentaEmisoraExportId": "a-001",
      "cuentaReceptoraExportId": "a-002",
      "flujo": "INTER_DISPONIBLE",
      "descripcion": "Transferencia",
      "fecha": "2026-04-16",
      "valor": 200000
    }
  ],
  "liabilityPayments": [
    {
      "exportId": "lp-0001",
      "accountExportId": "a-001",
      "descripcion": "Pago tarjeta",
      "fecha": "2026-04-20",
      "valor": 350000
    }
  ]
}
```

### 10.2 Import

- **ID strategy:** regenerate UUIDs and remap FKs (`exportId` is opaque, decoupled from real UUIDs).
- **Mode flag:** `?mode=replace` (wipe current user data first) vs `?mode=merge-fail-on-conflict` (default; abort on name collision). Replace is the realistic restore use case.
- **Dry run:** `?dryRun=1` parses, validates, plans, returns summary — no writes.
- **Order of replay:** the file is written in `fecha ASC, createdAt ASC` so balance events apply chronologically and never temporarily violate `disponible >= 0`.
- **Size limit:** 50 MB upload.
- **Avatar:** base64 inline; decoded on import to uploads volume.
- **Password:** by default not exported. Optional flag to include hash for full restore.

---

## 11. Docker setup

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-pft}
      POSTGRES_USER: ${POSTGRES_USER:-pft}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-pft}
    volumes:
      - pft_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 20

  backend:
    build: { context: ., dockerfile: apps/backend/Dockerfile }
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 4000
      DATABASE_URL: postgresql://${POSTGRES_USER:-pft}:${POSTGRES_PASSWORD:-pft}@db:5432/${POSTGRES_DB:-pft}
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      ACCESS_TOKEN_TTL: 15m
      REFRESH_TOKEN_TTL: 30d
      SINGLE_USER_MODE: ${SINGLE_USER_MODE:-true}
      UPLOAD_DIR: /data/uploads
      CORS_ORIGIN: http://localhost:3000
      COOKIE_SECURE: "false"
    volumes:
      - pft_uploads:/data/uploads
    depends_on:
      db: { condition: service_healthy }
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:4000/api/v1/health || exit 1"]
      interval: 10s
      timeout: 3s
      retries: 5
    ports: ["4000:4000"]

  frontend:
    build: { context: ., dockerfile: apps/frontend/Dockerfile }
    restart: unless-stopped
    depends_on:
      backend: { condition: service_healthy }
    ports: ["3000:3000"]

volumes:
  pft_pgdata:
  pft_uploads:
```

Backend entrypoint:
```sh
set -e
npx prisma migrate deploy
node dist/server.js
```

---

## 12. Avatar upload

- Volume `pft_uploads` at `/data/uploads/avatars/`.
- Naming: `{userId}_{sha256}.{ext}` (content-addressed).
- Served via `@fastify/static` at `/uploads/avatars`, behind auth guard that checks the userId in the path matches the authenticated user.
- Limits: 2 MB, png/jpg/webp, max 1024×1024. Resized to 512×512 webp via `sharp`.
- DB column `avatar_path` stores public URL path.
- Cleanup on replace/delete/import.
