/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

import { buildSystemPrompt, describeListing } from './ratingPrompt.js';
import { isPubliclyFetchableUrl } from '../security/outboundUrl.js';
import { MAX_AI_VERDICT_REASON_LENGTH } from '../listings/aiVerdict.js';
import { portalFetch } from '../proxy/portalProxy.js';

/**
 * Rate one listing with the user's own AI key: one request, one structured answer.
 *
 * Deliberately not an agent. The model gets the listing and, for Anthropic, its photo, and has no
 * tool to call and nothing to fetch. The answer is constrained to `{verdict, reasoning}`, so the
 * worst a hostile advert can achieve is a wrong verdict on itself - it cannot reach the filesystem,
 * another listing or another user's data, which is what makes this safe to offer to every user and
 * not only admins.
 */

/**
 * The providers a user can rate with.
 * @type {Readonly<{ANTHROPIC: 'anthropic', OPENAI_COMPATIBLE: 'openai-compatible'}>}
 */
export const AI_PROVIDERS = Object.freeze({ ANTHROPIC: 'anthropic', OPENAI_COMPATIBLE: 'openai-compatible' });

/**
 * The model used when the user names none. Anthropic only: an OpenAI-compatible server can run
 * anything, so there the user has to say which model.
 * @type {string}
 */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

/**
 * The ceiling on one answer, thinking included. Thinking is always on with the current Claude models
 * and counts towards this, so it is sized for the thinking a low effort does plus a three-sentence
 * reply - and it is also what caps the cost of one listing.
 * @type {number}
 */
const MAX_TOKENS = 4096;

/** How long one rating may take before it is given up, in milliseconds. */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Retries the Anthropic client makes on its own for a rate limit, an overload or a dropped
 * connection, honouring the server's retry-after. After that the failure comes back here and pauses
 * the background rating instead.
 */
const SDK_MAX_RETRIES = 2;

/**
 * Models that understand `output_config.effort`. Rating an advert is a classification, which the
 * current models do well at low effort - the cheapest setting that holds quality. An older model
 * rejects the field, so it is only sent where it is known to be accepted.
 * @type {string[]}
 */
const EFFORT_MODEL_PREFIXES = [
  'claude-fable-5',
  'claude-mythos-5',
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-5',
  'claude-opus-4-5',
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-sonnet-4-6',
];

/**
 * Models that support the server-side refusal fallback: when a safety classifier declines the
 * request, the API re-runs it on Anthropic's recommended substitute instead of returning the
 * refusal. Sent only to these, because another model rejects the parameter.
 * @type {Set<string>}
 */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

/** The beta that gates `fallbacks: 'default'`. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Image types the Messages API accepts. */
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/** Largest photo sent along, in bytes. Base64 adds a third, and the API refuses images over 5 MB. */
const MAX_IMAGE_BYTES = 3_500_000;

/** How long fetching the photo may take before the listing is rated without it. */
const IMAGE_TIMEOUT_MS = 10_000;

/**
 * The answer every provider has to give.
 */
const RATING_SCHEMA = z.object({
  verdict: z.enum(['good', 'maybe', 'bad']),
  reasoning: z.string(),
});

/**
 * The same shape as JSON Schema, for the OpenAI-compatible `response_format`.
 * @type {Object}
 */
const RATING_JSON_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['good', 'maybe', 'bad'] },
    reasoning: { type: 'string' },
  },
  required: ['verdict', 'reasoning'],
  additionalProperties: false,
};

/**
 * Why a rating did not happen, sorted by what the caller should do about it.
 *
 * - `listing` - this listing could not be rated (a refusal, an answer that did not parse). Count it
 *   against the listing and carry on with the next one.
 * - `rateLimit` / `unavailable` - the provider is busy or down. Stop for now and try again later.
 * - `auth` - the key was rejected. Stop until the user changes it.
 * - `config` - the provider refused the request itself (an unknown model, a bad base URL). Stop
 *   until the user changes the settings.
 */
export class AiRatingError extends Error {
  /**
   * @param {('listing'|'rateLimit'|'unavailable'|'auth'|'config')} kind
   * @param {string} message
   * @param {{retryAfterMs?: number|null, cause?: unknown}} [options]
   */
  constructor(kind, message, { retryAfterMs = null, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'AiRatingError';
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Whether a failure is about the account rather than one listing, so the caller should stop.
 *
 * @param {AiRatingError} error
 * @returns {boolean}
 */
export const stopsTheRun = (error) => error?.kind !== 'listing';

/**
 * @typedef {Object} RatingResult
 * @property {('good'|'maybe'|'bad')} verdict
 * @property {string} reason
 * @property {string} source - The model that rated it.
 */

/**
 * @typedef {Object} RaterDeps
 * @property {(apiKey: string) => Object} [createAnthropicClient] - Builds the Anthropic client.
 * @property {typeof fetch} [fetchImpl] - Used for the OpenAI-compatible call and the photo.
 */

/**
 * The real Anthropic client for a user's key.
 *
 * @param {string} apiKey
 * @returns {Anthropic}
 */
export const createAnthropicClient = (apiKey) =>
  new Anthropic({ apiKey, maxRetries: SDK_MAX_RETRIES, timeout: REQUEST_TIMEOUT_MS });

/**
 * Rate one listing.
 *
 * @param {Object} params
 * @param {Object} params.listing - A row as `getListingById` returns it.
 * @param {import('../storage/aiRatingSettingsStorage.js').AiRatingSettings} params.settings
 * @param {string|null} [params.language] - The user's UI language; the reasoning is written in it.
 * @param {boolean} [params.allowPrivateBaseUrl=false] - Whether the base URL may name a private
 *   address. Only for admins, who may run a model on their own network.
 * @param {RaterDeps} [params.deps]
 * @returns {Promise<RatingResult>}
 * @throws {AiRatingError}
 */
export async function rateListing({ listing, settings, language = null, allowPrivateBaseUrl = false, deps = {} }) {
  if (!settings?.apiKey) {
    throw new AiRatingError('auth', 'No API key is stored.');
  }
  const system = buildSystemPrompt(settings.instructions, language);
  const listingText = describeListing(listing);

  if (settings.provider === AI_PROVIDERS.ANTHROPIC) {
    return rateWithAnthropic({ listing, settings, system, listingText, deps });
  }
  if (settings.provider === AI_PROVIDERS.OPENAI_COMPATIBLE) {
    return rateWithOpenAiCompatible({ settings, system, listingText, allowPrivateBaseUrl, deps });
  }
  throw new AiRatingError('config', `Unknown AI provider: ${settings.provider}`);
}

/**
 * The verdict and reasoning, checked and trimmed, or a listing-level error.
 *
 * @param {unknown} output
 * @param {string} source
 * @returns {RatingResult}
 */
function toResult(output, source) {
  const parsed = RATING_SCHEMA.safeParse(output);
  if (!parsed.success) {
    throw new AiRatingError('listing', 'The model did not answer with a verdict.');
  }
  return {
    verdict: parsed.data.verdict,
    reason: parsed.data.reasoning.trim().slice(0, MAX_AI_VERDICT_REASON_LENGTH),
    source,
  };
}

/**
 * @param {Object} params
 * @param {Object} params.listing
 * @param {import('../storage/aiRatingSettingsStorage.js').AiRatingSettings} params.settings
 * @param {string} params.system
 * @param {string} params.listingText
 * @param {RaterDeps} params.deps
 * @returns {Promise<RatingResult>}
 */
async function rateWithAnthropic({ listing, settings, system, listingText, deps }) {
  const model = settings.model || DEFAULT_ANTHROPIC_MODEL;
  const client = (deps.createAnthropicClient ?? createAnthropicClient)(settings.apiKey);
  // The photo is the portal's, so it goes out the way every other request to a portal does: through
  // the configured proxy. The model API below is not a portal and is called directly.
  const image = await fetchListingImage(listing.image_url, deps.fetchImpl ?? portalFetch);

  const textBlock = { type: 'text', text: listingText };
  const send = (content) =>
    client.beta.messages.parse({
      model,
      max_tokens: MAX_TOKENS,
      // The frame and the user's criteria are the same for every listing of a run, so they are
      // cached and the second listing onwards pays a fraction for them. A prompt under the model's
      // minimum cacheable length is simply not cached; nothing breaks.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
      output_config: {
        format: betaZodOutputFormat(RATING_SCHEMA),
        ...(EFFORT_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix)) ? { effort: 'low' } : {}),
      },
      ...(FALLBACK_MODELS.has(model) ? { betas: [FALLBACK_BETA], fallbacks: 'default' } : {}),
    });

  let message;
  try {
    message =
      image == null
        ? await send([textBlock])
        : await send([
            { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
            textBlock,
          ]).catch((error) => {
            // A photo the API cannot decode fails the whole request with a 400, which would read as
            // a broken configuration and pause every rating. One retry from the text settles it:
            // if that goes through, it was the photo.
            if (error instanceof Anthropic.BadRequestError) return send([textBlock]);
            throw error;
          });
  } catch (error) {
    throw classifyAnthropicError(error);
  }

  if (message.stop_reason === 'refusal') {
    throw new AiRatingError('listing', 'The model declined to rate this listing.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new AiRatingError('listing', 'The answer was cut off before it was complete.');
  }
  // The model that answered, which differs from the one asked for when a refusal fell back.
  return toResult(message.parsed_output, message.model || model);
}

/**
 * Sort an Anthropic SDK error into what the caller does about it.
 *
 * @param {unknown} error
 * @returns {AiRatingError}
 */
function classifyAnthropicError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AiRatingError('auth', message, { cause: error });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiRatingError('rateLimit', message, {
      retryAfterMs: retryAfterMs(error.headers?.get?.('retry-after')),
      cause: error,
    });
  }
  if (error instanceof Anthropic.NotFoundError || error instanceof Anthropic.BadRequestError) {
    return new AiRatingError('config', message, { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.InternalServerError) {
    return new AiRatingError('unavailable', message, { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    return new AiRatingError(error.status >= 500 ? 'unavailable' : 'config', message, { cause: error });
  }
  // What is left is the SDK failing to parse the structured answer - this listing's problem.
  return new AiRatingError('listing', message, { cause: error });
}

/**
 * @param {Object} params
 * @param {import('../storage/aiRatingSettingsStorage.js').AiRatingSettings} params.settings
 * @param {string} params.system
 * @param {string} params.listingText
 * @param {boolean} params.allowPrivateBaseUrl
 * @param {RaterDeps} params.deps
 * @returns {Promise<RatingResult>}
 */
async function rateWithOpenAiCompatible({ settings, system, listingText, allowPrivateBaseUrl, deps }) {
  const baseUrl = typeof settings.baseUrl === 'string' ? settings.baseUrl.trim().replace(/\/+$/, '') : '';
  if (baseUrl.length === 0) {
    throw new AiRatingError('config', 'No base URL is set for the OpenAI-compatible server.');
  }
  if (!settings.model) {
    throw new AiRatingError('config', 'No model is set for the OpenAI-compatible server.');
  }
  // The base URL is typed by a user, and the server is what calls it. Checked again here and not
  // only when it was saved, because the user may have lost their admin rights since.
  if (!allowPrivateBaseUrl && !isPubliclyFetchableUrl(baseUrl)) {
    throw new AiRatingError('config', 'The base URL must be a public http(s) address.');
  }

  let response;
  try {
    response = await (deps.fetchImpl ?? fetch)(`${baseUrl}/chat/completions`, {
      method: 'POST',
      // A public address answering with a redirect to a private one is the same request the check
      // above refused, so redirects are not followed.
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.apiKey}` },
      // Text only. Many OpenAI-compatible servers run models that cannot read images, and sending a
      // photo to one of them fails the whole request rather than the photo.
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: listingText },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'listing_rating', strict: true, schema: RATING_JSON_SCHEMA },
        },
      }),
    });
  } catch (error) {
    throw new AiRatingError('unavailable', `Could not reach ${new URL(baseUrl).host}: ${error.message}`, {
      cause: error,
    });
  }

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = json?.error?.message ?? `HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403) throw new AiRatingError('auth', detail);
    if (response.status === 429) {
      throw new AiRatingError('rateLimit', detail, {
        retryAfterMs: retryAfterMs(response.headers.get('retry-after')),
      });
    }
    if (response.status >= 500) throw new AiRatingError('unavailable', detail);
    throw new AiRatingError('config', detail);
  }

  const text = json?.choices?.[0]?.message?.content;
  let output;
  try {
    output = typeof text === 'string' ? JSON.parse(text) : null;
  } catch {
    output = null;
  }
  return toResult(output, settings.model);
}

/**
 * Read a `retry-after` header into milliseconds.
 *
 * @param {string|null|undefined} value - Seconds, or an HTTP date.
 * @returns {number|null}
 */
function retryAfterMs(value) {
  if (value == null || value === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

/**
 * Download a listing's preview photo for the model to look at.
 *
 * Best effort: anything that goes wrong - no URL, a private address, a timeout, a redirect, a type
 * the API does not take, a file too large - means the listing is rated from its text alone. A photo
 * is a bonus; a rating that fails because of one would be worse than a rating without it.
 *
 * @param {string|null|undefined} imageUrl
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{mediaType: string, data: string}|null>} Base64 data, or null.
 */
export async function fetchListingImage(imageUrl, fetchImpl) {
  // Scraped, so whatever a portal's markup said. See outboundUrl.js for why private addresses are
  // refused.
  if (!isPubliclyFetchableUrl(imageUrl)) return null;
  try {
    const response = await fetchImpl(imageUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif' },
    });
    if (!response.ok) return null;
    const mediaType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!SUPPORTED_IMAGE_TYPES.has(mediaType)) return null;
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return null;
    const buffer = await readAtMost(response, MAX_IMAGE_BYTES);
    if (buffer == null || buffer.length === 0) return null;
    return { mediaType, data: buffer.toString('base64') };
  } catch {
    return null;
  }
}

/**
 * Read a response body, giving up as soon as it grows past `maxBytes`.
 *
 * The declared length is only a claim, and a server that sends none - or lies - would otherwise
 * have the whole body buffered in memory before the size is ever checked.
 *
 * @param {Response} response
 * @param {number} maxBytes
 * @returns {Promise<Buffer|null>} The body, or null when it was too large.
 */
async function readAtMost(response, maxBytes) {
  if (response.body == null) return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}
