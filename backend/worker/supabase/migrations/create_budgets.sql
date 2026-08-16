CREATE TABLE IF NOT EXISTS budgets (
  id          UUID PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  description TEXT NOT NULL,
  contact     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budgets_session_id ON budgets (session_id);
CREATE INDEX IF NOT EXISTS idx_budgets_status ON budgets (status);

CREATE OR REPLACE FUNCTION update_budgets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_budgets_updated_at ON budgets;
CREATE TRIGGER trg_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_budgets_updated_at();

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_budgets_select"
  ON budgets FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_budgets_insert"
  ON budgets FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_budgets_update"
  ON budgets FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_budgets_delete"
  ON budgets FOR DELETE USING (auth.role() = 'service_role');
