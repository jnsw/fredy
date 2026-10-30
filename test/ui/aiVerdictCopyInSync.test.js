/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import {
  AI_VERDICT_FILTER_VALUES as backendFilterValues,
  AI_VERDICT_SOURCE_MCP as backendSourceMcp,
  AI_VERDICT_UNRATED as backendUnrated,
  AI_VERDICT_VALUES as backendValues,
} from '../../lib/services/listings/aiVerdict.js';
import {
  AI_VERDICT_FILTER_VALUES as frontendFilterValues,
  AI_VERDICT_SOURCE_MCP as frontendSourceMcp,
  AI_VERDICT_UNRATED as frontendUnrated,
  AI_VERDICT_VALUES as frontendValues,
  aiVerdictOf,
  describeAiVerdictSource,
} from '../../ui/src/services/listings/aiVerdict.js';

/**
 * The frontend keeps its own copy of the verdict words (it may not import out of lib/). A verdict
 * the server stores but the browser does not know would show no badge, and a filter option the
 * server does not know would quietly filter nothing.
 */
describe('the AI verdict vocabulary stays in sync between the frontend copy and lib/', () => {
  it('agrees on the verdicts, the unrated marker and the filter values', () => {
    expect([...frontendValues]).toEqual(backendValues);
    expect(frontendUnrated).toBe(backendUnrated);
    expect([...frontendFilterValues]).toEqual(backendFilterValues);
    expect(frontendSourceMcp).toBe(backendSourceMcp);
  });

  it('names the model that rated a listing, and says "an assistant over MCP" instead of printing "mcp"', () => {
    const t = (key, vars) => (vars == null ? key : `${key}:${JSON.stringify(vars)}`);

    expect(describeAiVerdictSource({ ai_verdict_source: 'claude-opus-5-5' }, t)).toBe(
      'listings.aiVerdictSource:{"source":"claude-opus-5-5"}',
    );
    expect(describeAiVerdictSource({ ai_verdict_source: 'mcp' }, t)).toBe('listings.aiVerdictSourceMcp');
    expect(describeAiVerdictSource({ ai_verdict_source: null }, t)).toBeNull();
  });

  it('reads only the verdicts it can paint', () => {
    expect(aiVerdictOf({ ai_verdict: 'good' })).toBe('good');
    expect(aiVerdictOf({ ai_verdict: 'none' })).toBeNull();
    expect(aiVerdictOf({ ai_verdict: null })).toBeNull();
    expect(aiVerdictOf(null)).toBeNull();
  });
});
