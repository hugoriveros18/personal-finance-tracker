-- CreateEnum
CREATE TYPE "AiDraftStatus" AS ENUM ('pending', 'confirmed', 'cancelled');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "default_account_id" UUID;

-- CreateTable
CREATE TABLE "ai_transaction_draft" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "proposal" JSONB NOT NULL,
    "status" "AiDraftStatus" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "confirmed_hash" VARCHAR(64),
    "transaction_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_transaction_draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_transaction_draft_user_id_status_expires_at_idx" ON "ai_transaction_draft"("user_id", "status", "expires_at");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_default_account_id_fkey" FOREIGN KEY ("default_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_transaction_draft" ADD CONSTRAINT "ai_transaction_draft_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
