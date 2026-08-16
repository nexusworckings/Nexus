import { describe, it, expect } from 'vitest';
import { ToolRegistry } from './tool-registry.js';

describe('ToolRegistry', () => {
  it('registers a tool', () => {
    const r = new ToolRegistry();
    r.register({ name: 'test', execute: () => 'ok' });
    expect(r.count()).toBe(1);
  });

  it('throws on duplicate registration', () => {
    const r = new ToolRegistry();
    r.register({ name: 'test', execute: () => 'ok' });
    expect(() => r.register({ name: 'test', execute: () => 'ok' })).toThrow('already registered');
  });

  it('throws on missing name', () => {
    const r = new ToolRegistry();
    expect(() => r.register({ execute: () => 'ok' })).toThrow('must have a name');
  });

  it('throws on missing execute', () => {
    const r = new ToolRegistry();
    expect(() => r.register({ name: 'test' })).toThrow('must implement execute()');
  });

  it('gets tool by name', () => {
    const r = new ToolRegistry();
    const tool = { name: 'test', execute: () => 'ok' };
    r.register(tool);
    expect(r.get('test')).toBe(tool);
  });

  it('returns null for unknown tool', () => {
    const r = new ToolRegistry();
    expect(r.get('nope')).toBeNull();
  });

  it('lists all tools', () => {
    const r = new ToolRegistry();
    r.register({ name: 'a', execute: () => 1 });
    r.register({ name: 'b', execute: () => 2 });
    expect(r.list()).toHaveLength(2);
  });

  it('checks existence', () => {
    const r = new ToolRegistry();
    r.register({ name: 'x', execute: () => 0 });
    expect(r.exists('x')).toBe(true);
    expect(r.exists('y')).toBe(false);
  });

  it('returns all names', () => {
    const r = new ToolRegistry();
    r.register({ name: 'a', execute: () => 1 });
    r.register({ name: 'b', execute: () => 2 });
    expect(r.names()).toEqual(['a', 'b']);
  });

  it('counts tools', () => {
    const r = new ToolRegistry();
    expect(r.count()).toBe(0);
    r.register({ name: 'a', execute: () => 1 });
    expect(r.count()).toBe(1);
  });

  it('is chainable', () => {
    const r = new ToolRegistry();
    r.register({ name: 'a', execute: () => 1 }).register({ name: 'b', execute: () => 2 });
    expect(r.count()).toBe(2);
  });

  it('empty registry has no tools', () => {
    const r = new ToolRegistry();
    expect(r.list()).toEqual([]);
    expect(r.names()).toEqual([]);
  });

  it('registers tool with schema', () => {
    const r = new ToolRegistry();
    const tool = {
      name: 'withSchema',
      description: 'A test tool',
      inputSchema: { x: { type: 'string', required: true } },
      execute: () => 'ok',
    };
    r.register(tool);
    expect(r.get('withSchema').inputSchema).toBeDefined();
  });
});
