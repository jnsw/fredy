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
 * The scheduler holds the random delay to its bounds on its own, so a bad value would be stored and
 * quietly mean something other than what the admin typed. The route is where it can still be said.
 */
describe('POST /api/admin/generalSettings - intervalJitterPercent', () => {
  const post = async (body) => {
    const handler = await loadPostHandler();
    const reply = replyDouble();
    await handler({ body }, reply);
    return reply.recorded;
  };

  it.each([
    [0, 0],
    ['20', 20],
    [50, 50],
  ])('stores %s as the number %s', async (value, stored) => {
    const result = await post({ intervalJitterPercent: value });

    expect(result.status).toBe(200);
    expect(upserted[0].intervalJitterPercent).toBe(stored);
  });

  it.each([-1, 51, 12.5, '', null, 'lots'])('refuses %s', async (value) => {
    const result = await post({ intervalJitterPercent: value });

    expect(result.status).toBe(400);
    expect(result.payload.error).toMatch(/intervalJitterPercent/);
    expect(upserted).toEqual([]);
  });

  it('leaves a save without the field alone', async () => {
    const result = await post({ interval: '60' });

    expect(result.status).toBe(200);
    expect(upserted[0]).not.toHaveProperty('intervalJitterPercent');
  });
});
