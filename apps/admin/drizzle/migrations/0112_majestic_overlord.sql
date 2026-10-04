DROP INDEX "admin"."accounts_issuer_account_id_unique";--> statement-breakpoint
ALTER TABLE "admin"."accounts" ALTER COLUMN "issuer" DROP NOT NULL;