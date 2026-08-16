CREATE TABLE IF NOT EXISTS print_orders (
  id          UUID PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  material    TEXT NOT NULL,
  colors      JSONB NOT NULL DEFAULT '[]',
  quantity    INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'printing', 'completed', 'cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_orders_session_id ON print_orders (session_id);
CREATE INDEX IF NOT EXISTS idx_print_orders_status ON print_orders (status);

CREATE OR REPLACE FUNCTION update_print_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_print_orders_updated_at ON print_orders;
CREATE TRIGGER trg_print_orders_updated_at
  BEFORE UPDATE ON print_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_print_orders_updated_at();

ALTER TABLE print_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_print_orders_select"
  ON print_orders FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_print_orders_insert"
  ON print_orders FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_print_orders_update"
  ON print_orders FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_print_orders_delete"
  ON print_orders FOR DELETE USING (auth.role() = 'service_role');
