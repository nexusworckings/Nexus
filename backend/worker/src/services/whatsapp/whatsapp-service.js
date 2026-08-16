import { MetaWhatsAppChannel } from './meta-whatsapp-channel.js';
import { WebhookValidator } from './webhook-validator.js';
import { MessageParser } from './message-parser.js';
import { MediaHandler } from './media-handler.js';
import { ContactResolver } from './contact-resolver.js';
import { WebhookHandler } from './webhook-handler.js';

export class WhatsAppService {
  constructor(options = {}) {
    this.#config = options.config || {};
    this.#channel = options.channel || this.#createChannel(this.#config);
    this.#validator = options.validator || new WebhookValidator(options.config);
    this.#parser = options.parser || new MessageParser();
    this.#contactResolver = options.contactResolver;
    this.#mediaHandler = options.mediaHandler || (this.#channel ? new MediaHandler({ channel: this.#channel }) : null);
    this.#conversationManager = options.conversationManager;
    this.#conversationMemory = options.conversationMemory;
    this.#runtime = options.runtime;
    this.#eventBus = options.eventBus;
    this.#processedIds = new Set();
    this.#metrics = {
      received: 0,
      sent: 0,
      errors: 0,
      duplicates: 0,
      rateLimited: 0,
      retries: 0,
      avgLatencyMs: 0,
      totalLatencyMs: 0,
      latencyCount: 0,
    };

    this.#webhookHandler = options.webhookHandler || new WebhookHandler({
      validator: this.#validator,
      parser: this.#parser,
      contactResolver: this.#contactResolver,
      mediaHandler: this.#mediaHandler,
      conversationManager: this.#conversationManager,
      conversationMemory: this.#conversationMemory,
      runtime: this.#runtime,
      channel: this.#channel,
      eventBus: this.#eventBus,
      processedIds: this.#processedIds,
    });
  }

  #config;
  #channel;
  #validator;
  #parser;
  #contactResolver;
  #mediaHandler;
    #conversationManager;
    #conversationMemory;
    #runtime;
    #eventBus;
    #processedIds;
  #metrics;
  #webhookHandler;

  get channel() { return this.#channel; }
  get validator() { return this.#validator; }
  get parser() { return this.#parser; }
  get mediaHandler() { return this.#mediaHandler; }
  get webhookHandler() { return this.#webhookHandler; }
  get metrics() { return { ...this.#metrics }; }

  async sendMessage(phone, message, options = {}) {
    const start = Date.now();
    try {
      const result = await this.#channel.send({ phone, message, metadata: options.metadata });
      this.#metrics.sent++;
      this.#metrics.totalLatencyMs += (Date.now() - start);
      this.#metrics.latencyCount++;
      this.#metrics.avgLatencyMs = this.#metrics.totalLatencyMs / this.#metrics.latencyCount;
      return result;
    } catch (err) {
      this.#metrics.errors++;
      if (err.code === 'RATE_LIMITED') this.#metrics.rateLimited++;
      throw err;
    }
  }

  async sendTemplate(phone, templateName, components, options = {}) {
    const start = Date.now();
    try {
      const result = await this.#channel.sendTemplate({
        phone, templateName, language: options.language || 'es_AR',
        components,
        metadata: options.metadata,
      });
      this.#metrics.sent++;
      return result;
    } catch (err) {
      this.#metrics.errors++;
      throw err;
    }
  }

  async markAsRead(messageId) {
    return this.#channel.markAsRead(messageId);
  }

  async sendTypingIndicator(phone, action = 'typing') {
    return this.#channel.sendTypingIndicator(phone, action);
  }

  async downloadMedia(mediaId) {
    return this.#mediaHandler?.downloadMedia(mediaId);
  }

  async getMediaUrl(mediaId) {
    return this.#mediaHandler?.getMediaUrl(mediaId);
  }

  async handleWebhookGet(request, env) {
    return this.#webhookHandler.handleGet(request, env);
  }

  async handleWebhookPost(request, env) {
    this.#metrics.received++;
    return this.#webhookHandler.handlePost(request, env);
  }

  getProcessedCount() {
    return this.#processedIds.size;
  }

  resetMetrics() {
    this.#metrics = {
      received: 0, sent: 0, errors: 0, duplicates: 0,
      rateLimited: 0, retries: 0, avgLatencyMs: 0,
      totalLatencyMs: 0, latencyCount: 0,
    };
  }

  #createChannel(config) {
    const provider = config.provider || config.WHATSAPP_PROVIDER || 'meta';
    if (provider === 'mock') return null;
    return new MetaWhatsAppChannel(config);
  }
}
