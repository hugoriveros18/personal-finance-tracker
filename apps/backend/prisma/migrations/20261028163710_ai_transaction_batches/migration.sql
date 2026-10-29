-- CreateTable
CREATE TABLE "ai_transaction_batch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "reference_date" VARCHAR(10) NOT NULL,
    "time_zone" VARCHAR(80) NOT NULL,
    "notes" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_transaction_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_transaction_batch_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batch_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "source_text" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "draft_id" UUID,

    CONSTRAINT "ai_transaction_batch_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_transaction_batch_user_id_request_id_key" ON "ai_transaction_batch"("user_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_transaction_batch_item_draft_id_key" ON "ai_transaction_batch_item"("draft_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_transaction_batch_item_batch_id_position_key" ON "ai_transaction_batch_item"("batch_id", "position");

-- AddForeignKey
ALTER TABLE "ai_transaction_batch" ADD CONSTRAINT "ai_transaction_batch_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_transaction_batch_item" ADD CONSTRAINT "ai_transaction_batch_item_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "ai_transaction_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_transaction_batch_item" ADD CONSTRAINT "ai_transaction_batch_item_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "ai_transaction_draft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
