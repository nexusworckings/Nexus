import { handleRequest } from './router.js';
import eventWorker from './workers/event-worker.js';

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },

  async scheduled(event, env, ctx) {
    return eventWorker.scheduled(event, env, ctx);
  },
};
