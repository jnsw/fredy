/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Build the link to one listing in Fredy's own interface.
 *
 * The base URL is whatever the admin typed into the settings, and the settings page only trims one
 * trailing slash off it. Appending the route as text therefore broke on the inputs people actually
 * make: a host without a scheme (`192.168.1.10:9998`), which a chat client does not open as a link,
 * and a URL copied from the address bar of an open Fredy page, whose hash route (`#/dashboard`) was
 * kept and the listing route appended behind it. Parsing the URL and setting the hash replaces the
 * old route instead, and keeps the sub path of a reverse proxy.
 *
 * @param {string|null|undefined} baseUrl Fredy's base URL from the general settings.
 * @param {string|number|null|undefined} listingId
 * @returns {string|null} The link, or null when there is no base URL, no id, or no usable URL.
 */
export function buildFredyListingUrl(baseUrl, listingId) {
  if (!baseUrl || listingId == null || listingId === '') return null;

  let candidate = String(baseUrl).trim();
  if (!candidate) return null;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) candidate = `http://${candidate}`;

  try {
    const url = new URL(candidate);
    url.search = '';
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
    url.hash = `/listings/listing/${encodeURIComponent(String(listingId))}`;
    return url.toString();
  } catch {
    return null;
  }
}
