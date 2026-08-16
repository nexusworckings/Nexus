import { defaultLogger } from '../logger.js';

const log = defaultLogger;

const MAX_REPEATS = 2;

export class AntiLoop {
  constructor() {
    this._asked = new Map();
  }

  trackAsked(sessionId, fieldId) {
    if (!sessionId || !fieldId) return;
    const key = `${sessionId}:${fieldId}`;
    const count = (this._asked.get(key) || 0) + 1;
    this._asked.set(key, count);
  }

  getRepeatCount(sessionId, fieldId) {
    const key = `${sessionId}:${fieldId}`;
    return this._asked.get(key) || 0;
  }

  isLooping(sessionId, fieldId) {
    return this.getRepeatCount(sessionId, fieldId) >= MAX_REPEATS;
  }

  isLoopingAny(sessionId, fieldIds) {
    for (const fid of fieldIds) {
      if (this.isLooping(sessionId, fid)) return true;
    }
    return false;
  }

  detectLoop(state, sessionId, question) {
    if (!question || !question.id) return null;

    this.trackAsked(sessionId, question.id);

    if (this.isLooping(sessionId, question.id)) {
      log.info('[ANTI-LOOP]', `Bucle detectado en "${question.id}" para sesión "${sessionId}"`);
      state[question.id] = 'loop_skip';
      return {
        skipped: true,
        field: question.id,
        reason: 'loop_detected',
        repeats: this.getRepeatCount(sessionId, question.id),
      };
    }

    return null;
  }

  resetSession(sessionId) {
    if (!sessionId) return;
    for (const key of this._asked.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        this._asked.delete(key);
      }
    }
  }

  getStats(sessionId) {
    const stats = {};
    for (const [key, count] of this._asked.entries()) {
      if (key.startsWith(`${sessionId}:`)) {
        const field = key.split(':')[1];
        stats[field] = count;
      }
    }
    return stats;
  }
}

export const antiLoop = new AntiLoop();
