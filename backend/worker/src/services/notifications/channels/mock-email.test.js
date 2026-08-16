import { describe, it, expect } from 'vitest';
import { MockEmailChannel } from './mock-email.js';

describe('MockEmailChannel', () => {
  it('sends email and stores it', async () => {
    const ch = new MockEmailChannel();
    const result = await ch.send({ to: 'test@test.com', subject: 'Test', message: 'Hello' });
    expect(result.success).toBe(true);
    expect(result.id).toBe(1);
  });

  it('stores multiple sent emails', async () => {
    const ch = new MockEmailChannel();
    await ch.send({ to: 'a@test.com', subject: 'A', message: 'Msg A' });
    await ch.send({ to: 'b@test.com', subject: 'B', message: 'Msg B' });

    const sent = ch.getSent();
    expect(sent.length).toBe(2);
    expect(sent[0].to).toBe('a@test.com');
    expect(sent[1].to).toBe('b@test.com');
  });

  it('getSent returns a copy', async () => {
    const ch = new MockEmailChannel();
    await ch.send({ to: 'a@test.com', subject: 'A', message: 'M' });

    const copy = ch.getSent();
    copy.length = 0;

    expect(ch.getSent().length).toBe(1);
  });

  it('clear removes all stored emails', async () => {
    const ch = new MockEmailChannel();
    await ch.send({ to: 'a@test.com', subject: 'A', message: 'M' });
    ch.clear();

    expect(ch.getSent().length).toBe(0);
  });

  it('includes sentAt timestamp', async () => {
    const ch = new MockEmailChannel();
    await ch.send({ to: 'a@test.com', subject: 'S', message: 'M' });
    const sent = ch.getSent();
    expect(sent[0].sentAt).toBeTruthy();
  });
});
