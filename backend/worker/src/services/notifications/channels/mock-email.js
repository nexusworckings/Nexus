export class MockEmailChannel {
  #sent;

  constructor() {
    this.#sent = [];
  }

  async send({ to, subject, message }) {
    this.#sent.push({ to, subject, message, sentAt: new Date().toISOString() });
    return { success: true, id: this.#sent.length };
  }

  getSent() {
    return [...this.#sent];
  }

  clear() {
    this.#sent = [];
  }
}
