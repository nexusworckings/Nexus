import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './event-bus.js';

describe('EventBus', () => {
  describe('constructor', () => {
    it('creates an empty bus', () => {
      const bus = new EventBus();
      expect(bus).toBeInstanceOf(EventBus);
    });
  });

  describe('subscribe and publish', () => {
    it('calls handlers when event is published', () => {
      const bus = new EventBus();
      const handler = vi.fn();
      bus.subscribe('TEST_EVENT', handler);
      bus.publish('TEST_EVENT', { data: 'hello' });
      expect(handler).toHaveBeenCalledWith({ data: 'hello' });
    });

    it('calls multiple handlers for the same event', () => {
      const bus = new EventBus();
      const h1 = vi.fn();
      const h2 = vi.fn();
      bus.subscribe('TEST_EVENT', h1);
      bus.subscribe('TEST_EVENT', h2);
      bus.publish('TEST_EVENT', {});
      expect(h1).toHaveBeenCalledOnce();
      expect(h2).toHaveBeenCalledOnce();
    });

    it('does not call handlers for different event types', () => {
      const bus = new EventBus();
      const handler = vi.fn();
      bus.subscribe('EVENT_A', handler);
      bus.publish('EVENT_B', {});
      expect(handler).not.toHaveBeenCalled();
    });

    it('does nothing when no handlers for type', () => {
      const bus = new EventBus();
      expect(() => bus.publish('UNKNOWN', {})).not.toThrow();
    });

    it('passes payload to handler', () => {
      const bus = new EventBus();
      const handler = vi.fn();
      bus.subscribe('DATA', handler);
      const payload = { id: 1, name: 'test' };
      bus.publish('DATA', payload);
      expect(handler).toHaveBeenCalledWith(payload);
    });
  });

  describe('unsubscribe', () => {
    it('removes handler and stops receiving events', () => {
      const bus = new EventBus();
      const handler = vi.fn();
      bus.subscribe('TEST', handler);
      bus.unsubscribe('TEST', handler);
      bus.publish('TEST', {});
      expect(handler).not.toHaveBeenCalled();
    });

    it('returns unsubscribe function from subscribe', () => {
      const bus = new EventBus();
      const handler = vi.fn();
      const unsubscribe = bus.subscribe('TEST', handler);
      unsubscribe();
      bus.publish('TEST', {});
      expect(handler).not.toHaveBeenCalled();
    });

    it('does nothing when unsubscribing unknown handler', () => {
      const bus = new EventBus();
      expect(() => bus.unsubscribe('TEST', vi.fn())).not.toThrow();
    });

    it('does nothing when unsubscribing from unknown type', () => {
      const bus = new EventBus();
      expect(() => bus.unsubscribe('NONEXISTENT', vi.fn())).not.toThrow();
    });
  });

  describe('error isolation', () => {
    it('continues with other handlers when one throws', () => {
      const bus = new EventBus();
      const throwing = vi.fn(() => { throw new Error('fail'); });
      const normal = vi.fn();
      bus.subscribe('TEST', throwing);
      bus.subscribe('TEST', normal);

      expect(() => bus.publish('TEST', {})).not.toThrow();
      expect(normal).toHaveBeenCalled();
    });

    it('continues with other handlers when async one rejects', () => {
      const bus = new EventBus();
      const rejecting = vi.fn(async () => { throw new Error('async fail'); });
      const normal = vi.fn();
      bus.subscribe('TEST', rejecting);
      bus.subscribe('TEST', normal);

      expect(() => bus.publish('TEST', {})).not.toThrow();
      expect(normal).toHaveBeenCalled();
    });
  });
});
