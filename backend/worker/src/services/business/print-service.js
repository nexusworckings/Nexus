import { PRINT_ORDER_CREATED } from '../events/event-types.js';

export class PrintService {
  #insertFn;
  #eventBus;

  constructor(options = {}) {
    this.#insertFn = options.insertFn;
    this.#eventBus = options.eventBus || null;
    if (!this.#insertFn) {
      throw new Error('PrintService: insertFn is required');
    }
  }

  async createPrintOrder(data) {
    if (!data.objectDescription || typeof data.objectDescription !== 'string') {
      throw new Error('INVALID_DATA: objectDescription is required');
    }
    if (!data.material || typeof data.material !== 'string') {
      throw new Error('INVALID_DATA: material is required');
    }
    if (data.quantity !== undefined && (typeof data.quantity !== 'number' || data.quantity < 1)) {
      throw new Error('INVALID_DATA: quantity must be a positive number');
    }

    const id = crypto.randomUUID();
    const entry = {
      id,
      session_id: data.sessionId || null,
      client_id: data.clientId || null,
      description: data.objectDescription,
      material: data.material,
      colors: JSON.stringify(data.colors || []),
      quantity: data.quantity || 1,
      status: 'pending',
    };

    const result = await this.#insertFn('print_orders', entry);

    if (this.#eventBus) {
      this.#eventBus.publish(PRINT_ORDER_CREATED, {
        entityId: result.id || id,
        clientId: data.clientId || null,
        metadata: { description: data.objectDescription, material: data.material },
      });
    }

    return {
      id: result.id || id,
      status: 'pending',
    };
  }
}
