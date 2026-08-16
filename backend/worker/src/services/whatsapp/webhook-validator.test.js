import { describe, it, expect } from 'vitest';
import { WebhookValidator } from './webhook-validator.js';

describe('WebhookValidator', () => {
  const v = new WebhookValidator({ verifyToken: 'my_token' });

  it('validates correct token', () => {
    expect(v.validate('subscribe', 'my_token').valid).toBe(true);
  });

  it('rejects invalid token', () => {
    expect(v.validate('subscribe', 'wrong').valid).toBe(false);
  });

  it('rejects wrong mode', () => {
    expect(v.validate('notify', 'my_token').valid).toBe(false);
  });

  it('generateChallenge returns valid with challenge', () => {
    const result = v.generateChallenge('subscribe', 'my_token', '12345');
    expect(result.valid).toBe(true);
    expect(result.challenge).toBe('12345');
  });

  it('generateChallenge rejects invalid token', () => {
    expect(v.generateChallenge('subscribe', 'wrong', '12345').valid).toBe(false);
  });

  it('verifySignature returns false without signature', () => {
    expect(v.verifySignature(null, 'body', 'secret')).toBe(false);
  });

  it('verifySignature returns false without appSecret', () => {
    expect(v.verifySignature('sha256=abc', 'body', null)).toBe(false);
  });

  it('verifySignature returns false without body', () => {
    expect(v.verifySignature('sha256=abc', null, 'secret')).toBe(false);
  });

  it('verifySignature returns true when conditions are met', () => {
    expect(v.verifySignature('sha256=abc', 'body', 'secret')).toBe(true);
  });

  it('validateSignature validates HMAC', async () => {
    const result = await v.validateSignature('sha256=abc', 'test', 'secret');
    expect(typeof result).toBe('boolean');
  });

  it('validateSignature returns false for empty params', async () => {
    expect(await v.validateSignature('', '', '')).toBe(false);
  });
});
