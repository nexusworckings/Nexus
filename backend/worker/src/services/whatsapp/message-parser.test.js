import { describe, it, expect } from 'vitest';
import { MessageParser } from './message-parser.js';

describe('MessageParser', () => {
  const parser = new MessageParser();

  it('parses text message', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [{
              id: 'wa-1',
              from: '5492645555',
              timestamp: '1700000000',
              type: 'text',
              text: { body: 'Hola que tal' },
            }],
            contacts: [{ profile: { name: 'Juan' } }],
          },
        }],
      }],
    };
    const msgs = parser.parse(payload);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('wa-1');
    expect(msgs[0].phone).toBe('5492645555');
    expect(msgs[0].clientName).toBe('Juan');
    expect(msgs[0].type).toBe('text');
    expect(msgs[0].text).toBe('Hola que tal');
  });

  it('parses image message', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [{
              id: 'wa-img',
              from: '5492645555',
              timestamp: '1700000000',
              type: 'image',
              image: { id: 'img-1', mime_type: 'image/jpeg', caption: 'Foto' },
            }],
            contacts: [{ profile: { name: 'Maria' } }],
          },
        }],
      }],
    };
    const msgs = parser.parse(payload);
    expect(msgs[0].type).toBe('image');
    expect(msgs[0].media.type).toBe('image');
    expect(msgs[0].media.id).toBe('img-1');
    expect(msgs[0].media.caption).toBe('Foto');
  });

  it('parses document message', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [{
              id: 'wa-doc',
              from: '5492645555',
              timestamp: '1700000000',
              type: 'document',
              document: { id: 'doc-1', mime_type: 'application/pdf', filename: 'presupuesto.pdf' },
            }],
            contacts: [{ profile: { name: 'Test' } }],
          },
        }],
      }],
    };
    const msgs = parser.parse(payload);
    expect(msgs[0].type).toBe('document');
    expect(msgs[0].media.fileName).toBe('presupuesto.pdf');
  });

  it('parses audio message', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [{
              id: 'wa-audio',
              from: '5492645555',
              timestamp: '1700000000',
              type: 'audio',
              audio: { id: 'audio-1', mime_type: 'audio/ogg' },
            }],
            contacts: [{ profile: { name: 'Test' } }],
          },
        }],
      }],
    };
    const msgs = parser.parse(payload);
    expect(msgs[0].type).toBe('audio');
    expect(msgs[0].media.type).toBe('audio');
  });

  it('parses video message', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [{
              id: 'wa-vid',
              from: '5492645555',
              timestamp: '1700000000',
              type: 'video',
              video: { id: 'vid-1', mime_type: 'video/mp4' },
            }],
            contacts: [{ profile: { name: 'Test' } }],
          },
        }],
      }],
    };
    const msgs = parser.parse(payload);
    expect(msgs[0].type).toBe('video');
  });

  it('parses location message', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [{
              id: 'wa-loc',
              from: '5492645555',
              timestamp: '1700000000',
              type: 'location',
              location: { latitude: -31.5, longitude: -68.5, name: 'Local' },
            }],
            contacts: [{ profile: { name: 'Test' } }],
          },
        }],
      }],
    };
    const msgs = parser.parse(payload);
    expect(msgs[0].type).toBe('location');
    expect(msgs[0].media.latitude).toBe(-31.5);
  });

  it('parses contacts message', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [{
              id: 'wa-contact',
              from: '5492645555',
              timestamp: '1700000000',
              type: 'contacts',
              contacts: [{ name: { formatted_name: 'Pedro' }, phones: [{ phone: '5492647777' }] }],
            }],
            contacts: [{ profile: { name: 'Test' } }],
          },
        }],
      }],
    };
    const msgs = parser.parse(payload);
    expect(msgs[0].type).toBe('contacts');
    expect(msgs[0].contacts[0].name).toBe('Pedro');
  });

  it('parses button reply', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [{
              id: 'wa-btn',
              from: '5492645555',
              timestamp: '1700000000',
              type: 'button',
              button: { text: 'Sí', payload: 'confirm' },
            }],
            contacts: [{ profile: { name: 'Test' } }],
          },
        }],
      }],
    };
    const msgs = parser.parse(payload);
    expect(msgs[0].type).toBe('button');
    expect(msgs[0].text).toBe('Sí');
  });

  it('parses interactive button reply', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [{
              id: 'wa-interactive',
              from: '5492645555',
              timestamp: '1700000000',
              type: 'interactive',
              interactive: { button_reply: { id: 'btn-1', title: 'Aceptar' } },
            }],
            contacts: [{ profile: { name: 'Test' } }],
          },
        }],
      }],
    };
    const msgs = parser.parse(payload);
    expect(msgs[0].type).toBe('interactive');
    expect(msgs[0].text).toBe('Aceptar');
  });

  it('parses status update', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            statuses: [{
              id: 'status-1',
              recipient_id: '5492645555',
              timestamp: '1700000000',
              status: 'read',
            }],
          },
        }],
      }],
    };
    const msgs = parser.parse(payload);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].type).toBe('status');
    expect(msgs[0].metadata.status).toBe('read');
  });

  it('parses system message', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [{
              id: 'wa-sys',
              from: '5492645555',
              timestamp: '1700000000',
              type: 'system',
              system: { body: 'Customer changed number', type: 'customer_number_changed' },
            }],
            contacts: [{ profile: { name: 'Test' } }],
          },
        }],
      }],
    };
    const msgs = parser.parse(payload);
    expect(msgs[0].type).toBe('system');
  });

  it('parses order message', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [{
              id: 'wa-order',
              from: '5492645555',
              timestamp: '1700000000',
              type: 'order',
              order: { catalog_id: 'cat-1' },
            }],
            contacts: [{ profile: { name: 'Test' } }],
          },
        }],
      }],
    };
    const msgs = parser.parse(payload);
    expect(msgs[0].type).toBe('order');
  });

  it('parses sticker message', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [{
              id: 'wa-sticker',
              from: '5492645555',
              timestamp: '1700000000',
              type: 'sticker',
              sticker: { id: 'sticker-1', mime_type: 'image/webp' },
            }],
            contacts: [{ profile: { name: 'Test' } }],
          },
        }],
      }],
    };
    const msgs = parser.parse(payload);
    expect(msgs[0].type).toBe('sticker');
  });

  it('handles unknown message type', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [{ id: 'wa-unk', from: '5492645555', timestamp: '1700000000', type: 'unknown' }],
            contacts: [{ profile: { name: 'Test' } }],
          },
        }],
      }],
    };
    const msgs = parser.parse(payload);
    expect(msgs[0].type).toBe('unknown');
  });

  it('handles null payload', () => {
    expect(parser.parse(null)).toEqual([]);
  });

  it('handles empty entry', () => {
    expect(parser.parse({ entry: [] })).toEqual([]);
  });

  it('handles missing messages field', () => {
    const payload = { entry: [{ changes: [{ field: 'messages', value: {} }] }] };
    const msgs = parser.parse(payload);
    expect(msgs).toEqual([]);
  });

  it('parseSingle returns first message', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [{ id: 'wa-1', from: '5492645555', timestamp: '1700000000', type: 'text', text: { body: 'Hola' } }],
            contacts: [{ profile: { name: 'Test' } }],
          },
        }],
      }],
    };
    const msg = parser.parseSingle(payload);
    expect(msg.messageId).toBe('wa-1');
  });

  it('parseSingle returns null for empty payload', () => {
    expect(parser.parseSingle({ entry: [] })).toBeNull();
  });

  it('parses forwarded context', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [{
              id: 'wa-fwd',
              from: '5492645555',
              timestamp: '1700000000',
              type: 'text',
              text: { body: 'Reenviado' },
              context: { forwarded: true, id: 'orig-msg' },
            }],
            contacts: [{ profile: { name: 'Test' } }],
          },
        }],
      }],
    };
    const msgs = parser.parse(payload);
    expect(msgs[0].metadata.isForwarded).toBe(true);
    expect(msgs[0].metadata.replyTo).toBe('orig-msg');
  });

  it('parses multiple messages in one payload', () => {
    const payload = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [
              { id: 'wa-1', from: '5492645555', timestamp: '1700000000', type: 'text', text: { body: 'Primero' } },
              { id: 'wa-2', from: '5492645555', timestamp: '1700000001', type: 'text', text: { body: 'Segundo' } },
            ],
            contacts: [{ profile: { name: 'Test' } }],
          },
        }],
      }],
    };
    expect(parser.parse(payload)).toHaveLength(2);
  });
});
