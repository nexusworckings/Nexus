import { MockWhatsAppChannel } from './mock-whatsapp-channel.js';
import { MetaWhatsAppChannel } from '../../whatsapp/meta-whatsapp-channel.js';

export function createWhatsAppChannel(config = {}) {
  const provider = config.provider || config.WHATSAPP_PROVIDER || 'mock';

  if (provider === 'mock') {
    return new MockWhatsAppChannel();
  }

  if (provider === 'meta') {
    return new MetaWhatsAppChannel(config);
  }

  return new MetaWhatsAppChannel(config);
}
