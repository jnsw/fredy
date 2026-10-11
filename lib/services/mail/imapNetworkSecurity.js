/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { lookup as dnsLookup } from 'node:dns';
import net from 'node:net';

/**
 * Where a user-configured mailbox may make the server connect to.
 *
 * Any signed-in user can enter a host and a port, and the server then opens a socket there - from
 * inside a home network, next to a router admin page and a NAS. The same concern as
 * `lib/services/security/outboundUrl.js`, with one difference that makes a better answer possible:
 * here Fredy opens the socket itself, so the check can run against the address actually dialled
 * (a `lookup` hook) instead of a hostname that might resolve somewhere else a moment later.
 *
 * Only the two IMAP ports are accepted, and port 143 must upgrade with STARTTLS before the password
 * is sent.
 */

/** IMAP over TLS, and IMAP with a mandatory STARTTLS upgrade. */
export const ALLOWED_IMAP_PORTS = Object.freeze([993, 143]);

const blockedAddresses = new net.BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) {
  blockedAddresses.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
]) {
  blockedAddresses.addSubnet(network, prefix, 'ipv6');
}

/**
 * Whether an address is one a user-configured mailbox must never reach.
 *
 * Anything that is not an IP address at all counts as blocked, so a resolver returning something
 * unexpected fails closed.
 *
 * @param {string} address
 * @returns {boolean}
 */
export function isBlockedImapAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return blockedAddresses.check(address, 'ipv4');
  if (family !== 6) return true;

  const mappedIpv4 = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1];
  if (mappedIpv4) return isBlockedImapAddress(mappedIpv4);
  return blockedAddresses.check(address, 'ipv6');
}

/**
 * The error for a host that is, or resolves to, a private address.
 *
 * @returns {Error & {code: string}}
 */
function blockedEndpointError() {
  const error = new Error('IMAP host must resolve only to public IP addresses.');
  error.code = 'IMAP_ENDPOINT_BLOCKED';
  return error;
}

/**
 * Reject what can be rejected before anything is resolved: the port, an empty host, the names that
 * always mean this machine, and literal private addresses.
 *
 * @param {string} host
 * @param {number} port
 * @returns {void}
 * @throws {Error} with `code` `IMAP_PORT_NOT_ALLOWED` or `IMAP_ENDPOINT_BLOCKED`.
 */
export function assertSafeImapEndpoint(host, port) {
  const normalizedHost = String(host ?? '')
    .trim()
    .replace(/\.$/, '')
    .toLowerCase();
  if (!normalizedHost) throw blockedEndpointError();
  if (!ALLOWED_IMAP_PORTS.includes(Number(port))) {
    const error = new Error(`IMAP port must be one of: ${ALLOWED_IMAP_PORTS.join(', ')}.`);
    error.code = 'IMAP_PORT_NOT_ALLOWED';
    throw error;
  }
  if (
    normalizedHost === 'localhost' ||
    normalizedHost.endsWith('.localhost') ||
    normalizedHost.endsWith('.local') ||
    (net.isIP(normalizedHost) && isBlockedImapAddress(normalizedHost))
  ) {
    throw blockedEndpointError();
  }
}

/**
 * A `lookup` function for `net.connect`/`tls.connect` that refuses private results.
 *
 * Checking the addresses handed to the socket, rather than resolving once up front and connecting
 * later, closes the window in which a name could be re-pointed at an internal address between the
 * check and the connection.
 *
 * @param {typeof dnsLookup} [lookup]
 * @returns {typeof dnsLookup}
 */
export function createSafeImapLookup(lookup = dnsLookup) {
  return (hostname, options, callback) => {
    lookup(hostname, options, (error, address, family) => {
      if (error) return callback(error);

      const results = Array.isArray(address) ? address : [{ address, family }];
      if (results.length === 0 || results.some((result) => isBlockedImapAddress(result.address))) {
        return callback(blockedEndpointError());
      }

      if (Array.isArray(address)) return callback(null, results);
      return callback(null, address, family);
    });
  };
}

/**
 * The connection part of an ImapFlow configuration for an account.
 *
 * ImapFlow merges `tls` into the options of both `tls.connect` (port 993) and `net.connect`
 * (port 143), so one `lookup` guards both. `doSTARTTLS: true` makes the upgrade mandatory on 143;
 * ImapFlow's default is opportunistic and would carry on in plain text when a server - or somebody
 * in the middle - does not offer it.
 *
 * @param {{host: string, port: number}} account
 * @returns {Object}
 */
export function secureImapConnectionOptions(account) {
  assertSafeImapEndpoint(account.host, account.port);
  const secure = Number(account.port) === 993;
  return {
    host: account.host,
    port: Number(account.port),
    secure,
    doSTARTTLS: secure ? undefined : true,
    tls: { lookup: createSafeImapLookup() },
  };
}

/**
 * Turn a connection failure into one of a handful of fixed messages.
 *
 * Raw socket and DNS errors name internal addresses and ports, which is exactly what a probe of the
 * network behind Fredy would want to read back. The stored `last_sync_error` and every API response
 * go through this.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function publicImapErrorMessage(error) {
  if (error?.code === 'IMAP_ENDPOINT_BLOCKED') return 'IMAP host must resolve only to public IP addresses.';
  if (error?.code === 'IMAP_PORT_NOT_ALLOWED') return error.message;
  if (error?.code === 'SECRET_KEY_MISSING' || error?.code === 'SECRET_UNREADABLE') {
    return 'The stored IMAP password cannot be decrypted. Please enter it again.';
  }
  if (error?.authenticationFailed === true) return 'IMAP authentication failed.';

  const value = String(error?.message ?? '');
  if (/auth|credential|login/i.test(value)) return 'IMAP authentication failed.';
  if (/certificate|\btls\b|\bssl\b|self[- ]signed|starttls/i.test(value)) return 'IMAP TLS validation failed.';
  if (/timeout|timed out/i.test(value)) return 'IMAP connection timed out.';
  if (/mailbox/i.test(value)) return 'The configured IMAP mailbox is unavailable.';
  return 'Unable to connect to the IMAP server.';
}
