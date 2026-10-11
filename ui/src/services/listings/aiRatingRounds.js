/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Rate a selection of listings in rounds, one listing per request.
 *
 * One per request rather than the whole selection at once: each rating is a model call of several
 * seconds, and a request covering twenty of them would run into a reverse proxy's timeout and show
 * nothing until it either finished or failed. One at a time keeps every request short and lets the
 * page count up as it goes.
 *
 * Stops at the first failure the server reports as being about the key or the provider - a
 * rejected key, a rate limit - because every further request would fail the same way, and some of
 * them would still be billed.
 *
 * Kept apart from the component because it is the part worth testing: what is counted, and where it
 * stops.
 *
 * @param {string[]} ids
 * @param {(ids: string[]) => Promise<{results: Object[], stopped: {kind: string, message: string}|null}>} rate
 * @param {(progress: {done: number, total: number}) => void} [onProgress]
 * @returns {Promise<{rated: number, failed: number, stopped: {kind: string, message: string}|null}>}
 */
export async function rateInRounds(ids, rate, onProgress = () => {}) {
  const total = ids.length;
  let rated = 0;
  let failed = 0;
  let stopped = null;

  for (let index = 0; index < total; index++) {
    const response = await rate([ids[index]]);
    for (const result of response?.results ?? []) {
      if (result.status === 'rated') rated++;
      else if (result.status === 'failed' || result.status === 'notFound') failed++;
    }
    onProgress({ done: index + 1, total });
    if (response?.stopped != null) {
      stopped = response.stopped;
      break;
    }
  }
  return { rated, failed, stopped };
}
