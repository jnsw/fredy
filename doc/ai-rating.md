# 🤖 AI rating

An AI can give a listing one of three verdicts - **GOOD**, **MAYBE** or **BAD** - together with one to
three sentences saying why. Fredy stores the verdict on the listing, separate from your notes, so it
can be shown, filtered and replaced without touching anything you wrote.

Three words rather than a score on purpose: a number from 1 to 10 suggests a precision a model that
has read one advert does not have, and it cannot be filtered on without somebody picking a
threshold. GOOD / MAYBE / BAD is the decision you actually make: look at it now, later, or not at all.

## Where it shows up

- a chip on the listing card and in the listings table, with the reasoning in its tooltip
- a card on the listing detail page with the reasoning, the model that rated it, and when
- a filter in the listings drawer: Good, Maybe, Bad, or **not rated yet**. It appears once there is a
  rated listing to filter by

Nothing is hidden, deleted or held back from notifications because of a verdict.

## Rating through MCP

An assistant connected through the [MCP server](../lib/mcp/README.md) can read and write verdicts:

- `get_listing` shows the verdict, its reasoning, the model and the date
- `list_listings` has an `aiVerdict` filter (`good`, `maybe`, `bad`, `none`) and an AI column
- `set_listing_ai_verdict` stores a verdict with its reasoning, or clears it with `none`. It is a write
  tool, so it needs the `mcp:write` scope and follows the same access rules as the notes tools

> *"Go through my new listings from today and rate each one against what I told you I want."*

> **A verdict is one model's reading of one advert, not a fact about the flat.** It only knows what
> the advert says and what you told it to look for.

Implementation: [`lib/services/listings/aiVerdict.js`](../lib/services/listings/aiVerdict.js) (the
vocabulary) and `setListingAiVerdict` in
[`lib/services/storage/listingsStorage.js`](../lib/services/storage/listingsStorage.js).
