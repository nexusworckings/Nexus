export class ClientResolver {
  #clientService;

  constructor(options = {}) {
    this.#clientService = options.clientService;
    if (!this.#clientService) {
      throw new Error('ClientResolver: clientService is required');
    }
  }

  async resolve(data = {}) {
    const name = data.name || '';
    const phone = data.phone || '';

    if (!name || !phone) {
      return { clientId: null, isNew: false };
    }

    try {
      const existing = await this.#clientService.getClientByPhone(phone);
      if (existing) {
        return { clientId: existing.id, isNew: false };
      }
    } catch {
      // If lookup fails, proceed to create
    }

    const client = await this.#clientService.createClient({
      name,
      phone,
      email: data.email || null,
    });

    return { clientId: client.id, isNew: true };
  }
}
