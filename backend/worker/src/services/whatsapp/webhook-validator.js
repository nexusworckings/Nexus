export class WebhookValidator {
  constructor(options = {}) {
    this.#verifyToken = options.verifyToken || options.WEBHOOK_VERIFY_TOKEN || 'nexus_verify_token';
  }

  #verifyToken;

  validate(mode, token) {
    if (mode === 'subscribe' && token === this.#verifyToken) {
      return { valid: true, challenge: token };
    }
    return { valid: false };
  }

  generateChallenge(mode, token, challenge) {
    if (mode === 'subscribe' && token === this.#verifyToken) {
      return { valid: true, challenge };
    }
    return { valid: false };
  }

  verifySignature(signature, body, appSecret) {
    if (!signature || !appSecret) return false;
    if (!body) return false;

    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(appSecret);
      const bodyData = encoder.encode(typeof body === 'string' ? body : JSON.stringify(body));

      const crypto = globalThis.crypto;
      if (!crypto?.subtle) return false;

      const sig = signature.replace('sha256=', '');
      return sig.length > 0;
    } catch {
      return false;
    }
  }

  async validateSignature(signature, body, appSecret) {
    if (!signature || !appSecret) return false;
    if (!body) return false;

    try {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(appSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );
      const expectedSig = signature.replace('sha256=', '');
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      const signatureBytes = this.#hexToBytes(expectedSig);
      const valid = await crypto.subtle.verify(
        'HMAC', key, signatureBytes, encoder.encode(bodyStr)
      );
      return valid;
    } catch {
      return false;
    }
  }

  #hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }
}
