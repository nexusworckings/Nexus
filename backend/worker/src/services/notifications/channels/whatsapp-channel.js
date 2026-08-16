export class WhatsAppChannel {
  async send({ phone, message, metadata }) {
    throw new Error('WhatsAppChannel: send() must be implemented by subclass');
  }
}
