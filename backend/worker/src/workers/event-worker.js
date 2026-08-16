import { EventRepository } from '../services/events/event-repository.js';
import { EventQueue } from '../services/events/event-queue.js';
import { EventWorker } from '../services/events/event-worker.js';
import { eventBus } from '../services/events/event-bus.js';
import { query, insert, update } from '../services/supabase.js';

function createServices(env) {
  const repository = new EventRepository({
    insertFn: (table, data) => insert(env, table, data, true),
    queryFn: (table, opts) => query(env, table, opts, true),
    updateFn: (table, id, data) => update(env, table, id, data, true),
  });

  const queue = new EventQueue({ eventRepository: repository });

  const worker = new EventWorker({
    eventQueue: queue,
    handlers: {
      CLIENT_CREATED: (payload) => eventBus.publish('CLIENT_CREATED', payload),
      REPAIR_CREATED: (payload) => eventBus.publish('REPAIR_CREATED', payload),
      REPAIR_STATUS_CHANGED: (payload) => eventBus.publish('REPAIR_STATUS_CHANGED', payload),
      BUDGET_CREATED: (payload) => eventBus.publish('BUDGET_CREATED', payload),
      BUDGET_APPROVED: (payload) => eventBus.publish('BUDGET_APPROVED', payload),
      BUDGET_REJECTED: (payload) => eventBus.publish('BUDGET_REJECTED', payload),
      PRINT_ORDER_CREATED: (payload) => eventBus.publish('PRINT_ORDER_CREATED', payload),
      PRINT_ORDER_STATUS_CHANGED: (payload) => eventBus.publish('PRINT_ORDER_STATUS_CHANGED', payload),
    },
  });

  return { repository, queue, worker };
}

async function processEvents(env) {
  const { queue, worker } = createServices(env);
  const results = await worker.processBatch(10);
  return results;
}

async function retryDlq(env) {
  const { queue } = createServices(env);
  const dlqEntries = await queue.getDlq(10);
  const results = [];
  for (const entry of dlqEntries) {
    try {
      const result = await queue.replayFromDlq(entry);
      results.push({ dlqId: entry.id, success: true, eventId: result.eventId });
    } catch (err) {
      results.push({ dlqId: entry.id, success: false, error: err.message });
    }
  }
  return results;
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const url = new URL(request.url);
      if (url.pathname === '/retry-dlq') {
        const results = await retryDlq(env);
        return new Response(JSON.stringify({ retried: results.length, results }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const results = await processEvents(env);
      return new Response(JSON.stringify({ processed: results.length, results }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },

  async scheduled(event, env, ctx) {
    try {
      const results = await processEvents(env);
      console.log(`EventWorker: processed ${results.length} events`);

      const minute = new Date(event.scheduledTime).getMinutes();
      if (minute % 30 === 0) {
        const dlqResults = await retryDlq(env);
        if (dlqResults.length > 0) {
          console.log(`EventWorker: retried ${dlqResults.length} DLQ entries`);
        }
      }
    } catch (err) {
      console.error('EventWorker scheduled error:', err.message);
    }
  },
};
