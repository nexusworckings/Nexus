CREATE TABLE IF NOT EXISTS admin_activity_log (
  id         UUID PRIMARY KEY,
  user_id    UUID NOT NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  UUID,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_log_user_id ON admin_activity_log (user_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_entity ON admin_activity_log (entity);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_created_at ON admin_activity_log (created_at DESC);

ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_activity_log_select"
  ON admin_activity_log FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_activity_log_insert"
  ON admin_activity_log FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_activity_log_delete"
  ON admin_activity_log FOR DELETE USING (auth.role() = 'service_role');
