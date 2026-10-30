/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../../services/logger.js';
import { isAdmin } from '../security.js';
import { getSettings } from '../../services/storage/settingsStorage.js';
import * as aiSettingsStorage from '../../services/storage/aiRatingSettingsStorage.js';
import * as listingStorage from '../../services/storage/listingsStorage.js';
import { isPubliclyFetchableUrl } from '../../services/security/outboundUrl.js';
import { AI_PROVIDERS, DEFAULT_ANTHROPIC_MODEL } from '../../services/ai/listingRater.js';
import { DEFAULT_RATING_INSTRUCTIONS, MAX_RATING_INSTRUCTIONS_LENGTH } from '../../services/ai/ratingPrompt.js';
import { rateAndStoreListing } from '../../services/ai/aiRatingService.js';

/**
 * Each user's own AI key, and rating listings with it.
 *
 * Everything here acts on the signed-in user's own settings and nobody else's - an admin included.
 * There is no route that reads another user's settings, and none that returns a key at all: the key
 * is write-only, and the settings page learns only whether one is stored.
 */

/** Most listings one request may rate. Each is a model call of several seconds. */
export const MAX_LISTINGS_PER_RATE_REQUEST = 5;

/** Longest key accepted. Real keys are a fraction of this; the cap only keeps garbage out. */
const MAX_API_KEY_LENGTH = 500;

/** Longest base URL accepted. */
const MAX_BASE_URL_LENGTH = 500;

/** Model ids: `claude-opus-5-5`, `gpt-5`, `llama3.1:8b`, `meta-llama/Llama-3.1-8B-Instruct`. */
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,99}$/;

/** Bounds of the daily limit a user may set. */
const DAILY_LIMIT_RANGE = { min: 1, max: 1000 };

/**
 * The settings as the page gets them: the user's own, the defaults to show as placeholders, and the
 * providers to choose from.
 *
 * @param {string} userId
 * @returns {Object}
 */
const settingsResponse = (userId) => ({
  settings: aiSettingsStorage.toPublicAiRatingSettings(aiSettingsStorage.getAiRatingSettings(userId)),
  defaults: {
    anthropicModel: DEFAULT_ANTHROPIC_MODEL,
    instructions: DEFAULT_RATING_INSTRUCTIONS,
    dailyLimit: aiSettingsStorage.DEFAULT_AI_DAILY_LIMIT,
    pausedUntilSaved: aiSettingsStorage.PAUSED_UNTIL_SAVED,
  },
  providers: Object.values(AI_PROVIDERS),
  maxListingsPerRequest: MAX_LISTINGS_PER_RATE_REQUEST,
});

/**
 * Check and normalise a settings body against what is stored.
 *
 * @param {Object} body
 * @param {import('../../services/storage/aiRatingSettingsStorage.js').AiRatingSettings|null} existing
 * @param {boolean} requestIsAdmin
 * @returns {{error: string}|{values: Object}}
 */
function validateSettings(body, existing, requestIsAdmin) {
  const provider = body.provider;
  if (!Object.values(AI_PROVIDERS).includes(provider)) {
    return { error: 'Unknown AI provider.' };
  }

  let baseUrl = null;
  if (provider === AI_PROVIDERS.OPENAI_COMPATIBLE) {
    baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim().replace(/\/+$/, '') : '';
    let parsed = null;
    try {
      parsed = new URL(baseUrl);
    } catch {
      parsed = null;
    }
    if (parsed == null || !['http:', 'https:'].includes(parsed.protocol) || baseUrl.length > MAX_BASE_URL_LENGTH) {
      return { error: 'An OpenAI-compatible server needs a base URL, such as https://api.openai.com/v1.' };
    }
    // The server sends the key to this address, and it sits inside somebody's home network. Only an
    // admin may point it at a private one, the same rule the sqlite adapter's file path follows.
    if (!requestIsAdmin && !isPubliclyFetchableUrl(baseUrl)) {
      return { error: 'The base URL must be a public http(s) address. Ask an administrator to set up a local server.' };
    }
  }

  const model = typeof body.model === 'string' && body.model.trim().length > 0 ? body.model.trim() : null;
  if (model != null && !MODEL_PATTERN.test(model)) {
    return { error: 'That does not look like a model name.' };
  }
  if (model == null && provider === AI_PROVIDERS.OPENAI_COMPATIBLE) {
    return { error: 'Name the model the OpenAI-compatible server should use.' };
  }

  let instructions = null;
  if (typeof body.instructions === 'string' && body.instructions.trim().length > 0) {
    instructions = body.instructions.trim();
    if (instructions.length > MAX_RATING_INSTRUCTIONS_LENGTH) {
      return { error: `The rating criteria may be at most ${MAX_RATING_INSTRUCTIONS_LENGTH} characters long.` };
    }
  }

  const dailyLimit = body.dailyLimit == null ? aiSettingsStorage.DEFAULT_AI_DAILY_LIMIT : Number(body.dailyLimit);
  if (!Number.isInteger(dailyLimit) || dailyLimit < DAILY_LIMIT_RANGE.min || dailyLimit > DAILY_LIMIT_RANGE.max) {
    return {
      error: `The daily limit must be a whole number from ${DAILY_LIMIT_RANGE.min} to ${DAILY_LIMIT_RANGE.max}.`,
    };
  }

  // The key is write-only. An empty field means "keep the stored one" - but only while it would go
  // to the same place. A key entered for Anthropic must not be sent to a different provider, and a
  // key entered for one server not to another one that was typed in later, without the user typing
  // the key again: otherwise a changed URL is all it takes to send a stored key somewhere new.
  const typedKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  let apiKey = typedKey;
  if (typedKey.length === 0) {
    const sameDestination = existing != null && existing.provider === provider && existing.baseUrl === baseUrl;
    if (!existing?.apiKey || !sameDestination) {
      return { error: 'Enter the API key.' };
    }
    apiKey = existing.apiKey;
  }
  if (apiKey.length > MAX_API_KEY_LENGTH || /\s/.test(apiKey)) {
    return { error: 'That does not look like an API key.' };
  }

  return {
    values: { provider, apiKey, baseUrl, model, instructions, autoRate: body.autoRate === true, dailyLimit },
  };
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function aiRatingPlugin(fastify) {
  fastify.get('/settings', async (request) => settingsResponse(request.session.currentUser));

  fastify.post('/settings', async (request, reply) => {
    const userId = request.session.currentUser;
    const settings = await getSettings();
    // A demo account is shared by strangers: a key stored there would be spent by all of them.
    if (settings.demoMode && !isAdmin(request)) {
      return reply.code(403).send({ error: 'Sorry, but you cannot store an AI key in demo mode ;)' });
    }

    const result = validateSettings(
      request.body ?? {},
      aiSettingsStorage.getAiRatingSettings(userId),
      isAdmin(request),
    );
    if (result.error) {
      return reply.code(400).send({ error: result.error });
    }
    try {
      aiSettingsStorage.saveAiRatingSettings(userId, result.values);
      return settingsResponse(userId);
    } catch (error) {
      logger.error('Failed to save the AI rating settings', error);
      return reply.code(500).send({ error: 'Failed to save the AI rating settings.' });
    }
  });

  fastify.delete('/settings', async (request) => {
    aiSettingsStorage.deleteAiRatingSettings(request.session.currentUser);
    return settingsResponse(request.session.currentUser);
  });

  /**
   * Rate listings the user picked, now, with their own key.
   *
   * A few per request, one after the other: the page sends a larger selection in rounds, which
   * keeps every request short enough for a reverse proxy's timeout and lets it show progress. A
   * failure that is about the key or the provider ends the request early and is reported once,
   * rather than once per remaining listing.
   */
  fastify.post('/rate', async (request, reply) => {
    const userId = request.session.currentUser;
    const requestIsAdmin = isAdmin(request);
    const settings = await getSettings();
    if (settings.demoMode && !requestIsAdmin) {
      return reply.code(403).send({ error: 'Sorry, but you cannot rate listings in demo mode ;)' });
    }

    const { listingIds } = request.body ?? {};
    if (!Array.isArray(listingIds) || listingIds.length === 0) {
      return reply.code(400).send({ error: 'listingIds must be a non-empty array.' });
    }
    const ids = [...new Set(listingIds)];
    if (ids.length > MAX_LISTINGS_PER_RATE_REQUEST) {
      return reply.code(400).send({ error: `At most ${MAX_LISTINGS_PER_RATE_REQUEST} listings per request.` });
    }

    const aiSettings = aiSettingsStorage.getAiRatingSettings(userId);
    if (!aiSettings?.apiKey) {
      return reply.code(400).send({ error: 'Store an API key under Settings › AI rating first.' });
    }

    // All or nothing, like every other route taking listing ids: a request naming a listing the user
    // cannot see is refused outright.
    const allowed = listingStorage.filterListingIdsForUser(ids, userId, requestIsAdmin);
    if (allowed.length !== ids.length) {
      return reply.code(403).send({ error: 'You are trying to rate a listing that is not associated to your user.' });
    }

    const results = [];
    let stopped = null;
    for (const listingId of ids) {
      if (stopped != null) {
        results.push({ listingId, status: 'skipped' });
        continue;
      }
      const listing = listingStorage.getListingById(listingId, userId, requestIsAdmin, { includeGeometry: false });
      if (listing == null) {
        results.push({ listingId, status: 'notFound' });
        continue;
      }
      const outcome = await rateAndStoreListing(listing, aiSettings);
      results.push({ listingId, ...outcome });
      if (outcome.status === 'failed' && outcome.kind !== 'listing') {
        stopped = { kind: outcome.kind, message: outcome.message };
      }
    }
    return { results, stopped };
  });
}
