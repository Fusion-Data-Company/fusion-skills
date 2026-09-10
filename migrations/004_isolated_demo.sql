BEGIN;
CREATE TABLE IF NOT EXISTS fs_demo_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), buyer_id text NOT NULL,
 request_id uuid NOT NULL, input_hash text NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(buyer_id,request_id)
);
CREATE INDEX IF NOT EXISTS fs_demo_jobs_owner ON fs_demo_jobs(buyer_id,created_at);
COMMIT;
