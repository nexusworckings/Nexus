CREATE TABLE IF NOT EXISTS event_dlq (
  id            UUID PRIMARY KEY,
  event_id      UUID NOT NULL,
  type          TEXT NOT NULL,
  entity_id     UUID,
  client_id     UUID REFERENCES clients(id),
  payload       JSONB NOT NULL DEFAULT '{}',
  attempts      INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  failed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  replayed_at   TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'failed'
);

CREATE INDEX IF NOT EXISTS idx_event_dlq_status ON event_dlq (status);
CREATE INDEX IF NOT EXISTS idx_event_dlq_failed_at ON event_dlq (failed_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_dlq_event_id ON event_dlq (event_id);

ALTER TABLE event_dlq ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_event_dlq_select"
  ON event_dlq FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_event_dlq_insert"
  ON event_dlq FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_event_dlq_update"
  ON event_dlq FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_event_dlq_delete"
  ON event_dlq FOR DELETE USING (auth.role() = 'service_role');
