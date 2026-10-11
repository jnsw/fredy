/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

const root = (await import('node:path')).resolve('.');

let upserted;

/**
 * Register the settings plugin against a fastify double and return its POST handler.
 *
 * @returns {Promise<(request: any, reply: any) => Promise<any>>}
 */
async function loadPostHandler() {
  upserted = [];
  vi.resetModules();
  vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({
    getSettings: async () => ({ demoMode: false }),
    getPublicSettings: async () => ({}),
    upsertSettings: (settings) => upserted.push(settings),
  }));
  vi.doMock(root + '/lib/api/security.js', () => ({ isAdmin: () => true }));
  vi.doMock(root + '/lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
  vi.doMock(root + '/lib/services/storage/userStorage.js', () => ({ ensureDemoUserExists: vi.fn() }));
  const utils = await vi.importActual(root + '/lib/utils.js');
  vi.doMock(root + '/lib/utils.js', () => ({ ...utils, updateConfigOnDisk: vi.fn() }));

  const plugin = (await import(root + '/lib/api/routes/generalSettingsRoute.js')).default;
  const routes = {};
  await plugin({ get: () => {}, post: (path, handler) => (routes[`POST ${path}`] = handler) });
  return routes['POST /'];
}

/** A reply double that records what the handler answered. */
function replyDouble() {
  const recorded = { status: 200, payload: undefined };
  return {
    recorded,
    code(status) {
      recorded.status = status;
      return this;
    },
    send(payload) {
      recorded.payload = payload;
      return this;
    },
  };
}

/**
 * `maxResultPages` decides how many requests every search may send at a portal on every run, so a
 * value outside its range is refused at the route rather than turned into a burst that gets the
 * instance blocked.
 */
describe('POST /api/admin/generalSettings - maxResultPages', () => {
  const post = async (body) => {
    const handler = await loadPostHandler();
    const reply = replyDouble();
    await handler({ body }, reply);
    return reply.recorded;
  };

  it('stores a valid limit as a number', async () => {
    const result = await post({ maxResultPages: '5' });
    expect(result.status).toBe(200);
    expect(upserted[0].maxResultPages).toBe(5);
  });

  it('accepts one, which reads the first page alone as Fredy did before', async () => {
    await post({ maxResultPages: 1 });
    expect(upserted[0].maxResultPages).toBe(1);
  });

  it('rejects zero, a fraction and anything beyond the ceiling', async () => {
    for (const value of [0, 2.5, 11, 'all']) {
      const result = await post({ maxResultPages: value });
      expect(result.status).toBe(400);
      expect(result.payload.error).toContain('maxResultPages');
    }
    expect(upserted).toEqual([]);
  });

  it('rejects an empty value instead of reading it as zero', async () => {
    expect((await post({ maxResultPages: '' })).status).toBe(400);
    expect((await post({ maxResultPages: null })).status).toBe(400);
  });

  it('leaves the setting untouched when the request does not mention it', async () => {
    const result = await post({ interval: 30 });
    expect(result.status).toBe(200);
    expect(upserted[0]).not.toHaveProperty('maxResultPages');
  });
});
