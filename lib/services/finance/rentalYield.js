/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { MIN_SIZE_SQM } from '../listings/marketBenchmark.js';
import { closingCosts } from './financing.js';

/**
 * What a purchase would earn if it were let: gross and net rental yield, and the Kaufpreisfaktor.
 *
 * Everything here is arithmetic on a listing row. The rent it starts from is either the one the user
 * typed in on the detail page (`cold_rent_override`) or the median cold rent per square metre of the
 * rentals around the listing (`rent_median_sqm`, see `lib/services/listings/rentEstimate.js`). With
 * neither there is no yield, and every function returns `null` rather than a number built on a guess.
 *
 * The math lives on the server, like the rest of the finance module: the pipeline filters on the
 * gross yield and the detail page shows it, and two implementations would sooner or later disagree
 * about a listing the filter let through.
 */

/**
 * The share of the cold rent an owner pays and cannot pass on to the tenant, in percent.
 *
 * Verwaltung, Instandhaltung and the Mietausfallwagnis together - the Bewirtschaftungskosten a
 * scraped listing knows nothing about. Twenty percent is the common rule of thumb for a flat in a
 * multi-family building, and the detail page names it next to the net yield so nobody mistakes it
 * for a figure about this particular flat.
 *
 * @type {number}
 */
export const NON_ALLOCABLE_COST_PCT = 20;

/**
 * Where a listing's cold rent came from.
 *
 * @type {Readonly<{OVERRIDE: 'override', ESTIMATE: 'estimate'}>}
 */
export const COLD_RENT_SOURCES = Object.freeze({ OVERRIDE: 'override', ESTIMATE: 'estimate' });

/**
 * Largest monthly cold rent the override accepts, in EUR.
 *
 * Far above any flat Fredy will ever find, and low enough that a typo of three extra zeros is
 * refused instead of turning a listing into a 900 % yield.
 *
 * @type {number}
 */
export const MAX_COLD_RENT_OVERRIDE = 100000;

/**
 * A cold rent and how it came about.
 *
 * @typedef {Object} ColdRent
 * @property {number} monthly EUR per month.
 * @property {number|null} perSqm EUR per square metre and month; `null` for an override on a listing
 *   without a usable size.
 * @property {('override'|'estimate')} source
 * @property {number|null} sampleSize How many rentals the estimate came from. `null` for an override.
 * @property {number|null} radiusKm How far out those rentals were. `null` for an override.
 */

/**
 * Everything the detail page shows about the yield of one purchase.
 *
 * @typedef {Object} RentalYield
 * @property {ColdRent} coldRent
 * @property {number} grossYield Annual cold rent over the purchase price, in percent.
 * @property {number} netYield Annual cold rent less {@link NON_ALLOCABLE_COST_PCT}, over the price
 *   plus the Kaufnebenkosten, in percent.
 * @property {number} priceFactor Purchase price over the annual cold rent (Kaufpreisfaktor).
 * @property {number} closingCostsPct The Kaufnebenkosten the net yield was computed with, in percent.
 * @property {string|null} bundesland Whose Grunderwerbsteuer is in them.
 * @property {number} nonAllocableCostPct The share of the rent the net yield takes off.
 */

/**
 * A number, or nothing. `Number(null)` is 0, and a zero rent is not a rent.
 *
 * @param {*} value
 * @returns {number|null}
 */
function toNumber(value) {
  if (value == null || value === '' || typeof value === 'boolean') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {number} value
 * @param {number} digits
 * @returns {number}
 */
function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Gross yield in percent, to one decimal.
 *
 * Rounded here rather than in the view, so the filter and the page judge the same number: a listing
 * at 4,96 % shown as "5,0 %" and dropped by a 5 % filter would be the page contradicting the job.
 *
 * @param {number} monthlyRent
 * @param {number} price
 * @returns {number}
 */
function grossYieldOf(monthlyRent, price) {
  return round(((monthlyRent * 12) / price) * 100, 1);
}

/**
 * The monthly cold rent of a purchase listing, if there is anything to base one on.
 *
 * The override wins whenever it is set. The estimate is a median over a neighbourhood, and somebody
 * who has asked the agent, or knows the building, has a better figure than any median.
 *
 * @param {Object|null|undefined} listing A row as the storage returns it, or a pipeline listing the
 *   rent estimate has been attached to. Reads `size`, `cold_rent_override`, `rent_median_sqm`,
 *   `rent_sample_size` and `rent_radius_km`.
 * @returns {ColdRent|null}
 */
export function coldRentFor(listing) {
  const size = toNumber(listing?.size);
  const usableSize = size != null && size >= MIN_SIZE_SQM ? size : null;

  const override = toNumber(listing?.cold_rent_override);
  if (override != null && override > 0) {
    return {
      monthly: override,
      perSqm: usableSize == null ? null : round(override / usableSize, 2),
      source: COLD_RENT_SOURCES.OVERRIDE,
      sampleSize: null,
      radiusKm: null,
    };
  }

  const perSqm = toNumber(listing?.rent_median_sqm);
  if (perSqm == null || perSqm <= 0 || usableSize == null) {
    return null;
  }
  return {
    monthly: round(perSqm * usableSize, 2),
    perSqm,
    source: COLD_RENT_SOURCES.ESTIMATE,
    sampleSize: toNumber(listing?.rent_sample_size),
    radiusKm: toNumber(listing?.rent_radius_km),
  };
}

/**
 * The gross rental yield of a purchase listing: a year's cold rent over the purchase price.
 *
 * The figure the job's minimum yield is held against. Gross rather than net on purpose: it depends
 * on nothing but the listing and the rent, whereas the net yield needs the Kaufnebenkosten, and
 * those follow the user's finance profile - a filter that changed its answer whenever somebody
 * edited their notary percentage would be a filter nobody could reason about.
 *
 * @param {Object|null|undefined} listing See {@link coldRentFor}; additionally reads `price`.
 * @returns {number|null} Percent, to one decimal; `null` without a price or a rent.
 */
export function grossYieldPercent(listing) {
  const price = toNumber(listing?.price);
  const coldRent = coldRentFor(listing);
  if (price == null || price <= 0 || coldRent == null) {
    return null;
  }
  return grossYieldOf(coldRent.monthly, price);
}

/**
 * Gross yield, net yield and Kaufpreisfaktor of a purchase listing.
 *
 * The net yield follows the usual definition: the annual cold rent less what the owner cannot pass
 * on, over everything the purchase costs. The Kaufnebenkosten come from the user's finance profile
 * (Bundesland, notary, agent), the same figures the financing card under it uses, so the two cards
 * on one page never assume two different purchases.
 *
 * @param {Object|null|undefined} listing See {@link grossYieldPercent}.
 * @param {Object} [financing] The `financing` half of a normalised finance profile. Missing fields
 *   fall back to the defaults {@link closingCosts} uses.
 * @returns {RentalYield|null} `null` without a price or a rent.
 */
export function rentalYieldFor(listing, financing = {}) {
  const price = toNumber(listing?.price);
  const coldRent = coldRentFor(listing);
  if (price == null || price <= 0 || coldRent == null) {
    return null;
  }

  const annualRent = coldRent.monthly * 12;
  const costs = closingCosts(price, financing ?? {});
  const netAnnualRent = annualRent * (1 - NON_ALLOCABLE_COST_PCT / 100);

  return {
    coldRent,
    grossYield: grossYieldOf(coldRent.monthly, price),
    netYield: round((netAnnualRent / (price + costs.total)) * 100, 1),
    priceFactor: round(price / annualRent, 1),
    closingCostsPct: round(costs.totalPct, 2),
    bundesland: financing?.bundesland ?? null,
    nonAllocableCostPct: NON_ALLOCABLE_COST_PCT,
  };
}

/**
 * The job's minimum gross yield as a number, or nothing.
 *
 * The spec filter is stored as whatever JSON the form sent. An emptied field arrives as `null`, a
 * hand-written API call may send a string, and zero means "no minimum" just as it does for the
 * other spec filters.
 *
 * @param {*} value
 * @returns {number|null} Percent, or `null` when there is no minimum.
 */
export function normalizeMinGrossYield(value) {
  const parsed = toNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}
