# 🌐 Providers & Scraping

A **provider** is a real-estate platform. When you create a job, you paste the search URL from the
platform into Fredy.

> [!IMPORTANT]
> Always make sure the search results are sorted by **date**, so Fredy picks up the newest listings
> first.

## The 34 built-in providers

**🇩🇪 Germany**

| | | |
|---|---|---|
| 1a Immobilien | Immo Südwest Presse | Neubau Kompass |
| Deutsche Wohnen | Immobilien.de | OhneMakler |
| Engel & Völkers | Immoscout | Regionalimmobilien24 |
| IMAXX | Immowelt | Schwarzes Brett Bremen |
| InBerlinWohnen | Kleinanzeigen | Sparkasse Immobilien |
| McMakler | Vonovia | Wg gesucht |

**🇩🇪 Germany · 🇦🇹 Austria · 🇨🇭 Switzerland** · BETTERHOMES
**🇦🇹 Austria** · willhaben · Immoscout Österreich
**🇨🇭 Switzerland** · ImmoScout24.ch · Flatfox
**🇪🇸 Spain · 🇮🇹 Italy · 🇵🇹 Portugal** · idealista
**🇮🇹 Italy** · Subito · Tecnocasa · Tecnorete · Casa.it
**🇫🇷 France** · leboncoin · SeLoger · Bien'ici
**🇧🇪 Belgium** · Immoweb
**🇩🇰 Denmark** · Boligsiden · BoligPortal

If you run a portal Fredy does not cover yet, contributions are very welcome, see
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Immoscout

Immoscout has implemented advanced bot detection. To work around this, Fredy uses a reverse
engineered version of their mobile API, see the
[Immoscout reverse engineering documentation](../reverse-engineered-immoscout.md).

Paste the search URL from your browser as usual. Beside flats and houses this covers plots, garages,
WG rooms, short term lets, assisted living and foreclosures, region, radius and drawn-shape
searches, and the "pretty" URLs the website generates when a search carries a single filter
(`haus-mit-garage-kaufen`, `3-zimmer-wohnung-mieten`, `wohnung-bis-800-euro-warm`, ...). Commercial
searches (offices, shops, gastronomy) are not supported.

Worth knowing:

- A filter that Immoscout's own API does not offer for the type you are searching (a pets filter on
  a house purchase, say) is **dropped** and logged, because sending it makes their API reject the
  whole search.
- A filter Fredy has no translation for yet is dropped as well, and says so in the log:
  `no translator for query parameter "..." ... please report the search URL`. Your search then runs
  **wider** than you set it, so if results look too broad, check the log first.
- If a search URL cannot be mapped at all, the job fails with `Real estate type not found: <path>`.
  Please open an issue with the URL, it is a one line fix.

## Immoscout Österreich

`immobilienscout24.at` is a separate provider (`immoscoutAt`), not a country setting on the German
one. The two websites share nothing you can see: Austria has its own URL scheme
(`/regional/<bundesland>/<gemeinde>/<slug>`), its own filter parameters and its own listing ids.
What they do share is the index behind them, so Fredy reads Austria through the same reverse
engineered mobile API and both providers are thin descriptors over one client.

Paste the search URL from `immobilienscout24.at` as usual. Flats, houses and plots are covered, with
the site's filters for price, living space and room count, whether they sit in the path
(`wohnung-bis-1100-euro-mieten`) or in the query string (`?primaryPriceTo=1100`). Paging and sorting
in the path (`/seite-3`, `/aktualitaet`) are ignored rather than refused - Fredy walks and sorts on
its own.

Three limits, all of them the API's rather than Fredy's:

- **Districts are widened.** The Austrian part of the index files areas by Bundesland and Gemeinde
  and no deeper, so a Viennese district URL searches all of Vienna and says so in the log. Narrow
  the job down with a map area filter if that is too wide.
- **Renting and buying cannot be searched at once.** The API answers a request for both with the
  first of the two and reports nothing about it, so the site's plural pages (`wohnungen`,
  `einfamilienhaeuser`, `3-zimmer-wohnungen`, ...) are refused with the single-deal alternative
  named in the message. `immobilien`, which spans four types, does work.
- **Commercial searches are not supported**, the same as on the German site.

Listings link to `immobilienscout24.de/expose/<id>`. That is not a mistake: an Austrian advert is
served by the German index under a German id, and the API states that page as the advert's own
share link.

**Switzerland is not covered by this provider.** `immoscout24.ch` belongs to a different company and
runs a different platform, with no listings in this index at all. It has a provider of its own,
ImmoScout24.ch, below.

## ImmoScout24.ch

The Swiss portal of Swiss Marketplace Group, unrelated to ImmoScout24 in Germany and Austria. Its
website and its own API sit behind DataDome, so Fredy reads the SMG API the Homegate app uses, which
serves ImmoScout24.ch's listings as well and needs **no browser**.

Paste the search URL from `immoscout24.ch` as usual, for example
`https://www.immoscout24.ch/de/wohnung/mieten/ort-zuerich?nrf=3&pt=3000`. Flats (`wohnung`, `flat`,
...), houses (`haus`, `house`, ...) and the flats-and-houses category (`immobilien`, `real-estate`,
...) are covered, to rent or to buy, in all four languages, for a town, a canton, a postcode or a
district, or all of Switzerland. Rooms, living space, price, radius, object types (`pty`) and
facilities (`an`) are translated; a filter Fredy has no translation for is dropped and named in the
log, so the search then runs **wider** than you set it. Other property types (parking, commercial,
furnished, ...) stop the job with a message. Paging and sorting are ignored: Fredy reads the 60 newest
adverts itself.

That API answers each request at random with the real listings or with a **rewritten copy** in which
prices, rooms, living space and text are changed. Fredy checks every page before keeping it - a net
rent proves an answer real, a row breaking your own filters proves it rewritten, and of two
different answers the cheaper one is the real one - and asks again until it can tell. A page it
cannot verify after fifteen tries is not stored; the log says
`kept answering rewritten values ... left for the next run`, and the next run asks again.

Rents are stored as the Nettomiete where the advert gives one, with the Nebenkosten as its charges,
and as the Bruttomiete otherwise. Prices are in Swiss francs.

## idealista

Uses the mobile APIs for idealista.com, idealista.it and idealista.pt, and the search URL determines
the country. `/multi/` URLs are supported, unrelated domains are rejected. Searches with filters or
categories the APIs do not offer fall back to Fredy's browser, which DataDome can block. See the
[provider documentation](../reverse-engineered-idealista.md) for supported endpoints and filters.

## Tecnocasa & Tecnorete

The two agency networks of the Tecnocasa group, listing different adverts. Both sites ignore the
requested sort order, so Fredy reads each search to the end, up to forty pages.

## Casa.it

Uses its mobile API and geography service to translate search URLs. Searches that cannot be
translated into API requests use the job's browser; the fallback reads up to twenty pages and stops
when a page provides no valid results. See the
[provider documentation](../reverse-engineered-casa.md) for supported endpoints and filters.

## BETTERHOMES

One brokerage on three domains - `betterhomes.de`, `betterhomes.at` and `betterhomes.ch` - and a
search url from any of them works. Its results page fills itself from a JSON endpoint, which is
what Fredy asks as well, so this provider needs no browser and costs one request per run.

Paste the search url as usual: every filter it carries is passed on untouched, so anything the
portal offers works whether or not Fredy has heard of it. The exact street is never published on a
BETTERHOMES advert, so a listing is located by its postcode and district. The coordinates the
portal itself shows are its town's centre, so they are only used for an advert without any address.

A rent is stored as the Nettomiete, like every other provider's, because the affordability check
adds the Nebenkosten itself; the Bruttomiete is only the fallback for an advert that states no net
figure.

## Vonovia & Deutsche Wohnen

Germany's largest landlord and its subsidiary publish their flats on one platform, so the two
providers are one implementation over two sites. Paste the address of a search from
`vonovia.de/zuhause-finden/immobilien` or `deutsche-wohnen.com/mieten/mietangebote`: its results page
fills itself from a JSON endpoint, which is what Fredy asks as well, so neither needs a browser for
the search. A search larger than the 50 listings the endpoint hands out at once is read page by page.

Both providers read rentals, and store the Kaltmiete. The full description comes from the listing's
own page and leaves out the contact person's name, e-mail and phone number, which the page carries
in fields of their own.

## leboncoin

France's largest classifieds site, and the one with the most property adverts in the country -
private landlords above all. Paste the address of a search from `leboncoin.fr`, which reads
`https://www.leboncoin.fr/recherche?category=10&locations=...`. Every filter the site offers is
passed on: Fredy translates the url into the request the site's own search page sends, following
the site's own rules, so a filter Fredy has never heard of still reaches leboncoin. Towns with or
without a postcode, departments, regions and a radius around a place are covered, and the other kinds
of place the site writes into its urls (districts, map sections, drawn shapes) are passed on the way
it writes them.

leboncoin sits behind DataDome, and its result pages answer a browser that navigates to them with a
captcha. Fredy therefore opens leboncoin's home page once per run and asks the search endpoint from
inside it, the way the site does; that one navigation is all the browser costs. If a run still ends
with `We have been detected as a bot`, see the proxy section below. A French residential IP suits
leboncoin and SeLoger best; keep in mind that the proxy setting is shared by every browser-based
provider.

Two things leboncoin does not get: detail enrichment, because the search already answers with the
full description, and **price tracking**, because the only place the current price could be read is
the advert page, which is behind the same wall.

## SeLoger

SeLoger runs on the same platform as Immowelt - both belong to the AVIV group - so it is read the
same way, through the search endpoint its own result page uses, from inside a browser session. Paste
the address of a result page, which reads
`https://www.seloger.com/classified-search?distributionTypes=...&locations=AD08FR...`. SeLoger's
landing pages (`/recherche/location/appartement/...`), which spell their search in the path, are
refused with a message saying so: run the search from SeLoger's search form instead.

A filter Fredy cannot translate stops the job and names itself, rather than being dropped and
widening your search, exactly as on Immowelt; the campaign tags a link picks up from an alert mail or
an ad click (`xtor`, `at_medium`, `gclid`, ...) are ignored. SeLoger's results include the adverts of
Belles Demeures, its luxury sister portal, and those link to `bellesdemeures.com`; their full
description is not fetched and their price is not tracked, since that site is not SeLoger's.

Whether a stored advert is still online, and what it costs today, is asked the same way the search
is: from inside a browser session, since SeLoger - like Immowelt - answers any plain request with the
DataDome wall, whether the advert is still there or not. The alive-checker and the price tracker
start one browser per run for it, and only when a SeLoger or Immowelt listing is due.

**Rents are stored the way the card states them.** SeLoger quotes each rent either *charges
comprises* ("cc") or *hors charges* ("hc"), advert by advert, and its result cards give no charges
figure to take a "cc" rent down to the one without them. So a SeLoger rent is sometimes with the
charges and sometimes without, while leboncoin and Bien'ici store it without them wherever the
advert states them. Fredy records which one each stored rent is, and compares rents on the basis
both sides share when it looks for the same flat on two portals. The affordability verdict accounts
for it too: a "cc" rent is already what you pay each month, so it is measured against your warm-rent
ceiling with no Nebenkosten added on top, while an "hc" rent gets the surcharge as before.

## Bien'ici

The portal France's agency networks founded together. Its result page is filled from a public JSON
endpoint, which is what Fredy asks as well, so this provider needs **no browser** and costs one
request per run, plus one place lookup per place in the url once a day. Paste the address of a search from `bienici.com`, which reads
`https://www.bienici.com/recherche/location/paris-75000/appartement?...`. Several places, several
property types and room counts work, and so does every filter the site writes into the query string;
one Fredy does not know stops the job and names itself instead of widening your search.

Rents are stored without charges: Bien'ici quotes them *charges comprises* and states the charges
next to them, so Fredy subtracts them, or takes the advertiser's own figure where one is given. On a
rent-controlled advert that figure is the capped base rent, and the *complément de loyer* on top of
it is added back, since the tenant pays it every month like the rest.

Not supported: an area drawn on the map, a circle and a travel-time area. Bien'ici keeps those on its
own servers and the url carries nothing but an id, so the job stops and says so - search the town
and narrow it down with Fredy's own map area filter instead. A place Bien'ici no longer knows stops
the job too, rather than being searched as whatever its place lookup guesses instead.

## Immoweb

Belgium's largest property portal. Paste the address of a result page, which reads
`https://www.immoweb.be/en/search/apartment/for-rent?countries=BE&page=1&orderBy=newest`; the
French and Dutch versions (`/fr/`, `/nl/`) work the same way, and Fredy sorts by `orderBy=newest`
itself. The page is read in Fredy's browser, so the proxy section below applies: Immoweb sits
behind Cloudflare, which tends to refuse a datacenter IP.

What Fredy reads is the result card: price, living space, bedrooms, locality and photo. The room
count is the **number of bedrooms**, which is how Belgian adverts count, and a new-build project
quoting ranges is stored with the low end of each. There is no detail enrichment and no price
tracking for Immoweb yet. Addresses are geocoded in Belgium, and application letters are written in
English, since Fredy ships no French or Dutch template.

## Boligsiden

Denmark's portal for homes for sale: it gathers the adverts of most Danish estate agents (EDC,
Nybolig, home, danbolig, ...) in one search. Boligsiden has no rentals. The website sits behind a
Cloudflare challenge, but its results come from a JSON API that answers plainly, so Fredy asks that
API and needs **no browser**: one request per run, for the 50 newest cases.

Paste the address of a result page, for example
`https://www.boligsiden.dk/kommune/odense/tilsalg/ejerlejlighed?priceMax=3000000`. The filters in
the query string (price, rooms, area, radius, ...) are passed on as they are, since the API speaks
the same language. The path is translated for a municipality (`/kommune/...`), a postcode
(`/postnummer/...`) or the whole country, and for the types villa, rækkehus, ejerlejlighed,
andelsbolig and villalejlighed. A path naming anything else (a town, a district, a road, another
type) stops the job with a message rather than searching all of Denmark. For those, paste a query
on the API itself instead, which is passed on untouched:
`https://api.boligsiden.dk/search/cases?addressTypes=villa,condo&zipCodes=5000&zipCodes=5200`.
Several places are written as a repeated parameter there, never comma separated.

Prices are in Danish kroner. Listings link to the estate agent's own page.

## BoligPortal

Denmark's largest rental portal, private landlords included. Paste the address of a result page as
usual, for example `https://www.boligportal.dk/lejeboliger/hiller%C3%B8d/alle-v%C3%A6relser/?max_monthly_rent=15000`:
every filter in its path and query string is used as it is. A sort you picked on the site and the
page you copied it from are dropped, so Fredy always reads the newest adverts first, two result
pages per run.

BoligPortal sits behind Cloudflare, so this provider uses the browser and waits for the challenge to
clear. A datacenter IP can be blocked outright; if runs end with
`BoligPortal did not serve the page`, see the proxy section below and use a Danish residential IP.
Each new advert's own page is read once for its full description, a few seconds apart.

Rents are in Danish kroner and stored as advertised; running costs an advert states on top of the
rent (heating, water a conto) are stored as its charges.

## Countries and the map

**Every provider declares the countries it covers**, and the job form puts the matching flag in
front of its name so a mixed list can be read at a glance. The declaration is one line on the
provider's `metaInformation`:

```javascript
export const metaInformation = {
  name: 'your provider name',
  baseUrl: 'https://www.yourprovider.fr/',
  id: 'yourprovider',
  countries: ['fr'],
};
```

Addresses are then geocoded in those countries, and the map opens on them so you can draw a search
area there. A provider spanning several is fine: `countries: ['de', 'at', 'ch']`.

## 🛡️ Bot detection & proxies

Most browser-based providers (kleinanzeigen, wg-gesucht, ohnemakler, ...) are scraped through a
hardened headless browser ([CloakBrowser](https://www.npmjs.com/package/cloakbrowser)). It makes the
**browser fingerprint** indistinguishable from a real Chrome, which is enough when you run Fredy on
a normal home connection.

On a **server / VPS the requests usually originate from a datacenter IP**, and providers behind
anti-bot systems (e.g. AWS CloudFront/WAF) block those based on **IP reputation alone**, no matter
how perfect the fingerprint is. The typical symptom: it works locally but you get
`We have been detected as a bot :-/` on the server.

### The fix: a residential proxy

A **residential proxy** routes Fredy's browser through the internet connection of a real household,
so the provider sees a "normal user" IP instead of a datacenter. For German portals, use a **German
(DE) residential** (or mobile/4G) proxy. Plain VPNs and **datacenter proxies do not help** here,
they share the same bad reputation as your server.

**Configure it** under **Administration → Execution → Proxy URL**. Supported formats:

```
http://user:pass@host:port
socks5://user:pass@host:port
```

Leave the field empty to disable. The proxy applies to all headless-browser providers and takes
effect on the next job run (no restart needed). Immoscout uses a separate mobile API and is not
affected.

### Where to get one

Residential proxies are a paid service (usually billed per GB, Fredy's traffic is small). Well-known
providers offering German residential IPs:

| Provider | Notes |
|---|---|
| [IPRoyal](https://iproyal.com) | Pay-as-you-go, no monthly minimum, good for low volume |
| [Webshare](https://www.webshare.io) | Cheap entry tier, has a small free plan to test with |
| [Decodo (formerly Smartproxy)](https://decodo.com) | Easy setup, country/city targeting |
| [SOAX](https://soax.com) | Residential + mobile, fine-grained geo-targeting |
| [Bright Data](https://brightdata.com) | Largest pool, most features, higher complexity/price |
| [Oxylabs](https://oxylabs.io) | Enterprise-grade, larger plans |

This is not an endorsement, pick whatever fits your budget. For low-volume use like Fredy, a
pay-as-you-go plan (e.g. IPRoyal) or a cheap entry tier (e.g. Webshare) is usually plenty. Select
**Germany** as the proxy location and keep the search interval reasonable, the higher the interval,
the less you look like a bot.
