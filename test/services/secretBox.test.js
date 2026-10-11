/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  ENCRYPTION_KEY_ENV,
  SecretUnavailableError,
  openJson,
  openSecret,
  sealJson,
  sealSecret,
} from '../../lib/services/security/secretBox.js';

const HEX_KEY = 'a'.repeat(64);

describe('secretBox', () => {
  let previousKey;
  let dir;

  beforeEach(() => {
    previousKey = process.env[ENCRYPTION_KEY_ENV];
    delete process.env[ENCRYPTION_KEY_ENV];
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fredy-secretbox-'));
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env[ENCRYPTION_KEY_ENV];
    else process.env[ENCRYPTION_KEY_ENV] = previousKey;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips a value and never stores it readably', () => {
    process.env[ENCRYPTION_KEY_ENV] = HEX_KEY;

    const sealed = sealSecret('hunter2', 'mail-password');

    expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain('hunter2');
    expect(openSecret(sealed, 'mail-password')).toBe('hunter2');
  });

  it('uses a fresh IV every time, so equal passwords do not look equal', () => {
    process.env[ENCRYPTION_KEY_ENV] = HEX_KEY;

    expect(sealSecret('same', 'mail-password')).not.toBe(sealSecret('same', 'mail-password'));
  });

  it('refuses to open a value under a different purpose', () => {
    process.env[ENCRYPTION_KEY_ENV] = HEX_KEY;
    const sealed = sealSecret('hunter2', 'mail-password');

    expect(() => openSecret(sealed, 'mail-content')).toThrow(SecretUnavailableError);
  });

  it('refuses a tampered value instead of decrypting garbage', () => {
    process.env[ENCRYPTION_KEY_ENV] = HEX_KEY;
    const [version, iv, tag, data] = sealSecret('hunter2', 'mail-password').split('.');
    const flipped = Buffer.from(data, 'base64url');
    flipped[0] ^= 0xff;

    expect(() => openSecret([version, iv, tag, flipped.toString('base64url')].join('.'), 'mail-password')).toThrow(
      /could not be decrypted/,
    );
  });

  it('cannot open a value with another key', () => {
    process.env[ENCRYPTION_KEY_ENV] = HEX_KEY;
    const sealed = sealSecret('hunter2', 'mail-password');
    process.env[ENCRYPTION_KEY_ENV] = Buffer.alloc(32, 7).toString('base64');

    expect(() => openSecret(sealed, 'mail-password')).toThrow(expect.objectContaining({ code: 'SECRET_UNREADABLE' }));
  });

  it('rejects a key of the wrong length', () => {
    process.env[ENCRYPTION_KEY_ENV] = 'too-short';

    expect(() => sealSecret('x', 'mail-password')).toThrow(expect.objectContaining({ code: 'SECRET_KEY_INVALID' }));
  });

  it('writes a key file on the first seal only, readable by the owner alone', () => {
    const keyFile = path.join(dir, 'conf', 'secret.key');

    // Opening never creates one: a new random key could not open anything sealed before.
    expect(() => openSecret('v1.a.b.c', 'mail-password', { keyFile })).toThrow(
      expect.objectContaining({ code: 'SECRET_KEY_MISSING' }),
    );
    expect(fs.existsSync(keyFile)).toBe(false);

    const sealed = sealSecret('hunter2', 'mail-password', { keyFile });

    expect(fs.existsSync(keyFile)).toBe(true);
    expect(fs.readFileSync(keyFile, 'utf8').trim()).toMatch(/^[a-f0-9]{64}$/);
    if (process.platform !== 'win32') {
      expect(fs.statSync(keyFile).mode & 0o777).toBe(0o600);
    }
    expect(openSecret(sealed, 'mail-password', { keyFile })).toBe('hunter2');
  });

  it('prefers the environment variable over a key file', () => {
    const keyFile = path.join(dir, 'secret.key');
    fs.writeFileSync(keyFile, 'b'.repeat(64));
    process.env[ENCRYPTION_KEY_ENV] = HEX_KEY;
    const sealed = sealSecret('hunter2', 'mail-password', { keyFile });

    delete process.env[ENCRYPTION_KEY_ENV];

    expect(() => openSecret(sealed, 'mail-password', { keyFile })).toThrow(SecretUnavailableError);
  });

  it('seals structured values', () => {
    process.env[ENCRYPTION_KEY_ENV] = HEX_KEY;
    const value = { subject: 'Besichtigung', body: 'Termin am Montag' };

    expect(openJson(sealJson(value, 'mail-content'), 'mail-content')).toEqual(value);
  });
});
