BEGIN;
ALTER TABLE fs_accounts ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS fs_account_security_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), buyer_id text NOT NULL REFERENCES fs_accounts(buyer_id),
 tenant_id uuid REFERENCES fs_tenants(id), action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
