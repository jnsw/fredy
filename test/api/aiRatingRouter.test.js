/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../lib/services/storage/aiRatingSettingsStorage.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getAiRatingSettings: vi.fn(() => null),
    saveAiRatingSettings: vi.fn(),
    deleteAiRatingSettings: vi.fn(() => 1),
  };
});
vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  filterListingIdsForUser: vi.fn((ids) => ids),
  getListingById: vi.fn((id) => ({ id })),
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({ demoMode: false })),
  getUserSettings: vi.fn(() => ({})),
}));
vi.mock('../../lib/services/ai/aiRatingService.js', () => ({ rateAndStoreListing: vi.fn() }));
vi.mock('../../lib/services/logger.js', () => ({ default: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/api/security.js', () => ({ isAdmin: vi.fn(() => false) }));

import * as aiSettingsStorage from '../../lib/services/storage/aiRatingSettingsStorage.js';
import * as listingStorage from '../../lib/services/storage/listingsStorage.js';
import { getSettings } from '../../lib/services/storage/settingsStorage.js';
import { rateAndStoreListing } from '../../lib/services/ai/aiRatingService.js';
import { isAdmin } from '../../lib/api/security.js';
import aiRatingPlugin from '../../lib/api/routes/aiRatingRouter.js';

async function request(method, url, payload) {
  const app = Fastify();
  app.addHook('onRequest', async (req) => {
    req.session = { currentUser: 'u1' };
    req.currentUser = { id: 'u1', isAdmin: isAdmin() };
  });
  await app.register(aiRatingPlugin);
  await app.ready();
  return app.inject({ method, url, payload });
}

const STORED = {
  userId: 'u1',
  provider: 'anthropic',
  apiKey: 'sk-ant-stored-secret',
  baseUrl: null,
  model: null,
  instructions: null,
  autoRate: true,
  autoRateSince: 1_000,
  dailyLimit: 50,
  pausedUntil: null,
  lastError: null,
  updatedAt: 1_000,
};

beforeEach(() => {
  vi.clearAllMocks();
  isAdmin.mockReturnValue(false);
  getSettings.mockResolvedValue({ demoMode: false });
  aiSettingsStorage.getAiRatingSettings.mockReturnValue(null);
  listingStorage.filterListingIdsForUser.mockImplementation((ids) => ids);
  listingStorage.getListingById.mockImplementation((id) => ({ id }));
});

describe('GET /settings', () => {
  it('says a key is stored, and never which one', async () => {
    aiSettingsStorage.getAiRatingSettings.mockReturnValue(STORED);

    const response = await request('GET', '/settings');

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('sk-ant-stored-secret');
    expect(response.json().settings).toMatchObject({ provider: 'anthropic', hasApiKey: true, autoRate: true });
    expect(response.json().defaults.anthropicModel).toBe('claude-opus-5-5');
  });

  it('answers with no settings for a user who never set it up', async () => {
    const response = await request('GET', '/settings');
    expect(response.json().settings).toBeNull();
  });
});

describe('POST /settings', () => {
  const save = (payload) => request('POST', '/settings', payload);

  it('stores a first Anthropic setup', async () => {
    const response = await save({ provider: 'anthropic', apiKey: ' sk-ant-new ', autoRate: true, dailyLimit: 20 });

    expect(response.statusCode).toBe(200);
    expect(aiSettingsStorage.saveAiRatingSettings).toHaveBeenCalledWith('u1', {
      provider: 'anthropic',
      apiKey: 'sk-ant-new',
      baseUrl: null,
      model: null,
      instructions: null,
      autoRate: true,
      dailyLimit: 20,
    });
    expect(response.body).not.toContain('sk-ant-new');
  });

  it('needs a key the first time', async () => {
    const response = await save({ provider: 'anthropic' });
    expect(response.statusCode).toBe(400);
    expect(aiSettingsStorage.saveAiRatingSettings).not.toHaveBeenCalled();
  });

  it('keeps the stored key when the field is left empty and nothing about the destination changed', async () => {
    aiSettingsStorage.getAiRatingSettings.mockReturnValue(STORED);

    const response = await save({ provider: 'anthropic', apiKey: '', model: 'claude-sonnet-5-5' });

    expect(response.statusCode).toBe(200);
    expect(aiSettingsStorage.saveAiRatingSettings.mock.calls[0][1]).toMatchObject({
      apiKey: 'sk-ant-stored-secret',
      model: 'claude-sonnet-5-5',
    });
  });

  it('does not carry a stored key over to a different provider or server', async () => {
    aiSettingsStorage.getAiRatingSettings.mockReturnValue(STORED);

    const toOpenAi = await save({
      provider: 'openai-compatible',
      baseUrl: 'https://llm.example.com/v1',
      model: 'gpt-5',
    });
    expect(toOpenAi.statusCode).toBe(400);

    aiSettingsStorage.getAiRatingSettings.mockReturnValue({
      ...STORED,
      provider: 'openai-compatible',
      baseUrl: 'https://llm.example.com/v1',
      model: 'gpt-5',
    });
    const otherServer = await save({
      provider: 'openai-compatible',
      baseUrl: 'https://elsewhere.example/v1',
      model: 'gpt-5',
    });
    expect(otherServer.statusCode).toBe(400);
    expect(aiSettingsStorage.saveAiRatingSettings).not.toHaveBeenCalled();
  });

  it('wants a base URL and a model for an OpenAI-compatible server', async () => {
    expect((await save({ provider: 'openai-compatible', apiKey: 'k', model: 'gpt-5' })).statusCode).toBe(400);
    expect(
      (await save({ provider: 'openai-compatible', apiKey: 'k', baseUrl: 'https://x.example/v1' })).statusCode,
    ).toBe(400);
    expect(
      (await save({ provider: 'openai-compatible', apiKey: 'k', baseUrl: 'https://x.example/v1/', model: 'gpt-5' }))
        .statusCode,
    ).toBe(200);
    expect(aiSettingsStorage.saveAiRatingSettings.mock.calls[0][1].baseUrl).toBe('https://x.example/v1');
  });

  it('lets only an admin point the key at a server on the local network', async () => {
    const local = {
      provider: 'openai-compatible',
      apiKey: 'k',
      baseUrl: 'http://192.168.1.20:11434/v1',
      model: 'llama3.1:8b',
    };

    expect((await save(local)).statusCode).toBe(400);

    isAdmin.mockReturnValue(true);
    expect((await save(local)).statusCode).toBe(200);
  });

  it.each([
    [{ provider: 'mystery', apiKey: 'k' }],
    [{ provider: 'anthropic', apiKey: 'k', model: 'rm -rf /; echo' }],
    [{ provider: 'anthropic', apiKey: 'k', dailyLimit: 0 }],
    [{ provider: 'anthropic', apiKey: 'k', dailyLimit: 5000 }],
    [{ provider: 'anthropic', apiKey: 'k', instructions: 'x'.repeat(10_001) }],
    [{ provider: 'anthropic', apiKey: 'two words' }],
  ])('refuses %j', async (payload) => {
    expect((await save(payload)).statusCode).toBe(400);
    expect(aiSettingsStorage.saveAiRatingSettings).not.toHaveBeenCalled();
  });

  it('refuses to store a key on a demo instance', async () => {
    getSettings.mockResolvedValue({ demoMode: true });
    expect((await save({ provider: 'anthropic', apiKey: 'k' })).statusCode).toBe(403);
    expect(aiSettingsStorage.saveAiRatingSettings).not.toHaveBeenCalled();
  });
});

describe('DELETE /settings', () => {
  it('removes the settings of the signed-in user', async () => {
    const response = await request('DELETE', '/settings');
    expect(response.statusCode).toBe(200);
    expect(aiSettingsStorage.deleteAiRatingSettings).toHaveBeenCalledWith('u1');
  });
});

describe('POST /rate', () => {
  const rate = (payload) => request('POST', '/rate', payload);

  beforeEach(() => {
    aiSettingsStorage.getAiRatingSettings.mockReturnValue(STORED);
    rateAndStoreListing.mockResolvedValue({
      status: 'rated',
      verdict: 'good',
      reason: 'ok',
      source: 'claude-opus-5-5',
    });
  });

  it('rates each listing with the stored settings', async () => {
    const response = await rate({ listingIds: ['a', 'b'] });

    expect(response.statusCode).toBe(200);
    expect(rateAndStoreListing).toHaveBeenCalledTimes(2);
    expect(rateAndStoreListing).toHaveBeenCalledWith({ id: 'a' }, STORED);
    expect(response.json().results.map((r) => r.status)).toEqual(['rated', 'rated']);
    expect(listingStorage.getListingById).toHaveBeenCalledWith('a', 'u1', false, { includeGeometry: false });
  });

  it('stops at a failure about the key, and reports the rest as skipped', async () => {
    rateAndStoreListing.mockResolvedValueOnce({ status: 'failed', kind: 'auth', message: 'invalid x-api-key' });

    const response = await rate({ listingIds: ['a', 'b', 'c'] });

    expect(rateAndStoreListing).toHaveBeenCalledTimes(1);
    expect(response.json().results.map((r) => r.status)).toEqual(['failed', 'skipped', 'skipped']);
    expect(response.json().stopped).toEqual({ kind: 'auth', message: 'invalid x-api-key' });
  });

  it('goes on past a listing the model could not rate', async () => {
    rateAndStoreListing.mockResolvedValueOnce({ status: 'failed', kind: 'listing', message: 'declined' });

    const response = await rate({ listingIds: ['a', 'b'] });

    expect(rateAndStoreListing).toHaveBeenCalledTimes(2);
    expect(response.json().stopped).toBeNull();
  });

  it('refuses a listing the user cannot see, before rating anything', async () => {
    listingStorage.filterListingIdsForUser.mockReturnValue(['a']);

    const response = await rate({ listingIds: ['a', 'someone-elses'] });

    expect(response.statusCode).toBe(403);
    expect(rateAndStoreListing).not.toHaveBeenCalled();
  });

  it('needs a stored key', async () => {
    aiSettingsStorage.getAiRatingSettings.mockReturnValue(null);
    expect((await rate({ listingIds: ['a'] })).statusCode).toBe(400);
    expect(rateAndStoreListing).not.toHaveBeenCalled();
  });

  it('takes a handful per request, not a whole page', async () => {
    expect((await rate({ listingIds: ['1', '2', '3', '4', '5', '6'] })).statusCode).toBe(400);
    expect((await rate({ listingIds: [] })).statusCode).toBe(400);
    expect(rateAndStoreListing).not.toHaveBeenCalled();
  });

  it('refuses on a demo instance', async () => {
    getSettings.mockResolvedValue({ demoMode: true });
    expect((await rate({ listingIds: ['a'] })).statusCode).toBe(403);
    expect(rateAndStoreListing).not.toHaveBeenCalled();
  });
});
