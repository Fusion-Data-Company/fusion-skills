ALTER TABLE fs_accounts ADD COLUMN IF NOT EXISTS billing_invoice_id text;
CREATE TABLE IF NOT EXISTS fs_payment_holds(charge_id text PRIMARY KEY, invoice_id text NOT NULL, subscription_id text NOT NULL, held boolean NOT NULL, reason text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS fs_payment_holds_invoice ON fs_payment_holds(invoice_id) WHERE held;
