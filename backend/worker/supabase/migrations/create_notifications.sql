CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY,
  client_id       UUID REFERENCES clients(id),
  type            TEXT NOT NULL,
  channel         TEXT NOT NULL DEFAULT 'email',
  status          TEXT NOT NULL DEFAULT 'pending',
  message         TEXT NOT NULL,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_client_id ON notifications (client_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications (type);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications (status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_notifications_select"
  ON notifications FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_notifications_insert"
  ON notifications FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_notifications_update"
  ON notifications FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_notifications_delete"
  ON notifications FOR DELETE USING (auth.role() = 'service_role');
