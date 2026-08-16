import { WebhookValidator } from "./webhook-validator.js";
import { MessageParser } from "./message-parser.js";
import { ContactResolver } from "./contact-resolver.js";
import { MediaHandler } from "./media-handler.js";

const INTERVIEW_SESSION_KEY = "interviewSessionId";
const INTERVIEW_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export class WebhookHandler {
  constructor(options = {}) {
    this.#validator = options.validator || new WebhookValidator();
    this.#parser = options.parser || new MessageParser();
    this.#contactResolver = options.contactResolver;
    this.#mediaHandler = options.mediaHandler;
    this.#conversationManager = options.conversationManager;
    this.#conversationMemory = options.conversationMemory;
    this.#runtime = options.runtime;
    this.#channel = options.channel;
    this.#eventBus = options.eventBus;
    this.#processedIds = options.processedIds || new Set();
    this.#maxIdempotencyCache = options.maxIdempotencyCache || 10000;
  }

  #validator;
  #parser;
  #contactResolver;
  #mediaHandler;
  #conversationManager;
  #conversationMemory;
  #runtime;
  #channel;
  #eventBus;
  #processedIds;
  #maxIdempotencyCache;

  async handleGet(request, env) {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const result = this.#validator.generateChallenge(mode, token, challenge);
    if (result.valid) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Verification failed", { status: 403 });
  }

  async handlePost(request, env) {
    const signature = request.headers.get("x-hub-signature-256") || "";
    const body = await request.text();

    const appSecret = env?.WHATSAPP_APP_SECRET || "";
    if (appSecret) {
      const valid = await this.#validator.validateSignature(
        signature,
        body,
        appSecret,
      );
      if (!valid) {
        return new Response("Invalid signature", { status: 403 });
      }
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const parsedMessages = this.#parser.parse(payload);
    const results = [];

    for (const msg of parsedMessages) {
      if (msg.type === "status") continue;
      if (this.#processedIds.has(msg.messageId)) {
        results.push({
          messageId: msg.messageId,
          status: "duplicate",
          skipped: true,
        });
        continue;
      }
      this.#processedIds.add(msg.messageId);
      if (this.#processedIds.size > this.#maxIdempotencyCache) {
        const firstEntries = Array.from(this.#processedIds).slice(0, 1000);
        for (const id of firstEntries) this.#processedIds.delete(id);
      }

      try {
        const result = await this.#processMessage(msg, env);
        results.push(result);
      } catch (err) {
        results.push({
          messageId: msg.messageId,
          status: "error",
          error: err.message,
        });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }

  async #processMessage(msg, env) {
    const phone = msg.phone;
    const clientName = msg.clientName || null;

    let contactInfo = {
      clientId: null,
      clientName,
      phone,
      existed: false,
      client: null,
    };
    if (this.#contactResolver) {
      try {
        if (clientName) {
          contactInfo = await this.#contactResolver.resolveOrCreate(
            phone,
            clientName,
          );
        } else {
          contactInfo = await this.#contactResolver.resolveByPhone(phone);
        }
      } catch {
        contactInfo = {
          clientId: null,
          clientName,
          phone,
          existed: false,
          client: null,
        };
      }
    }

    let conversation;
    const existingConversations = this.#conversationManager
      ? this.#conversationManager.getConversationsByPhone(phone)
      : [];

    if (existingConversations.length > 0) {
      conversation = existingConversations[0];
      conversation.addMessage("client", msg.text || `[${msg.type}]`, {
        waId: msg.messageId,
        messageType: msg.type,
        media: msg.media,
      });
    } else {
      conversation = this.#conversationManager?.createConversation({
        clientId: contactInfo.clientId,
        clientName: contactInfo.clientName,
        phone,
        channel: "whatsapp",
        status: "active",
      });
      if (conversation && (msg.text || msg.type)) {
        conversation.addMessage("client", msg.text || `[${msg.type}]`, {
          waId: msg.messageId,
          messageType: msg.type,
          media: msg.media,
        });
      }
    }

    if (this.#conversationMemory && conversation) {
      this.#conversationMemory.remember(
        conversation.conversationId,
        "phone",
        phone,
      );
      this.#conversationMemory.remember(
        conversation.conversationId,
        "clientId",
        contactInfo.clientId,
      );
      if (contactInfo.clientName) {
        this.#conversationMemory.remember(
          conversation.conversationId,
          "clientName",
          contactInfo.clientName,
        );
      }
    }

    if (this.#eventBus) {
      try {
        this.#eventBus.emit("WHATSAPP_MESSAGE_RECEIVED", {
          messageId: msg.messageId,
          phone,
          clientId: contactInfo.clientId,
          clientName: contactInfo.clientName,
          conversationId: conversation?.conversationId,
          type: msg.type,
          text: msg.text,
          media: msg.media,
          timestamp: msg.timestamp,
        });
      } catch {}
    }

    if (this.#channel && conversation) {
      try {
        await this.#channel.markAsRead(msg.messageId);
      } catch {}
    }

    if (this.#runtime && conversation) {
      const conversationId = conversation.conversationId;
      const interviewSessionId = this.#conversationMemory?.recall(
        conversationId,
        INTERVIEW_SESSION_KEY,
      );
      try {
        const response = await this.#runtime.handleMessage({
          message: msg.text || "",
          sessionId: conversationId,
          interviewSessionId,
          clientId: contactInfo.clientId,
          conversationId,
        });

        if (response?.type === "interview" && response.sessionId) {
          this.#conversationMemory?.remember(
            conversationId,
            INTERVIEW_SESSION_KEY,
            response.sessionId,
            INTERVIEW_SESSION_TTL_MS,
          );
        } else if (
          response?.type === "completed" ||
          response?.type === "chat"
        ) {
          this.#conversationMemory?.forget(
            conversationId,
            INTERVIEW_SESSION_KEY,
          );
        }

        const outgoingMessage = response.message || response.question;
        if (outgoingMessage) {
          conversation.addMessage("assistant", outgoingMessage);
          if (this.#channel && phone) {
            try {
              await this.#channel.send({ phone, message: outgoingMessage });
              await this.#channel.markAsRead(msg.messageId);
            } catch {}
          }
        }
      } catch {}
    }

    return {
      messageId: msg.messageId,
      status: "processed",
      conversationId: conversation?.conversationId,
      clientId: contactInfo.clientId,
      clientName: contactInfo.clientName,
      phone,
      isNewClient: !contactInfo.existed,
      isNewConversation: existingConversations.length === 0,
    };
  }
}
