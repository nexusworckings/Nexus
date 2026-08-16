CREATE TABLE IF NOT EXISTS repairs (
  id         UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  device     TEXT NOT NULL,
  problem    TEXT NOT NULL,
  urgency    TEXT NOT NULL DEFAULT 'normal',
  status     TEXT NOT NULL DEFAULT 'received'
             CHECK (status IN ('received', 'diagnosing', 'repairing', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repairs_session_id ON repairs (session_id);
CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs (status);

CREATE OR REPLACE FUNCTION update_repairs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_repairs_updated_at ON repairs;
CREATE TRIGGER trg_repairs_updated_at
  BEFORE UPDATE ON repairs
  FOR EACH ROW
  EXECUTE FUNCTION update_repairs_updated_at();

ALTER TABLE repairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_repairs_select"
  ON repairs FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_repairs_insert"
  ON repairs FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_repairs_update"
  ON repairs FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_repairs_delete"
  ON repairs FOR DELETE USING (auth.role() = 'service_role');
