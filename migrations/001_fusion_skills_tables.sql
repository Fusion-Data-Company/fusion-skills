-- Fusion Skills — multi-tenant Speed-to-Lead schema.
-- Applied to the same Neon DB Drive City uses (separate `fs_*` table namespace).

BEGIN;

CREATE TABLE IF NOT EXISTS fs_tenants (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    slug varchar(100) NOT NULL UNIQUE,
    business_name varchar(255) NOT NULL,
    brand_voice jsonb DEFAULT '{}'::jsonb,
    business_hours jsonb DEFAULT '{}'::jsonb,
    qualification_criteria jsonb DEFAULT '{}'::jsonb,
    crm_webhook_url varchar(2048) NOT NULL,
    crm_webhook_hmac_secret text,
    incoming_hmac_secret text,
    owner_contact jsonb DEFAULT '{}'::jsonb,
    notification_channels jsonb DEFAULT '{}'::jsonb,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS fs_tenants_slug_idx ON fs_tenants(slug);

CREATE TABLE IF NOT EXISTS fs_incoming_leads (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES fs_tenants(id) ON DELETE CASCADE,
    source varchar(50) NOT NULL,
    raw_payload jsonb NOT NULL,
    contact_name varchar(255),
    contact_email varchar(255),
    contact_phone varchar(20),
    idempotency_key varchar(255),
    received_at timestamp DEFAULT now() NOT NULL,
    created_at timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS fs_in_leads_tenant_idx ON fs_incoming_leads(tenant_id);
CREATE INDEX IF NOT EXISTS fs_in_leads_idem_idx ON fs_incoming_leads(idempotency_key);

CREATE TABLE IF NOT EXISTS fs_qualified_leads (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES fs_tenants(id) ON DELETE CASCADE,
    incoming_lead_id uuid REFERENCES fs_incoming_leads(id),
    idempotency_key varchar(255),
    qualification_score integer NOT NULL DEFAULT 0,
    score_breakdown jsonb DEFAULT '{}'::jsonb,
    pain_identified text,
    solution_pitched text,
    roi_articulated text,
    action varchar(50) NOT NULL,
    reason text,
    response_sent text,
    created_at timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS fs_qual_tenant_idx ON fs_qualified_leads(tenant_id);
CREATE INDEX IF NOT EXISTS fs_qual_score_idx ON fs_qualified_leads(qualification_score);
CREATE INDEX IF NOT EXISTS fs_qual_idem_idx ON fs_qualified_leads(idempotency_key);

CREATE TABLE IF NOT EXISTS fs_lead_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES fs_tenants(id) ON DELETE CASCADE,
    lead_id uuid REFERENCES fs_incoming_leads(id),
    event_type varchar(50) NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb,
    ts timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS fs_events_tenant_idx ON fs_lead_events(tenant_id);
CREATE INDEX IF NOT EXISTS fs_events_lead_idx ON fs_lead_events(lead_id);
CREATE INDEX IF NOT EXISTS fs_events_type_idx ON fs_lead_events(event_type);

COMMIT;
