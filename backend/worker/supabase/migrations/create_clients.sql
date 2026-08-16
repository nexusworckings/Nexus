CREATE TABLE IF NOT EXISTS clients (
  id         UUID PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  email      TEXT NULL,
  notes      TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients (phone);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients (email);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients (created_at DESC);

CREATE OR REPLACE FUNCTION update_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_clients_updated_at();

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_clients_select"
  ON clients FOR SELECT USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all_clients_insert"
  ON clients FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_clients_update"
  ON clients FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_role_all_clients_delete"
  ON clients FOR DELETE USING (auth.role() = 'service_role');

ALTER TABLE repairs ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);
ALTER TABLE print_orders ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

CREATE INDEX IF NOT EXISTS idx_repairs_client_id ON repairs (client_id);
CREATE INDEX IF NOT EXISTS idx_budgets_client_id ON budgets (client_id);
CREATE INDEX IF NOT EXISTS idx_print_orders_client_id ON print_orders (client_id);
