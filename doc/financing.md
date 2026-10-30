# 💶 Financing Calculator

The **Financing** page works out what a listing would cost you every month, and whether that fits
your household.

Every job declares whether it searches to **rent** or to **buy**, and the page has one tab for each.
Both share the same household block (income for one or two people, living costs, any loan you are
already paying off) and the same rule of thumb: housing costs plus existing debt at or below 35 % of
net income.

## Renting

Portals quote Kaltmiete, households pay warm. Set the Nebenkosten surcharge once, and Fredy reports
the highest cold rent you can take on, what that comes to warm, and what is left over each month.
The renting tab asks for nothing beyond that.

Some portals quote a rent with the running charges already in it instead: a French rent *charges
comprises*, an immowelt Warmmiete. Fredy records which kind each stored rent is, and the verdict
accounts for it. A rent quoted with the charges is measured against your warm-rent ceiling as it
stands, with no surcharge added on top, in the verdict chip, the affordability filter, the rent card
and the `calculate_financing` answer alike; the rent card shows the charges the advert states
instead of an estimate. Rents quoted without the charges, and those whose portal does not say, are
judged exactly as before.

## Buying

The buying tab models the purchase the way a European bank would, as an **Annuitätendarlehen**:

- the **monthly rate**, and how it splits into interest and repayment over the years
- the **Kaufnebenkosten**: Grunderwerbsteuer for your Bundesland, Notar + Grundbuch, and the
  Maklerprovision. On a 400.000 € house in NRW these add roughly 46.000 € that you have to finance
  or pay out of your own pocket
- the **Restschuld** left when the Zinsbindung runs out, which you have to refinance at whatever
  rates exist then
- the **age at which you and your partner become debt-free**
- the **highest purchase price** that keeps you inside the 35 % rule

Loan scenarios can be compared side by side, each with a Sollzins, a Tilgung, a Zinsbindung, a
monthly rate and an optional Sondertilgung. Tilgung and monthly rate describe the same thing from
opposite ends, so editing one rewrites the other and you can enter whichever figure you have. The
term is calculated at a constant Sollzins. Fredy does not guess what a follow-up loan will cost
after the Zinsbindung, it reports the Restschuld instead.

## Rental yield (buying jobs)

A listing found by a buying job also gets an estimate of what it would earn if you let it out, on a
**Mietrendite (Schätzung)** card on its detail page:

- **gross yield**: a year of cold rent over the purchase price
- **net yield**: that rent less a flat 20 % for costs an owner cannot pass on to the tenant
  (management, maintenance, vacancy), over the price plus the Kaufnebenkosten from your buying tab
- **Kaufpreisfaktor**: the purchase price over a year of cold rent

The cold rent is never the advert's own. Fredy takes the **median cold rent per m² of the rentals it
has found around the listing**, with the same radius and minimum sample as the price per m²
comparison: at least eight rentals within 5 km, widened to 15 km where 5 km holds too few. That
needs rentals in the table, so it only works where a rent job of yours, or of another user on the
same instance, covers the same area. Rents quoted with the charges in them are brought down to the
cold rent where the advert states the charges, and left out where it does not. Without enough
rentals nearby the card shows no yield and says why. Fredy ships no Mietspiegel table. Like the
price per m² comparison, the estimate is taken when Fredy finds the listing (and once, on upgrade,
for the purchases already stored), so it describes the rentals on the market at that time.

If you know the actual rent, from the exposé or the agent, enter it on the card; every figure is
then computed from your rent instead, and **Use the estimate** goes back.

A buying job can also set a **minimum gross yield** among its criteria. Listings below it are
dropped the way the area filter drops listings outside the drawn area. A listing Fredy cannot
estimate a rent for is **kept**: a missing estimate says nothing about the flat, and dropping those
would silently empty a search in any area your rent jobs do not cover. Rent jobs are not affected.

## Where the result shows up

Each tab saves and deletes on its own. Once one is saved, its verdict appears elsewhere:

- an **affordability filter** on the listings overview and the map, next to the status and provider
  filters, plus a small verdict chip on each listing
- a **rent card or a financing card** on the listing detail page, whichever matches the job that
  found the listing

Which calculation a listing gets follows the deal type of its job, so a 1.200 € rent is never read
as a very cheap house. Nothing appears until the matching tab is filled in.

An LLM can ask the same question over MCP with the `calculate_financing` tool, which returns a
mortgage answer or a rent answer depending on the listing.

> **This is an estimate, not financial advice.** The Grunderwerbsteuer rates ship as editable
> defaults and Bundesländer change them from time to time, so check the figure for your state and
> get a binding offer from your bank before committing to anything.
