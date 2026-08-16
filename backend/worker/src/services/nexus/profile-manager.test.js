import { describe, it, expect } from 'vitest';
import { ProfileManager } from './profile-manager.js';

describe('ProfileManager', () => {
  it('has default customer profile', () => {
    const pm = new ProfileManager();
    expect(pm.exists('customer')).toBe(true);
  });

  it('has default admin profile', () => {
    const pm = new ProfileManager();
    expect(pm.exists('admin')).toBe(true);
  });

  it('has default interview profile', () => {
    const pm = new ProfileManager();
    expect(pm.exists('interview')).toBe(true);
  });

  it('returns null for unknown profile', () => {
    const pm = new ProfileManager();
    expect(pm.get('nope')).toBeNull();
  });

  it('exists returns true for known profile', () => {
    const pm = new ProfileManager();
    expect(pm.exists('customer')).toBe(true);
  });

  it('exists returns false for unknown profile', () => {
    const pm = new ProfileManager();
    expect(pm.exists('ghost')).toBe(false);
  });

  it('registers a custom profile', () => {
    const pm = new ProfileManager();
    pm.register({ id: 'custom', systemPrompt: 'You are custom' });
    const p = pm.get('custom');
    expect(p).not.toBeNull();
    expect(p.systemPrompt).toBe('You are custom');
  });

  it('throws on duplicate registration', () => {
    const pm = new ProfileManager();
    expect(() => pm.register({ id: 'customer', systemPrompt: 'dup' })).toThrow('already registered');
  });

  it('throws on missing id', () => {
    const pm = new ProfileManager();
    expect(() => pm.register({ systemPrompt: 'no id' })).toThrow('must have an id');
  });

  it('lists all profiles', () => {
    const pm = new ProfileManager();
    const list = pm.list();
    const ids = list.map(p => p.id);
    expect(ids).toContain('customer');
    expect(ids).toContain('admin');
    expect(ids).toContain('interview');
  });

  it('ids returns all profile ids', () => {
    const pm = new ProfileManager();
    const ids = pm.ids();
    expect(ids).toContain('customer');
    expect(ids).toContain('admin');
    expect(ids).toContain('interview');
  });

  it('count returns number of profiles', () => {
    const pm = new ProfileManager();
    expect(pm.count()).toBe(3);
    pm.register({ id: 'extra', systemPrompt: 'extra' });
    expect(pm.count()).toBe(4);
  });

  it('customer has limited tools', () => {
    const pm = new ProfileManager();
    const p = pm.get('customer');
    expect(p.allowedTools).not.toContain('updateRepairStatus');
    expect(p.allowedTools).toContain('searchClient');
    expect(p.allowedTools).toContain('searchPrice');
  });

  it('admin has full tools', () => {
    const pm = new ProfileManager();
    const p = pm.get('admin');
    expect(p.allowedTools).toContain('updateRepairStatus');
    expect(p.allowedTools).toContain('sendWhatsApp');
    expect(p.allowedTools).toContain('searchInternet');
  });

  it('admin has modify permissions', () => {
    const pm = new ProfileManager();
    const p = pm.get('admin');
    expect(p.permissions.canModify).toBe(true);
  });

  it('customer cannot modify', () => {
    const pm = new ProfileManager();
    const p = pm.get('customer');
    expect(p.permissions.canModify).toBe(false);
  });

  it('interview has canCreate permission', () => {
    const pm = new ProfileManager();
    const p = pm.get('interview');
    expect(p.permissions.canCreate).toBe(true);
  });
});
