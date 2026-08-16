import { CLIENT_CREATED } from '../events/event-types.js';

export class ClientService {
  #insertFn;
  #queryFn;
  #updateFn;
  #eventBus;

  constructor(options = {}) {
    this.#insertFn = options.insertFn;
    this.#queryFn = options.queryFn;
    this.#updateFn = options.updateFn;
    this.#eventBus = options.eventBus || null;
    if (!this.#insertFn) throw new Error('ClientService: insertFn is required');
    if (!this.#queryFn) throw new Error('ClientService: queryFn is required');
  }

  async createClient(data) {
    if (!data.name || typeof data.name !== 'string') {
      throw new Error('INVALID_DATA: name is required');
    }
    if (!data.phone || typeof data.phone !== 'string') {
      throw new Error('INVALID_DATA: phone is required');
    }

    const existing = await this.getClientByPhone(data.phone);
    if (existing) return existing;

    const id = crypto.randomUUID();
    const entry = {
      id,
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      notes: data.notes || null,
    };

    await this.#insertFn('clients', entry);

    if (this.#eventBus) {
      this.#eventBus.publish(CLIENT_CREATED, {
        entityId: id,
        clientId: id,
        metadata: { name: data.name, phone: data.phone },
      });
    }

    return { id, name: data.name, phone: data.phone, email: entry.email, notes: entry.notes };
  }

  async getClientByPhone(phone) {
    if (!phone) return null;
    try {
      const results = await this.#queryFn('clients', { eq: { phone }, limit: 1 });
      const list = Array.isArray(results) ? results : [];
      return list[0] || null;
    } catch {
      return null;
    }
  }

  async getClient(id) {
    if (!id) return null;
    try {
      const results = await this.#queryFn('clients', { eq: { id }, limit: 1 });
      const list = Array.isArray(results) ? results : [];
      return list[0] || null;
    } catch {
      return null;
    }
  }

  async updateClient(id, data) {
    if (!id) throw new Error('INVALID_DATA: id is required');
    if (!this.#updateFn) throw new Error('ClientService: updateFn not configured');

    const allowed = {};
    if (data.name !== undefined) allowed.name = data.name;
    if (data.phone !== undefined) allowed.phone = data.phone;
    if (data.email !== undefined) allowed.email = data.email || null;
    if (data.notes !== undefined) allowed.notes = data.notes || null;

    if (Object.keys(allowed).length === 0) {
      throw new Error('INVALID_DATA: no fields to update');
    }

    return this.#updateFn('clients', id, allowed);
  }
}
