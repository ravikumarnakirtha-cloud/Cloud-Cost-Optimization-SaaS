-- ============================================================
-- Cloud Cost Optimizer - Full Database Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS & AUTH
-- ============================================================
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name   VARCHAR(255),
    role        VARCHAR(50) DEFAULT 'user',   -- admin | user
    tenant_id   UUID NOT NULL,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tenants (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(255) NOT NULL,
    plan        VARCHAR(50) DEFAULT 'free',   -- free | pro | enterprise
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD CONSTRAINT fk_users_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- ============================================================
-- CLOUD ACCOUNTS
-- ============================================================
CREATE TABLE cloud_accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    provider        VARCHAR(50) NOT NULL,     -- aws | azure
    account_alias   VARCHAR(255),
    account_id      VARCHAR(255) NOT NULL,
    credentials     JSONB,                    -- encrypted creds (simulated)
    regions         TEXT[],
    is_active       BOOLEAN DEFAULT TRUE,
    last_scan_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CLOUD RESOURCES
-- ============================================================
CREATE TABLE resources (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    account_id      UUID NOT NULL REFERENCES cloud_accounts(id),
    provider        VARCHAR(50) NOT NULL,
    resource_type   VARCHAR(100) NOT NULL,    -- ec2 | ebs | s3 | vm | storage_account
    resource_id     VARCHAR(255) NOT NULL,
    resource_name   VARCHAR(255),
    region          VARCHAR(100),
    tags            JSONB DEFAULT '{}',
    config          JSONB DEFAULT '{}',       -- size, type, specs
    metrics         JSONB DEFAULT '{}',       -- cpu, mem, network utilization
    monthly_cost    NUMERIC(12,4) DEFAULT 0,
    status          VARCHAR(50) DEFAULT 'active',  -- active | idle | stopped | orphaned
    is_zombie       BOOLEAN DEFAULT FALSE,
    zombie_reason   TEXT,
    first_seen_at   TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ DEFAULT NOW(),
    scanned_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resources_tenant ON resources(tenant_id);
CREATE INDEX idx_resources_account ON resources(account_id);
CREATE INDEX idx_resources_zombie ON resources(is_zombie) WHERE is_zombie = TRUE;
CREATE INDEX idx_resources_type ON resources(resource_type);

-- ============================================================
-- SCAN JOBS
-- ============================================================
CREATE TABLE scan_jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    account_id      UUID REFERENCES cloud_accounts(id),
    status          VARCHAR(50) DEFAULT 'pending',  -- pending | running | completed | failed
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    resources_found INT DEFAULT 0,
    zombies_found   INT DEFAULT 0,
    error_message   TEXT,
    triggered_by    VARCHAR(100) DEFAULT 'scheduler',  -- scheduler | user | api
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- COST REPORTS
-- ============================================================
CREATE TABLE cost_reports (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    account_id          UUID REFERENCES cloud_accounts(id),
    report_period_start DATE NOT NULL,
    report_period_end   DATE NOT NULL,
    total_cost          NUMERIC(14,4) DEFAULT 0,
    wasted_cost         NUMERIC(14,4) DEFAULT 0,
    potential_savings   NUMERIC(14,4) DEFAULT 0,
    cost_breakdown      JSONB DEFAULT '{}',   -- by service, region, tag
    generated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RECOMMENDATIONS
-- ============================================================
CREATE TABLE recommendations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    resource_id     UUID REFERENCES resources(id),
    account_id      UUID REFERENCES cloud_accounts(id),
    category        VARCHAR(100) NOT NULL,    -- rightsizing | delete | reserved | schedule
    priority        VARCHAR(20) DEFAULT 'medium',  -- critical | high | medium | low
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    current_cost    NUMERIC(12,4) DEFAULT 0,
    projected_cost  NUMERIC(12,4) DEFAULT 0,
    monthly_savings NUMERIC(12,4) DEFAULT 0,
    annual_savings  NUMERIC(12,4) DEFAULT 0,
    effort          VARCHAR(50) DEFAULT 'low',  -- low | medium | high
    status          VARCHAR(50) DEFAULT 'open',  -- open | applied | dismissed | snoozed
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recs_tenant ON recommendations(tenant_id);
CREATE INDEX idx_recs_status ON recommendations(status);
CREATE INDEX idx_recs_priority ON recommendations(priority);

-- ============================================================
-- COST HISTORY (for trend charts)
-- ============================================================
CREATE TABLE cost_history (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id),
    account_id  UUID REFERENCES cloud_accounts(id),
    snapshot_date DATE NOT NULL,
    service     VARCHAR(100),
    region      VARCHAR(100),
    cost        NUMERIC(12,4) DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cost_history_tenant_date ON cost_history(tenant_id, snapshot_date);

-- ============================================================
-- ALERTS
-- ============================================================
CREATE TABLE alerts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id),
    type        VARCHAR(100) NOT NULL,   -- cost_spike | new_zombie | budget_exceeded
    severity    VARCHAR(20) DEFAULT 'info',
    title       VARCHAR(500),
    message     TEXT,
    metadata    JSONB DEFAULT '{}',
    is_read     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEED: default tenant + admin user
-- ============================================================
INSERT INTO tenants (id, name, plan) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Demo Corp', 'pro');

-- password: Admin@123 (bcrypt)
INSERT INTO users (id, email, password_hash, full_name, role, tenant_id) VALUES
    ('00000000-0000-0000-0000-000000000002',
     'admin@democorp.com',
     '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeAoE3e.lq8RdNlC2',
     'Admin User',
     'admin',
     '00000000-0000-0000-0000-000000000001');

INSERT INTO cloud_accounts (id, tenant_id, provider, account_alias, account_id, credentials, regions, is_active) VALUES ('f9eea427-b6e3-41bd-b486-4c17742c031e', '00000000-0000-0000-0000-000000000001', 'aws', 'Demo AWS Account', '123456789012', '{}'::jsonb, ARRAY['us-east-1', 'us-west-2'], true) ON CONFLICT (id) DO NOTHING;
