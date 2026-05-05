-- Convert all monetary BIGINT columns from "pesos" to "centavos" (×100).
--
-- Rationale: the app needs to support amounts with up to 2 decimal places.
-- We keep BIGINT integer arithmetic (no Decimal/float) and just shift the
-- unit so 1 peso = 100 in the DB. Existing CHECK constraints (e.g.
-- total = disponible + ahorro, all >= 0, all valor > 0) remain valid
-- because every term is multiplied by the same factor.
--
-- BIGINT max = 9_223_372_036_854_775_807 → ample headroom (~92 trillion COP).
-- The serialization plugin still rejects values above Number.MAX_SAFE_INTEGER
-- (~9.0e15) before sending them to the client; the per-amount input validation
-- in the API layer caps individual amounts well below that ceiling.

UPDATE "account" SET
  "disponible" = "disponible" * 100,
  "ahorro"     = "ahorro"     * 100,
  "pasivos"    = "pasivos"    * 100,
  "total"      = "total"      * 100;

UPDATE "transaction"        SET "valor" = "valor" * 100;
UPDATE "movement"           SET "valor" = "valor" * 100;
UPDATE "liability_payment"  SET "valor" = "valor" * 100;
