import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(__dirname, 'create_interview_sessions.sql');
const sql = readFileSync(sqlPath, 'utf8');

describe('create_interview_sessions.sql', () => {
  it('creates the interview_sessions table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS interview_sessions/);
  });

  it('has id as UUID primary key', () => {
    expect(sql).toMatch(/id\s+UUID PRIMARY KEY/i);
  });

  it('has schema_id column', () => {
    expect(sql).toMatch(/schema_id\s+TEXT NOT NULL/i);
  });

  it('has user_id column (nullable, for future auth)', () => {
    expect(sql).toMatch(/user_id\s+UUID NULL/i);
  });

  it('has status column with CHECK constraint', () => {
    expect(sql).toMatch(/status\s+TEXT NOT NULL DEFAULT 'active'/i);
    expect(sql).toMatch(/CHECK\s*\(\s*status\s+IN\s*\(\s*'active'\s*,\s*'completed'\s*,\s*'expired'\s*\)\s*\)/i);
  });

  it('has state as JSONB NOT NULL', () => {
    expect(sql).toMatch(/state\s+JSONB NOT NULL/i);
  });

  it('has schema as JSONB NOT NULL', () => {
    expect(sql).toMatch(/schema\s+JSONB NOT NULL/i);
  });

  it('has created_at with default now()', () => {
    expect(sql).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
  });

  it('has updated_at with default now()', () => {
    expect(sql).toMatch(/updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
  });

  describe('indexes', () => {
    it('creates index on schema_id', () => {
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_interview_sessions_schema_id\s+ON interview_sessions\s*\(schema_id\)/i);
    });

    it('creates index on status', () => {
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_interview_sessions_status\s+ON interview_sessions\s*\(status\)/i);
    });

    it('creates index on created_at DESC', () => {
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_interview_sessions_created_at\s+ON interview_sessions\s*\(created_at DESC\)/i);
    });

    it('creates partial index on user_id', () => {
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id\s+ON interview_sessions\s*\(user_id\)/i);
    });
  });

  describe('trigger', () => {
    it('creates the update function', () => {
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION update_interview_sessions_updated_at/i);
    });

    it('creates the trigger', () => {
      expect(sql).toMatch(/CREATE TRIGGER trg_interview_sessions_updated_at/i);
      expect(sql).toMatch(/BEFORE UPDATE ON interview_sessions/i);
      expect(sql).toMatch(/EXECUTE FUNCTION update_interview_sessions_updated_at/i);
    });
  });

  describe('Row Level Security', () => {
    it('enables RLS', () => {
      expect(sql).toMatch(/ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY/i);
    });

    it('creates SELECT policy for service_role', () => {
      expect(sql).toMatch(/CREATE POLICY "service_role_all_select"\s+ON interview_sessions\s+FOR SELECT\s+USING\s*\(auth\.role\(\)\s*=\s*'service_role'\)/i);
    });

    it('creates INSERT policy for service_role', () => {
      expect(sql).toMatch(/CREATE POLICY "service_role_all_insert"\s+ON interview_sessions\s+FOR INSERT\s+WITH CHECK\s*\(auth\.role\(\)\s*=\s*'service_role'\)/i);
    });

    it('creates UPDATE policy for service_role', () => {
      expect(sql).toMatch(/CREATE POLICY "service_role_all_update"\s+ON interview_sessions\s+FOR UPDATE/i);
    });

    it('creates DELETE policy for service_role', () => {
      expect(sql).toMatch(/CREATE POLICY "service_role_all_delete"\s+ON interview_sessions\s+FOR DELETE/i);
    });
  });
});
