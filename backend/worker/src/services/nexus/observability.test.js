import { describe, it, expect, vi } from 'vitest';
import { MetricsCollector } from './observability.js';

describe('MetricsCollector (Observability)', () => {
  it('starts with zero metrics', () => {
    const mc = new MetricsCollector();
    const s = mc.snapshot();
    expect(s.engine.calls).toBe(0);
    expect(s.engine.plans).toBe(0);
    expect(s.engine.tools).toBe(0);
    expect(s.engine.errors).toBe(0);
  });

  it('records engine calls by profile', () => {
    const mc = new MetricsCollector();
    mc.recordEngineCall('admin', 'session-1');
    const s = mc.snapshot();
    expect(s.engine.calls).toBe(1);
    expect(s.profile.admin.calls).toBe(1);
  });

  it('records plans', () => {
    const mc = new MetricsCollector();
    mc.recordPlan('customer', [{ tool: 'searchClient', params: { query: 'test' } }]);
    const s = mc.snapshot();
    expect(s.engine.plans).toBe(1);
    expect(s.byPlan).toHaveLength(1);
  });

  it('records tool execution', () => {
    const mc = new MetricsCollector();
    mc.recordToolExecution('searchClient', 50, true);
    mc.recordToolExecution('searchClient', 30, true);
    mc.recordToolExecution('sendWhatsApp', 100, false, 'network error');
    const s = mc.snapshot();
    expect(s.engine.tools).toBe(3);
    expect(s.byTool.searchClient.calls).toBe(2);
    expect(s.byTool.sendWhatsApp.errors).toBe(1);
    expect(s.engine.errors).toBe(1);
  });

  it('records tokens', () => {
    const mc = new MetricsCollector();
    mc.recordTokens(150);
    mc.recordTokens(200);
    expect(mc.snapshot().engine.tokens).toBe(350);
  });

  it('records errors with profile', () => {
    const mc = new MetricsCollector();
    mc.recordEngineCall('admin', 's1');
    mc.recordError('admin', new Error('test error'));
    const s = mc.snapshot();
    expect(s.engine.errors).toBe(1);
    expect(s.history).toHaveLength(1);
    expect(s.history[0].error).toBe('test error');
  });

  it('summary returns aggregated data', () => {
    const mc = new MetricsCollector();
    mc.recordEngineCall('admin', 's1');
    mc.recordEngineCall('customer', 's2');
    mc.recordToolExecution('toolA', 100, true);
    mc.recordToolExecution('toolA', 200, true);
    mc.recordToolExecution('toolB', 50, false, 'fail');
    const sum = mc.summary();
    expect(sum.totalCalls).toBe(2);
    expect(sum.totalTools).toBe(3);
    expect(sum.totalErrors).toBe(1);
    expect(sum.byTool).toHaveLength(2);
    const toolA = sum.byTool.find(t => t.tool === 'toolA');
    expect(toolA.avgMs).toBe(150);
  });

  it('reset clears all metrics', () => {
    const mc = new MetricsCollector();
    mc.recordEngineCall('admin', 's1');
    mc.reset();
    const s = mc.snapshot();
    expect(s.engine.calls).toBe(0);
  });

  it('calls registered listeners', () => {
    const mc = new MetricsCollector();
    const listener = vi.fn();
    mc.onEvent(listener);
    mc.recordEngineCall('admin', 's1');
    expect(listener).toHaveBeenCalledWith('engine.call', { profile: 'admin', sessionId: 's1' });
  });

  it('handles listener exceptions gracefully', () => {
    const mc = new MetricsCollector();
    mc.onEvent(() => { throw new Error('listener error'); });
    expect(() => mc.recordEngineCall('admin', 's1')).not.toThrow();
  });

  it('recordError with string error', () => {
    const mc = new MetricsCollector();
    mc.recordError('customer', 'string error');
    const s = mc.snapshot();
    expect(s.history[0].error).toBe('string error');
  });

  it('multiple profiles tracked independently', () => {
    const mc = new MetricsCollector();
    mc.recordEngineCall('admin', 's1');
    mc.recordEngineCall('customer', 's2');
    mc.recordEngineCall('interview', 's3');
    mc.recordEngineCall('admin', 's4');
    const s = mc.snapshot();
    expect(s.profile.admin.calls).toBe(2);
    expect(s.profile.customer.calls).toBe(1);
    expect(s.profile.interview.calls).toBe(1);
  });
});
