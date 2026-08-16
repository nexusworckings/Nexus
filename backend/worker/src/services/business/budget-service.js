import { BUDGET_CREATED } from '../events/event-types.js';

export class BudgetService {
  #insertFn;
  #eventBus;

  constructor(options = {}) {
    this.#insertFn = options.insertFn;
    this.#eventBus = options.eventBus || null;
    if (!this.#insertFn) {
      throw new Error('BudgetService: insertFn is required');
    }
  }

  async createBudget(data) {
    if (!data.serviceType || typeof data.serviceType !== 'string') {
      throw new Error('INVALID_DATA: serviceType is required');
    }
    if (!data.description || typeof data.description !== 'string') {
      throw new Error('INVALID_DATA: description is required');
    }

    const id = crypto.randomUUID();
    const entry = {
      id,
      session_id: data.sessionId || null,
      client_id: data.clientId || null,
      service_type: data.serviceType,
      description: data.description,
      contact: data.contact || null,
      status: 'pending',
    };

    const result = await this.#insertFn('budgets', entry);

    if (this.#eventBus) {
      this.#eventBus.publish(BUDGET_CREATED, {
        entityId: result.id || id,
        clientId: data.clientId || null,
        metadata: { serviceType: data.serviceType, description: data.description },
      });
    }

    return {
      id: result.id || id,
      status: 'pending',
    };
  }
}
