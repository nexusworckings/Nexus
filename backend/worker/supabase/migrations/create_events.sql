CREATE TABLE IF NOT EXISTS events (
  id            UUID PRIMARY KEY,
  event_id      UUID NOT NULL,
  type          TEXT NOT NULL,
  entity_id     UUID,
  client_id     UUID REFERENCES clients(id),
  payload       JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending',
  attempts      INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_event_id ON events (event_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events (status);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (type);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_events_select"
  ON events FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_events_insert"
  ON events FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_events_update"
  ON events FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_events_delete"
  ON events FOR DELETE USING (auth.role() = 'service_role');
