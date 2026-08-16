import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(__dirname, 'create_event_dlq.sql');
const sql = readFileSync(sqlPath, 'utf8');

describe('create_event_dlq.sql', () => {
  it('creates the event_dlq table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS event_dlq/);
  });

  it('has id as UUID PRIMARY KEY', () => {
    expect(sql).toMatch(/id\s+UUID PRIMARY KEY/i);
  });

  it('has event_id as UUID NOT NULL', () => {
    expect(sql).toMatch(/event_id\s+UUID NOT NULL/i);
  });

  it('has type as TEXT NOT NULL', () => {
    expect(sql).toMatch(/type\s+TEXT NOT NULL/i);
  });

  it('has error_message column', () => {
    expect(sql).toMatch(/error_message\s+TEXT/i);
  });

  it('has failed_at with default now()', () => {
    expect(sql).toMatch(/failed_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i);
  });

  it('has replayed_at nullable TIMESTAMPTZ', () => {
    expect(sql).toMatch(/replayed_at\s+TIMESTAMPTZ/i);
  });

  it('has status with default', () => {
    expect(sql).toMatch(/status\s+TEXT NOT NULL DEFAULT 'failed'/i);
  });

  it('has payload as JSONB', () => {
    expect(sql).toMatch(/payload\s+JSONB NOT NULL/i);
  });

  it('creates index on status', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_event_dlq_status/i);
  });

  it('creates index on failed_at DESC', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_event_dlq_failed_at/i);
  });

  it('creates index on event_id', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_event_dlq_event_id/i);
  });

  it('enables RLS', () => {
    expect(sql).toMatch(/ALTER TABLE event_dlq ENABLE ROW LEVEL SECURITY/i);
  });

  it('creates SELECT policy for service_role', () => {
    expect(sql).toMatch(/service_role_all_event_dlq_select/i);
  });

  it('creates INSERT policy for service_role', () => {
    expect(sql).toMatch(/service_role_all_event_dlq_insert/i);
  });

  it('creates UPDATE policy for service_role', () => {
    expect(sql).toMatch(/service_role_all_event_dlq_update/i);
  });

  it('creates DELETE policy for service_role', () => {
    expect(sql).toMatch(/service_role_all_event_dlq_delete/i);
  });
});
