# Fredy-Forks: Was die Community ergänzt hat

Stand: 11.10.2026. Verglichen mit [`orangecoding/fredy`](https://github.com/orangecoding/fredy) `master` auf
Commit `cbb3cab` vom 07.10.2026.

Diese Übersicht sammelt, was die Forks von Fredy gegenüber Upstream ergänzt haben, und prüft für jede
Ergänzung, ob der heutige Upstream-Stand sie schon hat. Die ausführlichen Beschreibungen mit Dateien und
Commit-Links stehen in [fork-improvements-details.md](./fork-improvements-details.md).

## Vorgehen

1. **Forks erfasst:** 240 Forks laut GitHub-Netzwerkseite, davon alle 524 Branches per `git fetch` in ein
   gemeinsames Repository geladen.
2. **Eigene Commits bestimmt:** pro Fork die Commits, die in keinem Upstream-Branch und keinem Tag liegen.
   Herausgefiltert wurden Commits aus Upstream-PRs, die gemergt sind, und Commits, deren Patch identisch in
   Upstream-`master` liegt.
3. **Ergebnis der Filterung:**

   | Gruppe | Forks |
   | --- | --- |
   | ohne einen einzigen eigenen Commit | 106 |
   | nur mit Beiträgen, die Upstream schon übernommen hat | 38 |
   | mit eigenen Änderungen, die Upstream nicht hat | **96** |

4. **Inhalt bewertet:** Die 96 Forks wurden auf 10 parallel arbeitende Agenten verteilt (große Forks einzeln,
   kleine gebündelt). Jeder Agent hat die Diffs gelesen, zusammengehörige Commits zu Funktionen gruppiert,
   Rauschen aussortiert (Dependabot, Lockfiles, eigene Suchkonfiguration, private Deployments) und jede Funktion
   gegen den heutigen Upstream-Code geprüft.

**Grenzen:** Nichts davon wurde ausgeführt oder getestet. „Nutzen“ und „Aufwand“ sind Einschätzungen aus dem
Code. Viele Forks basieren auf alten Ständen; „Aufwand“ meint die Übernahme in den heutigen Upstream, nicht ein
einfaches Cherry-Pick. Einige Forks bauen auf älteren, noch MIT-lizenzierten Ständen auf; Upstream steht heute
unter Apache-2.0 mit Commons Clause. Vor einer Übernahme Lizenz und Urheber prüfen.

## Das Wichtigste in Kürze

### Was mehrere Forks unabhängig voneinander gebaut haben

Wenn mehrere Leute dieselbe Lücke selbst schließen, ist das das stärkste Signal für fehlende Funktionen in
Upstream.

| Thema | Forks | Stand Upstream |
| --- | --- | --- |
| **Mehrere Ergebnisseiten abrufen** (Paginierung), vor allem ImmoScout und Kleinanzeigen | 7: adhi1419, oneskovic, CommanderTvis, MatthiasCK, NoRiceToday, marvin-bay, lanschl | fehlt; `lib/services/immoscout/mobileApi.js` liest genau eine Ergebnisseite |
| **Mehrere Bilder pro Inserat**, Galerie, lokaler Bild-Cache, Bilder in Benachrichtigungen | 9: andrey5608, dosr1, lolokraus, realDayaa, hugoschwabe, CappyT, domisko, MatthiasCK, mkarlan | nur ein Vorschaubild |
| **Eigene Abfrageintervalle**: pro Job, mit Zufallsverzögerung, unter 5 Minuten, zu festen Uhrzeiten, Arbeitszeiten pro Job | 6: yoolandes, Jtingo, moleqnap, Cenngo, rustam-k0, tsteffek | nur ein globales Intervall und globale Arbeitszeiten |
| **Bewerbung an Vermieter automatisieren**: KI-Text, Versand über das Kontaktformular des Portals, Gmail-Entwurf, Antworten per IMAP verfolgen | 5: adhi1419, sidneypiper, oneskovic, moleqnap, alexanderroidl | Anschreiben aus Vorlagen, kein Versand, kein Posteingang |
| **Wohnungsunternehmen als Provider**: Vonovia, Adler, LEG, GAG, Genossenschaften | 5: netzkontrast, Jtingo, realDayaa, yanicii, Jexome | nur Deutsche Wohnen und inberlinwohnen.de |
| **Währung pro Provider oder Inserat** statt fest Euro | 4: CappyT, rcmadruga, Gabko14, domisko | Euro fest verdrahtet |
| **Schweiz: ImmoScout24.ch und Homegate** | 4: CappyT, domisko, Gabko14, MikeW27 | fehlt (Flatfox ist vorhanden) |
| **Filter nach Einzugsdatum** | 4: paula003, awerks, rcmadruga, sidneypiper | fehlt |
| **API-Token für die REST-API** | 3: Cenngo, Tee132me, satty008 | nur Session-Login (MCP hat Token) |
| **Dasselbe Inserat nur einmal**, auch wenn es mehrere Jobs finden | 2: rustam-k0, hugoschwabe | bekannte Inserate gelten pro Job |
| **Docker-Container ohne Root** | 2: Apfelwurm (offener PR #477), rugk | läuft als root |
| **Wunderflats** als Provider | 2: paula003, netzkontrast | fehlt |

### Fehler, die in Upstream noch stecken und die ein Fork schon behoben hat

Kleine Änderungen, die sich einzeln übernehmen lassen. Die ersten beiden habe ich im Upstream-Code selbst
nachgeprüft.

| Fehler in Upstream | Fork mit Fix |
| --- | --- |
| Mattermost: `send()` hängt `newListings.map(...)` ohne `join('')` an den Text, die Tabellenzeilen werden dadurch mit Kommas verbunden; `\|` in Titeln wird nicht escaped | [bergo/fredy](https://github.com/bergo/fredy) |
| HTTP-Webhook: `timeout: 10000` wird an das native `fetch` übergeben, das die Option ignoriert; der Antwortstatus wird nicht geprüft | [hugoschwabe/fredy-berlin](https://github.com/hugoschwabe/fredy-berlin) |
| Wirft das Schließen des Browsers einen Fehler, bleibt der Job dauerhaft als „läuft“ markiert | [realDayaa/fredy](https://github.com/realDayaa/fredy) |
| Engel & Völkers antwortet mit HTTP 500, wenn als Ort eine Postleitzahl übergeben wird | [realDayaa/fredy](https://github.com/realDayaa/fredy) |
| Geocoding nimmt ungeprüft den ersten Nominatim-Treffer, auch wenn die Postleitzahl nicht passt | [johannesvedder/fredy](https://github.com/johannesvedder/fredy) |
| Ändert ein Portal den Preis, entsteht ein neues Inserat statt einer Preisänderung (Abgleich nur über den Hash, nicht über den Link) | [CappyT/fredy](https://github.com/CappyT/fredy) |

### Die größten Fork-Projekte

| Fork | Schwerpunkt |
| --- | --- |
| [adhi1419/fredy](https://github.com/adhi1419/fredy) | Umbau zur mandantenfähigen Cloud-Anwendung (Cloud Run, Firestore, Google-Login). Kern ist der automatische Bewerbungsversand über die Kontaktformulare von ImmoScout24, Kleinanzeigen, Deutsche Wohnen, HOWOGE, WBM und Stadt und Land, mit KI-Texten über Gemini. Dazu ein neues TypeScript-Frontend. Viele Upstream-Funktionen wurden dafür entfernt, deshalb eher Ideenquelle als Merge-Kandidat. |
| [CappyT/fredy](https://github.com/CappyT/fredy) | Italien und Schweiz vom Autor der Italien-Provider, die Upstream schon hat. Immobiliare.it, Homegate und ImmoScout24.ch über die Mobile-APIs, Anti-Bot-Infrastruktur (globaler Proxy, IPRoyal, Capsolver), CHF-Preise. |
| [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk) | Dänemark, aktuell auf Upstream rebased: vier Portale, Währung pro Provider, dänische Finanzierung und Kartenebenen. Allgemein nützlich ist ein Listing-Score mit Radar-Chart. Fast alles hat Tests. |
| [aselekoglu/arpa-house-search](https://github.com/aselekoglu/arpa-house-search) | Eigenständiges Derivat: frei definierbare Quellen per CSS-Selektor-Rezept mit SSRF-Schutz, Realtor.ca für Kanada, kanonisches Listing-Modell. |
| [satty008/fredy](https://github.com/satty008/fredy) | Für Kapitalanleger: Mietrendite, Kaufpreisfaktor, Cashflow-Urteil, KI-Bewertung GOOD/MAYBE/BAD mit eigenem API-Schlüssel, PWA. |
| [moleqnap/fredy](https://github.com/moleqnap/fredy) | Bewerbungsablauf: IMAP-Postfach, Mails werden Inseraten zugeordnet, Einladungen und Besichtigungen werden verfolgt (Upstream-PRs #414/#415 offen). |
| [netzkontrast/fredy](https://github.com/netzkontrast/fredy) | Zehn neue Provider ohne Browser (Vonovia, LEG, GAG, Vivawest, Adler, Grand City, Wunderflats …), alle mit Fixture-Tests und nach Upstream-Konventionen. Gut zu übernehmen. |
| [realDayaa/fredy](https://github.com/realDayaa/fredy) | Halle (Saale): ein Dutzend Genossenschaften und Vermieter, lokaler Bild-Cache, Robustheits-Fixes. |
| [Gabko14/fredy-ch](https://github.com/Gabko14/fredy-ch) | Schweiz: ImmoScout24.ch über Bright Data, CHF-Preise. |
| [sidneypiper/fredy](https://github.com/sidneypiper/fredy) | KI-Nachricht an Vermieter in jeder Benachrichtigung, ImmoScout24-Mieter-Netzwerk, Detailabruf erst nach allen Filtern. |
| [Wodooman/fredy](https://github.com/Wodooman/fredy) | Health-Monitoring der Jobs mit Laufhistorie und Protokoll pro Stufe und Provider. |
| [andrey5608/fredy](https://github.com/andrey5608/fredy) | Mehrere Bilder pro Inserat mit Bild-Proxy, Galerie, Telegram-Alben und Bildern in E-Mails. |

### Beste Kandidaten zur Übernahme

Funktionen mit hohem Nutzen, die Upstream noch nicht (oder nur teilweise) hat und deren Übernahme
höchstens mittleren Aufwand kostet.

| Funktion | Fork | Kategorie | Upstream | Aufwand |
| --- | --- | --- | --- | --- |
| [Fehler beim Schließen des Browsers blockiert Job nicht mehr](fork-improvements-details.md#realdayaafredy) | [realDayaa/fredy](https://github.com/realDayaa/fredy) | Bugfix | neu | gering |
| [Postleitzahl-Validierung beim Geocoding](fork-improvements-details.md#johannesvedderfredy) | [johannesvedder/fredy](https://github.com/johannesvedder/fredy) | Karte & Geodaten | neu | gering |
| [Mehrseitiger Abruf für ImmoScout24 und Kleinanzeigen](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy) | Provider | neu | gering |
| [Vonovia-Provider über die JSON-Schnittstelle](fork-improvements-details.md#netzkontrastfredy) | [netzkontrast/fredy](https://github.com/netzkontrast/fredy) | Provider | neu | gering |
| [Alle Ergebnisseiten bei ImmoScout und WG-Gesucht abrufen](fork-improvements-details.md#oneskovicfredy) | [oneskovic/fredy](https://github.com/oneskovic/fredy) | Provider | neu | gering |
| [Boligsiden-Provider (dänische Kaufobjekte)](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk) | Provider | neu | gering |
| [BoligPortal-Provider (größtes dänisches Mietportal)](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk) | Provider | neu | gering |
| [Immoweb-Provider (Belgien)](fork-improvements-details.md#sanderdeweirdtfredy) | [SanderDeweirdt/fredy](https://github.com/SanderDeweirdt/fredy) | Provider | neu | gering |
| [Preisänderung per Link erkennen statt Duplikat anlegen](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy) | Bugfix | neu | mittel |
| [Automatische Zuordnung eingehender Mails zu Inseraten](fork-improvements-details.md#moleqnapfredy) | [moleqnap/fredy](https://github.com/moleqnap/fredy) | Daten & Speicherung | neu | mittel |
| [Globaler Ausgangs-Proxy für alle Portal-Aufrufe inkl. IPRoyal-Steuerung](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy) | Deployment & Betrieb | teilweise | mittel |
| [Filter nach Einzugsdatum (frühestens/spätestens)](fork-improvements-details.md#paula003fredy) | [paula003/fredy](https://github.com/paula003/fredy) | Filter & Suche | neu | mittel |
| [Karte mit denselben serverseitigen Filtern wie die Übersicht](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk) | Filter & Suche | neu | mittel |
| [Mietrendite-Schätzung (brutto/netto) mit Mindestrendite-Filter und Kaltmiete-Override](fork-improvements-details.md#satty008fredy) | [satty008/fredy](https://github.com/satty008/fredy) | Filter & Suche | neu | mittel |
| [Preise in eigener Währung (CHF getrennt von EUR)](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy) | Länder & Lokalisierung | neu | mittel |
| [Währung pro Provider statt fest Euro](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk) | Länder & Lokalisierung | neu | mittel |
| ['Rate with my own AI': KI-Bewertung mit eigenem API-Schlüssel jedes Nutzers](fork-improvements-details.md#satty008fredy) | [satty008/fredy](https://github.com/satty008/fredy) | MCP & KI | neu | mittel |
| [Eigenes Abfrageintervall pro Job mit zufälligem Jitter](fork-improvements-details.md#yoolandesfredy) | [yoolandes/fredy](https://github.com/yoolandes/fredy) | Performance | neu | mittel |
| [ImmoScout24.ch-Provider über die Android-Mobile-API](fork-improvements-details.md#domiskofredy) | [domisko/fredy](https://github.com/domisko/fredy) | Provider | neu | mittel |
| [Erweiterter Bewerbungsstatus mit Mail-Erkennung und Einladungs-Tracking](fork-improvements-details.md#moleqnapfredy) | [moleqnap/fredy](https://github.com/moleqnap/fredy) | UI/UX | teilweise | mittel |

## Kennzahlen

| Kennzahl | Wert |
| --- | --- |
| Forks mit ausgewerteten eigenen Commits | 96 |
| davon mit mindestens einer echten Funktion | 78 |
| Funktionen/Verbesserungen insgesamt | 247 |
| Upstream-Status „neu“ | 154 |
| Upstream-Status „teilweise“ | 48 |
| Upstream-Status „schon upstream“ | 45 |

## Alle Funktionen nach Kategorie

Sortiert nach Upstream-Status (neue zuerst) und Nutzen. Der Funktionsname springt zur Beschreibung im
Abschnitt „Details pro Fork“. „Aufwand“ schätzt, was eine Übernahme in den heutigen Upstream-Stand kostet.

### Provider (67)

| Funktion | Fork | Upstream | Nutzen | Aufwand |
| --- | --- | --- | --- | --- |
| [Mehrseitiger Abruf für ImmoScout24 und Kleinanzeigen](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | neu | hoch | gering |
| [Custom Sources: eigene Quellen per Selektor-Rezept mit Source Builder](fork-improvements-details.md#aselekogluarpa-house-search) | [aselekoglu/arpa-house-search](https://github.com/aselekoglu/arpa-house-search/tree/main) | neu | hoch | hoch |
| [Provider Homegate und ImmoScout24.ch (SMG-Mobile-API mit Poisoning-Erkennung)](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy/tree/master) | neu | hoch | hoch |
| [Provider Immobiliare.it (Android-App-API mit Browser-Fallback)](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy/tree/master) | neu | hoch | hoch |
| [ImmoScout24.ch-Provider über die Android-Mobile-API](fork-improvements-details.md#domiskofredy) | [domisko/fredy](https://github.com/domisko/fredy/tree/master) | neu | hoch | mittel |
| [Vonovia-Provider über die JSON-Schnittstelle](fork-improvements-details.md#netzkontrastfredy) | [netzkontrast/fredy](https://github.com/netzkontrast/fredy/tree/feat/vonovia-provider) | neu | hoch | gering |
| [Alle Ergebnisseiten bei ImmoScout und WG-Gesucht abrufen](fork-improvements-details.md#oneskovicfredy) | [oneskovic/fredy](https://github.com/oneskovic/fredy/tree/master) | neu | hoch | gering |
| [BoligPortal-Provider (größtes dänisches Mietportal)](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk/tree/master) | neu | hoch | gering |
| [Boligsiden-Provider (dänische Kaufobjekte)](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk/tree/master) | neu | hoch | gering |
| [Immoweb-Provider (Belgien)](fork-improvements-details.md#sanderdeweirdtfredy) | [SanderDeweirdt/fredy](https://github.com/SanderDeweirdt/fredy/tree/master) | neu | hoch | gering |
| [Neuer Provider WBM (wbm.de)](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | neu | mittel | gering |
| [Idealista: Fotogalerie und Link-Sprache pro Job](fork-improvements-details.md#andrey5608fredy) | [andrey5608/fredy](https://github.com/andrey5608/fredy/tree/master) | neu | mittel | gering |
| [Provider Realtor.ca (Kanada, Mietangebote)](fork-improvements-details.md#aselekogluarpa-house-search) | [aselekoglu/arpa-house-search](https://github.com/aselekoglu/arpa-house-search/tree/main) | neu | mittel | mittel |
| [Idealista-Aktivprüfung über die App-Detail-API](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy/tree/master) | neu | mittel | gering |
| [ImmoScout-Paginierung](fork-improvements-details.md#commandertvisfredy) | [CommanderTvis/fredy](https://github.com/CommanderTvis/fredy/tree/commandertvis/pages) | neu | mittel | mittel |
| [Homegate.ch-Provider mit CloakBrowser und DataDome-Umgehung](fork-improvements-details.md#domiskofredy) | [domisko/fredy](https://github.com/domisko/fredy/tree/master) | neu | mittel | mittel |
| [Zusätzliche Bilder und Exposé-PDFs von ImmoScout speichern](fork-improvements-details.md#dosr1fredy) | [dosr1/fredy](https://github.com/dosr1/fredy/tree/features/additionalpictures) | neu | mittel | hoch |
| [ImmoScout24.ch-Provider über Bright Data Web Unlocker](fork-improvements-details.md#gabko14fredy-ch) | [Gabko14/fredy-ch](https://github.com/Gabko14/fredy-ch/tree/feature/swiss-providers) | neu | mittel | mittel |
| [Provider Adler Group](fork-improvements-details.md#jtingofredy) | [Jtingo/fredy](https://github.com/Jtingo/fredy/tree/master) | neu | mittel | gering |
| [Provider Vonovia](fork-improvements-details.md#jtingofredy) | [Jtingo/fredy](https://github.com/Jtingo/fredy/tree/master) | neu | mittel | gering |
| [Paginierung für HTML-Provider](fork-improvements-details.md#marvin-bayfredy) | [marvin-bay/fredy](https://github.com/marvin-bay/fredy/tree/master) | neu | mittel | mittel |
| [ImmoScout-Paginierung mit Abbruch bei bekannten Inseraten und Full-Fetch-Modus](fork-improvements-details.md#matthiasckfredy) | [MatthiasCK/fredy](https://github.com/MatthiasCK/fredy/tree/mk/master) | neu | mittel | mittel |
| [Provider ImmoScout24.ch](fork-improvements-details.md#mikew27fredy) | [MikeW27/fredy](https://github.com/MikeW27/fredy/tree/master) | neu | mittel | mittel |
| [Provider immo.tt.com (Tirol)](fork-improvements-details.md#mrxderfredy) | [mrxder/fredy](https://github.com/mrxder/fredy/tree/master) | neu | mittel | gering |
| [Provider für Wohnungsunternehmen in Köln/Bonn/NRW](fork-improvements-details.md#netzkontrastfredy) | [netzkontrast/fredy](https://github.com/netzkontrast/fredy/tree/feat/koeln-bonn-providers) | neu | mittel | gering |
| [Überregionale Provider: Grand City Property, Adler Group, Wunderflats, immosuchmaschine](fork-improvements-details.md#netzkontrastfredy) | [netzkontrast/fredy](https://github.com/netzkontrast/fredy/tree/feat/koeln-bonn-providers) | neu | mittel | gering |
| [Kleinanzeigen: Paginierung über bis zu 5 Ergebnisseiten](fork-improvements-details.md#noricetodayfredy) | [NoRiceToday/fredy](https://github.com/NoRiceToday/fredy/tree/local-patches) | neu | mittel | gering |
| [Provider HousingAnywhere](fork-improvements-details.md#paula003fredy) | [paula003/fredy](https://github.com/paula003/fredy/tree/master) | neu | mittel | gering |
| [Provider Wunderflats](fork-improvements-details.md#paula003fredy) | [paula003/fredy](https://github.com/paula003/fredy/tree/master) | neu | mittel | gering |
| [kleinanzeigen.at-Provider](fork-improvements-details.md#pposchfredy_at) | [pposch/fredy_AT](https://github.com/pposch/fredy_AT/tree/master) | neu | mittel | gering |
| [Lejebolig-Provider (dänische Mietwohnungen)](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk/tree/master) | neu | mittel | gering |
| [12 Provider für Wohnungsgenossenschaften und Vermieter in Halle (Saale)](fork-improvements-details.md#realdayaafredy) | [realDayaa/fredy](https://github.com/realDayaa/fredy/tree/master) | neu | mittel | gering |
| [WG-Gesucht: Anbieter und Anbietertyp auslesen und per Blacklist filtern](fork-improvements-details.md#rustam-k0fredy) | [rustam-k0/fredy](https://github.com/rustam-k0/fredy/tree/master) | neu | mittel | gering |
| [ImmoScout: Einzugsdatum, Shape-Fix und pagesize](fork-improvements-details.md#sidneypiperfredy) | [sidneypiper/fredy](https://github.com/sidneypiper/fredy/tree/main) | neu | mittel | gering |
| [Provider ImmoScout24 Mieter-Netzwerk](fork-improvements-details.md#sidneypiperfredy) | [sidneypiper/fredy](https://github.com/sidneypiper/fredy/tree/main) | neu | mittel | gering |
| [Fotocasa-Provider über die signierte Android-Mobile-API](fork-improvements-details.md#sunil16666fredy) | [Sunil16666/fredy](https://github.com/Sunil16666/fredy/tree/add-fotocasa-provider) | neu | mittel | mittel |
| [Generischer Provider für ImmoScout24-Anbieterportale](fork-improvements-details.md#yaniciifredy) | [yanicii/fredy](https://github.com/yanicii/fredy/tree/develop) | neu | mittel | gering |
| [Homegate-, Newhome- und Anibis-Provider sowie 2Captcha-DataDome-Solver (wieder entfernt)](fork-improvements-details.md#gabko14fredy-ch) | [Gabko14/fredy-ch](https://github.com/Gabko14/fredy-ch/tree/master) | neu | niedrig | hoch |
| [Provider GAG Köln](fork-improvements-details.md#jexomefredy) | [Jexome/fredy](https://github.com/Jexome/fredy/tree/gagKoeln) | neu | niedrig | mittel |
| [Kleinanzeigen-Provider über externe Python-API (allgemeine Artikelsuche)](fork-improvements-details.md#jsonlordfredy) | [JsonLord/fredy](https://github.com/JsonLord/fredy/tree/kleinanzeigen-api-integration-2270847634649632849) | neu | niedrig | hoch |
| [Eigenständiger Scraper für Studierendenwerk Karlsruhe (sw-ka.de)](fork-improvements-details.md#oneskovicfredy) | [oneskovic/fredy](https://github.com/oneskovic/fredy/tree/swka-scraper) | neu | niedrig | mittel |
| [Provider Südkurier Anzeigen](fork-improvements-details.md#pxldifredy) | [pxldi/fredy](https://github.com/pxldi/fredy/tree/custom) | neu | niedrig | gering |
| [Provider Vierwände (RSS)](fork-improvements-details.md#pxldifredy) | [pxldi/fredy](https://github.com/pxldi/fredy/tree/custom) | neu | niedrig | gering |
| [Danica-Ejendomme-Provider](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk/tree/master) | neu | niedrig | gering |
| [Provider ISIHOME mit Paginierung und Detailabruf](fork-improvements-details.md#realdayaafredy) | [realDayaa/fredy](https://github.com/realDayaa/fredy/tree/master) | neu | niedrig | gering |
| [Provider Augsburger Allgemeine Immobilien](fork-improvements-details.md#ssch4tzfredy) | [ssch4tz/fredy](https://github.com/ssch4tz/fredy/tree/master) | neu | niedrig | mittel |
| [Provider für Hamburger Vermieter und Makler (Thor, Groth & Schneider, Wentzel Dr.)](fork-improvements-details.md#yaniciifredy) | [yanicii/fredy](https://github.com/yanicii/fredy/tree/develop) | neu | niedrig | gering |
| [Provider für eBay und asgoodasnew (Nicht-Immobilien)](fork-improvements-details.md#yoolandesfredy) | [yoolandes/fredy](https://github.com/yoolandes/fredy/tree/fork) | neu | niedrig | gering |
| [Portaldatum für weitere Provider](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy/tree/master) | teilweise | mittel | gering |
| [Erweiterte URL-Übersetzung für ImmoScout24.at](fork-improvements-details.md#mrxderfredy) | [mrxder/fredy](https://github.com/mrxder/fredy/tree/master) | teilweise | mittel | gering |
| [Immowelt: Exposé-Abruf per page.goto statt XHR](fork-improvements-details.md#chbndrhnnsfredy) | [chbndrhnns/fredy](https://github.com/chbndrhnns/fredy/tree/fix/immowelt-expose-description-and-navigation) | teilweise | niedrig | gering |
| [Flatfox-Provider mit optionaler Schweizer IP über Bright Data und Batching](fork-improvements-details.md#gabko14fredy-ch) | [Gabko14/fredy-ch](https://github.com/Gabko14/fredy-ch/tree/master) | teilweise | niedrig | gering |
| [Scrapfly statt ScrapingAnt als Scraping-Backend](fork-improvements-details.md#ivanovvladifredy) | [ivanovvladi/fredy](https://github.com/ivanovvladi/fredy/tree/update-scraping-providers) | teilweise | niedrig | hoch |
| [ImmoScout: alle Ergebnisseiten laden, Details mit Parallelitätslimit](fork-improvements-details.md#lanschlfredy) | [lanschl/fredy](https://github.com/lanschl/fredy/tree/master) | teilweise | niedrig | gering |
| [Kleinanzeigen: Detailseiten mit Ausstattungsmerkmalen auslesen](fork-improvements-details.md#lanschlfredy) | [lanschl/fredy](https://github.com/lanschl/fredy/tree/master) | teilweise | niedrig | gering |
| [Immonet-Provider wiederhergestellt](fork-improvements-details.md#noricetodayfredy) | [NoRiceToday/fredy](https://github.com/NoRiceToday/fredy/tree/local-patches) | teilweise | niedrig | gering |
| [Immowelt: vollständige Exposé-Beschreibung aus Server-State](fork-improvements-details.md#chbndrhnnsfredy) | [chbndrhnns/fredy](https://github.com/chbndrhnns/fredy/tree/fix/immowelt-expose-description-and-navigation) | schon upstream | mittel | gering |
| [Immobilien-Südwestpresse: Zimmer, Adresse, Titel- und Größen-Fix](fork-improvements-details.md#dnlfrstfredy) | [dnlfrst/fredy](https://github.com/dnlfrst/fredy/tree/master) | schon upstream | niedrig | gering |
| [Provider Subito.it](fork-improvements-details.md#edsolfredy) | [Edsol/fredy](https://github.com/Edsol/fredy/tree/master) | schon upstream | niedrig | gering |
| [Bild-Extraktion für 1A-Immobilien, Immoscout und Kleinanzeigen](fork-improvements-details.md#ivanovvladifredy) | [ivanovvladi/fredy](https://github.com/ivanovvladi/fredy/tree/update-telegram-provider) | schon upstream | niedrig | gering |
| [Anti-Bot-Härtung des Puppeteer-Extractors](fork-improvements-details.md#lanschlfredy) | [lanschl/fredy](https://github.com/lanschl/fredy/tree/master) | schon upstream | niedrig | gering |
| [Immowelt: Puppeteer-Paginierung und Parsing von Zimmern/Fläche/Preis](fork-improvements-details.md#lanschlfredy) | [lanschl/fredy](https://github.com/lanschl/fredy/tree/master) | schon upstream | niedrig | mittel |
| [Provider willhaben.at und Österreich-Unterstützung](fork-improvements-details.md#lolokrausfredy) | [lolokraus/fredy](https://github.com/lolokraus/fredy/tree/master) | schon upstream | niedrig | gering |
| [Provider inberlinwohnen.de](fork-improvements-details.md#majbootredfredy) | [majbootred/fredy](https://github.com/majbootred/fredy/tree/master) | schon upstream | niedrig | gering |
| [ImmoScout-Suche mit gezeichneter Fläche (shape)](fork-improvements-details.md#pr0misesfredy) | [Pr0mises/fredy](https://github.com/Pr0mises/fredy/tree/immoscout-shape) | schon upstream | niedrig | gering |
| [Kleinanzeigen: Straße aus der Detailseite, per Einstellung schaltbar](fork-improvements-details.md#realdayaafredy) | [realDayaa/fredy](https://github.com/realDayaa/fredy/tree/fix/kleinanzeigen-address) | schon upstream | niedrig | gering |
| [Idealista-Provider über die Android-Mobile-API mit Polygon-Suchen](fork-improvements-details.md#sunil16666fredy) | [Sunil16666/fredy](https://github.com/Sunil16666/fredy/tree/master) | schon upstream | niedrig | gering |

### Benachrichtigung (13)

| Funktion | Fork | Upstream | Nutzen | Aufwand |
| --- | --- | --- | --- | --- |
| [Mehrere Bilder pro Listing mit Bild-Proxy, Galerie und Telegram-Alben](fork-improvements-details.md#andrey5608fredy) | [andrey5608/fredy](https://github.com/andrey5608/fredy/tree/master) | neu | hoch | hoch |
| [Zustellungs-Ledger pro Anzeige und Kanal](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | neu | mittel | hoch |
| [HTTP-Webhook-Adapter mit echtem Timeout und Fehlerauswertung](fork-improvements-details.md#hugoschwabefredy-berlin) | [hugoschwabe/fredy-berlin](https://github.com/hugoschwabe/fredy-berlin/tree/master) | neu | mittel | gering |
| [Lokalisierte E-Mail-Benachrichtigungen (DE/EN)](fork-improvements-details.md#johannesvedderfredy) | [johannesvedder/fredy](https://github.com/johannesvedder/fredy/tree/fix/email-notification-localization) | neu | mittel | gering |
| [Inseratsbilder als Anhang bei Apprise](fork-improvements-details.md#mkarlanfredy) | [mkarlan/fredy](https://github.com/mkarlan/fredy/tree/apprise-images) | neu | mittel | gering |
| [Bekannte Inserate jobübergreifend pro Nutzer erkennen](fork-improvements-details.md#rustam-k0fredy) | [rustam-k0/fredy](https://github.com/rustam-k0/fredy/tree/master) | neu | mittel | gering |
| [Provider-Name statt Provider-ID in Benachrichtigungen](fork-improvements-details.md#dnlfrstfredy) | [dnlfrst/fredy](https://github.com/dnlfrst/fredy/tree/master) | neu | niedrig | gering |
| [Robuste Rate-Limit-Behandlung für Telegram (429-Retry, serielle Warteschlange pro Chat)](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | teilweise | mittel | gering |
| [Discord-Benachrichtigung per Bot](fork-improvements-details.md#dnlfrstfredy) | [dnlfrst/fredy](https://github.com/dnlfrst/fredy/tree/master) | teilweise | niedrig | gering |
| [Beschreibung in Apprise-Benachrichtigungen](fork-improvements-details.md#lars147fredy) | [Lars147/fredy](https://github.com/Lars147/fredy/tree/master) | teilweise | niedrig | gering |
| [Telegram-Rich-Message mit Listing-Foto](fork-improvements-details.md#ivanovvladifredy) | [ivanovvladi/fredy](https://github.com/ivanovvladi/fredy/tree/update-telegram-provider) | schon upstream | niedrig | gering |
| [E-Mail-Benachrichtigung (SMTP via nodemailer)](fork-improvements-details.md#noctariusfredy) | [noctarius/fredy](https://github.com/noctarius/fredy/tree/email) | schon upstream | niedrig | gering |
| [Discord-Webhook-Adapter mit Chunking und Rate-Limit](fork-improvements-details.md#yzaimoglufredy) | [yzaimoglu/fredy](https://github.com/yzaimoglu/fredy/tree/master) | schon upstream | niedrig | gering |

### Filter & Suche (18)

| Funktion | Fork | Upstream | Nutzen | Aufwand |
| --- | --- | --- | --- | --- |
| [Filter nach Einzugsdatum (frühestens/spätestens)](fork-improvements-details.md#paula003fredy) | [paula003/fredy](https://github.com/paula003/fredy/tree/master) | neu | hoch | mittel |
| [Karte mit denselben serverseitigen Filtern wie die Übersicht](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk/tree/master) | neu | hoch | mittel |
| [Listing-Score mit Radar-Chart und pro Job konfigurierbaren Gewichten](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk/tree/feat/listing-score) | neu | hoch | hoch |
| [Mietrendite-Schätzung (brutto/netto) mit Mindestrendite-Filter und Kaltmiete-Override](fork-improvements-details.md#satty008fredy) | [satty008/fredy](https://github.com/satty008/fredy/tree/master) | neu | hoch | mittel |
| [Filter 'Bezugsfrei ab' (ImmoScout)](fork-improvements-details.md#awerksfredy) | [awerks/fredy](https://github.com/awerks/fredy/tree/master) | neu | mittel | mittel |
| [Referenzadressen pro Job auswählen (Pendelfilter)](fork-improvements-details.md#johannesvedderfredy) | [johannesvedder/fredy](https://github.com/johannesvedder/fredy/tree/feat/job-address-selection) | neu | mittel | mittel |
| [Positivliste (Include Words) je Suchauftrag](fork-improvements-details.md#jsonlordfredy) | [JsonLord/fredy](https://github.com/JsonLord/fredy/tree/kleinanzeigen-api-integration-2270847634649632849) | neu | mittel | gering |
| [Blacklist auch auf die Adresse anwenden](fork-improvements-details.md#noricetodayfredy) | [NoRiceToday/fredy](https://github.com/NoRiceToday/fredy/tree/local-patches) | neu | mittel | gering |
| [Kaufpreisfaktor und Investment-Urteil (Cashflow, DSCR, Eigenkapitalrendite)](fork-improvements-details.md#satty008fredy) | [satty008/fredy](https://github.com/satty008/fredy/tree/master) | neu | mittel | mittel |
| [Mehrfachauswahl für Job-, Provider- und Urteilsfilter](fork-improvements-details.md#satty008fredy) | [satty008/fredy](https://github.com/satty008/fredy/tree/master) | neu | mittel | gering |
| [Spezifikationsfilter nach dem Detailabruf erneut anwenden](fork-improvements-details.md#yaniciifredy) | [yanicii/fredy](https://github.com/yanicii/fredy/tree/develop) | neu | mittel | gering |
| [Mindestpreis im Kriterienfilter des Jobs](fork-improvements-details.md#jsonlordfredy) | [JsonLord/fredy](https://github.com/JsonLord/fredy/tree/kleinanzeigen-api-integration-2270847634649632849) | teilweise | mittel | gering |
| [Search Profiles mit Scheduler, Run Now und Laufhistorie](fork-improvements-details.md#aselekogluarpa-house-search) | [aselekoglu/arpa-house-search](https://github.com/aselekoglu/arpa-house-search/tree/main) | teilweise | niedrig | hoch |
| [Preisspanne als Filter in der Inseratsübersicht](fork-improvements-details.md#juliusxyzfredy) | [Juliusxyz/fredy](https://github.com/Juliusxyz/fredy/tree/master) | teilweise | niedrig | gering |
| [Arbeitszeiten pro Job mit mehreren Zeitfenstern](fork-improvements-details.md#tsteffekfredy) | [tsteffek/fredy](https://github.com/tsteffek/fredy/tree/working_hours) | teilweise | niedrig | mittel |
| [Zimmeranzahl aus ImmoScout-Web-Pfaden](fork-improvements-details.md#commandertvisfredy) | [CommanderTvis/fredy](https://github.com/CommanderTvis/fredy/tree/commandertvis/pages) | schon upstream | niedrig | gering |
| [Unscharfe portalübergreifende Dublettenerkennung](fork-improvements-details.md#jtingofredy) | [Jtingo/fredy](https://github.com/Jtingo/fredy/tree/master) | schon upstream | niedrig | gering |
| [Fahrzeit-Filter pro Job](fork-improvements-details.md#sidneypiperfredy) | [sidneypiper/fredy](https://github.com/sidneypiper/fredy/tree/main) | schon upstream | niedrig | mittel |

### UI/UX (26)

| Funktion | Fork | Upstream | Nutzen | Aufwand |
| --- | --- | --- | --- | --- |
| [Home-Feed mit integrierter Karte, Viewport-Filter und endloser Liste](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | neu | mittel | mittel |
| [Gelesen/Ungelesen-Markierung mit Filter](fork-improvements-details.md#lolokrausfredy) | [lolokraus/fredy](https://github.com/lolokraus/fredy/tree/master) | neu | mittel | gering |
| [Manuelles Verknüpfen von Inseraten mit Ähnlichkeitssuche](fork-improvements-details.md#matthiasckfredy) | [MatthiasCK/fredy](https://github.com/MatthiasCK/fredy/tree/mk/master) | neu | mittel | hoch |
| [PWA: Fredy auf dem Homescreen installieren](fork-improvements-details.md#satty008fredy) | [satty008/fredy](https://github.com/satty008/fredy/tree/master) | neu | mittel | gering |
| [Navigation als echte Links, klickbare Job-Karten und Logo](fork-improvements-details.md#andrey5608fredy) | [andrey5608/fredy](https://github.com/andrey5608/fredy/tree/master) | neu | niedrig | mittel |
| [Einstellbares Datumsformat (TT/MM/JJJJ oder MM/TT/JJJJ)](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy/tree/master) | neu | niedrig | gering |
| [Live aktualisiertes Dashboard](fork-improvements-details.md#jtingofredy) | [Jtingo/fredy](https://github.com/Jtingo/fredy/tree/master) | neu | niedrig | gering |
| [Sidebar-Einträge als echte Links, Update-Hinweis nur für Admins](fork-improvements-details.md#realdayaafredy) | [realDayaa/fredy](https://github.com/realDayaa/fredy/tree/master) | neu | niedrig | gering |
| [Providername in der Job-Tabelle auflösen, wenn der Eintrag keinen hat](fork-improvements-details.md#yaniciifredy) | [yanicii/fredy](https://github.com/yanicii/fredy/tree/develop) | neu | niedrig | gering |
| [Globaler Fehler-Toast bei nicht erreichbarem Backend](fork-improvements-details.md#yoolandesfredy) | [yoolandes/fredy](https://github.com/yoolandes/fredy/tree/fork) | neu | niedrig | gering |
| [Erweiterter Bewerbungsstatus mit Mail-Erkennung und Einladungs-Tracking](fork-improvements-details.md#moleqnapfredy) | [moleqnap/fredy](https://github.com/moleqnap/fredy/tree/master) | teilweise | hoch | mittel |
| [Lokale Bildergalerie und Detailabruf per Klick mit dauerhaftem Browser](fork-improvements-details.md#hugoschwabefredy-berlin) | [hugoschwabe/fredy-berlin](https://github.com/hugoschwabe/fredy-berlin/tree/master) | teilweise | mittel | mittel |
| [Breite, sortierbare Inseratstabelle mit allen Objektmerkmalen](fork-improvements-details.md#lanschlfredy) | [lanschl/fredy](https://github.com/lanschl/fredy/tree/master) | teilweise | mittel | mittel |
| [Bildergalerie und strukturierte Attribute pro Inserat](fork-improvements-details.md#lolokrausfredy) | [lolokraus/fredy](https://github.com/lolokraus/fredy/tree/master) | teilweise | mittel | mittel |
| [Geführter Such-Assistent mit Provider-Auswahlkarten](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | teilweise | niedrig | mittel |
| [Neugestaltetes Frontend: Zwei-Tab-Navigation, Detailansicht als Produktseite, mobile Aktionsleiste](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | teilweise | niedrig | hoch |
| [Listen- und Kartenansicht mit synchronisierter Auswahl](fork-improvements-details.md#aselekogluarpa-house-search) | [aselekoglu/arpa-house-search](https://github.com/aselekoglu/arpa-house-search/tree/main) | teilweise | niedrig | mittel |
| [Einklappbares Karten-Filterpanel auf Smartphones](fork-improvements-details.md#osinhofredy) | [osinho/fredy](https://github.com/osinho/fredy/tree/map-mobile-fixes) | teilweise | niedrig | gering |
| [Listen-Filter und Sortierung im localStorage merken](fork-improvements-details.md#realdayaafredy) | [realDayaa/fredy](https://github.com/realDayaa/fredy/tree/feat/persist-filters) | teilweise | niedrig | gering |
| [Mobile Layout-Fixes (Detailseite, Statusbutton, Beschreibung)](fork-improvements-details.md#satty008fredy) | [satty008/fredy](https://github.com/satty008/fredy/tree/master) | teilweise | niedrig | gering |
| [Inseratsübersicht in der Web-UI](fork-improvements-details.md#bozturk10fredy) | [bozturk10/fredy](https://github.com/bozturk10/fredy/tree/listing_pageview) | schon upstream | niedrig | gering |
| [Umschalter Kachel-/Tabellenansicht für Jobs](fork-improvements-details.md#datenwurmfredy) | [datenwurm/fredy](https://github.com/datenwurm/fredy/tree/feat/jobs-view-toggle) | schon upstream | niedrig | gering |
| [Job manuell starten und Verlauf eines Jobs löschen](fork-improvements-details.md#edsolfredy) | [Edsol/fredy](https://github.com/Edsol/fredy/tree/master) | schon upstream | niedrig | gering |
| [Ansicht gelöschter Inserate mit Wiederherstellung](fork-improvements-details.md#matthiasckfredy) | [MatthiasCK/fredy](https://github.com/MatthiasCK/fredy/tree/mk/master) | schon upstream | niedrig | gering |
| [Keine horizontale Überbreite der Detailansicht auf Smartphones](fork-improvements-details.md#osinhofredy) | [osinho/fredy](https://github.com/osinho/fredy/tree/mobile-fixes) | schon upstream | niedrig | gering |
| [Letzter Lauf als lesbare Uhrzeit](fork-improvements-details.md#tmbofredy) | [tmbo/fredy](https://github.com/tmbo/fredy/tree/resiliance) | schon upstream | niedrig | gering |

### Karte & Geodaten (15)

| Funktion | Fork | Upstream | Nutzen | Aufwand |
| --- | --- | --- | --- | --- |
| [Postleitzahl-Validierung beim Geocoding](fork-improvements-details.md#johannesvedderfredy) | [johannesvedder/fredy](https://github.com/johannesvedder/fredy/tree/fix/postcode-geocoding) | neu | hoch | gering |
| [Italienische Breitband-Verfügbarkeit (Navigabene und fibermap.it)](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy/tree/master) | neu | mittel | mittel |
| [Regionale Kartenebenen für Dänemark: Kommunalsteuer und Schulen](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk/tree/master) | neu | mittel | hoch |
| [Supermarkt-Layer mit Ketten-Logos (OpenStreetMap)](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk/tree/master) | neu | mittel | mittel |
| [CSC-Standort-Screening (200-m-Abstand nach KCanG)](fork-improvements-details.md#daraarntoikos) | [daraarnt/oikos](https://github.com/daraarnt/oikos/tree/master) | neu | niedrig | gering |
| [Zusätzliche POI-Kategorien Spielplatz, Kinderbetreuung, Jugendzentrum](fork-improvements-details.md#daraarntoikos) | [daraarnt/oikos](https://github.com/daraarnt/oikos/tree/master) | neu | niedrig | gering |
| [Stadtteil-Anzeige für ImmoScout-Inserate](fork-improvements-details.md#matthiasckfredy) | [MatthiasCK/fredy](https://github.com/MatthiasCK/fredy/tree/mk/master) | neu | niedrig | gering |
| [Jobs-Layer (Jobindex) für ein bestimmtes Berufsfeld](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk/tree/master) | neu | niedrig | mittel |
| [Standortdaten (Kaufpreis, Miete, Zukunftsatlas-Rang) je Stadt](fork-improvements-details.md#satty008fredy) | [satty008/fredy](https://github.com/satty008/fredy/tree/master) | neu | niedrig | gering |
| [Grobe Geokodierung für unvollständige Adressen](fork-improvements-details.md#sidneypiperfredy) | [sidneypiper/fredy](https://github.com/sidneypiper/fredy/tree/main) | teilweise | mittel | mittel |
| [Fahrzeit zu Zielorten per Google Distance Matrix](fork-improvements-details.md#ahmedwalid05fredy) | [ahmedwalid05/fredy](https://github.com/ahmedwalid05/fredy/tree/master) | schon upstream | niedrig | mittel |
| [Fahrzeiten zu Wegpunkten pro Job (Google Routes API)](fork-improvements-details.md#crystalnetfredy) | [crystalnet/fredy](https://github.com/crystalnet/fredy/tree/feature/enhancedProcessingAndStorage) | schon upstream | niedrig | mittel |
| [Pendelzeiten in der Detailansicht (erst OpenRouteService, dann Transitous)](fork-improvements-details.md#domiskofredy) | [domisko/fredy](https://github.com/domisko/fredy/tree/master) | schon upstream | niedrig | gering |
| [Schweizer Voreinstellungen für Karte, Geocoding und Distanzanzeige](fork-improvements-details.md#gabko14fredy-ch) | [Gabko14/fredy-ch](https://github.com/Gabko14/fredy-ch/tree/feature/swiss-providers) | schon upstream | niedrig | gering |
| [Geocoding, Karte und Formatierung für Nicht-Deutschland-Listings](fork-improvements-details.md#sanderdeweirdtfredy) | [SanderDeweirdt/fredy](https://github.com/SanderDeweirdt/fredy/tree/master) | schon upstream | niedrig | gering |

### Daten & Speicherung (22)

| Funktion | Fork | Upstream | Nutzen | Aufwand |
| --- | --- | --- | --- | --- |
| [Automatische Zuordnung eingehender Mails zu Inseraten](fork-improvements-details.md#moleqnapfredy) | [moleqnap/fredy](https://github.com/moleqnap/fredy/tree/master) | neu | hoch | mittel |
| [Supabase-Adapter mit optionaler Tabellenanlage](fork-improvements-details.md#c9h13no3-devfredy) | [C9H13NO3-dev/fredy](https://github.com/C9H13NO3-dev/fredy/tree/master) | neu | mittel | gering |
| [Listing-Fotos lokal speichern und ausliefern](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy/tree/master) | neu | mittel | mittel |
| [Währung pro Inserat und Bildergalerie](fork-improvements-details.md#domiskofredy) | [domisko/fredy](https://github.com/domisko/fredy/tree/master) | neu | mittel | mittel |
| [Deduplizierung desselben Listings über mehrere Jobs](fork-improvements-details.md#hugoschwabefredy-berlin) | [hugoschwabe/fredy-berlin](https://github.com/hugoschwabe/fredy-berlin/tree/master) | neu | mittel | hoch |
| [Inserate überstehen das Löschen eines Jobs](fork-improvements-details.md#matthiasckfredy) | [MatthiasCK/fredy](https://github.com/MatthiasCK/fredy/tree/mk/master) | neu | mittel | mittel |
| [Kaufkonditionen (sale_terms) mit Verkaufskarte, Kauf-Filtern und Kostenzeile in Benachrichtigungen](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk/tree/master) | neu | mittel | mittel |
| [Mietkonditionen (rental_terms) mit Miet-Karte und Einzugsdatum-Filter](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk/tree/master) | neu | mittel | mittel |
| [Lokaler Bild-Cache für Inseratsfotos mit manuellem Neuladen](fork-improvements-details.md#realdayaafredy) | [realDayaa/fredy](https://github.com/realDayaa/fredy/tree/master) | neu | mittel | mittel |
| [Firestore-Speicher und backend-unabhängige Storage-Contract-Testsuite](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | neu | niedrig | hoch |
| [CouchDB-Adapter](fork-improvements-details.md#c9h13no3-devfredy) | [C9H13NO3-dev/fredy](https://github.com/C9H13NO3-dev/fredy/tree/master) | neu | niedrig | gering |
| [NocoDB-Adapter (v2-API)](fork-improvements-details.md#c9h13no3-devfredy) | [C9H13NO3-dev/fredy](https://github.com/C9H13NO3-dev/fredy/tree/master) | neu | niedrig | gering |
| [PostgreSQL-Export-Adapter](fork-improvements-details.md#elijahrossfredy) | [elijahross/fredy](https://github.com/elijahross/fredy/tree/master) | neu | niedrig | gering |
| [Investor-/Eigennutzer-Score für Berliner Kaufobjekte](fork-improvements-details.md#hugoschwabefredy-berlin) | [hugoschwabe/fredy-berlin](https://github.com/hugoschwabe/fredy-berlin/tree/master) | neu | niedrig | hoch |
| [Anzeigen-Lebenszyklus (Neu/Beworben/Besichtigt/Archiviert) mit automatischer Archivierung](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | teilweise | mittel | mittel |
| [Nächtlicher Detail-Backfill für Beschreibung und Veröffentlichungsdatum](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy/tree/master) | teilweise | mittel | mittel |
| [Erweiterte ImmoScout-Exposédaten mit eigenen DB-Spalten](fork-improvements-details.md#lanschlfredy) | [lanschl/fredy](https://github.com/lanschl/fredy/tree/master) | teilweise | mittel | mittel |
| [Erweiterte ImmoScout-Detaildaten und lokales Medienarchiv](fork-improvements-details.md#matthiasckfredy) | [MatthiasCK/fredy](https://github.com/MatthiasCK/fredy/tree/mk/master) | teilweise | mittel | mittel |
| [Versionserkennung für neu eingestellte Inserate (Property Identity + Fuzzy Matching)](fork-improvements-details.md#matthiasckfredy) | [MatthiasCK/fredy](https://github.com/MatthiasCK/fredy/tree/mk/master) | teilweise | mittel | hoch |
| [Reparaturlauf für bekannte Anzeigen und gebündelte Wartungsläufe](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | teilweise | niedrig | hoch |
| [Kanonisches Listing-Modell und quellenübergreifender Listing-Feed](fork-improvements-details.md#aselekogluarpa-house-search) | [aselekoglu/arpa-house-search](https://github.com/aselekoglu/arpa-house-search/tree/main) | teilweise | niedrig | hoch |
| [Lebenszyklus-Tracking: Veröffentlichungsdatum, Deaktivierung, Online-Dauer](fork-improvements-details.md#matthiasckfredy) | [MatthiasCK/fredy](https://github.com/MatthiasCK/fredy/tree/mk/master) | teilweise | niedrig | gering |

### API & Integration (8)

| Funktion | Fork | Upstream | Nutzen | Aufwand |
| --- | --- | --- | --- | --- |
| [Automatischer Bewerbungs-/Anfrageversand über Portal-Kontaktformulare](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | neu | hoch | hoch |
| [IMAP-Postfach mit verschlüsselter Speicherung und Posteingangs-UI](fork-improvements-details.md#moleqnapfredy) | [moleqnap/fredy](https://github.com/moleqnap/fredy/tree/master) | neu | hoch | hoch |
| [Persönliches API-Token (Bearer) für die REST-API](fork-improvements-details.md#cenngofredy) | [Cenngo/fredy](https://github.com/Cenngo/fredy/tree/master) | neu | mittel | gering |
| [Übersetzung von Inseratsbeschreibungen per DeepL](fork-improvements-details.md#domiskofredy) | [domisko/fredy](https://github.com/domisko/fredy/tree/master) | neu | mittel | gering |
| [REST-API-Zugriff mit MCP-Bearer-Token](fork-improvements-details.md#satty008fredy) | [satty008/fredy](https://github.com/satty008/fredy/tree/master) | neu | mittel | gering |
| [Kafka-Adapter als Datensenke](fork-improvements-details.md#severina19fredy) | [severina19/fredy](https://github.com/severina19/fredy/tree/add-kafka-data-sink) | neu | niedrig | mittel |
| [Externe REST-API zur Job-Verwaltung mit API-Key](fork-improvements-details.md#tee132mefredy) | [Tee132me/fredy](https://github.com/Tee132me/fredy/tree/master) | teilweise | mittel | mittel |
| [Automatische Kontaktanfrage bei ImmoScout24 (WIP)](fork-improvements-details.md#alexanderroidlfredy) | [alexanderroidl/fredy](https://github.com/alexanderroidl/fredy/tree/feat/immoscout-auto-contact) | teilweise | niedrig | hoch |

### MCP & KI (8)

| Funktion | Fork | Upstream | Nutzen | Aufwand |
| --- | --- | --- | --- | --- |
| ['Rate with my own AI': KI-Bewertung mit eigenem API-Schlüssel jedes Nutzers](fork-improvements-details.md#satty008fredy) | [satty008/fredy](https://github.com/satty008/fredy/tree/master) | neu | hoch | mittel |
| [KI-Extraktion frei definierbarer Zusatzfelder pro Job (ChatGPT)](fork-improvements-details.md#crystalnetfredy) | [crystalnet/fredy](https://github.com/crystalnet/fredy/tree/feature/enhancedProcessingAndStorage) | neu | mittel | hoch |
| [Bewerbung als Gmail-Entwurf per MCP-Tool apply_for_listing](fork-improvements-details.md#oneskovicfredy) | [oneskovic/fredy](https://github.com/oneskovic/fredy/tree/master) | neu | mittel | hoch |
| [KI-Bewertung als strukturierte Spalte (GOOD/MAYBE/BAD) mit Filter, Badge und Sammelauswahl](fork-improvements-details.md#satty008fredy) | [satty008/fredy](https://github.com/satty008/fredy/tree/master) | neu | mittel | mittel |
| [Job-Gebietsfilter auch beim Lesen über MCP (list_listings)](fork-improvements-details.md#madsbergstroemfredy) | [madsbergstroem/fredy](https://github.com/madsbergstroem/fredy/tree/truffle-2210) | neu | niedrig | gering |
| [KI-personalisierte Nachricht an Vermieter pro Listing](fork-improvements-details.md#sidneypiperfredy) | [sidneypiper/fredy](https://github.com/sidneypiper/fredy/tree/main) | teilweise | hoch | hoch |
| [KI-generierte Anfragetexte (Gemini) mit Bewerberprofil](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | teilweise | mittel | mittel |
| [Optionale MCP-Schreibtools (Status, Notizen, Merkliste)](fork-improvements-details.md#madsbergstroemfredy) | [madsbergstroem/fredy](https://github.com/madsbergstroem/fredy/tree/truffle-2210) | teilweise | niedrig | gering |

### Länder & Lokalisierung (9)

| Funktion | Fork | Upstream | Nutzen | Aufwand |
| --- | --- | --- | --- | --- |
| [Preise in eigener Währung (CHF getrennt von EUR)](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy/tree/master) | neu | hoch | mittel |
| [Währung pro Provider statt fest Euro](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk/tree/master) | neu | hoch | mittel |
| [Währung pro Provider (CHF statt €)](fork-improvements-details.md#gabko14fredy-ch) | [Gabko14/fredy-ch](https://github.com/Gabko14/fredy-ch/tree/feature/swiss-providers) | neu | mittel | gering |
| [Beschreibungen beim Abruf ins Englische übersetzen](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk/tree/master) | neu | mittel | gering |
| [Dänische Breitband-Verfügbarkeit (Quelle dk-tjekditnet)](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk/tree/master) | neu | mittel | gering |
| [Dänisches Finanzierungsmodell für Kaufobjekte](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk/tree/master) | neu | mittel | mittel |
| [wg-gesucht.at als eigener Österreich-Provider](fork-improvements-details.md#pposchfredy_at) | [pposch/fredy_AT](https://github.com/pposch/fredy_AT/tree/master) | teilweise | niedrig | gering |
| [Locale-sicherer Zahlenparser (en/fr/nl)](fork-improvements-details.md#sanderdeweirdtfredy) | [SanderDeweirdt/fredy](https://github.com/SanderDeweirdt/fredy/tree/master) | teilweise | niedrig | gering |
| [Österreich-Paket: willhaben, ImmoScout24.at, immowelt.at, DACH-Geocoding](fork-improvements-details.md#pposchfredy_at) | [pposch/fredy_AT](https://github.com/pposch/fredy_AT/tree/backup-before-rebase) | schon upstream | niedrig | gering |

### Deployment & Betrieb (19)

| Funktion | Fork | Upstream | Nutzen | Aufwand |
| --- | --- | --- | --- | --- |
| [Job-Health-Monitoring mit Ausführungsprotokollen](fork-improvements-details.md#wodoomanfredy) | [Wodooman/fredy](https://github.com/Wodooman/fredy/tree/feature/job-health-tracking) | neu | hoch | hoch |
| [Externer Trigger-Endpunkt für Scale-to-Zero-Betrieb (Cloud Run)](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | neu | mittel | gering |
| [Strukturierte Entscheidungslogs pro Anzeige und Zeitmessung der Pipeline-Stufen](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | neu | mittel | gering |
| [Docker-Build nativ pro Architektur statt QEMU](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy/tree/master) | neu | mittel | gering |
| [Betrieb unter konfigurierbarem Base-Path (Reverse Proxy)](fork-improvements-details.md#kercdbhfredy) | [kercdbh/fredy](https://github.com/kercdbh/fredy/tree/base-url) | neu | mittel | mittel |
| [Jobs deklarativ aus config.json synchronisieren (mit File-Watcher)](fork-improvements-details.md#tee132mefredy) | [Tee132me/fredy](https://github.com/Tee132me/fredy/tree/master) | neu | mittel | mittel |
| [Admin-Monitoring-Dashboard (Anzeigen, Bewerbungsergebnisse, Cloud-Kosten)](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | neu | niedrig | hoch |
| [Zustandsloser Betrieb auf Vercel mit Neon-Postgres](fork-improvements-details.md#aselekogluarpa-house-search) | [aselekoglu/arpa-house-search](https://github.com/aselekoglu/arpa-house-search/tree/deploy/vercel-private) | neu | niedrig | hoch |
| [ARM64: Chromium mit SwiftShader starten gegen GPU-Fingerprinting](fork-improvements-details.md#domiskofredy) | [domisko/fredy](https://github.com/domisko/fredy/tree/master) | neu | niedrig | gering |
| [WORKER_MODE: nur Job-Ausführung ohne API](fork-improvements-details.md#kaicallbackfredy) | [kaicallback/fredy](https://github.com/kaicallback/fredy/tree/master) | neu | niedrig | gering |
| [Begrenztes Plattenwachstum im Docker-Betrieb](fork-improvements-details.md#marvin-bayfredy) | [marvin-bay/fredy](https://github.com/marvin-bay/fredy/tree/master) | neu | niedrig | gering |
| [Geplante Suchläufe zu festen Uhrzeiten](fork-improvements-details.md#rustam-k0fredy) | [rustam-k0/fredy](https://github.com/rustam-k0/fredy/tree/master) | neu | niedrig | gering |
| [Aktivitätsprüfung gespeicherter Listings abschaltbar](fork-improvements-details.md#sidneypiperfredy) | [sidneypiper/fredy](https://github.com/sidneypiper/fredy/tree/main) | neu | niedrig | gering |
| [Globaler Ausgangs-Proxy für alle Portal-Aufrufe inkl. IPRoyal-Steuerung](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy/tree/master) | teilweise | hoch | mittel |
| [Proxy für alle Scraping-Anfragen inklusive fetch-basierter Provider](fork-improvements-details.md#wodoomanfredy) | [Wodooman/fredy](https://github.com/Wodooman/fredy/tree/feature/proxy-support-combined) | teilweise | mittel | mittel |
| [Kleineres Docker-Image durch Entfernen ungenutzter Chromium-Locales und chromedriver](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | teilweise | niedrig | gering |
| [Raspberry-Pi-Build und systemd-Autostart](fork-improvements-details.md#n-athanfredy) | [n-athan/fredy](https://github.com/n-athan/fredy/tree/feature/run-as-is) | teilweise | niedrig | gering |
| [Container/PaaS-Betrieb: Env-Konfiguration, Parallelitätslimit, Health-Endpoint](fork-improvements-details.md#tee132mefredy) | [Tee132me/fredy](https://github.com/Tee132me/fredy/tree/master) | teilweise | niedrig | gering |
| [Aufräumen abgestürzter Chromium-Prozesse (tini, Force-Kill)](fork-improvements-details.md#strech345fredy) | [strech345/fredy](https://github.com/strech345/fredy/tree/fix/kill_chrome_processes) | schon upstream | mittel | gering |

### Performance (9)

| Funktion | Fork | Upstream | Nutzen | Aufwand |
| --- | --- | --- | --- | --- |
| [Eigenes Abfrageintervall pro Job mit zufälligem Jitter](fork-improvements-details.md#yoolandesfredy) | [yoolandes/fredy](https://github.com/yoolandes/fredy/tree/fork) | neu | hoch | mittel |
| [Browserloses Scraping per HTTP (httpExtractor) für Kleinanzeigen, InBerlinWohnen und Deutsche Wohnen](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | neu | mittel | mittel |
| [Browser-Ressourcen-Cache und Bilder aus im Headless-Browser](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy/tree/master) | neu | mittel | gering |
| [Suchintervall unter 5 Minuten mit Zufallsverzögerung](fork-improvements-details.md#jtingofredy) | [Jtingo/fredy](https://github.com/Jtingo/fredy/tree/master) | neu | mittel | gering |
| [Mindest-Scanintervall pro Provider](fork-improvements-details.md#moleqnapfredy) | [moleqnap/fredy](https://github.com/moleqnap/fredy/tree/master) | neu | mittel | gering |
| [Detailseiten erst nach allen Filtern abrufen](fork-improvements-details.md#sidneypiperfredy) | [sidneypiper/fredy](https://github.com/sidneypiper/fredy/tree/main) | neu | mittel | mittel |
| [Puppeteer-Browser-Pool mit Idle-Timeout](fork-improvements-details.md#yoolandesfredy) | [yoolandes/fredy](https://github.com/yoolandes/fredy/tree/fork) | neu | mittel | mittel |
| [Cache für vorbereitete SQLite-Statements](fork-improvements-details.md#florki610fredy) | [FlorKi610/fredy](https://github.com/FlorKi610/fredy/tree/perf/sqlite-statement-cache) | neu | niedrig | gering |
| [Set statt Array beim Abgleich bekannter Inserate](fork-improvements-details.md#florki610fredy) | [FlorKi610/fredy](https://github.com/FlorKi610/fredy/tree/perf/findnew-set-lookup) | schon upstream | niedrig | gering |

### Sicherheit (7)

| Funktion | Fork | Upstream | Nutzen | Aufwand |
| --- | --- | --- | --- | --- |
| [Docker-Image ohne Root-Rechte](fork-improvements-details.md#apfelwurmfredy) | [Apfelwurm/fredy](https://github.com/Apfelwurm/fredy/tree/master) | neu | mittel | gering |
| [SSRF-Schutz für vom Nutzer angegebene Ziel-URLs](fork-improvements-details.md#aselekogluarpa-house-search) | [aselekoglu/arpa-house-search](https://github.com/aselekoglu/arpa-house-search/tree/main) | neu | mittel | gering |
| [Single Sign-on über OpenID Connect](fork-improvements-details.md#madsbergstroemfredy) | [madsbergstroem/fredy](https://github.com/madsbergstroem/fredy/tree/truffle-2210) | neu | mittel | mittel |
| [Erst-Admin über Umgebungsvariablen statt admin/admin](fork-improvements-details.md#michioswfredy) | [michiosw/fredy](https://github.com/michiosw/fredy/tree/fix/secure-bootstrap-admin) | neu | mittel | gering |
| [Google-Login über Firebase mit Allowlist, Zugangsanfragen und Admin-Freigabe](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | neu | niedrig | hoch |
| [Strikte Mandantentrennung: Admins sehen keine fremden Suchen und Kanäle](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | neu | niedrig | gering |
| [Container läuft als Nicht-Root-Nutzer](fork-improvements-details.md#rugkfredy) | [rugk/fredy](https://github.com/rugk/fredy/tree/container/nonroot) | neu | niedrig | mittel |

### Bugfix (19)

| Funktion | Fork | Upstream | Nutzen | Aufwand |
| --- | --- | --- | --- | --- |
| [Preisänderung per Link erkennen statt Duplikat anlegen](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy/tree/master) | neu | hoch | mittel |
| [Fehler beim Schließen des Browsers blockiert Job nicht mehr](fork-improvements-details.md#realdayaafredy) | [realDayaa/fredy](https://github.com/realDayaa/fredy/tree/master) | neu | hoch | gering |
| [Mattermost-Tabelle: fehlendes join und Pipe-Escaping](fork-improvements-details.md#bergofredy) | [bergo/fredy](https://github.com/bergo/fredy/tree/master) | neu | mittel | gering |
| [Engel & Völkers: HTTP 500 bei Postleitzahl als placeName vermeiden](fork-improvements-details.md#realdayaafredy) | [realDayaa/fredy](https://github.com/realDayaa/fredy/tree/master) | neu | mittel | gering |
| [Migration 9: doppelte Settings vor dem Unique-Index entfernen](fork-improvements-details.md#gabko14fredy-ch) | [Gabko14/fredy-ch](https://github.com/Gabko14/fredy-ch/tree/master) | neu | niedrig | gering |
| [Robuster 'Open in Fredy'-Link in Telegram-Nachrichten](fork-improvements-details.md#rustam-k0fredy) | [rustam-k0/fredy](https://github.com/rustam-k0/fredy/tree/master) | teilweise | niedrig | gering |
| [extractNumber robuster gegen Text vor der Zahl](fork-improvements-details.md#yoolandesfredy) | [yoolandes/fredy](https://github.com/yoolandes/fredy/tree/fork) | teilweise | niedrig | gering |
| [Fix: Listing-ID-Mismatch nach dem Speichern und -1-Geokoordinaten](fork-improvements-details.md#strech345fredy) | [strech345/fredy](https://github.com/strech345/fredy/tree/fix/listing-id-mismatch) | schon upstream | mittel | gering |
| [Letzten Scheduler-Lauf dauerhaft speichern](fork-improvements-details.md#bilalelhajfredy) | [bilalelhaj/fredy](https://github.com/bilalelhaj/fredy/tree/fix/persist-last-run-timestamp) | schon upstream | niedrig | gering |
| [Telegram-Rate-Limit gegen HTTP 429](fork-improvements-details.md#daniel17903fredy) | [daniel17903/fredy](https://github.com/daniel17903/fredy/tree/patch-1) | schon upstream | niedrig | gering |
| [1A-Immobilien: Preis ohne Zusatztext](fork-improvements-details.md#dekieselfredy) | [dekiesel/fredy](https://github.com/dekiesel/fredy/tree/master) | schon upstream | niedrig | gering |
| [Listing-Löschung: Similarity-Cache auffrischen, keine doppelte Antwort](fork-improvements-details.md#gabko14fredy-ch) | [Gabko14/fredy-ch](https://github.com/Gabko14/fredy-ch/tree/master) | schon upstream | niedrig | gering |
| [Parser-Fixes: Tausendertrennzeichen, SEO-Suchpfade, Provider ohne crawlFields](fork-improvements-details.md#lanschlfredy) | [lanschl/fredy](https://github.com/lanschl/fredy/tree/master) | schon upstream | niedrig | gering |
| [Dubletten nicht mehr soft-löschen](fork-improvements-details.md#noricetodayfredy) | [NoRiceToday/fredy](https://github.com/NoRiceToday/fredy/tree/local-patches) | schon upstream | niedrig | gering |
| [Proxy auch für Puppeteer-Provider mit eigenem getListings](fork-improvements-details.md#pposchfredy_at) | [pposch/fredy_AT](https://github.com/pposch/fredy_AT/tree/backup-before-rebase) | schon upstream | niedrig | gering |
| [Kleinanzeigen-Selektoren für Preis und Größe angepasst](fork-improvements-details.md#ssch4tzfredy) | [ssch4tz/fredy](https://github.com/ssch4tz/fredy/tree/master) | schon upstream | niedrig | gering |
| [Robustheit bei fehlgeschlagenen Scrape-Requests](fork-improvements-details.md#tmbofredy) | [tmbo/fredy](https://github.com/tmbo/fredy/tree/resiliance) | schon upstream | niedrig | gering |
| [ImmoScout-Shape: rohe Polyline nicht base64-dekodieren](fork-improvements-details.md#tomtomnavigatorfredy) | [TomTomNavigator/fredy](https://github.com/TomTomNavigator/fredy/tree/fix/immoscout-shape-base64) | schon upstream | niedrig | gering |
| [Sparkasse-Selektor an neues Seiten-HTML angepasst](fork-improvements-details.md#wodoomanfredy) | [Wodooman/fredy](https://github.com/Wodooman/fredy/tree/fix/sparkasse-selector) | schon upstream | niedrig | gering |

### Tests & Tooling (4)

| Funktion | Fork | Upstream | Nutzen | Aufwand |
| --- | --- | --- | --- | --- |
| [Browser-Probe für Bot-Sperren vor dem Schreiben eines Providers](fork-improvements-details.md#rcmadrugafredy-dk) | [rcmadruga/fredy-dk](https://github.com/rcmadruga/fredy-dk/tree/master) | neu | mittel | gering |
| [Frontend-Migration auf strict TypeScript (Bun/tsc)](fork-improvements-details.md#adhi1419fredy) | [adhi1419/fredy](https://github.com/adhi1419/fredy/tree/main) | neu | niedrig | hoch |
| [Teilweise Umstellung auf ES-Module](fork-improvements-details.md#renee-schultz-wufredy) | [renee-schultz-wu/fredy](https://github.com/renee-schultz-wu/fredy/tree/esm) | schon upstream | niedrig | gering |
| [Offline-Provider-Tests mit gespeicherten HTML-Fixtures](fork-improvements-details.md#wodoomanfredy) | [Wodooman/fredy](https://github.com/Wodooman/fredy/tree/feature/offline-provider-testing) | schon upstream | niedrig | gering |

### Sonstiges (3)

| Funktion | Fork | Upstream | Nutzen | Aufwand |
| --- | --- | --- | --- | --- |
| [DataDome-Challenges per Capsolver lösen und Cookie wiederverwenden](fork-improvements-details.md#cappytfredy) | [CappyT/fredy](https://github.com/CappyT/fredy/tree/master) | neu | mittel | hoch |
| [Plug-in-System für Listing-Prozessoren](fork-improvements-details.md#ahmedwalid05fredy) | [ahmedwalid05/fredy](https://github.com/ahmedwalid05/fredy/tree/master) | neu | niedrig | hoch |
| [Mindest-Suchintervall 1 statt 5 Minuten](fork-improvements-details.md#cenngofredy) | [Cenngo/fredy](https://github.com/Cenngo/fredy/tree/master) | neu | niedrig | gering |

## Forks mit eigenen Commits, aber ohne übertragbare Funktion


| Fork | Befund |
| --- | --- |
| [AlChe31/fredy](https://github.com/AlChe31/fredy) | Nur VOLUME /db und /conf aus dem Dockerfile entfernt, typisch für Railway-Deployments. Keine Funktion. |
| [AmineAfia/app-crawler](https://github.com/AmineAfia/app-crawler) | Nur das Abfrageintervall in conf/config.json geändert. Keine Funktion. |
| [cedricziel/fredy](https://github.com/cedricziel/fredy) | Aktiver Mitwirkender (2026-08): MCP-OAuth mit Dynamic Client Registration, MCP-Tool-Annotations, Reverse-Proxy-Login (Forward Auth) und Consent-Form-Fixes. Alles ist upstream gemergt (#407, #434, #435, #436); übrig sind nur Screenshot-Assets für einen PR. |
| [DatenRaten/fredy](https://github.com/DatenRaten/fredy) | Nur README-Änderungen von 2024-02: persönliche Installationsnotizen und eine kopierte Anleitung für einen systemd-Autostart. Keine Funktion im Code. |
| [florian-utzt/fredy](https://github.com/florian-utzt/fredy) | Ein Commit (2026-07), der einen Caddy-Reverse-Proxy mit Secret-Header in docker-compose ergänzt, passend zum eigenen Cloud-Run-Deployment. Keine allgemeine Funktion: das zugehörige Caddyfile fehlt. |
| [gorgobacka/fredy](https://github.com/gorgobacka/fredy) | Nur ein Revert-Commit, der den McMakler-Provider entfernt. Keine eigene Funktion. |
| [johannesmokry/wohnungsmaxxing](https://github.com/johannesmokry/wohnungsmaxxing) | Nur die VOLUME-Deklarationen im Dockerfile auskommentiert, typisch für Plattformen wie Railway, die VOLUME nicht erlauben. Keine Funktion. |
| [kealsera/fredy](https://github.com/kealsera/fredy) | Nur eine repository.json, vermutlich um den Fork als Home-Assistant-Add-on-Repository einzubinden. Ohne Add-on-Definition keine nutzbare Funktion. |
| [kuuroo3/real_estate](https://github.com/kuuroo3/real_estate) | Keine echte Funktion: Der Fork (Juli 2023) besteht nur aus WIP-Commits, um die eigene Instanz auf einem Raspberry Pi unter einem festen Pfad hinter der eigenen Domain zu betreiben (hartkodierte /fredy-API-Pfade, private Proxy-Ziele, Pi-spezifische npm-Skripte). Trotz des Branch-Namens 'discord_notifier' enthält er keinen Discord-Adapter. |
| [maxkoehlerkarstens/fredy](https://github.com/maxkoehlerkarstens/fredy) | Nur VOLUME /db und /conf aus dem Dockerfile entfernt, typisch für Railway-Deployments. Keine Funktion. |
| [outnabout/fredy](https://github.com/outnabout/fredy) | Nur eigene Volume-Pfade in docker-compose.yml. Keine Funktion. |
| [probststefan/fredy](https://github.com/probststefan/fredy) | Die nennenswerten Beiträge (Preisformatierung in Benachrichtigungen #486, wg-gesucht-Link-Fix #123) sind upstream gemergt. Offen sind nur Docker-Anpassungen von 2024-11 für die eigene Instanz. |
| [RaminGe/fredy](https://github.com/RaminGe/fredy) | Contributor-Fork, dessen Beiträge (Live-Reload neuer Listings per SSE, PR #361, und ein Listing-Filter-Fix, PR #311) bereits in Upstream gemergt sind. Übrig bleiben nur automatische Star-History-Commits, keine eigenen Funktionen. |
| [robertmayen/fredy](https://github.com/robertmayen/fredy) | Ein Commit (2024-12) mit eigener Konfiguration (Intervall 1 Minute, TLS-Zertifikat-Mounts) und package-lock.json. Keine Funktion. |
| [serious6/fredy](https://github.com/serious6/fredy) | Nur ein Dependabot-Bump von 2019. Keine Funktion. |
| [weypro/fredy](https://github.com/weypro/fredy) | Contributor-Fork, dessen Arbeit (u. a. Performance-Optimierung der user-bezogenen Listing-Queries, PR #413) bereits in Upstream gemergt ist. Übrig bleiben nur automatische Star-History-Commits auf master, keine eigenen Funktionen. |
| [xwarth/fredy](https://github.com/xwarth/fredy) | Keine echte Funktion: Der Fork enthält nur private Betriebsanpassungen (hochgeladene eigene SQLite-Datenbank, entfernte VOLUME-Deklarationen im Dockerfile, vermutlich für ein Hosting ohne Docker-Volumes) und automatische Star-History-Commits. |
| [zorlac-coding/fredy](https://github.com/zorlac-coding/fredy) | Ein Sammel-Commit (2025-02) mit Lockfiles, eigener Konfiguration und einem trivialen Build-Skript. Keine Funktion. |

## Forks, deren Beiträge Upstream schon übernommen hat (38)

Ihre eigenen Commits stecken als gemergter PR oder als identischer Patch bereits in Upstream.

[0verhead/fredy](https://github.com/0verhead/fredy), [a-shrfi/fredy](https://github.com/a-shrfi/fredy), [AdmiralCM/fredy](https://github.com/AdmiralCM/fredy), [adrianbartnik/fredy](https://github.com/adrianbartnik/fredy), [AdriDevelopsThings/fredy](https://github.com/AdriDevelopsThings/fredy), [anbucher/fredy](https://github.com/anbucher/fredy), [andesyteoss/fredy](https://github.com/andesyteoss/fredy), [anupamme/fredy](https://github.com/anupamme/fredy), [bytedream/fredy](https://github.com/bytedream/fredy), [CarlAmbroselli/fredy](https://github.com/CarlAmbroselli/fredy), [efekrskl/fredy](https://github.com/efekrskl/fredy), [fapfaff/fredy-arm](https://github.com/fapfaff/fredy-arm), [fjrtdk/freiddy](https://github.com/fjrtdk/freiddy), [Freax13/fredy](https://github.com/Freax13/fredy), [ilhamradhan/fredy](https://github.com/ilhamradhan/fredy), [janekbettinger/fredy](https://github.com/janekbettinger/fredy), [jfrcom/fredy](https://github.com/jfrcom/fredy), [jkhsjdhjs/fredy](https://github.com/jkhsjdhjs/fredy), [jstnw10/fredy](https://github.com/jstnw10/fredy), [katrinleinweber/fredy](https://github.com/katrinleinweber/fredy), [Kavlahkaff/fredy](https://github.com/Kavlahkaff/fredy), [konlanx/fredy](https://github.com/konlanx/fredy), [leonbeon/fredy](https://github.com/leonbeon/fredy), [libklein/fredy](https://github.com/libklein/fredy), [lorem-ipsum-dolor-sit/fredy](https://github.com/lorem-ipsum-dolor-sit/fredy), [louanbardou/fff](https://github.com/louanbardou/fff), [lwarode/fredy](https://github.com/lwarode/fredy), [medaliraz/fredy](https://github.com/medaliraz/fredy), [MindCollaps/fredy](https://github.com/MindCollaps/fredy), [pomeloy/fredy](https://github.com/pomeloy/fredy), [qudiqudi/fredy](https://github.com/qudiqudi/fredy), [rmargar/fredy](https://github.com/rmargar/fredy), [stefanbielmeier/fredy](https://github.com/stefanbielmeier/fredy), [sven-simonsen/fredy](https://github.com/sven-simonsen/fredy), [thekoma/fredy](https://github.com/thekoma/fredy), [timur-me/fredy](https://github.com/timur-me/fredy), [vwkd/fredy](https://github.com/vwkd/fredy), [wi1k1n/fredy](https://github.com/wi1k1n/fredy)

## Forks ohne eigene Commits (106)

Reine Kopien eines Upstream-Stands, ohne einen einzigen eigenen Commit auf irgendeinem Branch.

[0xBADBAC0N/fredy](https://github.com/0xBADBAC0N/fredy), [0xShkk/fredy](https://github.com/0xShkk/fredy), [abdosamaa/fredy](https://github.com/abdosamaa/fredy), [ajl789/fredy](https://github.com/ajl789/fredy), [akcware/fredy](https://github.com/akcware/fredy), [alexanderwallau/orangecoding-fredy](https://github.com/alexanderwallau/orangecoding-fredy), [AnasElmou/fredy](https://github.com/AnasElmou/fredy), [arminsarabi88/fredy](https://github.com/arminsarabi88/fredy), [asmitbm/fredy](https://github.com/asmitbm/fredy), [avocado-king/fredy](https://github.com/avocado-king/fredy), [ax4consultants-lab/fredy-01-06-2026](https://github.com/ax4consultants-lab/fredy-01-06-2026), [azizullah2017/fredy](https://github.com/azizullah2017/fredy), [B-00/fredy](https://github.com/B-00/fredy), [basarozcan/fredy](https://github.com/basarozcan/fredy), [beanduong/fredy](https://github.com/beanduong/fredy), [berlinum/fredy](https://github.com/berlinum/fredy), [budtmo/fredy](https://github.com/budtmo/fredy), [BuenosMuchachos246/fredy](https://github.com/BuenosMuchachos246/fredy), [canmuratt/fredy](https://github.com/canmuratt/fredy), [Cheppar/fredy](https://github.com/Cheppar/fredy), [Cheyans/fredy](https://github.com/Cheyans/fredy), [choerl/fredy](https://github.com/choerl/fredy), [ChristianGaertner/fredy](https://github.com/ChristianGaertner/fredy), [coxtor/fredy](https://github.com/coxtor/fredy), [cumbaba/fredy](https://github.com/cumbaba/fredy), [denisalevi/fredy](https://github.com/denisalevi/fredy), [DonaldLika/real-estate-researcher](https://github.com/DonaldLika/real-estate-researcher), [DulanDev/fredy](https://github.com/DulanDev/fredy), [efathy/fredy](https://github.com/efathy/fredy), [efeumutaslan/fredy](https://github.com/efeumutaslan/fredy), [ekoepplin/fredy](https://github.com/ekoepplin/fredy), [emmaRangel92/fredy](https://github.com/emmaRangel92/fredy), [escapist-berlin/fredy](https://github.com/escapist-berlin/fredy), [eyren5000GIT/fredy-immoscouter](https://github.com/eyren5000GIT/fredy-immoscouter), [FabiLochner/fredy](https://github.com/FabiLochner/fredy), [fahmyfarahat/fredy](https://github.com/fahmyfarahat/fredy), [faisalae/fredy](https://github.com/faisalae/fredy), [favour-chibueze/fredy](https://github.com/favour-chibueze/fredy), [fhollaender/fredy](https://github.com/fhollaender/fredy), [flobotde-org/fredy](https://github.com/flobotde-org/fredy), [flowni/fredy](https://github.com/flowni/fredy), [foxx-tech/fredy](https://github.com/foxx-tech/fredy), [francescodone/fredy](https://github.com/francescodone/fredy), [frankcai/fredy](https://github.com/frankcai/fredy), [FreakySandra1995/fredy](https://github.com/FreakySandra1995/fredy), [Gatel20/fredy](https://github.com/Gatel20/fredy), [gruessi/fredy](https://github.com/gruessi/fredy), [hadi-codes/fredy](https://github.com/hadi-codes/fredy), [Harishmvl/fredy](https://github.com/Harishmvl/fredy), [hrvOj3/fredy](https://github.com/hrvOj3/fredy), [hsyngmtrk/fredy](https://github.com/hsyngmtrk/fredy), [ikoirala/fredy](https://github.com/ikoirala/fredy), [IsaacMorzy/fredy](https://github.com/IsaacMorzy/fredy), [itaintarco/fredy](https://github.com/itaintarco/fredy), [ivanvs/fredy](https://github.com/ivanvs/fredy), [Jasatai/fredy](https://github.com/Jasatai/fredy), [jdickel/fredy](https://github.com/jdickel/fredy), [jnsw/fredy](https://github.com/jnsw/fredy), [juserrrr/fredy](https://github.com/juserrrr/fredy), [jvesquivel626-rgb/fredy](https://github.com/jvesquivel626-rgb/fredy), [koljaoh/aptm](https://github.com/koljaoh/aptm), [kolyose/fredy](https://github.com/kolyose/fredy), [koo-projects/fredy](https://github.com/koo-projects/fredy), [Lenzebo/fredy](https://github.com/Lenzebo/fredy), [lksingh91/fredy](https://github.com/lksingh91/fredy), [logeyG/fredy](https://github.com/logeyG/fredy), [lukeundtrug/fredy](https://github.com/lukeundtrug/fredy), [luzyv2000/try_and_leran_fredy](https://github.com/luzyv2000/try_and_leran_fredy), [MAG-91/fredy](https://github.com/MAG-91/fredy), [Matandaelis/fredy-realestate](https://github.com/Matandaelis/fredy-realestate), [mefarazath/fredy](https://github.com/mefarazath/fredy), [MichaelMandel26/fredy](https://github.com/MichaelMandel26/fredy), [miha2227/fredy](https://github.com/miha2227/fredy), [Mitjaaa/fredy](https://github.com/Mitjaaa/fredy), [MucManu/fredy_api](https://github.com/MucManu/fredy_api), [nburchha/fasdy](https://github.com/nburchha/fasdy), [ngdio/fredy](https://github.com/ngdio/fredy), [NotNANtoN/fredy](https://github.com/NotNANtoN/fredy), [noubar/fredy](https://github.com/noubar/fredy), [Omanaite/fredy-appartments](https://github.com/Omanaite/fredy-appartments), [ParsaMK/Fredy-Rent](https://github.com/ParsaMK/Fredy-Rent), [peiga/fredy](https://github.com/peiga/fredy), [phil-bergmann/fredy](https://github.com/phil-bergmann/fredy), [PhilippTheDeveloper/fredy](https://github.com/PhilippTheDeveloper/fredy), [Pixxeasy/fredy](https://github.com/Pixxeasy/fredy), [push-mybuttons/fredy](https://github.com/push-mybuttons/fredy), [PxlCode/fredy](https://github.com/PxlCode/fredy), [rafaelfe/fredy](https://github.com/rafaelfe/fredy), [Raghul-sys/fredy](https://github.com/Raghul-sys/fredy), [run-my-job/fredy](https://github.com/run-my-job/fredy), [SebSchroen/fredy](https://github.com/SebSchroen/fredy), [sgerodes/fredy](https://github.com/sgerodes/fredy), [Shisuki/fredy](https://github.com/Shisuki/fredy), [skizilkaya/fredy](https://github.com/skizilkaya/fredy), [spacexbt/fredy](https://github.com/spacexbt/fredy), [Speedefix/fredy](https://github.com/Speedefix/fredy), [stanleyume/fredy](https://github.com/stanleyume/fredy), [stevenklar/fredy](https://github.com/stevenklar/fredy), [sunjoonkim/fredy](https://github.com/sunjoonkim/fredy), [tayz98/fredy](https://github.com/tayz98/fredy), [TheZargs/fredy](https://github.com/TheZargs/fredy), [TimLukaHorstmann/fredy](https://github.com/TimLukaHorstmann/fredy), [trulyfurqan/fredy](https://github.com/trulyfurqan/fredy), [vst121/fredy](https://github.com/vst121/fredy), [wizard107/fredy](https://github.com/wizard107/fredy), [Wuifi/fredy](https://github.com/Wuifi/fredy)
