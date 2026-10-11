/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { randomBytes } from 'node:crypto';
import { getSettings } from '../storage/settingsStorage.js';

/**
 * The one place that decides how Fredy reaches a real estate portal.
 *
 * The proxy setting used to reach only the headless browser. Everything a portal is asked without
 * one - the search apis (ImmoScout's mobile api, idealista, casa.it, Bien'ici, willhaben, ...), the
 * detail and alive probes, the photos a notification or the MCP server downloads - went out from
 * the server's own address. A portal that blocks a datacenter IP blocks it for those requests just
 * the same, and every one of them told the portal which address the proxy was hiding.
 *
 * Every request to a portal therefore goes through {@link portalFetch}, and every browser launch
 * reads the same setting (see `launchBrowser`). Requests to Fredy's own infrastructure - geocoding,
 * the notification services, connectivity and transit data, tracking - keep using their own
 * clients and stay direct: the operator pays for the proxy to look like a household to the portals,
 * not to route a Telegram message or a Nominatim lookup through it.
 *
 * Where a proxy is configured, it is never bypassed. A url the requests cannot use rejects the
 * request instead of sending it directly, because quietly falling back to the server's address is
 * exactly the block the proxy was bought against.
 */

/**
 * Written anywhere in the proxy url, e.g. `http://user-session-{session}:pass@host:port`, and
 * replaced with a fresh random id per job run and per browser launch. Most residential proxy
 * services keep one exit address per session id, so this gives each run its own address without
 * any provider-specific settings.
 * @type {string}
 */
export const PROXY_SESSION_PLACEHOLDER = '{session}';

/**
 * The schemes undici's `ProxyAgent` can tunnel through (`socks:` is its alias for SOCKS5). Chromium
 * would take `socks4:` as well, but a url the portal requests cannot use is refused for all of them.
 */
const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:', 'socks5:', 'socks:']);

/**
 * Read a proxy url the way the browser reads it, so one setting means the same proxy for both:
 * without a scheme (`user:pass@host:port`) it is http, as CloakBrowser takes it, and `socks5h:` is
 * SOCKS5 with names resolved by the proxy - which undici's SOCKS5 client does for every host anyway.
 *
 * @param {string} proxyUrl
 * @returns {string}
 */
function asBrowserReadsIt(proxyUrl) {
  if (!proxyUrl.includes('://')) return `http://${proxyUrl}`;
  return proxyUrl.replace(/^socks5h:\/\//i, 'socks5://');
}

/**
 * The dispatcher portal requests currently go through, and the setting it was built from. The
 * promise is kept rather than the dispatcher, so requests starting together share one build - and
 * with it one proxy session - instead of each racing to make their own.
 * @type {{ configured: string, dispatcher: Promise<import('undici').Dispatcher> } | null}
 */
let current = null;

/**
 * The proxy url as the operator configured it, placeholder included.
 *
 * @param {Record<string, any> | null | undefined} settings
 * @returns {string | null} the trimmed url, or null when none is set
 */
export function configuredProxyUrl(settings) {
  const raw = settings?.proxyUrl;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Replace every {@link PROXY_SESSION_PLACEHOLDER} with one new session id.
 *
 * Eight hex characters, because that is a shape every service that takes a session id accepts.
 *
 * @param {string | null | undefined} proxyUrl
 * @returns {string | null} the url ready to connect with, or null for none
 */
export function withFreshSession(proxyUrl) {
  if (typeof proxyUrl !== 'string') return null;
  const trimmed = proxyUrl.trim();
  if (trimmed.length === 0) return null;
  if (!trimmed.includes(PROXY_SESSION_PLACEHOLDER)) return trimmed;
  return trimmed.replaceAll(PROXY_SESSION_PLACEHOLDER, randomBytes(4).toString('hex'));
}

/**
 * The proxy a portal request or a browser launch has to use right now, read live from the
 * settings so a change in the UI applies without a restart.
 *
 * @returns {Promise<string | null>} the url with a fresh session id, or null when none is set
 */
export async function getPortalProxyUrl() {
  return withFreshSession(configuredProxyUrl(await getSettings()));
}

/**
 * Build an undici dispatcher that tunnels through `proxyUrl`.
 *
 * The errors never repeat any part of the url, not even its scheme: it carries the proxy
 * credentials, and these messages end up in the log. That is also why the url is parsed here rather
 * than by undici - Node's `Invalid URL` error keeps the input on the error object, where a logger
 * printing the whole error finds it.
 *
 * @param {string} proxyUrl a url with any session placeholder already replaced
 * @returns {Promise<import('undici').Dispatcher>}
 * @throws {Error} when the url is malformed or uses a scheme undici cannot tunnel through
 */
async function createProxyDispatcher(proxyUrl) {
  let parsed;
  try {
    parsed = new URL(asBrowserReadsIt(proxyUrl));
  } catch {
    throw new Error('The configured proxy URL is not a valid URL. Portal requests are not sent without it.');
  }
  if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      'The configured proxy URL uses a scheme portal requests cannot go through. Use http, https or socks5.',
    );
  }

  const { ProxyAgent } = await import('undici');
  return new ProxyAgent({
    uri: parsed.href,
    // undici passes a SOCKS5 proxy's credentials on still percent-encoded; decoded here so a
    // password with an `@` or a `:` in it authenticates the same way it does over http.
    ...(parsed.protocol.startsWith('socks') && parsed.username
      ? { username: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password) }
      : {}),
  });
}

/**
 * The dispatcher every portal request has to be sent with, or null to send it directly.
 *
 * Kept across requests so connections to the proxy are reused, and rebuilt when the setting
 * changes or a new session was asked for. A replaced dispatcher is not closed: a request another
 * job just took it for may not have been dispatched yet, and its idle connections time out on
 * their own a few seconds later. A url that cannot be used stays refused until the setting changes.
 *
 * @returns {Promise<import('undici').Dispatcher | null>}
 * @throws {Error} when a proxy is configured that cannot be used; see {@link createProxyDispatcher}
 */
export async function getPortalDispatcher() {
  const configured = configuredProxyUrl(await getSettings());
  if (configured == null) {
    current = null;
    return null;
  }
  if (current?.configured !== configured) {
    current = { configured, dispatcher: createProxyDispatcher(withFreshSession(configured)) };
  }
  return current.dispatcher;
}

/**
 * Start a new proxy session for the requests that follow, if the proxy url asks for sessions.
 *
 * Called when a job run starts, so each run leaves from an address of its own and keeps it for
 * the whole run. Without a {@link PROXY_SESSION_PLACEHOLDER} in the url nothing changes.
 *
 * @returns {void}
 */
export function renewProxySession() {
  if (current?.configured.includes(PROXY_SESSION_PLACEHOLDER)) {
    current = null;
  }
}

/**
 * `fetch` for a request to a real estate portal: through the configured proxy, or directly when
 * there is none.
 *
 * The global `fetch` is looked up on every call rather than imported, so the offline test suite's
 * stub of it keeps answering for the providers.
 *
 * Without a proxy the call is handed on exactly as it was made, so nothing changes for an
 * installation that has none configured.
 *
 * @param {string | URL | Request} input
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 * @throws {Error} when a proxy is configured that cannot be used - the request is then not sent
 */
export async function portalFetch(input, init) {
  const dispatcher = await getPortalDispatcher();
  if (dispatcher == null) {
    return init === undefined ? globalThis.fetch(input) : globalThis.fetch(input, init);
  }
  return globalThis.fetch(input, { ...init, dispatcher });
}
