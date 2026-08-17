-- ============================================================
-- Migration 002: Add unique constraints and performance indexes
-- ============================================================

-- Unique constraint so scanner can upsert resources
ALTER TABLE resources
    ADD CONSTRAINT uq_resource_id_account
    UNIQUE (resource_id, account_id);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_resources_provider        ON resources(provider);
CREATE INDEX IF NOT EXISTS idx_resources_monthly_cost    ON resources(monthly_cost DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_savings   ON recommendations(monthly_savings DESC);
CREATE INDEX IF NOT EXISTS idx_cost_history_date         ON cost_history(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant_unread      ON alerts(tenant_id, is_read) WHERE is_read = FALSE;

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recommendations_updated_at
    BEFORE UPDATE ON recommendations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
