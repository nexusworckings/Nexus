import { REPAIR_CREATED } from '../events/event-types.js';

export class RepairService {
  #insertFn;
  #eventBus;

  constructor(options = {}) {
    this.#insertFn = options.insertFn;
    this.#eventBus = options.eventBus || null;
    if (!this.#insertFn) {
      throw new Error('RepairService: insertFn is required');
    }
  }

  async createRepair(data) {
    if (!data.device || typeof data.device !== 'string') {
      throw new Error('INVALID_DATA: device is required');
    }
    if (!data.problem || typeof data.problem !== 'string') {
      throw new Error('INVALID_DATA: problem is required');
    }

    const id = crypto.randomUUID();
    const entry = {
      id,
      session_id: data.sessionId || null,
      client_id: data.clientId || null,
      device: data.device,
      problem: data.problem,
      urgency: data.urgency || 'normal',
      status: 'received',
    };

    const result = await this.#insertFn('repairs', entry);

    if (this.#eventBus) {
      this.#eventBus.publish(REPAIR_CREATED, {
        entityId: result.id || id,
        clientId: data.clientId || null,
        metadata: { device: data.device, problem: data.problem },
      });
    }

    return {
      id: result.id || id,
      status: 'received',
      device: data.device,
    };
  }
}
