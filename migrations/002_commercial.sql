BEGIN;
CREATE TABLE IF NOT EXISTS fs_accounts (
 buyer_id text PRIMARY KEY, email text NOT NULL, tenant_id uuid UNIQUE REFERENCES fs_tenants(id),
 subscription_id text UNIQUE, access_until timestamptz, billing_status text NOT NULL DEFAULT 'unconfigured',
 checkout_id text, checkout_url text, checkout_expires timestamptz, checkout_attempt uuid,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fs_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES fs_tenants(id),
 request_id uuid NOT NULL, input_hash text NOT NULL, result jsonb NOT NULL,
 delivery_status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), lease_token uuid, lease_until timestamptz,
 last_http_status integer, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,request_id)
);
CREATE TABLE IF NOT EXISTS fs_delivery_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES fs_jobs(id), decision text NOT NULL, evidence text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fs_jobs_due ON fs_jobs(delivery_status,available_at);
COMMIT;
