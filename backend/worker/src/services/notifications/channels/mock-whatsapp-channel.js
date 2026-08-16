export class MockWhatsAppChannel {
  #sent;

  constructor() {
    this.#sent = [];
  }

  async send({ phone, message, metadata }) {
    if (!phone) throw new Error('MockWhatsAppChannel: phone is required');
    const id = this.#sent.length + 1;
    const entry = { id, phone, message, metadata: metadata || {}, sentAt: new Date().toISOString(), status: 'sent' };
    this.#sent.push(entry);
    return { success: true, id, phone };
  }

  getSent() {
    return [...this.#sent];
  }

  getSentByPhone(phone) {
    return this.#sent.filter(e => e.phone === phone);
  }

  clear() {
    this.#sent = [];
  }
}
