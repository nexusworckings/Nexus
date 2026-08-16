export class CompletionHandler {
  #repairService;
  #budgetService;
  #printService;
  #clientResolver;

  constructor(options = {}) {
    this.#repairService = options.repairService;
    this.#budgetService = options.budgetService;
    this.#printService = options.printService;
    this.#clientResolver = options.clientResolver;

    if (!this.#repairService) {
      throw new Error('CompletionHandler: repairService is required');
    }
    if (!this.#budgetService) {
      throw new Error('CompletionHandler: budgetService is required');
    }
    if (!this.#printService) {
      throw new Error('CompletionHandler: printService is required');
    }
  }

  async handle(session, completedFields) {
    if (!session || !session.state) {
      return { success: false, error: 'Invalid session data' };
    }

    const schemaId = session.schema?.serviceId;
    if (!schemaId) {
      return { success: false, error: 'Session has no schemaId' };
    }

    const clientInfo = this.#extractClientInfo(completedFields);
    let clientId = null;
    let clientCreated = false;

    if (this.#clientResolver && clientInfo.name && clientInfo.phone) {
      try {
        const resolved = await this.#clientResolver.resolve(clientInfo);
        clientId = resolved.clientId;
        clientCreated = resolved.isNew;
      } catch {
        // If resolver fails, continue without client
      }
    }

    switch (schemaId) {
      case 'repair-request':
        return this.#processRepair(session, completedFields, clientId, clientCreated);
      case 'budget-request':
        return this.#processBudget(session, completedFields, clientId, clientCreated);
      case 'print-order':
        return this.#processPrintOrder(session, completedFields, clientId, clientCreated);
      default:
        return { success: false, error: `Unknown schemaId: ${schemaId}` };
    }
  }

  #extractClientInfo(completedFields) {
    return {
      name: completedFields.clientName?.value || '',
      phone: completedFields.clientPhone?.value || '',
    };
  }

  async #processRepair(session, completedFields, clientId, clientCreated) {
    const sessionId = session.sessionId;
    const data = {
      sessionId,
      clientId,
      device: completedFields.device?.value || '',
      problem: completedFields.problem?.value || '',
      urgency: completedFields.urgency?.value || 'normal',
    };

    try {
      const result = await this.#repairService.createRepair(data);
      return {
        success: true,
        type: 'repair',
        entityId: result.id,
        data: result,
        clientId,
        clientCreated,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async #processBudget(session, completedFields, clientId, clientCreated) {
    const sessionId = session.sessionId;
    const data = {
      sessionId,
      clientId,
      serviceType: completedFields.serviceType?.value || '',
      description: completedFields.description?.value || '',
      contact: completedFields.contact?.value || '',
    };

    try {
      const result = await this.#budgetService.createBudget(data);
      return {
        success: true,
        type: 'budget',
        entityId: result.id,
        data: result,
        clientId,
        clientCreated,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async #processPrintOrder(session, completedFields, clientId, clientCreated) {
    const sessionId = session.sessionId;
    const data = {
      sessionId,
      clientId,
      objectDescription: completedFields.objectDescription?.value || '',
      material: completedFields.material?.value || '',
      colors: completedFields.colors?.value || [],
      quantity: completedFields.quantity?.value || 1,
    };

    try {
      const result = await this.#printService.createPrintOrder(data);
      return {
        success: true,
        type: 'print-order',
        entityId: result.id,
        data: result,
        clientId,
        clientCreated,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}
