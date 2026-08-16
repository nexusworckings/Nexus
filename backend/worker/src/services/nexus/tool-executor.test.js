import { describe, it, expect, vi } from 'vitest';
import { ToolExecutor } from './tool-executor.js';
import { ToolRegistry } from './tool-registry.js';

function makeRegistry(tools = []) {
  const r = new ToolRegistry();
  for (const t of tools) r.register(t);
  return r;
}

describe('ToolExecutor', () => {
  it('throws without registry', () => {
    expect(() => new ToolExecutor()).toThrow('toolRegistry is required');
  });

  it('returns error for unknown tool', async () => {
    const registry = makeRegistry();
    const exec = new ToolExecutor({ toolRegistry: registry });
    const result = await exec.execute('nope');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('executes a valid tool', async () => {
    const tool = { name: 'hello', execute: vi.fn().mockResolvedValue('world') };
    const exec = new ToolExecutor({ toolRegistry: makeRegistry([tool]) });
    const result = await exec.execute('hello');
    expect(result.success).toBe(true);
    expect(result.data).toBe('world');
  });

  it('captures error from tool', async () => {
    const tool = { name: 'fail', execute: vi.fn().mockRejectedValue(new Error('boom')) };
    const exec = new ToolExecutor({ toolRegistry: makeRegistry([tool]) });
    const result = await exec.execute('fail');
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('requires required params', async () => {
    const tool = { name: 'req', inputSchema: { name: { type: 'string', required: true } }, execute: vi.fn() };
    const exec = new ToolExecutor({ toolRegistry: makeRegistry([tool]) });
    const result = await exec.execute('req', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required');
  });

  it('validates param type mismatch', async () => {
    const tool = { name: 'typed', inputSchema: { age: { type: 'number', required: true } }, execute: vi.fn() };
    const exec = new ToolExecutor({ toolRegistry: makeRegistry([tool]) });
    const result = await exec.execute('typed', { age: 'not-a-number' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('expected number');
  });

  it('passes validation for optional params', async () => {
    const tool = { name: 'opt', inputSchema: { x: { type: 'string' } }, execute: vi.fn().mockResolvedValue('ok') };
    const exec = new ToolExecutor({ toolRegistry: makeRegistry([tool]) });
    const result = await exec.execute('opt', {});
    expect(result.success).toBe(true);
  });

  it('tracks metrics on success', async () => {
    const tool = { name: 'm', execute: vi.fn().mockResolvedValue('ok') };
    const exec = new ToolExecutor({ toolRegistry: makeRegistry([tool]) });
    await exec.execute('m');
    const m = exec.getMetrics();
    expect(m.executed).toBe(1);
    expect(m.succeeded).toBe(1);
    expect(m.failed).toBe(0);
  });

  it('tracks metrics on failure', async () => {
    const tool = { name: 'm', execute: vi.fn().mockRejectedValue(new Error('fail')) };
    const exec = new ToolExecutor({ toolRegistry: makeRegistry([tool]) });
    await exec.execute('m');
    const m = exec.getMetrics();
    expect(m.executed).toBe(1);
    expect(m.succeeded).toBe(0);
    expect(m.failed).toBe(1);
  });

  it('tracks per-tool metrics', async () => {
    const tool = { name: 'pt', execute: vi.fn().mockResolvedValue('ok') };
    const exec = new ToolExecutor({ toolRegistry: makeRegistry([tool]) });
    await exec.execute('pt');
    expect(exec.getMetrics().byTool.pt.succeeded).toBe(1);
  });

  it('resetMetrics clears all', async () => {
    const tool = { name: 'r', execute: vi.fn().mockResolvedValue('ok') };
    const exec = new ToolExecutor({ toolRegistry: makeRegistry([tool]) });
    await exec.execute('r');
    exec.resetMetrics();
    const m = exec.getMetrics();
    expect(m.executed).toBe(0);
    expect(m.succeeded).toBe(0);
  });

  it('passes context to execute', async () => {
    const tool = { name: 'ctx', execute: vi.fn().mockResolvedValue('ok') };
    const exec = new ToolExecutor({ toolRegistry: makeRegistry([tool]) });
    await exec.execute('ctx', {}, { clientId: '123' });
    expect(tool.execute).toHaveBeenCalledWith({}, { clientId: '123' });
  });

  it('works with async tool returning promise', async () => {
    const tool = { name: 'async', execute: vi.fn().mockResolvedValue('done') };
    const exec = new ToolExecutor({ toolRegistry: makeRegistry([tool]) });
    const result = await exec.execute('async');
    expect(result.data).toBe('done');
  });

  it('skips validation when no inputSchema', async () => {
    const tool = { name: 'noschema', execute: vi.fn().mockResolvedValue('ok') };
    const exec = new ToolExecutor({ toolRegistry: makeRegistry([tool]) });
    const result = await exec.execute('noschema', { anything: 'goes' });
    expect(result.success).toBe(true);
  });

  it('handles multiple sequential calls', async () => {
    const tool = { name: 'seq', execute: vi.fn().mockResolvedValue('ok') };
    const exec = new ToolExecutor({ toolRegistry: makeRegistry([tool]) });
    await exec.execute('seq');
    await exec.execute('seq');
    await exec.execute('seq');
    expect(exec.getMetrics().executed).toBe(3);
  });

  it('captures error without message', async () => {
    const tool = { name: 'empty', execute: vi.fn().mockRejectedValue(new Error()) };
    const exec = new ToolExecutor({ toolRegistry: makeRegistry([tool]) });
    const result = await exec.execute('empty');
    expect(result.success).toBe(false);
  });

  it('returns toolName in result', async () => {
    const tool = { name: 'named', execute: vi.fn().mockResolvedValue('ok') };
    const exec = new ToolExecutor({ toolRegistry: makeRegistry([tool]) });
    const result = await exec.execute('named');
    expect(result.toolName).toBe('named');
  });
});
