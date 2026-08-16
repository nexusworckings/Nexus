# WhatsApp Integration

Nexus integrates with WhatsApp through the Meta Cloud API for both receiving messages (webhook) and sending messages (API calls).

## Architecture

```
Meta Cloud API
      │
      ├─ Inbound: Webhook POST ──► Worker
      │     └─ chat.js → ChatRuntime → Response
      │
      └─ Outbound: API POST ◄── Worker
            └─ whatsapp-service.js → Meta API
```

## Components

### `webhook-handler.js`

Handles incoming WhatsApp webhook requests:

- **GET** — Webhook verification (hub.mode, hub.verify_token, hub.challenge)
- **POST** — Message receipt (text, images, interactive replies)
  - Validates signature using `WHATSAPP_APP_SECRET`
  - Parses messages via `MessageParser`
  - Delegates to `chat.js` for business logic

### `webhook-validator.js`

Validates webhook authenticity:

- `verifySignature(signature, body, secret)` — SHA256 signature verification
- `validateSignature(signature, body, secret)` — Async wrapper
- `generateChallenge(mode, token, challenge)` — Webhook verification handshake

### `whatsapp-service.js`

High-level service for sending messages:

```js
await ws.sendMessage(to, text);
await ws.sendTemplate(to, templateName, components);
await ws.sendMedia(to, mediaUrl, mediaType);
```

### `meta-whatsapp-channel.js`

Low-level Meta Cloud API implementation:

- Sends messages via `POST /v20.0/{phone-number-id}/messages`
- Rate-limited (configurable requests per second)
- Configurable timeout
- Bearer token authentication

### `message-parser.js`

Parses incoming webhook payloads:

```js
const parsed = MessageParser.parse(rawWebhookBody);
// { type: 'text', content: 'Hola', from: '5491111111111', timestamp, ... }
```

### `contact-resolver.js`

Resolves phone numbers to known clients:

```js
await resolver.resolve(phone);
// { clientId, name, ... } or null
```

### `media-handler.js`

Downloads and processes media messages:

```js
await media.download(mediaId);
await media.process(buffer, mimeType);
```

## Configuration

Required env vars:

| Variable | Description |
|----------|-------------|
| `WHATSAPP_TOKEN` | Meta WhatsApp access token |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID from Meta Business |
| `WHATSAPP_APP_SECRET` | App secret for webhook signature verification |
| `WEBHOOK_VERIFY_TOKEN` | Custom token for webhook verification |
| `WHATSAPP_NUMBER` | Display phone number |

## Webhook Setup

1. Go to Meta Developer Console → WhatsApp → Configuration
2. Set Callback URL to `https://your-worker.workers.dev/webhook/whatsapp`
3. Set Verify Token (must match `WEBHOOK_VERIFY_TOKEN`)
4. Subscribe to: `messages`, `message_deliveries`, `message_reads`

## Rate Limiting

- Inbound: Configurable per-IP rate limit in `chat.js` (default: 10 requests / 60s)
- Outbound: Configurable in `MetaWhatsAppChannel` (default: 5 requests/second)
- Spam detection: Duplicate message detection within 5s window
