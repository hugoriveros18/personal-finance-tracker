-- pgcrypto provides gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "Language" AS ENUM ('es', 'en');
CREATE TYPE "Theme" AS ENUM ('light', 'dark');
CREATE TYPE "CategoryTipo" AS ENUM ('ingreso', 'egreso');
CREATE TYPE "TransactionTipo" AS ENUM ('ingreso', 'egreso', 'pasivo');
CREATE TYPE "MovementFlujo" AS ENUM ('INTER_DISPONIBLE', 'INTRA_DISPONIBLE_TO_AHORRO', 'INTRA_AHORRO_TO_DISPONIBLE');

CREATE TABLE "user" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "nombre" VARCHAR(80) NOT NULL,
  "apellidos" VARCHAR(120) NOT NULL,
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
  "nombre" VARCHAR(80) NOT NULL,
  "tipo" "CategoryTipo" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "category_user_id_nombre_tipo_key" ON "category"("user_id", "nombre", "tipo");
CREATE INDEX "category_user_id_tipo_idx" ON "category"("user_id", "tipo");

ALTER TABLE "category" ADD CONSTRAINT "category_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "account" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "nombre" VARCHAR(80) NOT NULL,
  "disponible" BIGINT NOT NULL DEFAULT 0,
  "ahorro" BIGINT NOT NULL DEFAULT 0,
  "pasivos" BIGINT NOT NULL DEFAULT 0,
  "total" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "account_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_disponible_nonneg" CHECK ("disponible" >= 0),
  CONSTRAINT "account_ahorro_nonneg"     CHECK ("ahorro"     >= 0),
  CONSTRAINT "account_pasivos_nonneg"    CHECK ("pasivos"    >= 0),
  CONSTRAINT "account_total_eq"          CHECK ("total"      = "disponible" + "ahorro")
);

CREATE UNIQUE INDEX "account_user_id_nombre_key" ON "account"("user_id", "nombre");
CREATE INDEX "account_user_id_idx" ON "account"("user_id");

ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "transaction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "category_tipo" "CategoryTipo" NOT NULL,
  "descripcion" VARCHAR(200) NOT NULL,
  "fecha" DATE NOT NULL,
  "tipo" "TransactionTipo" NOT NULL,
  "valor" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "transaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tx_valor_pos" CHECK ("valor" > 0)
);

CREATE INDEX "transaction_user_id_fecha_idx" ON "transaction"("user_id", "fecha");
CREATE INDEX "transaction_user_id_account_id_fecha_idx" ON "transaction"("user_id", "account_id", "fecha");
CREATE INDEX "transaction_user_id_category_id_fecha_idx" ON "transaction"("user_id", "category_id", "fecha");
CREATE INDEX "transaction_user_id_tipo_fecha_idx" ON "transaction"("user_id", "tipo", "fecha");

ALTER TABLE "transaction" ADD CONSTRAINT "transaction_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "movement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "cuenta_emisora_id" UUID NOT NULL,
  "cuenta_receptora_id" UUID NOT NULL,
  "flujo" "MovementFlujo" NOT NULL,
  "descripcion" VARCHAR(200) NOT NULL,
  "fecha" DATE NOT NULL,
  "valor" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "movement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mov_valor_pos" CHECK ("valor" > 0),
  CONSTRAINT "mov_flujo_shape" CHECK (
    ("flujo" = 'INTER_DISPONIBLE'           AND "cuenta_emisora_id" <> "cuenta_receptora_id") OR
    ("flujo" = 'INTRA_DISPONIBLE_TO_AHORRO' AND "cuenta_emisora_id"  = "cuenta_receptora_id") OR
    ("flujo" = 'INTRA_AHORRO_TO_DISPONIBLE' AND "cuenta_emisora_id"  = "cuenta_receptora_id")
  )
);

CREATE INDEX "movement_user_id_fecha_idx" ON "movement"("user_id", "fecha");
CREATE INDEX "movement_user_id_cuenta_emisora_id_fecha_idx" ON "movement"("user_id", "cuenta_emisora_id", "fecha");
CREATE INDEX "movement_user_id_cuenta_receptora_id_fecha_idx" ON "movement"("user_id", "cuenta_receptora_id", "fecha");
CREATE INDEX "movement_user_id_flujo_fecha_idx" ON "movement"("user_id", "flujo", "fecha");

ALTER TABLE "movement" ADD CONSTRAINT "movement_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "movement" ADD CONSTRAINT "movement_cuenta_emisora_id_fkey"
  FOREIGN KEY ("cuenta_emisora_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "movement" ADD CONSTRAINT "movement_cuenta_receptora_id_fkey"
  FOREIGN KEY ("cuenta_receptora_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "liability_payment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "descripcion" VARCHAR(200) NOT NULL,
  "fecha" DATE NOT NULL,
  "valor" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "liability_payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lp_valor_pos" CHECK ("valor" > 0)
);

CREATE INDEX "liability_payment_user_id_fecha_idx" ON "liability_payment"("user_id", "fecha");
CREATE INDEX "liability_payment_user_id_account_id_fecha_idx" ON "liability_payment"("user_id", "account_id", "fecha");

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

-- Sync transaction.category_tipo from joined category and enforce coherence
CREATE OR REPLACE FUNCTION sync_transaction_category_tipo() RETURNS TRIGGER AS $$
DECLARE
  cat_tipo "CategoryTipo";
BEGIN
  SELECT tipo INTO cat_tipo FROM category WHERE id = NEW.category_id;
  IF cat_tipo IS NULL THEN
    RAISE EXCEPTION 'Category % not found', NEW.category_id;
  END IF;
  NEW.category_tipo := cat_tipo;
  IF (NEW.tipo = 'ingreso' AND NEW.category_tipo <> 'ingreso')
     OR (NEW.tipo IN ('egreso','pasivo') AND NEW.category_tipo <> 'egreso') THEN
    RAISE EXCEPTION 'Transaction tipo % incompatible with category tipo %',
                    NEW.tipo, NEW.category_tipo;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transaction_category_tipo
  BEFORE INSERT OR UPDATE OF category_id, tipo ON "transaction"
  FOR EACH ROW EXECUTE FUNCTION sync_transaction_category_tipo();

-- Prevent changing a category's tipo while it has transactions
CREATE OR REPLACE FUNCTION guard_category_tipo_change() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo <> OLD.tipo AND EXISTS (
    SELECT 1 FROM "transaction" WHERE category_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Cannot change category tipo while transactions reference it';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_category_tipo_immutable
  BEFORE UPDATE ON "category"
  FOR EACH ROW EXECUTE FUNCTION guard_category_tipo_change();
