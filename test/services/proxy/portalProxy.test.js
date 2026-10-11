/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import http from 'node:http';
import net from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { settings } = vi.hoisted(() => ({ settings: { current: {} } }));

vi.mock('../../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: async () => settings.current,
}));

const {
  PROXY_SESSION_PLACEHOLDER,
  configuredProxyUrl,
  getPortalDispatcher,
  portalFetch,
  renewProxySession,
  withFreshSession,
} = await import('../../../lib/services/proxy/portalProxy.js');

/**
 * Point the module at a proxy url, or at none, and drop whatever dispatcher it built before.
 * @param {string | undefined} proxyUrl
 */
async function configure(proxyUrl) {
  settings.current = {};
  await getPortalDispatcher();
  settings.current = proxyUrl === undefined ? {} : { proxyUrl };
}

describe('the proxy setting', () => {
  it('is trimmed, and empty means none', () => {
    expect(configuredProxyUrl({ proxyUrl: '  http://host:8080 ' })).toBe('http://host:8080');
    expect(configuredProxyUrl({ proxyUrl: '   ' })).toBeNull();
    expect(configuredProxyUrl({ proxyUrl: null })).toBeNull();
    expect(configuredProxyUrl(undefined)).toBeNull();
  });

  it('gets one fresh session id wherever the placeholder stands', () => {
    const url = `http://user-${PROXY_SESSION_PLACEHOLDER}:pass-${PROXY_SESSION_PLACEHOLDER}@host:8080`;
    const first = withFreshSession(url);
    const second = withFreshSession(url);

    const [, userId, passId] = first.match(/^http:\/\/user-([0-9a-f]{8}):pass-([0-9a-f]{8})@host:8080$/);
    expect(userId).toBe(passId);
    expect(second).not.toBe(first);
  });

  it('is left alone when it asks for no session', () => {
    expect(withFreshSession('http://user:pass@host:8080')).toBe('http://user:pass@host:8080');
    expect(withFreshSession('')).toBeNull();
    expect(withFreshSession(null)).toBeNull();
  });
});

describe('portalFetch without a proxy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hands the call on exactly as it was made', async () => {
    await configure(undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
    const init = { headers: { Accept: 'text/html' } };

    await portalFetch('https://portal.example/a', init);
    await portalFetch('https://portal.example/b');

    expect(fetchSpy.mock.calls[0]).toEqual(['https://portal.example/a', init]);
    expect(fetchSpy.mock.calls[0][1]).toBe(init);
    expect(fetchSpy.mock.calls[1]).toEqual(['https://portal.example/b']);
  });
});

describe('portalFetch with a proxy configured', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends every request with the proxy dispatcher, and keeps it across requests', async () => {
    await configure('http://user:pass@proxy.example:8080');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

    await portalFetch('https://portal.example/a', { method: 'POST', body: 'x' });
    await portalFetch('https://portal.example/b');

    const dispatcher = await getPortalDispatcher();
    expect(dispatcher).not.toBeNull();
    expect(dispatcher.constructor.name).toBe('ProxyAgent');
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: 'POST', body: 'x', dispatcher });
    expect(fetchSpy.mock.calls[1][1].dispatcher).toBe(dispatcher);
  });

  it('builds a new dispatcher when the setting changes', async () => {
    await configure('http://proxy-a.example:8080');
    const first = await getPortalDispatcher();
    settings.current = { proxyUrl: 'socks5://user:pass@proxy-b.example:1080' };

    const second = await getPortalDispatcher();

    expect(second).not.toBe(first);
    settings.current = {};
    expect(await getPortalDispatcher()).toBeNull();
  });

  it('starts a new session per run only when the url asks for one', async () => {
    await configure(`http://user-${PROXY_SESSION_PLACEHOLDER}:pass@proxy.example:8080`);
    const first = await getPortalDispatcher();
    expect(await getPortalDispatcher()).toBe(first);

    renewProxySession();
    expect(await getPortalDispatcher()).not.toBe(first);

    await configure('http://user:pass@proxy.example:8080');
    const fixed = await getPortalDispatcher();
    renewProxySession();
    expect(await getPortalDispatcher()).toBe(fixed);
  });

  it.each([
    ['a url that does not parse', 'http://user:hunter2@proxy example:80 80', 'not a valid URL'],
    ['a scheme undici cannot tunnel through', 'socks4://user:hunter2@proxy.example:1080', 'cannot go through'],
  ])('refuses %s instead of going out directly, without naming the credentials', async (_what, url, message) => {
    await configure(url);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));

    const error = await portalFetch('https://portal.example/a').catch((err) => err);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(message);
    expect(JSON.stringify({ message: error.message, ...error })).not.toContain('hunter2');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/**
 * The tests above prove the dispatcher is handed over; this one proves the request then really
 * leaves through the proxy - with the credentials of the url - and not directly. A plain http
 * CONNECT proxy and a target server on loopback stand in for the residential proxy and the portal.
 */
describe('portalFetch through a real proxy', () => {
  /** @type {http.Server} */
  let target;
  /** @type {http.Server} */
  let proxy;
  /** @type {net.Server} */
  let socksProxy;
  /** @type {{ to: string, auth: string | undefined }[]} */
  let tunnels;
  /** Every socket a tunnel holds open, so the servers can be shut down after the suite. */
  const sockets = new Set();

  /**
   * Splice a client socket onto a connection to `host:port`, once the proxy has said yes.
   * @param {net.Socket} socket the client side
   * @param {string} host
   * @param {number} port
   * @param {Buffer} reply what tells the client the tunnel is open
   * @param {Buffer} [head] bytes the client already sent past the handshake
   */
  const splice = (socket, host, port, reply, head) => {
    sockets.add(socket);
    const upstream = net.connect(port, host, () => {
      socket.write(reply);
      if (head?.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    sockets.add(upstream);
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  };

  /**
   * The smallest SOCKS5 server undici can talk to: username/password authentication (RFC 1929),
   * then CONNECT to an IPv4 address or a domain name.
   * @param {net.Socket} socket
   */
  const socksHandshake = (socket) => {
    let auth;
    let stage = 'greeting';
    socket.on('data', function onData(chunk) {
      if (stage === 'greeting') {
        stage = 'auth';
        socket.write(Buffer.from([0x05, 0x02]));
      } else if (stage === 'auth') {
        const userLength = chunk[1];
        const user = chunk.subarray(2, 2 + userLength).toString();
        const password = chunk.subarray(3 + userLength, 3 + userLength + chunk[2 + userLength]).toString();
        auth = `${user}:${password}`;
        stage = 'connect';
        socket.write(Buffer.from([0x01, 0x00]));
      } else {
        socket.off('data', onData);
        const ipv4 = chunk[3] === 0x01;
        const host = ipv4 ? [...chunk.subarray(4, 8)].join('.') : chunk.subarray(5, 5 + chunk[4]).toString();
        const port = chunk.readUInt16BE(ipv4 ? 8 : 5 + chunk[4]);
        tunnels.push({ to: `${host}:${port}`, auth });
        splice(socket, host, port, Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
      }
    });
  };

  beforeAll(async () => {
    socksProxy = net.createServer(socksHandshake);
    target = http.createServer((req, res) => res.end(`portal answered ${req.url}`));
    proxy = http.createServer((_req, res) => res.writeHead(405).end());
    proxy.on('connect', (req, socket, head) => {
      tunnels.push({ to: req.url, auth: req.headers['proxy-authorization'] });
      const [host, port] = req.url.split(':');
      splice(socket, host, Number(port), Buffer.from('HTTP/1.1 200 Connection Established\r\n\r\n'), head);
    });
    await Promise.all([
      new Promise((resolve) => target.listen(0, '127.0.0.1', resolve)),
      new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve)),
      new Promise((resolve) => socksProxy.listen(0, '127.0.0.1', resolve)),
    ]);
  });

  afterAll(async () => {
    await configure(undefined);
    for (const socket of sockets) socket.destroy();
    proxy.closeAllConnections();
    target.closeAllConnections();
    await Promise.all([
      new Promise((resolve) => proxy.close(resolve)),
      new Promise((resolve) => target.close(resolve)),
      new Promise((resolve) => socksProxy.close(resolve)),
    ]);
  });

  beforeEach(() => {
    tunnels = [];
  });

  const targetUrl = (path) => `http://127.0.0.1:${target.address().port}${path}`;
  const proxyAt = (userinfo) => `http://${userinfo}@127.0.0.1:${proxy.address().port}`;
  const basic = (credentials) => `Basic ${Buffer.from(credentials).toString('base64')}`;

  it('tunnels the request through the proxy, authenticated with the url’s credentials', async () => {
    await configure(proxyAt('fredy%40home:p%3Ass'));

    const response = await portalFetch(targetUrl('/expose/1'));

    expect(await response.text()).toBe('portal answered /expose/1');
    expect(tunnels).toEqual([{ to: `127.0.0.1:${target.address().port}`, auth: basic('fredy@home:p:ss') }]);
  });

  // The browser takes a url without a scheme as http, so the portal requests have to as well, or
  // one setting would mean two different things.
  it('reads a url without a scheme as http, the way the browser does', async () => {
    await configure(proxyAt('fredy:secret').replace('http://', ''));

    const response = await portalFetch(targetUrl('/expose/4'));

    expect(await response.text()).toBe('portal answered /expose/4');
    expect(tunnels).toEqual([{ to: `127.0.0.1:${target.address().port}`, auth: basic('fredy:secret') }]);
  });

  it.each(['socks5', 'socks5h'])('tunnels through a %s proxy just the same, credentials decoded', async (scheme) => {
    await configure(`${scheme}://fredy%40home:p%3Ass@127.0.0.1:${socksProxy.address().port}`);

    const response = await portalFetch(targetUrl('/expose/3'));

    expect(await response.text()).toBe('portal answered /expose/3');
    expect(tunnels).toEqual([{ to: `127.0.0.1:${target.address().port}`, auth: 'fredy@home:p:ss' }]);
  });

  it('goes straight to the portal when no proxy is configured', async () => {
    await configure(undefined);

    const response = await portalFetch(targetUrl('/expose/2'));

    expect(await response.text()).toBe('portal answered /expose/2');
    expect(tunnels).toEqual([]);
  });

  it('hands the proxy a new session id once a new run starts', async () => {
    await configure(proxyAt(`user-session-${PROXY_SESSION_PLACEHOLDER}:pass`));

    await (await portalFetch(targetUrl('/a'))).text();
    renewProxySession();
    await (await portalFetch(targetUrl('/b'))).text();

    const sessions = tunnels.map(({ auth }) => {
      const decoded = Buffer.from(auth.replace(/^Basic /, ''), 'base64').toString();
      return decoded.match(/^user-session-([0-9a-f]{8}):pass$/)?.[1];
    });
    expect(sessions).toHaveLength(2);
    expect(sessions.every(Boolean)).toBe(true);
    expect(sessions[0]).not.toBe(sessions[1]);
  });
});
