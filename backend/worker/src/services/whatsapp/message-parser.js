export class MessageParser {
  parse(payload) {
    if (!payload?.entry) return [];

    const messages = [];
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value || {};

        for (const msg of value.messages || []) {
          messages.push(this.#parseMessage(msg, value));
        }

        for (const status of value.statuses || []) {
          messages.push(this.#parseStatus(status, value));
        }
      }
    }
    return messages;
  }

  parseSingle(payload) {
    const results = this.parse(payload);
    return results.length > 0 ? results[0] : null;
  }

  #parseMessage(msg, value) {
    const parsed = {
      messageId: msg.id,
      phone: msg.from,
      clientName: value.contacts?.[0]?.profile?.name || null,
      timestamp: msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000).toISOString() : new Date().toISOString(),
      type: this.#getMessageType(msg),
      text: null,
      media: null,
      metadata: {
        waId: msg.id,
        from: msg.from,
        context: msg.context || null,
        replyTo: msg.context?.id || null,
        isForwarded: !!msg.context?.forwarded,
        isFromMe: false,
      },
    };

    if (msg.type === 'text' && msg.text) {
      parsed.text = msg.text.body;
    }

    const mediaTypes = ['image', 'document', 'audio', 'video', 'sticker'];
    for (const mediaType of mediaTypes) {
      if (msg[mediaType]) {
        parsed.media = {
          type: mediaType,
          id: msg[mediaType].id,
          mimeType: msg[mediaType].mime_type || null,
          caption: msg[mediaType].caption || null,
          fileName: msg[mediaType].filename || null,
          fileSize: msg[mediaType].file_size ? parseInt(msg[mediaType].file_size) : null,
          sha256: msg[mediaType].sha256 || null,
        };
        if (mediaType === 'audio') {
          parsed.media.duration = msg.audio?.duration || null;
          parsed.media.voice = msg.audio?.voice || false;
        }
        break;
      }
    }

    if (msg.type === 'location' && msg.location) {
      parsed.media = {
        type: 'location',
        latitude: msg.location.latitude,
        longitude: msg.location.longitude,
        name: msg.location.name || null,
        address: msg.location.address || null,
      };
    }

    if (msg.type === 'contacts' && msg.contacts) {
      parsed.contacts = msg.contacts.map(c => ({
        name: c.name?.formatted_name || c.name?.full_name || null,
        phones: (c.phones || []).map(p => p.phone),
        emails: (c.emails || []).map(e => e.email),
      }));
    }

    if (msg.type === 'button' && msg.button) {
      parsed.type = 'button';
      parsed.text = msg.button.text;
      parsed.metadata.buttonPayload = msg.button.payload;
    }

    if (msg.type === 'interactive' && msg.interactive) {
      parsed.type = 'interactive';
      if (msg.interactive.button_reply) {
        parsed.text = msg.interactive.button_reply.title;
        parsed.metadata.interactiveId = msg.interactive.button_reply.id;
      }
      if (msg.interactive.list_reply) {
        parsed.text = msg.interactive.list_reply.title;
        parsed.metadata.interactiveId = msg.interactive.list_reply.id;
      }
    }

    if (msg.type === 'order' && msg.order) {
      parsed.type = 'order';
      parsed.text = `Pedido: ${msg.order.catalog_id || ''}`;
      parsed.metadata.order = msg.order;
    }

    if (msg.type === 'system' && msg.system) {
      parsed.type = 'system';
      parsed.text = msg.system.body || 'Mensaje del sistema';
      parsed.metadata.systemType = msg.system.type;
    }

    if (msg.type === 'unknown') {
      parsed.type = 'unknown';
    }

    return parsed;
  }

  #parseStatus(status, value) {
    return {
      messageId: status.id,
      phone: status.recipient_id || value.metadata?.display_phone_number || null,
      clientName: null,
      timestamp: status.timestamp ? new Date(parseInt(status.timestamp) * 1000).toISOString() : new Date().toISOString(),
      type: 'status',
      text: null,
      media: null,
      metadata: {
        waId: status.id,
        status: status.status,
        statusDescription: status.status,
        pricing: status.pricing || null,
        conversation: status.conversation || null,
        isFromMe: true,
      },
    };
  }

  #getMessageType(msg) {
    if (!msg || !msg.type) return 'unknown';
    const type = msg.type;
    if (['text', 'image', 'document', 'audio', 'video', 'sticker', 'location', 'contacts', 'button', 'interactive', 'order', 'system'].includes(type)) {
      return type;
    }
    return 'unknown';
  }
}
