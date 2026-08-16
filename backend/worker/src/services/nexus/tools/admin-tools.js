export function registerAdminTools(registry, deps) {
  const tools = [
    createQueryTableTool(deps),
    createUpdateSingleTool(deps),
    createUpdateAllTool(deps),
    createFindAndUpdateTool(deps),
    createCreateRecordTool(deps),
    createDeleteRecordTool(deps),
  ];
  for (const tool of tools) {
    registry.register(tool);
  }
  return registry;
}

const TABLES = [
  'business_info', 'address', 'chatbot_config', 'products', 'services',
  'categories', 'prices', 'promotions', 'warranties', 'print3d',
  'faqs', 'hours', 'social_media', 'phones', 'emails', 'featured_messages',
];

function createQueryTableTool(deps) {
  return {
    name: 'queryTable',
    description: 'Query any admin table with optional filters. Tables: ' + TABLES.join(', '),
    inputSchema: {
      table: { type: 'string', required: true },
      filters: { type: 'object' },
      limit: { type: 'number' },
    },
    async execute(params) {
      const opts = {};
      if (params.filters) opts.eq = params.filters;
      if (params.limit) opts.limit = String(params.limit);
      const results = await deps.query(params.table, opts, true);
      return { table: params.table, results: Array.isArray(results) ? results : [] };
    },
  };
}

function createUpdateSingleTool(deps) {
  return {
    name: 'updateSingle',
    description: 'Update a single record in an admin table by ID',
    inputSchema: {
      table: { type: 'string', required: true },
      id: { type: 'number', required: true },
      changes: { type: 'object', required: true },
    },
    async execute(params) {
      await deps.update(params.table, params.id, params.changes, true);
      return { table: params.table, id: params.id, changes: params.changes, updated: true };
    },
  };
}

function createUpdateAllTool(deps) {
  return {
    name: 'updateAll',
    description: 'Update all records in a table matching filters, supports percentage/math operations on numeric fields',
    inputSchema: {
      table: { type: 'string', required: true },
      filters: { type: 'object' },
      changes: { type: 'object', required: true },
    },
    async execute(params) {
      const opts = {};
      if (params.filters) opts.eq = params.filters;
      const records = await deps.query(params.table, opts, true);
      const modified = [];

      for (const reg of records) {
        const updates = {};
        for (const [field, val] of Object.entries(params.changes)) {
          if (typeof val === 'object' && val?.operation) {
            const orig = Number(reg[field]) || 0;
            switch (val.operation) {
              case 'percentage': updates[field] = Math.round(orig * (1 + val.value / 100) * 100) / 100; break;
              case 'multiply': updates[field] = Math.round(orig * val.value * 100) / 100; break;
              case 'add': updates[field] = Math.round((orig + val.value) * 100) / 100; break;
              case 'subtract': updates[field] = Math.round((orig - val.value) * 100) / 100; break;
            }
          } else if (val !== null && val !== undefined) {
            updates[field] = val;
          }
        }
        if (Object.keys(updates).length > 0) {
          await deps.update(params.table, reg.id, updates, true);
          modified.push({ id: reg.id, name: reg.name || reg.title || `#${reg.id}`, updates });
        }
      }
      return { table: params.table, count: modified.length, modified };
    },
  };
}

function createFindAndUpdateTool(deps) {
  return {
    name: 'findAndUpdate',
    description: 'Find records by a match field and update them',
    inputSchema: {
      table: { type: 'string', required: true },
      match: { type: 'object', required: true },
      changes: { type: 'object', required: true },
    },
    async execute(params) {
      const opts = { eq: params.match };
      const records = await deps.query(params.table, opts, true);
      const modified = [];

      for (const reg of records) {
        const updates = {};
        for (const [field, val] of Object.entries(params.changes)) {
          if (typeof val === 'object' && val?.operation) {
            const orig = Number(reg[field]) || 0;
            switch (val.operation) {
              case 'percentage': updates[field] = Math.round(orig * (1 + val.value / 100) * 100) / 100; break;
              case 'multiply': updates[field] = Math.round(orig * val.value * 100) / 100; break;
              case 'add': updates[field] = Math.round((orig + val.value) * 100) / 100; break;
              case 'subtract': updates[field] = Math.round((orig - val.value) * 100) / 100; break;
            }
          } else if (val !== null && val !== undefined) {
            updates[field] = val;
          }
        }
        if (Object.keys(updates).length > 0) {
          await deps.update(params.table, reg.id, updates, true);
          modified.push({ id: reg.id, name: reg.name || reg.title || `#${reg.id}`, updates });
        }
      }
      return { table: params.table, count: modified.length, modified };
    },
  };
}

function createCreateRecordTool(deps) {
  return {
    name: 'createRecord',
    description: 'Create a new record in an admin table',
    inputSchema: {
      table: { type: 'string', required: true },
      data: { type: 'object', required: true },
    },
    async execute(params) {
      const clean = {};
      for (const [k, v] of Object.entries(params.data)) {
        if (v !== null && v !== undefined && v !== '') clean[k] = v;
      }
      const result = await deps.insert(params.table, clean, true);
      return { table: params.table, id: result?.id, created: true };
    },
  };
}

function createDeleteRecordTool(deps) {
  return {
    name: 'deleteRecord',
    description: 'Delete a record from an admin table',
    inputSchema: {
      table: { type: 'string', required: true },
      id: { type: 'number', required: true },
    },
    async execute(params) {
      await deps.delete(params.table, params.id);
      return { table: params.table, id: params.id, deleted: true };
    },
  };
}
