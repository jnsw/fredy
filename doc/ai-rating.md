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

## Rating with your own AI key

Under **Settings › AI rating** every user can store an API key of their own:

- **Anthropic** - the default model is `claude-opus-5-5`; any other Claude model id can be entered,
  a smaller one such as `claude-haiku-5-5` costs less per listing.
- **OpenAI-compatible** - OpenAI itself, OpenRouter, or a model you run yourself (Ollama, LM Studio,
  vLLM). Give the base URL (without `/chat/completions`) and the model. Only an administrator may
  point it at an address on the local network.

Then either tick listings in the overview and press **Rate with my AI**, or use the button on a
listing's detail page. Switch on **Rate new listings automatically** to have the listings your own
searches find from then on rated in the background.

Nothing changes for anybody who has not stored a key: no request is made, no button is shown.

### What is sent

One request per listing, with the listing's title, description, price, size, rooms, address, year
built, energy class, the local price per m² median and the scam check - and, for Anthropic, its
preview photo. Never your finances, your addresses, your travel times or any other setting. The
model gets no tools and fetches nothing; its answer is forced into `{verdict, reasoning}`, so an
advert written to manipulate the rating can at most get itself a wrong verdict.

Your **rating criteria** decide what "good" means. Leave them empty to use the built-in ones, written
for somebody looking for a home; write your own to rate by what matters to you.

### What it costs, and what keeps that bounded

Every rating is billed to your account with the provider. Fredy keeps that predictable:

- automatic rating only ever looks at listings found **after** you switched it on, of **your own**
  searches, still online and not hidden - switching it on never sends a back catalogue
- at most 20 listings per run and at most your **daily limit** (default 50) in any 24 hours
- a listing the model cannot rate is given up after three attempts
- a rate limit pauses automatic rating for as long as the provider asks (at least 15 minutes), an
  outage for 30 minutes, and a rejected key or an unknown model until you save the settings again.
  The settings page says when and why it is paused
- on Anthropic, the low effort setting and a cached system prompt keep each call small

Ratings you start by hand are never held back by the daily limit, but they count towards it: on a
day you rated a lot by hand, the background rates less.

### The key

The key is stored in Fredy's database, the same way notification credentials are, and is
**write-only**: no page and no API returns it, to anybody, you included. The settings page only
shows that one is stored. Changing the provider or the server asks for the key again, so a stored
key is never sent somewhere it was not entered for. On a demo instance keys cannot be stored at all.

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
vocabulary), [`lib/services/ai/`](../lib/services/ai/) (prompt, providers, the rules above) and
[`lib/services/storage/aiRatingSettingsStorage.js`](../lib/services/storage/aiRatingSettingsStorage.js).
