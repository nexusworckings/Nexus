import { WhatsAppChannel } from '../notifications/channels/whatsapp-channel.js';

export class MetaWhatsAppChannel extends WhatsAppChannel {
  constructor(options = {}) {
    super();
    this.#token = options.token || options.WHATSAPP_TOKEN || '';
    this.#phoneNumberId = options.phoneNumberId || options.WHATSAPP_PHONE_NUMBER_ID || '';
    this.#apiVersion = options.apiVersion || options.WHATSAPP_API_VERSION || 'v22.0';
    this.#baseUrl = options.baseUrl || 'https://graph.facebook.com';
    this.#defaultCountry = options.defaultCountry || options.WHATSAPP_DEFAULT_COUNTRY || 'AR';
    this.#timeout = options.timeout || 15000;
    this.#maxRetries = options.maxRetries || 3;
    this.#retryDelay = options.retryDelay || 1000;
    this.#rateLimitPerSecond = options.rateLimitPerSecond || 80;
    this.#requestTimestamps = [];
  }

  #token;
  #phoneNumberId;
  #apiVersion;
  #baseUrl;
  #defaultCountry;
  #timeout;
  #maxRetries;
  #retryDelay;
  #rateLimitPerSecond;
  #requestTimestamps;

  get apiVersion() { return this.#apiVersion; }
  get phoneNumberId() { return this.#phoneNumberId; }
  get baseUrl() { return this.#baseUrl; }

  async send({ phone, message, metadata }) {
    if (!phone) throw new Error('MetaWhatsAppChannel: phone is required');
    await this.#checkRateLimit();

    const normalizedPhone = this.#normalizePhone(phone);
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'text',
      text: { preview_url: false, body: message },
    };

    let lastError;
    for (let attempt = 1; attempt <= this.#maxRetries; attempt++) {
      try {
        const response = await this.#apiCall(body);
        const messages = response?.messages || [];
        const id = messages[0]?.id || `wa-${Date.now()}`;
        return { success: true, id, phone: normalizedPhone, provider: 'meta' };
      } catch (err) {
        lastError = err;
        if (this.#isRetryable(err) && attempt < this.#maxRetries) {
          await this.#delay(this.#retryDelay * attempt);
        } else {
          throw this.#normalizeError(err);
        }
      }
    }
    throw lastError;
  }

  async sendTemplate({ phone, templateName, language, components, metadata }) {
    if (!phone) throw new Error('MetaWhatsAppChannel: phone is required');
    await this.#checkRateLimit();

    const normalizedPhone = this.#normalizePhone(phone);
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language || 'es_AR' },
        components: components || [],
      },
    };

    const response = await this.#apiCall(body);
    const messages = response?.messages || [];
    const id = messages[0]?.id || `wa-${Date.now()}`;
    return { success: true, id, phone: normalizedPhone, provider: 'meta', template: templateName };
  }

  async markAsRead(messageId) {
    await this.#checkRateLimit();
    await this.#apiCall({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
    return { success: true, messageId };
  }

  async sendTypingIndicator(phone, action = 'typing') {
    await this.#checkRateLimit();
    const normalizedPhone = this.#normalizePhone(phone);
    await this.#apiCall({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'action',
      action: action,
    });
    return { success: true, phone: normalizedPhone, action };
  }

  async downloadMedia(mediaId) {
    if (!mediaId) throw new Error('MetaWhatsAppChannel: mediaId is required');

    const mediaUrl = `${this.#baseUrl}/${this.#apiVersion}/${mediaId}`;
    const response = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${this.#token}` },
    });
    if (!response.ok) throw new Error(`Failed to get media URL: ${response.status}`);

    const mediaData = await response.json();
    const url = mediaData.url;
    const mimeType = mediaData.mime_type || 'application/octet-stream';
    const fileSize = mediaData.file_size || 0;
    const fileName = mediaData.filename || `media-${mediaId}`;

    const fileResponse = await fetch(url, {
      headers: { Authorization: `Bearer ${this.#token}` },
    });
    if (!fileResponse.ok) throw new Error(`Failed to download media: ${fileResponse.status}`);

    const buffer = await fileResponse.arrayBuffer();
    return {
      mediaId,
      url,
      mimeType,
      fileSize,
      fileName,
      buffer,
      data: buffer,
    };
  }

  async getMediaUrl(mediaId) {
    if (!mediaId) throw new Error('MetaWhatsAppChannel: mediaId is required');
    const mediaUrl = `${this.#baseUrl}/${this.#apiVersion}/${mediaId}`;
    const response = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${this.#token}` },
    });
    if (!response.ok) throw new Error(`Failed to get media URL: ${response.status}`);
    const data = await response.json();
    return {
      mediaId,
      url: data.url,
      mimeType: data.mime_type || 'application/octet-stream',
      fileSize: data.file_size || 0,
      fileName: data.filename || `media-${mediaId}`,
    };
  }

  async verifyWebhookToken(mode, token, verifyToken) {
    if (mode === 'subscribe' && token === verifyToken) {
      return { success: true };
    }
    return { success: false };
  }

  async #apiCall(body) {
    const url = `${this.#baseUrl}/${this.#apiVersion}/${this.#phoneNumberId}/messages`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.#timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.#token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      this.#requestTimestamps.push(Date.now());

      if (!response.ok) {
        const errorBody = await response.text();
        let parsed;
        try { parsed = JSON.parse(errorBody); } catch { parsed = { error: { message: errorBody } }; }
        const err = new Error(parsed.error?.message || `HTTP ${response.status}`);
        err.status = response.status;
        err.code = parsed.error?.code || response.status;
        err.type = parsed.error?.type || 'unknown';
        err.errorData = parsed;
        throw err;
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  #normalizePhone(phone) {
    if (!phone) return phone;
    const cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('549') && cleaned.length > 10) return cleaned;
    if (cleaned.startsWith('54') && cleaned.length > 10) return cleaned;
    if (cleaned.startsWith('+')) return cleaned.substring(1);
    if (this.#defaultCountry === 'AR' && !cleaned.startsWith('54')) return `549${cleaned}`;
    return cleaned;
  }

  getRequestTimestamps() {
    return this.#requestTimestamps;
  }

  setRequestTimestamps(timestamps) {
    this.#requestTimestamps = timestamps;
  }

  async #checkRateLimit() {
    const now = Date.now();
    this.#requestTimestamps = this.#requestTimestamps.filter(ts => now - ts < 1000);
    if (this.#requestTimestamps.length >= this.#rateLimitPerSecond) {
      await this.#delay(100);
      return this.#checkRateLimit();
    }
  }

  #isRetryable(err) {
    if (err.status === 429) return true;
    if (err.status === 500) return true;
    if (err.status === 503) return true;
    if (err.code === 2 || err.code === 130429) return true;
    return false;
  }

  #normalizeError(err) {
    if (err.name === 'AbortError') {
      const timeout = new Error('MetaWhatsAppChannel: request timed out');
      timeout.code = 'TIMEOUT';
      timeout.retryable = true;
      return timeout;
    }
    if (err.status === 429) {
      err.code = 'RATE_LIMITED';
      err.retryable = true;
    }
    if (err.status >= 500) {
      err.retryable = true;
    }
    return err;
  }

  #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
