export class ContactResolver {
  constructor(options = {}) {
    this.#query = options.query;
    this.#insert = options.insert;
    this.#defaultCountry = options.defaultCountry || 'AR';
  }

  #query;
  #insert;
  #defaultCountry;

  async resolveByPhone(phone, name) {
    if (!phone) throw new Error('ContactResolver: phone is required');

    const existing = await this.#findByPhone(phone);
    if (existing) {
      return {
        clientId: existing.id,
        clientName: existing.name || name || null,
        phone: existing.phone,
        existed: true,
        client: existing,
      };
    }

    if (name) {
      return this.#createClient(phone, name);
    }

    return {
      clientId: null,
      clientName: name || null,
      phone,
      existed: false,
      client: null,
    };
  }

  async resolveOrCreate(phone, name) {
    if (!phone) throw new Error('ContactResolver: phone is required');

    const existing = await this.#findByPhone(phone);
    if (existing) {
      return {
        clientId: existing.id,
        clientName: existing.name || name || null,
        phone: existing.phone,
        existed: true,
        client: existing,
      };
    }

    const clientName = name || `Cliente ${phone.slice(-4)}`;
    return this.#createClient(phone, clientName);
  }

  async #findByPhone(phone) {
    if (!this.#query) return null;
    const normalized = this.#normalizePhone(phone);

    try {
      const results = await this.#query('clients', { eq: { phone: normalized }, limit: '1' });
      if (Array.isArray(results) && results.length > 0) {
        return results[0];
      }
    } catch {
      return null;
    }

    const partial = normalized.slice(-8);
    if (partial.length >= 6) {
      try {
        const results = await this.#query('clients', { like: { phone: `%${partial}` }, limit: '1' });
        if (Array.isArray(results) && results.length > 0) {
          return results[0];
        }
      } catch {}
    }

    return null;
  }

  async #createClient(phone, name) {
    if (!this.#insert) {
      return {
        clientId: `temp-${Date.now()}`,
        clientName: name,
        phone,
        existed: false,
        client: { id: `temp-${Date.now()}`, name, phone },
      };
    }

    const id = crypto.randomUUID();
    const clientData = {
      id,
      name,
      phone: this.#normalizePhone(phone),
      created_at: new Date().toISOString(),
    };

    await this.#insert('clients', clientData);
    return {
      clientId: id,
      clientName: name,
      phone: clientData.phone,
      existed: false,
      client: clientData,
    };
  }

  #normalizePhone(phone) {
    if (!phone) return phone;
    const cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('549') && cleaned.length > 10) return cleaned;
    if (cleaned.startsWith('54') && cleaned.length > 10) return cleaned;
    if (cleaned.length === 10 && this.#defaultCountry === 'AR') return `549${cleaned}`;
    return cleaned;
  }
}
