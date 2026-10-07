-- All monetary BIGINT columns store integer COP cents (1 COP = 100 cents).
-- pgcrypto provides gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "Language" AS ENUM ('es', 'en');
CREATE TYPE "Theme" AS ENUM ('light', 'dark');
CREATE TYPE "CategoryType" AS ENUM ('income', 'expense');
CREATE TYPE "TransactionType" AS ENUM ('income', 'expense', 'liability');
CREATE TYPE "MovementFlow" AS ENUM ('INTER_AVAILABLE', 'INTRA_AVAILABLE_TO_SAVINGS', 'INTRA_SAVINGS_TO_AVAILABLE');

CREATE TABLE "user" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "first_name" VARCHAR(80) NOT NULL,
  "last_name" VARCHAR(120) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "avatar_path" TEXT,
  "preferred_language" "Language" NOT NULL DEFAULT 'es',
  "preferred_theme" "Theme" NOT NULL DEFAULT 'light',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

CREATE TABLE "category" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "type" "CategoryType" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "category_user_id_name_type_key" ON "category"("user_id", "name", "type");
CREATE INDEX "category_user_id_type_idx" ON "category"("user_id", "type");

ALTER TABLE "category" ADD CONSTRAINT "category_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "account" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "available_balance" BIGINT NOT NULL DEFAULT 0,
  "savings_balance" BIGINT NOT NULL DEFAULT 0,
  "liabilities_balance" BIGINT NOT NULL DEFAULT 0,
  "total" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "account_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_available_balance_nonneg" CHECK ("available_balance" >= 0),
  CONSTRAINT "account_savings_balance_nonneg"     CHECK ("savings_balance"     >= 0),
  CONSTRAINT "account_liabilities_balance_nonneg"    CHECK ("liabilities_balance"    >= 0),
  CONSTRAINT "account_total_eq"          CHECK ("total"      = "available_balance" + "savings_balance")
);

CREATE UNIQUE INDEX "account_user_id_name_key" ON "account"("user_id", "name");
CREATE INDEX "account_user_id_idx" ON "account"("user_id");

ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "transaction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "category_type" "CategoryType" NOT NULL,
  "description" VARCHAR(200) NOT NULL,
  "date" DATE NOT NULL,
  "type" "TransactionType" NOT NULL,
  "amount" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "transaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tx_amount_pos" CHECK ("amount" > 0)
);

CREATE INDEX "transaction_user_id_date_idx" ON "transaction"("user_id", "date");
CREATE INDEX "transaction_user_id_account_id_date_idx" ON "transaction"("user_id", "account_id", "date");
CREATE INDEX "transaction_user_id_category_id_date_idx" ON "transaction"("user_id", "category_id", "date");
CREATE INDEX "transaction_user_id_type_date_idx" ON "transaction"("user_id", "type", "date");

ALTER TABLE "transaction" ADD CONSTRAINT "transaction_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "movement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "source_account_id" UUID NOT NULL,
  "destination_account_id" UUID NOT NULL,
  "flow" "MovementFlow" NOT NULL,
  "description" VARCHAR(200) NOT NULL,
  "date" DATE NOT NULL,
  "amount" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "movement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mov_amount_pos" CHECK ("amount" > 0),
  CONSTRAINT "mov_flow_shape" CHECK (
    ("flow" = 'INTER_AVAILABLE'           AND "source_account_id" <> "destination_account_id") OR
    ("flow" = 'INTRA_AVAILABLE_TO_SAVINGS' AND "source_account_id"  = "destination_account_id") OR
    ("flow" = 'INTRA_SAVINGS_TO_AVAILABLE' AND "source_account_id"  = "destination_account_id")
  )
);

CREATE INDEX "movement_user_id_date_idx" ON "movement"("user_id", "date");
CREATE INDEX "movement_user_id_source_account_id_date_idx" ON "movement"("user_id", "source_account_id", "date");
CREATE INDEX "movement_user_id_destination_account_id_date_idx" ON "movement"("user_id", "destination_account_id", "date");
CREATE INDEX "movement_user_id_flow_date_idx" ON "movement"("user_id", "flow", "date");

ALTER TABLE "movement" ADD CONSTRAINT "movement_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "movement" ADD CONSTRAINT "movement_source_account_id_fkey"
  FOREIGN KEY ("source_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movement" ADD CONSTRAINT "movement_destination_account_id_fkey"
  FOREIGN KEY ("destination_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "liability_payment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "description" VARCHAR(200) NOT NULL,
  "date" DATE NOT NULL,
  "amount" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "liability_payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lp_amount_pos" CHECK ("amount" > 0)
);

CREATE INDEX "liability_payment_user_id_date_idx" ON "liability_payment"("user_id", "date");
CREATE INDEX "liability_payment_user_id_account_id_date_idx" ON "liability_payment"("user_id", "account_id", "date");

ALTER TABLE "liability_payment" ADD CONSTRAINT "liability_payment_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "liability_payment" ADD CONSTRAINT "liability_payment_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "refresh_token" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "user_agent" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");
CREATE INDEX "refresh_token_user_id_idx" ON "refresh_token"("user_id");

ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Triggers
-- ============================================================================

-- Sync transaction.category_type from joined category and enforce coherence
CREATE OR REPLACE FUNCTION sync_transaction_category_type() RETURNS TRIGGER AS $$
DECLARE
  category_type "CategoryType";
BEGIN
  SELECT type INTO category_type FROM category WHERE id = NEW.category_id;
  IF category_type IS NULL THEN
    RAISE EXCEPTION 'Category % not found', NEW.category_id;
  END IF;
  NEW.category_type := category_type;
  IF (NEW.type = 'income' AND NEW.category_type <> 'income')
     OR (NEW.type IN ('expense','liability') AND NEW.category_type <> 'expense') THEN
    RAISE EXCEPTION 'Transaction type % incompatible with category type %',
                    NEW.type, NEW.category_type;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transaction_category_type
  BEFORE INSERT OR UPDATE OF category_id, type ON "transaction"
  FOR EACH ROW EXECUTE FUNCTION sync_transaction_category_type();

-- Prevent changing a category's type while it has transactions
CREATE OR REPLACE FUNCTION guard_category_type_change() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type <> OLD.type AND EXISTS (
    SELECT 1 FROM "transaction" WHERE category_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Cannot change category type while transactions reference it';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_category_type_immutable
  BEFORE UPDATE ON "category"
  FOR EACH ROW EXECUTE FUNCTION guard_category_type_change();
