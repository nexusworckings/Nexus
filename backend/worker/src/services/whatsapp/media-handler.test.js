import { describe, it, expect, vi } from 'vitest';
import { MediaHandler } from './media-handler.js';

describe('MediaHandler', () => {
  it('downloadMedia delegates to channel', async () => {
    const channel = { downloadMedia: vi.fn().mockResolvedValue({ mediaId: 'm1', data: 'data' }) };
    const mh = new MediaHandler({ channel });
    const result = await mh.downloadMedia('m1');
    expect(result.mediaId).toBe('m1');
  });

  it('downloadMedia throws without channel', async () => {
    const mh = new MediaHandler({});
    await expect(mh.downloadMedia('m1')).rejects.toThrow('WhatsApp channel not available');
  });

  it('getMediaUrl delegates to channel', async () => {
    const channel = { getMediaUrl: vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/img' }) };
    const mh = new MediaHandler({ channel });
    const result = await mh.getMediaUrl('m1');
    expect(result.url).toBe('https://cdn.example.com/img');
  });

  it('getMediaUrl throws without channel', async () => {
    const mh = new MediaHandler({});
    await expect(mh.getMediaUrl('m1')).rejects.toThrow('WhatsApp channel not available');
  });

  it('storeReference returns media info', async () => {
    const channel = { getMediaUrl: vi.fn().mockResolvedValue({ mediaId: 'm1', url: 'https://cdn.example.com/img', mimeType: 'image/jpeg', fileSize: 1000, fileName: 'foto.jpg' }) };
    const mh = new MediaHandler({ channel });
    const result = await mh.storeReference('m1');
    expect(result.mediaId).toBe('m1');
    expect(result.url).toBe('https://cdn.example.com/img');
    expect(result.storedAt).toBeTruthy();
  });

  it('storeReference handles error gracefully', async () => {
    const channel = { getMediaUrl: vi.fn().mockRejectedValue(new Error('fail')) };
    const mh = new MediaHandler({ channel });
    const result = await mh.storeReference('m1');
    expect(result.mediaId).toBe('m1');
    expect(result.url).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('getMediaType classifies correctly', () => {
    const mh = new MediaHandler({});
    expect(mh.getMediaType('image/jpeg')).toBe('image');
    expect(mh.getMediaType('video/mp4')).toBe('video');
    expect(mh.getMediaType('audio/ogg')).toBe('audio');
    expect(mh.getMediaType('application/pdf')).toBe('document');
    expect(mh.getMediaType('text/plain')).toBe('other');
    expect(mh.getMediaType(null)).toBe('unknown');
  });

  it('isSupported checks supported types', () => {
    const mh = new MediaHandler({});
    expect(mh.isSupported('m1', 'image/jpeg')).toBe(true);
    expect(mh.isSupported('m1', 'video/mp4')).toBe(true);
    expect(mh.isSupported('m1', 'application/pdf')).toBe(true);
    expect(mh.isSupported('m1', 'text/plain')).toBe(false);
  });
});
