/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { configFilePath } from '../../utils.js';

/**
 * Encryption for values Fredy has to be able to read back, such as the password of a mailbox it
 * logs into on the user's behalf.
 *
 * A password a user logs into Fredy with is hashed (`hash.js`), because Fredy only ever has to
 * compare it. A credential Fredy itself presents to another server cannot be hashed, so it is
 * sealed with AES-256-GCM instead: authenticated, so a tampered value fails to open rather than
 * decrypting to garbage, and bound to a purpose, so a value sealed as one thing cannot be replayed
 * into a column that means another.
 *
 * The key never lives in the database. That is the point: the backup a user downloads, and the
 * `listings.db` they copy around to move an instance, carry the sealed values but not the means to
 * open them. It comes from, in this order:
 *
 * 1. `FREDY_ENCRYPTION_KEY` - 32 bytes, as 64 hex characters or base64. For operators who keep
 *    secrets in an orchestrator rather than on a volume.
 * 2. `conf/secret.key`, next to `config.json`. Written on the first encryption with a random key and
 *    mode 0600. The Docker image keeps `/conf` and `/db` on separate volumes, so the two travel
 *    separately as well.
 *
 * Nothing is created before something actually needs sealing, so an installation that never uses a
 * feature which stores a credential never gets a key file either.
 */

/** Environment variable that supplies the key directly. */
export const ENCRYPTION_KEY_ENV = 'FREDY_ENCRYPTION_KEY';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** Keys read from disk, by path. A key file never changes once written. */
const fileKeys = new Map();

/**
 * Raised when a sealed value cannot be opened: no key is configured, or the key is not the one it
 * was sealed with, or the value was altered.
 */
export class SecretUnavailableError extends Error {
  /**
   * @param {string} message
   * @param {'SECRET_KEY_MISSING'|'SECRET_KEY_INVALID'|'SECRET_UNREADABLE'} code
   * @param {unknown} [cause]
   */
  constructor(message, code, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'SecretUnavailableError';
    this.code = code;
  }
}

/**
 * Where the generated key is kept when no environment variable supplies one.
 *
 * @returns {string}
 */
export function defaultKeyFilePath() {
  return path.join(path.dirname(configFilePath()), 'secret.key');
}

/**
 * Read a key in either of the two accepted spellings.
 *
 * @param {string} raw
 * @param {string} source - Named in the error, never the value itself.
 * @returns {Buffer}
 */
function parseKey(raw, source) {
  const value = String(raw).trim();
  const key = /^[a-f\d]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new SecretUnavailableError(
      `${source} must hold exactly ${KEY_BYTES} bytes, as 64 hexadecimal characters or base64.`,
      'SECRET_KEY_INVALID',
    );
  }
  return key;
}

/**
 * The key to seal and open with.
 *
 * @param {Object} [options]
 * @param {boolean} [options.create=false] - Write a new key file when there is none. Only sealing
 *   asks for this: opening without a key cannot succeed with a freshly generated one anyway.
 * @param {string} [options.keyFile] - Where the key file lives; defaults to {@link defaultKeyFilePath}.
 * @returns {Buffer}
 */
function resolveKey({ create = false, keyFile = defaultKeyFilePath() } = {}) {
  const fromEnv = process.env[ENCRYPTION_KEY_ENV];
  if (fromEnv != null && fromEnv.trim().length > 0) {
    return parseKey(fromEnv, ENCRYPTION_KEY_ENV);
  }

  const cached = fileKeys.get(keyFile);
  if (cached != null) return cached;

  let raw = null;
  try {
    raw = fs.readFileSync(keyFile, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  if (raw == null) {
    if (!create) {
      throw new SecretUnavailableError(
        `No encryption key found. Set ${ENCRYPTION_KEY_ENV} or restore ${path.basename(keyFile)}.`,
        'SECRET_KEY_MISSING',
      );
    }
    const generated = crypto.randomBytes(KEY_BYTES).toString('hex');
    fs.mkdirSync(path.dirname(keyFile), { recursive: true });
    try {
      // `wx` fails when the file appeared in the meantime, so two first encryptions racing each
      // other cannot end with one of them holding a key that was overwritten on disk.
      fs.writeFileSync(keyFile, `${generated}\n`, { mode: 0o600, flag: 'wx' });
      raw = generated;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      raw = fs.readFileSync(keyFile, 'utf8');
    }
  }

  const key = parseKey(raw, keyFile);
  fileKeys.set(keyFile, key);
  return key;
}

/**
 * Additional authenticated data for a purpose. Binding it in is what makes a value sealed as a
 * mailbox password fail to open as anything else.
 *
 * @param {string} purpose
 * @returns {Buffer}
 */
function aadFor(purpose) {
  if (typeof purpose !== 'string' || purpose.length === 0) {
    throw new TypeError('A purpose is required to seal or open a secret.');
  }
  return Buffer.from(`fredy:${purpose}`, 'utf8');
}

/**
 * Seal a string.
 *
 * @param {string} plaintext
 * @param {string} purpose - What the value is, e.g. `mail-password`. The same purpose must be given
 *   to {@link openSecret}.
 * @param {Object} [options]
 * @param {string} [options.keyFile] - Override the key file location (tests).
 * @returns {string} A versioned envelope, `v1.<iv>.<tag>.<ciphertext>` in base64url.
 */
export function sealSecret(plaintext, purpose, options = {}) {
  if (typeof plaintext !== 'string') {
    throw new TypeError('Only strings can be sealed.');
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, resolveKey({ ...options, create: true }), iv);
  cipher.setAAD(aadFor(purpose));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

/**
 * Open a value sealed by {@link sealSecret}.
 *
 * @param {string} envelope
 * @param {string} purpose
 * @param {Object} [options]
 * @param {string} [options.keyFile] - Override the key file location (tests).
 * @returns {string}
 * @throws {SecretUnavailableError} when the key is missing or wrong, or the value was altered.
 */
export function openSecret(envelope, purpose, options = {}) {
  const [version, iv, tag, encrypted, ...rest] = String(envelope ?? '').split('.');
  if (version !== VERSION || !iv || !tag || !encrypted || rest.length > 0) {
    throw new SecretUnavailableError('The stored secret has an unsupported format.', 'SECRET_UNREADABLE');
  }
  const key = resolveKey({ ...options, create: false });
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(aadFor(purpose));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  } catch (error) {
    throw new SecretUnavailableError(
      'The stored secret could not be decrypted with the configured key.',
      'SECRET_UNREADABLE',
      error,
    );
  }
}

/**
 * Seal any JSON-serialisable value.
 *
 * @param {unknown} value
 * @param {string} purpose
 * @param {Object} [options]
 * @returns {string}
 */
export function sealJson(value, purpose, options = {}) {
  return sealSecret(JSON.stringify(value), purpose, options);
}

/**
 * Open a value sealed by {@link sealJson}.
 *
 * @param {string} envelope
 * @param {string} purpose
 * @param {Object} [options]
 * @returns {any}
 */
export function openJson(envelope, purpose, options = {}) {
  return JSON.parse(openSecret(envelope, purpose, options));
}
