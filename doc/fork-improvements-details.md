# Fredy-Forks: Details pro Fork

Gehört zu [fork-improvements.md](./fork-improvements.md), dort stehen Vorgehen, Zusammenfassung und die
Übersicht nach Kategorie. Stand: 11.10.2026, verglichen mit `orangecoding/fredy` `master` auf `cbb3cab`.

Pro Funktion: Kategorie; Upstream-Status (neu / teilweise / schon upstream); eingeschätzter Nutzen und
Aufwand der Übernahme. Funktionen, die Upstream inzwischen selbst hat, stehen gesammelt am Ende des
jeweiligen Forks. Reihenfolge: Forks mit den meisten neuen Funktionen zuerst.

## adhi1419/fredy

[Repository](https://github.com/adhi1419/fredy) · Zeitraum: 2026-08 bis 2026-10 · Branches: `main`

Weitgehender Umbau von Fredy zu einer mandantenfähigen Cloud-Run-Anwendung mit Firestore statt SQLite, Firebase-Google-Login und extern getriggertem Scheduler. Der fachliche Kern ist ein automatischer Bewerbungs- bzw. Anfrage-Versand über die Kontaktformulare mehrerer Portale (ImmoScout24, Kleinanzeigen, Deutsche Wohnen, HOWOGE, WBM, Stadt und Land), dazu KI-Anfragetexte per Gemini, mehrseitiger Abruf, browserloses Scraping und ein komplett neu gestaltetes TypeScript-Frontend. Gleichzeitig wurden viele Upstream-Funktionen entfernt: die meisten Provider und Benachrichtigungsadapter, MCP, Demo, Preisverfolgung, Backup und Konnektivität. Der Branch feat/job-validation-typescript ist eine Teilmenge von main.

- **Automatischer Bewerbungs-/Anfrageversand über Portal-Kontaktformulare** (API & Integration; neu; Nutzen hoch, Aufwand hoch)  
  Für neue Anzeigen sendet Fredy auf Wunsch selbst eine Kontaktanfrage. Es gibt Sender für ImmoScout24 (OAuth des Nutzerkontos über die Mobile-API, verschlüsselt gespeicherte Zugangsdaten, dynamische Pflichtfelder), Kleinanzeigen (Session-Cookies), Deutsche Wohnen, WBM sowie die InBerlinWohnen-Partner HOWOGE und Stadt und Land (Wohnungshelden). Eine Reservierung pro Anzeige verhindert Doppelversand. Gespeichert wird ein Status (sending/sent/failed/rejected/unknown), und nur eindeutig fehlgeschlagene Anfragen werden wiederholt. Pro Provider-Quelle eines Jobs gibt es eine Policy ‚automatic enabled/disabled‘ samt Capability-Deklaration im Provider (metaInformation.capabilities). Zusätzlich greifen Schutzregeln, z. B. ein Pendelzeit-Budget, bevor automatisch gesendet wird.  
  _Upstream:_ Upstream erzeugt seit 2026-09 in lib/services/application/ nur ein Anschreiben zum Kopieren und sendet nichts an Portale.  
  Branch `main` · Dateien: `lib/services/inquiries/sendInquiry.js`, `lib/services/inquiries/deliverInquiry.js`, `lib/services/immoscout/contactClient.js`, `lib/services/immoscout/authClient.js` · Commits: [`dcdc038`](https://github.com/adhi1419/fredy/commit/dcdc0389b3), [`d5d1b56`](https://github.com/adhi1419/fredy/commit/d5d1b564f2), [`e077a50`](https://github.com/adhi1419/fredy/commit/e077a504df) und 9 weitere
- **Mehrseitiger Abruf für ImmoScout24 und Kleinanzeigen** (Provider; neu; Nutzen hoch, Aufwand gering)  
  ImmoScout24 durchläuft über den pagenumber-Parameter der Mobile-API alle Ergebnisseiten bis numberOfPages, höchstens 20. Kleinanzeigen liest weitere Seiten über das Pfadsegment seite:N, bis die gemeldete Gesamtzahl erreicht ist, eine Seite leer bleibt oder 10 Seiten gelesen sind. Doppelte Treffer an Seitengrenzen werden entfernt, und fehlerhafte Seiten werden mit Timeout und Retry erneut geladen. Bisher gingen bei großen Suchen und beim ersten Lauf alle Treffer nach Seite 1 (rund 50 bzw. 25) verloren.  
  _Upstream:_ Upstream ruft in lib/services/immoscout/mobileApi.js und lib/provider/kleinanzeigen.js jeweils nur die erste Ergebnisseite ab.  
  Branch `main` · Dateien: `lib/provider/immoscout.js`, `lib/provider/kleinanzeigen.js` · Commits: [`458c7f2`](https://github.com/adhi1419/fredy/commit/458c7f2d29), [`49cb492`](https://github.com/adhi1419/fredy/commit/49cb49214e), [`b8d105e`](https://github.com/adhi1419/fredy/commit/b8d105e2ba) und 1 weitere
- **Browserloses Scraping per HTTP (httpExtractor) für Kleinanzeigen, InBerlinWohnen und Deutsche Wohnen** (Performance; neu; Nutzen mittel, Aufwand mittel)  
  Der neue lib/services/extractor/httpExtractor.js lädt serverseitig gerenderte Seiten mit browserähnlichen deutschen Headern und hat denselben Vertrag wie der Puppeteer-Extractor: HTML, oder null bei Fehler bzw. Bot-Wall. Kleinanzeigen-Suche und -Details, die Livewire-Snapshots von InBerlinWohnen sowie die Deutsche-Wohnen-Detailseiten laufen damit ohne Chromium, statt 3–10 s nur noch 0,03–1,3 s pro Seite. Der Kleinanzeigen-Parser liest die Ergebnisse jetzt anhand der Struktur (article[data-adid]) statt generierter CSS-Klassen und bricht bei einer fremden Seite laut ab. Im Fork wurden danach Chromium und alle Browser-Provider ganz entfernt.  
  _Upstream:_ Upstream nutzt für diese drei Provider weiter Puppeteer; die Kleinanzeigen-Selektoren wurden upstream am 2026-09-02 nur repariert, nicht auf HTTP umgestellt.  
  Branch `main` · Dateien: `lib/services/extractor/httpExtractor.js`, `lib/provider/kleinanzeigen.js`, `lib/provider/inberlinwohnen.js`, `lib/provider/deutscheWohnen.js` · Commits: [`d68b662`](https://github.com/adhi1419/fredy/commit/d68b662050), [`fe5e60a`](https://github.com/adhi1419/fredy/commit/fe5e60aa0f)
- **Neuer Provider WBM (wbm.de)** (Provider; neu; Nutzen mittel, Aufwand gering)  
  lib/provider/wbm.js liest die Angebotsliste der Berliner Wohnungsbaugesellschaft WBM direkt per HTTP und Cheerio. Die Detailseiten (OpenImmo-Markup: Kaltmiete, Zimmer, Fläche, Adresse, Objektnummer) werden parallel mit begrenzter Nebenläufigkeit geladen. InBerlinWohnen-Treffer, die auf WBM verweisen, werden passend zugeordnet.  
  _Upstream:_ Upstream hat keinen WBM-Provider; WBM-Angebote kommen dort höchstens indirekt über inberlinwohnen.js.  
  Branch `main` · Dateien: `lib/provider/wbm.js`, `lib/provider/inberlinwohnen.js` · Commits: [`531fccb`](https://github.com/adhi1419/fredy/commit/531fccbaf9)
- **Zustellungs-Ledger pro Anzeige und Kanal** (Benachrichtigung; neu; Nutzen mittel, Aufwand hoch)  
  Statt eine Charge an alle Adapter zu verteilen und pauschal als erledigt zu markieren, plant notificationDeliveryPlanner jede Kombination aus Anzeige und Kanal einzeln. notificationDeliveryOrchestrator reserviert sie vor dem Senden im Ledger und sendet seriell. Eine Anzeige gilt erst als benachrichtigt, wenn alle Kanäle bestätigt sind. Ein zweiter Lauf schickt dadurch nichts doppelt, und unvollständige Zustellungen bleiben nachvollziehbar.  
  _Upstream:_ Upstream (lib/notification/notify.js) feuert pro Adapter ein Promise ohne Zustellprotokoll oder Wiederholung.  
  Branch `main` · Dateien: `lib/notification/notificationDeliveryOrchestrator.js`, `lib/notification/notificationDeliveryPlanner.js`, `lib/notification/notificationSendOutcome.js`, `lib/services/storage/firestore/notificationLedgerStorage.js` · Commits: [`1c7adc7`](https://github.com/adhi1419/fredy/commit/1c7adc75d1)
- **Strukturierte Entscheidungslogs pro Anzeige und Zeitmessung der Pipeline-Stufen** (Deployment & Betrieb; neu; Nutzen mittel, Aufwand gering)  
  listingDecisionLogger.js schreibt pro Anzeige ein JSON-Ereignis mit dem Präfix LISTING_DECISION. Es enthält Job, Provider, Listing-ID, Ablauf (new/repair), Entscheidung (stored/filtered/skipped/sent/failed) und einen Grund-Code. Titel, Adressen und Bewerberdaten fließen bewusst nicht ein. pipelineRunLogger.js misst die Dauer jeder Pipeline-Stufe (Abruf, Normalisierung, Details, Geocoding, Speichern, Benachrichtigen). So lässt sich nachvollziehen, warum eine Anzeige nicht gemeldet wurde und wo ein Lauf Zeit verliert.  
  _Upstream:_ Upstream hat nur das zuschaltbare Debug-Log-Bundle (lib/services/debug/) ohne Grund-Codes pro Anzeige oder Stufenzeiten.  
  Branch `main` · Dateien: `lib/services/observability/listingDecisionLogger.js`, `lib/services/observability/pipelineRunLogger.js`, `lib/FredyPipelineExecutioner.js` · Commits: [`77fcb69`](https://github.com/adhi1419/fredy/commit/77fcb69434), [`3c738a8`](https://github.com/adhi1419/fredy/commit/3c738a8ebc)
- **Externer Trigger-Endpunkt für Scale-to-Zero-Betrieb (Cloud Run)** (Deployment & Betrieb; neu; Nutzen mittel, Aufwand gering)  
  POST /api/trigger startet alle Jobs und danach die Wartungsläufe und hält die Anfrage bis zum Ende offen, weil Cloud Run nur dann CPU garantiert. Abgesichert ist der Endpunkt per X-Trigger-Token, der in konstanter Zeit gegen TRIGGER_TOKEN geprüft wird. Ohne konfiguriertes Token antwortet er mit 404. Interne Timer und der Scrape beim Start entfallen dann. Dazu gehören Skripte für Cloud-Run-Deployment, Firebase-Setup und GitHub-Actions mit Workload Identity Federation sowie ein Frontend auf GitHub Pages mit CORS-fähigem SSE.  
  _Upstream:_ Upstream startet Läufe nur über den internen Scheduler oder die sessiongeschützte Route POST /api/jobs/:id/run und hat keinen Token-Trigger für externe Cron-Dienste.  
  Branch `main` · Dateien: `lib/api/routes/triggerRoute.js`, `lib/services/jobs/jobExecutionService.js`, `scripts/deploy-cloud-run.sh`, `scripts/setup-firebase-project.sh` · Commits: [`f2f767c`](https://github.com/adhi1419/fredy/commit/f2f767c860), [`79562b1`](https://github.com/adhi1419/fredy/commit/79562b1d99), [`151a667`](https://github.com/adhi1419/fredy/commit/151a667025) und 3 weitere
- **Home-Feed mit integrierter Karte, Viewport-Filter und endloser Liste** (UI/UX; neu; Nutzen mittel, Aufwand mittel)  
  Die neue Home-Ansicht ersetzt das Dashboard durch einen URL-gesteuerten Feed mit Liste und Karte. Verschieben oder Zoomen schreibt eine bbox in die URL, und die Listings-API filtert serverseitig auf diesen Ausschnitt. Pins wählen Anzeigen bzw. Adressgruppen aus, und Karte und Liste heben sich beim Hover gegenseitig hervor. Gespeicherte Orte erscheinen auf der Karte (Arbeitsplatz als Aktentasche, andere als Flagge), und der ÖPNV-Layer ist standardmäßig an. Die Liste lädt beim Scrollen in Zehnerschritten nach, außerdem gibt es Aktivitäts-Tabs mit Zählern, Provider-Mehrfachauswahl und Sortierung nach Entfernung bzw. Reisezeit.  
  _Upstream:_ Upstream hat getrennte Ansichten für Dashboard, Liste und Karte (ui/src/views/listings/Map.jsx), aber keinen bbox-Filter und kein endloses Scrollen.  
  Branch `main` · Dateien: `ui/src/views/home/Home.tsx`, `ui/src/services/home/homeViewState.ts`, `ui/src/services/state/listingsState.ts`, `lib/api/routes/listingsRouter.js` · Commits: [`ce4d87d`](https://github.com/adhi1419/fredy/commit/ce4d87d93d), [`0c64813`](https://github.com/adhi1419/fredy/commit/0c64813337), [`70e5532`](https://github.com/adhi1419/fredy/commit/70e553277c) und 5 weitere
- **Admin-Monitoring-Dashboard (Anzeigen, Bewerbungsergebnisse, Cloud-Kosten)** (Deployment & Betrieb; neu; Nutzen niedrig, Aufwand hoch)  
  Eine Admin-Seite zeigt stündliche Rollups pro Job und Provider: neue Anzeigen, aktive Anzeigen sowie Ergebnisse automatischer Bewerbungen (bestätigt, manuell, retrybar, endgültig fehlgeschlagen, nicht versucht samt Grund). Ein Drilldown führt bis zur einzelnen Anzeige. Dazu kommen Nutzung und geschätzte bzw. tatsächliche Kosten aus Google-Cloud-Monitoring und dem Billing-Export. scripts/backfill-monitoring.js füllt Historie nach.  
  _Upstream:_ Das Upstream-Dashboard zeigt Job- und Anzeigenstatistiken, aber keine Bewerbungsergebnisse und keine Betriebskosten; die Fork-Lösung hängt an Firestore und GCP.  
  Branch `main` · Dateien: `lib/services/monitoring/monitoringService.js`, `lib/services/monitoring/monitoringCounters.js`, `lib/services/monitoring/googleCloudUsage.js`, `lib/services/storage/firestore/monitoringStorage.js` · Commits: [`ecf5565`](https://github.com/adhi1419/fredy/commit/ecf55658c0), [`a62cf3b`](https://github.com/adhi1419/fredy/commit/a62cf3b944), [`d9a5eda`](https://github.com/adhi1419/fredy/commit/d9a5eda0a8) und 2 weitere
- **Google-Login über Firebase mit Allowlist, Zugangsanfragen und Admin-Freigabe** (Sicherheit; neu; Nutzen niedrig, Aufwand hoch)  
  Im AUTH_MODE firebase prüft POST /api/login/firebase das Firebase-ID-Token, gleicht es mit einer Allowlist ab, legt den Nutzer an und setzt eine normale Fredy-Session. Der Passwort-Login ist in diesem Modus abgeschaltet. Nicht freigeschaltete Google-Konten können eine Zugangsanfrage stellen (Warteliste). Admins genehmigen oder lehnen sie in einem neuen Admin-Panel ab. Die Login-Seite zeigt den Status der Anfrage.  
  _Upstream:_ Upstream bietet Benutzername/Passwort und Forward-Auth per Proxy-Header (lib/api/proxyAuth.js), aber keinen eigenen Google- bzw. OIDC-Login und keine Zugangsanfragen.  
  Branch `main` · Dateien: `lib/api/routes/firebaseLoginRoute.js`, `lib/services/security/firebaseIdentity.js`, `lib/services/storage/firestore/allowedUsersStorage.js`, `lib/services/storage/firestore/accessRequestsStorage.js` · Commits: [`334b938`](https://github.com/adhi1419/fredy/commit/334b938c64), [`51c48ba`](https://github.com/adhi1419/fredy/commit/51c48baa48), [`c3b7017`](https://github.com/adhi1419/fredy/commit/c3b7017555) und 3 weitere
- **Strikte Mandantentrennung: Admins sehen keine fremden Suchen und Kanäle** (Sicherheit; neu; Nutzen niedrig, Aufwand gering)  
  canAccessJob und canModifyJob in lib/services/security/access.js gewähren Admins keinen Zugriff mehr auf fremde Jobs und Anzeigen: Sichtbarkeit nur noch für Eigentümer und ausdrücklich geteilte Jobs. Benachrichtigungskanäle erhalten ein eigenes canListChannel. Admins sehen nur eigene, für alle geteilte oder admin-geteilte Kanäle und dürfen fremde Zugangsdaten nicht bearbeiten. Das ist für Instanzen mit mehreren Haushalten gedacht.  
  _Upstream:_ Upstream gewährt isAdmin in access.js und channelAccess.js bewusst Vollzugriff.  
  Branch `main` · Dateien: `lib/services/security/access.js`, `lib/services/security/channelAccess.js`, `lib/api/routes/notificationChannelRouter.js` · Commits: [`8fdca77`](https://github.com/adhi1419/fredy/commit/8fdca770e2), [`3b9efba`](https://github.com/adhi1419/fredy/commit/3b9efbaa9e)
- **Firestore-Speicher und backend-unabhängige Storage-Contract-Testsuite** (Daten & Speicherung; neu; Nutzen niedrig, Aufwand hoch)  
  Zuerst entstand eine Contract-Testsuite mit rund 280 Verhaltenstests gegen die öffentliche Storage-API, umschaltbar über STORAGE_BACKEND. Danach wurden Settings, Sessions, Jobs, Listings, Kanäle, Watchlist und Nutzer auf Firestore portiert, die beide Backends bestehen mussten. Später wurde SQLite samt Migrationen ganz entfernt. Es folgten viele Firestore-Optimierungen: ein geshardetes Manifest bekannter Listings statt Vollscans, indizierte Fälligkeitsabfragen und weniger Lesezugriffe pro Lauf.  
  _Upstream:_ Upstream setzt ausschließlich auf SQLite (better-sqlite3) und hat keine backend-unabhängige Contract-Suite.  
  Branch `main` · Dateien: `lib/services/storage/firestore/`, `lib/services/storage/firestore/knownListingManifest.js`, `vitest.contract.config.js`, `test/contract/` · Commits: [`52476eb`](https://github.com/adhi1419/fredy/commit/52476eb2a0), [`8a5ced4`](https://github.com/adhi1419/fredy/commit/8a5ced4954), [`64b7350`](https://github.com/adhi1419/fredy/commit/64b7350818) und 9 weitere
- **Frontend-Migration auf strict TypeScript (Bun/tsc)** (Tests & Tooling; neu; Nutzen niedrig, Aufwand hoch)  
  Das komplette Frontend unter ui/src (rund 140 Dateien) wurde in Wellen nach strict TypeScript migriert, darunter Store-Slices, Home-Modell, Listing-Filter, Provider-URL-Prüfung, Job-Validierung, Finanzen, Karte und Transit. Dazu kommen tsconfig-Projekte, ein typecheck:frontend-Skript und eine Bun-Toolchain. Das Backend bleibt JavaScript mit einzelnen .d.ts-Dateien.  
  _Upstream:_ Upstream ist laut AGENTS.md bewusst JavaScript mit JSDoc-Typedefs, ohne TypeScript.  
  Branch `main` · Dateien: `tsconfig.frontend.json`, `ui/src/App.tsx`, `ui/src/services/state/store.ts`, `ui/src/services/jobs/providerUrl.ts` · Commits: [`7d73606`](https://github.com/adhi1419/fredy/commit/7d73606d10), [`ed498ba`](https://github.com/adhi1419/fredy/commit/ed498ba1ec), [`418ffc3`](https://github.com/adhi1419/fredy/commit/418ffc39a8) und 4 weitere
- **KI-generierte Anfragetexte (Gemini) mit Bewerberprofil** (MCP & KI; teilweise; Nutzen mittel, Aufwand mittel)  
  lib/services/messageGenerator.js erzeugt über die Gemini-API (aktiv nur mit GEMINI_API_KEY) aus Anzeige, Beschreibung und Bewerberprofil einen deutschen Anfragetext. Der Prompt verbietet ausdrücklich erfundene Angaben. Der Text entsteht auf Knopfdruck in der Detailansicht oder schon in der Pipeline für jede neue Anzeige. Er wird gespeichert und als zweite Telegram-Nachricht mitgeschickt. Dazu kommen eine Einstellungsseite für das Bewerberprofil, ein Pflicht-Onboarding und ein RPM-Pacer mit Retry, der RetryInfo bei 429 auswertet.  
  _Upstream:_ Upstream hat seit 2026-09-20 ein Bewerberprofil und vorlagenbasierte Anschreiben (lib/services/application/, MCP get_application_letter), aber keine LLM-Generierung und keinen Versand in der Pipeline bzw. per Telegram.  
  Branch `main` · Dateien: `lib/services/messageGenerator.js`, `lib/services/inquiries/profile.js`, `lib/notification/adapter/telegram.js`, `ui/src/views/settings/pages/InquiryProfilePage.tsx` · Commits: [`2426c18`](https://github.com/adhi1419/fredy/commit/2426c184b8), [`1df4cd8`](https://github.com/adhi1419/fredy/commit/1df4cd853a), [`9dd3317`](https://github.com/adhi1419/fredy/commit/9dd331712d) und 8 weitere
- **Robuste Rate-Limit-Behandlung für Telegram (429-Retry, serielle Warteschlange pro Chat)** (Benachrichtigung; teilweise; Nutzen mittel, Aufwand gering)  
  Telegram-Aufrufe laufen pro Chat über einen seriellen Pacer (lib/utils/rateLimiter.js) statt nur zeitlich versetzt. Bei 429 wird mit exponentiellem Backoff und Jitter wiederholt, wobei retry_after beachtet und auf 30 s gedeckelt wird (lib/utils/retry.js). send() nutzt allSettled, damit eine nicht zustellbare Anzeige nicht die übrigen Benachrichtigungen des Laufs verwirft. Das hilft bei großen Läufen, etwa durch die Paginierung.  
  _Upstream:_ Upstream drosselt mit p-throttle auf 1 Anfrage/s pro Chat, wiederholt aber bei 429 nicht und wertet retry_after nicht aus.  
  Branch `main` · Dateien: `lib/notification/adapter/telegram.js`, `lib/utils/retry.js`, `lib/utils/rateLimiter.js` · Commits: [`458c7f2`](https://github.com/adhi1419/fredy/commit/458c7f2d29), [`cbea5d8`](https://github.com/adhi1419/fredy/commit/cbea5d8407)
- **Anzeigen-Lebenszyklus (Neu/Beworben/Besichtigt/Archiviert) mit automatischer Archivierung** (Daten & Speicherung; teilweise; Nutzen mittel, Aufwand mittel)  
  lib/services/listings/listingLifecycle.js führt die festen Zustände new, applied, viewed und archived mit Zeitstempeln ein. Eine bestätigte automatische Bewerbung setzt den Zustand ‚applied‘ automatisch. Statt der Retention-Löschung archiviert staleArchive.js Anzeigen nach ihrer Zeit im jeweiligen Zustand: neu 14 Tage, beworben 30, besichtigt 45. Gelöscht wird dabei nichts. Die Oberfläche zeigt einheitliche Badges und Lifecycle-Chips.  
  _Upstream:_ Upstream kennt den manuellen Status applied/rejected/accepted und eine Retention-Löschung, aber keinen Zustand ‚besichtigt‘ und keine Archivierung nach Zustandsalter.  
  Branch `main` · Dateien: `lib/services/listings/listingLifecycle.js`, `lib/services/listings/staleArchive.js`, `lib/api/routes/listingsRouter.js` · Commits: [`a788683`](https://github.com/adhi1419/fredy/commit/a788683467), [`8b490fa`](https://github.com/adhi1419/fredy/commit/8b490fa929), [`151a667`](https://github.com/adhi1419/fredy/commit/151a667025)
- **Reparaturlauf für bekannte Anzeigen und gebündelte Wartungsläufe** (Daten & Speicherung; teilweise; Nutzen niedrig, Aufwand hoch)  
  lib/services/jobs/searchRepair.js gleicht bei jedem Suchlauf schon gespeicherte Anzeigen ab, die die Pipeline sonst überspringt. Für halbfertige Datensätze wird ein feldgenauer Reparaturplan erstellt: fehlende Koordinaten, fehlender Anfragetext, unvollständige Benachrichtigung, fehlgeschlagene Anfrage. Ein zweiter Lauf auf einem gesunden Datensatz plant nichts. maintenanceSweeps.js ersetzt die node-cron-Jobs: Geocoding, Alive-Check und Reisezeiten laufen gedrosselt nach jedem Trigger über indexierte Abfragen.  
  _Upstream:_ Upstream holt fehlende Koordinaten und Reisezeiten per geocoding-cron.js bzw. travel-time-cron.js nach; die Reparatur von Benachrichtigungen und Anfragen fehlt.  
  Branch `main` · Dateien: `lib/services/jobs/searchRepair.js`, `lib/services/maintenance/maintenanceSweeps.js`, `lib/FredyPipelineExecutioner.js` · Commits: [`adb1734`](https://github.com/adhi1419/fredy/commit/adb1734857), [`151a667`](https://github.com/adhi1419/fredy/commit/151a667025), [`71acfa7`](https://github.com/adhi1419/fredy/commit/71acfa7e04) und 2 weitere
- **Geführter Such-Assistent mit Provider-Auswahlkarten** (UI/UX; teilweise; Nutzen niedrig, Aufwand mittel)  
  Anlegen und Bearbeiten einer Suche laufen als barrierearmer Assistent in vier Schritten mit Entwurfserhaltung (GuidedJobForm). Statt der Provider-Tabelle gibt es Auswahlkarten (ProviderChoiceCards), die die URL prüfen und pro Quelle den Schalter für automatische Bewerbungen anzeigen. Die Übersicht der gespeicherten Suchen wurde ebenfalls neu gestaltet.  
  _Upstream:_ Upstream gliedert das Job-Formular in Abschnitte mit JobReadinessBar, hat aber keinen schrittweisen Assistenten und keine Provider-Karten.  
  Branch `main` · Dateien: `ui/src/views/jobs/mutation/GuidedJobForm.tsx`, `ui/src/services/jobs/guidedSearchForm.ts`, `ui/src/views/jobs/mutation/components/provider/ProviderChoiceCards.tsx`, `ui/src/views/jobs/SavedSearchesIndex.tsx` · Commits: [`f25332a`](https://github.com/adhi1419/fredy/commit/f25332af71), [`2381dec`](https://github.com/adhi1419/fredy/commit/2381dec526), [`f8e1e2d`](https://github.com/adhi1419/fredy/commit/f8e1e2dcdf) und 2 weitere
- **Neugestaltetes Frontend: Zwei-Tab-Navigation, Detailansicht als Produktseite, mobile Aktionsleiste** (UI/UX; teilweise; Nutzen niedrig, Aufwand hoch)  
  Die Seitenleiste wurde durch zwei Haupt-Tabs ersetzt (Home und Gespeicherte Suchen), dazu ein Kontomenü und eine mobile Bottom-Navigation. Die Detailansicht ist jetzt eine Produktseite: links eine fixierte Spalte mit Foto und Karte, rechts Fakten mit Kaufbox (Bewerben, Anfrage-Entwurf, Inserat öffnen) und aufklappbaren Abschnitten. Auf dem Handy gibt es ein festes Dock mit Bewerben, Maps und Provider. Hinzu kommen ein neuer Login-Screen und ein durchgängiger Reskin.  
  _Upstream:_ Upstream hat 2026-09 selbst neu gestaltet (Hell/Dunkel-Theme, komponentisierte Detailansicht mit ListingActionBar), allerdings in anderer Form.  
  Branch `main` · Dateien: `ui/src/components/navigation/navModel.ts`, `ui/src/views/listings/ListingDetail.tsx`, `ui/src/views/listings/listingActions.js`, `ui/src/views/login/Login.tsx` · Commits: [`fee201c`](https://github.com/adhi1419/fredy/commit/fee201c79c), [`baed253`](https://github.com/adhi1419/fredy/commit/baed253cb9), [`45c72e3`](https://github.com/adhi1419/fredy/commit/45c72e3236) und 3 weitere
- **Kleineres Docker-Image durch Entfernen ungenutzter Chromium-Locales und chromedriver** (Deployment & Betrieb; teilweise; Nutzen niedrig, Aufwand gering)  
  Im selben Layer wie der CloakBrowser-Download werden alle Chromium-Locales außer de.pak und en-US.pak sowie der ungenutzte chromedriver gelöscht. Außerdem werden nur Produktionsabhängigkeiten installiert und der Yarn-Cache im selben Layer geleert. Laut Commit sinkt das Image komprimiert von 1,22 GB auf etwa 430 MB, nach der späteren Chromium-Entfernung im Fork auf etwa 105 MB.  
  _Upstream:_ Upstream leert den Yarn-Cache bereits im selben Layer, behält aber alle Chromium-Locales und chromedriver und installiert auch devDependencies für den Frontend-Build.  
  Branch `main` · Dateien: `Dockerfile` · Commits: [`ec00c02`](https://github.com/adhi1419/fredy/commit/ec00c027ee)

_Nicht berücksichtigt:_ Ignoriert wurden: viele Commits zum Entfernen von Upstream-Funktionen (Notification-Adapter außer Telegram, MCP, Demo, Debug-Logs, Preisverfolgung, Backup/Restore, Konnektivität, Browser-Benachrichtigungen/SSE, Analytics, Spendenhinweis, Whats-New, Release-Polling, die meisten Provider), ein ungenutzter („dormant“) Rust-Backend-Prototyp unter rust/health-route, CI- und Cloud-Build-Workflows für die eigene GCP-Instanz, Scheduler-Takt und Secrets, ‚docs: bind … review‘-Tracker-Commits, Screenshots, Prettier- und Formatierungscommits sowie der Branch feat/job-validation-typescript (gleicher Stand wie in main).

## rcmadruga/fredy-dk

[Repository](https://github.com/rcmadruga/fredy-dk) · Zeitraum: 2026-09 bis 2026-10 · Branches: `master`, `feat/listing-score`

Umfassende Dänemark-Anpassung, auf den aktuellen Upstream-Stand (2026-10-07) rebased: vier dänische Portale, Währung pro Provider, dänische Miet- und Kaufkonditionen, ein dänisches Finanzierungsmodell, dänische Breitbanddaten und regionale Kartenebenen (Kommunalsteuer, Schulen, Supermärkte, Jobs). Auf dem Branch feat/listing-score kommt ein pro Suchauftrag konfigurierbarer Listing-Score mit Radar-Chart hinzu. Fast alles ist mit Tests abgedeckt. Vieles ist DK-spezifisch, allgemein nützlich sind vor allem Währung pro Provider, Filterparität zwischen Karte und Übersicht, Beschreibungs-Übersetzung und der Score.

- **Boligsiden-Provider (dänische Kaufobjekte)** (Provider; neu; Nutzen hoch, Aufwand gering)  
  Neuer Provider für boligsiden.dk, das die Angebote der meisten dänischen Makler (EDC, Nybolig, home, danbolig usw.) bündelt. Die Website liegt hinter Cloudflare, deshalb spricht der Provider direkt die JSON-API api.boligsiden.dk an, die ohne Challenge antwortet (gleiches Muster wie flatfox.js). Ergebnisse kommen neueste zuerst, der Host-Check nutzt das Upstream-Feld hosts, und die Währung ist DKK. Damit ist mit einem einzigen Provider ein Großteil des dänischen Kaufmarkts abgedeckt.  
  _Upstream:_ Upstream hat keinen dänischen Provider; countryBounds.js kennt 'dk' nur als Kartenausschnitt.  
  Branch `master` · Dateien: `lib/provider/boligsiden.js`, `test/provider/boligsiden.test.js`, `ui/src/services/providerOrder.js` · Commits: [`c0b4cc5`](https://github.com/rcmadruga/fredy-dk/commit/c0b4cc584f), [`6a95e45`](https://github.com/rcmadruga/fredy-dk/commit/6a95e45806), [`8877187`](https://github.com/rcmadruga/fredy-dk/commit/8877187705) und 1 weitere
- **BoligPortal-Provider (größtes dänisches Mietportal)** (Provider; neu; Nutzen hoch, Aufwand gering)  
  Provider für boligportal.dk mit eigenem Navigationsmodul (lib/services/boligportal/boligportalSearch.js), weil Cloudflare zuerst mit 403 antwortet und der Standard-Extractor die Seite sonst verwerfen würde. Die Trefferliste wird aus dem eingebetteten JSON (script#store, props.page_props.results) gelesen, nicht aus dem Markup. Pro Lauf werden zwei Seiten gelesen und neueste zuerst sortiert, die Koordinaten der Seite werden übernommen. fetchDetails liest die volle Beschreibung aus dem Hydration-State der Detailseite.  
  _Upstream:_ Kein dänisches Mietportal in Upstream.  
  Branch `master` · Dateien: `lib/provider/boligportal.js`, `lib/services/boligportal/boligportalSearch.js`, `test/provider/boligportalSearch.test.js` · Commits: [`b70481b`](https://github.com/rcmadruga/fredy-dk/commit/b70481bedc), [`9802ee7`](https://github.com/rcmadruga/fredy-dk/commit/9802ee7830), [`cab477c`](https://github.com/rcmadruga/fredy-dk/commit/cab477c70f)
- **Währung pro Provider statt fest Euro** (Länder & Lokalisierung; neu; Nutzen hoch, Aufwand mittel)  
  Provider können in metaInformation optional eine ISO-4217-Währung angeben (Standard EUR). Ohne diese Angabe wurde zum Beispiel ein Haus für 2.000.000 kr. als 2.000.000 EUR angezeigt. Grid, Tabelle, Detailseite, Kartenpopup, Preisänderungs- und m²-Preis-Badge holen die Währung über den Hook useCurrencyOf, und Benachrichtigungen bekommen sie über formatListing aus der Pipeline. Später wurde das auf die Finanzseite (Kronen-Eingaben) ausgeweitet.  
  _Upstream:_ Upstream formatiert Preise in priceService.js fest mit currency 'EUR', auch für flatfox.ch und betterhomes.ch (CHF).  
  Branch `master` · Dateien: `lib/services/providers/currencies.js`, `lib/services/providers/providerCurrency.js`, `ui/src/hooks/useCurrencyOf.js`, `ui/src/services/price/priceService.js` · Commits: [`72c812b`](https://github.com/rcmadruga/fredy-dk/commit/72c812b2ad), [`196c0d3`](https://github.com/rcmadruga/fredy-dk/commit/196c0d3173)
- **Karte mit denselben serverseitigen Filtern wie die Übersicht** (Filter & Suche; neu; Nutzen hoch, Aufwand mittel)  
  Bisher filterte die Kartenansicht nur Preis und Pendelzeit im Browser und übergab dem Server nur die Job-ID. Jetzt nutzt die Karte dasselbe Filterobjekt und denselben Servercode (listingFilterQuery, listingsRouter) wie die Übersicht, mit gemeinsamem Filter-Drawer und Chips. Beim Wechsel zwischen den Ansichten bleiben die Filter erhalten. Nebenbei behoben: Inserate ohne Preis verschwinden nicht mehr, solange der Preisregler unberührt ist, und Änderungen an Konnektivitätsfiltern lösen in der Übersicht wieder ein Neuladen aus.  
  _Upstream:_ Upstream-Map.jsx filtert weiterhin clientseitig (filterListings nach Preis und Pendelzeit) und lädt nur per jobId.  
  Branch `master` · Dateien: `ui/src/views/listings/Map.jsx`, `ui/src/components/listings/ListingFiltersDrawer.jsx`, `ui/src/services/listings/listingFilters.js`, `lib/api/listingFilterQuery.js` · Commits: [`45a7208`](https://github.com/rcmadruga/fredy-dk/commit/45a7208395)
- **Listing-Score mit Radar-Chart und pro Job konfigurierbaren Gewichten** (Filter & Suche; neu; Nutzen hoch, Aufwand hoch)  
  Eine reine Score-Engine (lib/services/score/score.js) rechnet jede Metrik linear zwischen einem Ideal- und einem Worst-Wert des Nutzers auf 0 bis 100 um. Die Metriken sind in Gruppen gewichtet gemittelt: Geld, Schulen, Arbeit, Wohnung, Umfeld und Deal, wobei Deal nur bei Kauf zählt. Fehlende Daten zählen neutral als 50 und werden markiert. Die Konfiguration liegt pro Job in score_config (Migration 52) mit Gruppen- und Metrikgewichten, Zielen und Pendeladresse und hat ein eigenes Formular in JobMutation. Angezeigt wird der Score als ListingScoreCard mit Radar und Aufschlüsselung, als Chip auf Karten und in der Tabelle sowie über MCP (get_listing, list_listings). Einige Metriken (Trend, Grün, Ruhe, Sicherheit) sind noch Platzhalter.  
  _Upstream:_ Upstream hat Affordability-Verdict und Scam-Signale, aber keinen gewichteten Gesamt-Score pro Inserat.  
  Branch `feat/listing-score` · Dateien: `lib/services/score/score.js`, `lib/services/score/context.js`, `lib/services/score/metrics/index.js`, `lib/services/storage/migrations/sql/52.job-score-config.js` · Commits: [`e5f57c5`](https://github.com/rcmadruga/fredy-dk/commit/e5f57c5409), [`8b62749`](https://github.com/rcmadruga/fredy-dk/commit/8b62749bdc), [`d07d95c`](https://github.com/rcmadruga/fredy-dk/commit/d07d95c35c) und 11 weitere
- **Lejebolig-Provider (dänische Mietwohnungen)** (Provider; neu; Nutzen mittel, Aufwand gering)  
  Provider für lejebolig.dk per fetch und cheerio, ohne Browser, da die Seite serverseitig rendert und keine Bot-Sperre hat. Preis-, Zimmer- und Typfilter der Seite laufen nur per POST, daher greifen nur Fredys eigene Spezifikationsfilter. fetchDetails liest Beschreibung, Adresse und Veröffentlichungsdatum aus der Detailseite (ld+json RealEstateListing), weil die Suchkarte beides nicht enthält.  
  _Upstream:_ Kein Upstream-Provider für lejebolig.dk.  
  Branch `master` · Dateien: `lib/provider/lejebolig.js`, `test/provider/lejebolig.test.js` · Commits: [`8ee3850`](https://github.com/rcmadruga/fredy-dk/commit/8ee3850c92), [`add7c2b`](https://github.com/rcmadruga/fredy-dk/commit/add7c2b156)
- **Mietkonditionen (rental_terms) mit Miet-Karte und Einzugsdatum-Filter** (Daten & Speicherung; neu; Nutzen mittel, Aufwand mittel)  
  Ein gemeinsamer Helper (lib/services/rental/rentalTerms.js) normalisiert, was dänische Mietinserate über die Miete hinaus angeben: Nebenkosten a conto, Kaution, Mietvorauszahlung, Mietdauer, Bezugstermin, sofort frei und Einzugspreis. Gespeichert wird das als JSON-Spalte listings.rental_terms (Migration 50). Die ListingRentalCard zeigt Bezugstermin, Monatssumme und nötiges Startkapital und warnt bei Kaution oder Vorauszahlung über den gesetzlichen Obergrenzen. Dazu kommt ein Filter für ein Einzugsfenster (MoveInWindowFilter), der in Übersicht und Karte über json_extract wirkt.  
  _Upstream:_ Upstream kennt charges/charges_included, aber keine strukturierten Mietkonditionen und keinen Einzugsdatum-Filter.  
  Branch `master` · Dateien: `lib/services/rental/rentalTerms.js`, `lib/services/storage/migrations/sql/50.listing-rental-terms.js`, `ui/src/views/listings/components/ListingRentalCard.jsx`, `ui/src/components/listings/MoveInWindowFilter.jsx` · Commits: [`f625afb`](https://github.com/rcmadruga/fredy-dk/commit/f625afb1fe), [`45a7208`](https://github.com/rcmadruga/fredy-dk/commit/45a7208395), [`7cb9708`](https://github.com/rcmadruga/fredy-dk/commit/7cb9708b3c)
- **Kaufkonditionen (sale_terms) mit Verkaufskarte, Kauf-Filtern und Kostenzeile in Benachrichtigungen** (Daten & Speicherung; neu; Nutzen mittel, Aufwand mittel)  
  Die JSON-Spalte listings.sale_terms (Migration 51) speichert, was Boligsiden zu einem Kaufobjekt liefert: Ejerudgift, Anzahlung, Beispielrechnung des Maklers, kr/m², öffentliche Bewertung, frühere Verkäufe, Liegezeit, Vormakler, Preisänderung, Gebäudedaten und Grundsteuer. Die ListingSaleCard zeigt Monatskosten, Tage am Markt mit Relisted-Badge (Lücke ab 60 Tagen) und eine Tabelle früherer Verkäufe im Vergleich zum heutigen Preis. Neue Filter gibt es für Ejerudgift, Energielabel, wieder eingestellt und Preis gesenkt. Alle Notification-Adapter und E-Mail-Templates bekommen eine saleCosts-Zeile, und MCP get_listing liefert die Kaufdaten.  
  _Upstream:_ Upstream hat Preis-Historie und Preisänderungs-Badges, aber keine Liegezeit, kein Relisted, keine Verkaufshistorie und keinen Energielabel-Filter.  
  Branch `master` · Dateien: `lib/services/sale/saleTerms.js`, `lib/services/storage/migrations/sql/51.listing-sale-terms.js`, `ui/src/views/listings/components/ListingSaleCard.jsx`, `ui/src/views/listings/listingFacts.js` · Commits: [`106084f`](https://github.com/rcmadruga/fredy-dk/commit/106084fca7), [`23e805b`](https://github.com/rcmadruga/fredy-dk/commit/23e805b526), [`660fa34`](https://github.com/rcmadruga/fredy-dk/commit/660fa34dff) und 4 weitere
- **Dänisches Finanzierungsmodell für Kaufobjekte** (Länder & Lokalisierung; neu; Nutzen mittel, Aufwand mittel)  
  Reine Funktionen in lib/services/finance/dk/ bilden den dänischen Immobilienkauf ab: Finanzierungsstruktur aus Realkredit, Bankkredit und Anzahlung, Bidrag nach Beleihungsband, Kurs, Tinglysningsafgift, Annuitäts- und tilgungsfreie Darlehen, Ejendomsværdiskat mit Progressionsgrenze, Grundskyld, Rentefradrag und den Höchstpreis für ein Monatsbudget. Die Konstanten stehen mit Quellen und Datum in constants.js. computeFinanceResult wählt das Modell nach der Währung des Providers. Der Finanzrechner bekommt einen Schalter Deutschland/Dänemark (DanishBuying.jsx), und Affordability-Chip, -Filter, /api/finance/affordability sowie MCP calculate_financing rechnen DKK-Inserate mit dem dänischen Modell.  
  _Upstream:_ Upstream hat nur das deutsche Finanzierungsmodell (lib/services/finance/financing.js) in Euro.  
  Branch `master` · Dateien: `lib/services/finance/dk/financing.js`, `lib/services/finance/dk/constants.js`, `lib/services/finance/dk/listingVerdict.js`, `lib/services/finance/calculate.js` · Commits: [`8d7189a`](https://github.com/rcmadruga/fredy-dk/commit/8d7189a05f), [`e3d2565`](https://github.com/rcmadruga/fredy-dk/commit/e3d2565313), [`c39426d`](https://github.com/rcmadruga/fredy-dk/commit/c39426d8b0) und 3 weitere
- **Dänische Breitband-Verfügbarkeit (Quelle dk-tjekditnet)** (Länder & Lokalisierung; neu; Nutzen mittel, Aufwand gering)  
  Neue Konnektivitätsquelle für Dänemark. Die öffentliche CSV der Digitaliseringsstyrelsen mit etwa 2,4 Mio. Adressen (Glasfaser, Kabel, xDSL, Fixed Wireless) wird beim ersten Bedarf in eine eigene SQLite-Datei importiert und atomar getauscht. Die Suche rechnet die Koordinate nach ETRS89/EPSG:25832 um und nimmt die nächste Adresse im Umkreis von 500 m über ein Gitterraster, ohne Netzwerkzugriff und ohne das abgeschaltete DAWA. Migration 49 stellt dänische Inserate erneut in die Warteschlange, die vorher als 'keine Abdeckung' markiert worden waren.  
  _Upstream:_ Upstream hat Konnektivitätsquellen für DE, AT, ES und CH (geoAdmin), aber keine für Dänemark.  
  Branch `master` · Dateien: `lib/services/connectivity/dk/danishBroadbandData.js`, `lib/services/connectivity/client/danishBroadbandClient.js`, `lib/services/connectivity/sources.js`, `lib/services/geo/etrs89.js` · Commits: [`b05d872`](https://github.com/rcmadruga/fredy-dk/commit/b05d8724ab), [`a7407f0`](https://github.com/rcmadruga/fredy-dk/commit/a7407f0fd1), [`8ad1947`](https://github.com/rcmadruga/fredy-dk/commit/8ad1947ff3)
- **Regionale Kartenebenen für Dänemark: Kommunalsteuer und Schulen** (Karte & Geodaten; neu; Nutzen mittel, Aufwand hoch)  
  Zwei abschaltbare Overlays werden über /api/regional-data/dk/* bereitgestellt. Das erste ist ein Choropleth aus Kommuneskat und Grundskyld (Statistikbanken, Tabelle PSKAT) auf Kommunegrenzen, die als Offline-Daten aus DAGI mitgeliefert werden (denmarkGeo.js für Punkt-, Postleitzahl- und Ortsnamensuche, Generator tools/geo/build-denmark-geo.mjs). Das zweite sind Schulmarker mit Inklusionsquote, Anteil in Sonderklassen und Notenschnitt aus api.uddannelsesstatistik.dk (API-Key per Umgebungsvariable nötig), positioniert über das STIL-Institutionsregister. Ein eigenes SchoolPanel bietet Filter nach Schultyp, Sonderschulen und Notenbereich, die Farben sind farbenblind-sicher. Daten werden auf Platte gecacht (diskCache.js), und Popups werden escaped.  
  _Upstream:_ Upstream hat keine regionalen Daten-Layer; Schulen gibt es dort nur als OSM-Kategorie für Reisezeiten.  
  Branch `master` · Dateien: `lib/services/regionalData/regionalDataService.js`, `lib/services/regionalData/taxClient.js`, `lib/services/regionalData/schoolClient.js`, `lib/services/geo/denmarkGeo.js` · Commits: [`8e0439e`](https://github.com/rcmadruga/fredy-dk/commit/8e0439ecf3), [`ace891a`](https://github.com/rcmadruga/fredy-dk/commit/ace891aac0), [`2531168`](https://github.com/rcmadruga/fredy-dk/commit/253116891e) und 5 weitere
- **Supermarkt-Layer mit Ketten-Logos (OpenStreetMap)** (Karte & Geodaten; neu; Nutzen mittel, Aufwand mittel)  
  Eine landesweite Overpass-Abfrage nach shop=supermarket wird zwei Wochen auf Platte gecacht und unter /api/regional-data/dk/groceries ausgeliefert. Der Server ordnet die Märkte Ketten zu (Netto, Føtex, Bilka, Rema 1000, Lidl, Aldi, Coop, Meny usw.), die Karte zeigt sie als Logo-Badges mit Filter pro Kette im GroceryPanel. overpassClient bekommt dafür findElements mit gemeinsamem Throttle und Backoff. Die Abfrage selbst ist länderunabhängig, die Kettenzuordnung und die Logos (Markenzeichen) sind DK-spezifisch.  
  _Upstream:_ Upstream nutzt shop=supermarket nur als Ziel für Reisezeitberechnungen (lib/services/poi/categories.js), nicht als Kartenebene.  
  Branch `master` · Dateien: `lib/services/regionalData/groceryClient.js`, `lib/services/regionalData/groceryChains.js`, `lib/services/poi/overpassClient.js`, `ui/src/components/map/GroceryPanel.jsx` · Commits: [`d283b10`](https://github.com/rcmadruga/fredy-dk/commit/d283b10563), [`ed75f54`](https://github.com/rcmadruga/fredy-dk/commit/ed75f54b20), [`b3a8bd4`](https://github.com/rcmadruga/fredy-dk/commit/b3a8bd4c14) und 3 weitere
- **Beschreibungen beim Abruf ins Englische übersetzen** (Länder & Lokalisierung; neu; Nutzen mittel, Aufwand gering)  
  Neue Inserate bekommen beim Abruf description_en und description_lang (Migration 48). Übersetzt wird über den inoffiziellen Google-Translate-Endpunkt (client=gtx), in Abschnitten und auf Best-Effort-Basis, ohne die Pipeline zu blockieren. POST /api/listings/:id/translate übersetzt ältere Inserate nach, und ein manueller Detail-Refetch übersetzt neu. Die Beschreibungskarte hat einen Umschalter Übersetzung/Original, der pro Browser gespeichert wird. Die Zielsprache ist fest Englisch.  
  _Upstream:_ Upstream übersetzt keine Inseratsbeschreibungen.  
  Branch `master` · Dateien: `lib/services/translation/translateService.js`, `lib/services/storage/migrations/sql/48.listing-description-translation.js`, `lib/FredyPipelineExecutioner.js`, `ui/src/views/listings/components/ListingDescriptionCard.jsx` · Commits: [`e61d6fe`](https://github.com/rcmadruga/fredy-dk/commit/e61d6fe5e9)
- **Browser-Probe für Bot-Sperren vor dem Schreiben eines Providers** (Tests & Tooling; neu; Nutzen mittel, Aufwand gering)  
  Das Skript tools/deploy/browser-probe.mjs lädt Seiten mit den Startoptionen des Fredy-Extractors und meldet, ob eine Cloudflare-Challenge durchgeht. Es listet alle Daten- und JSON-Requests der Seite auf (Kandidaten für direkte API-Aufrufe), skizziert eingebettetes JSON und findet darin die Inseratsliste. HTML- und JSON-Antworten werden als Test-Fixtures gespeichert, und das Skript wird per stdin an node auf dem Host übergeben.  
  _Upstream:_ Upstream hat tools/testFixtures/downloadFixtures.js, aber kein Werkzeug zur Bot-Wall- und Endpunkt-Analyse.  
  Branch `master` · Dateien: `tools/deploy/browser-probe.mjs` · Commits: [`a2c2eeb`](https://github.com/rcmadruga/fredy-dk/commit/a2c2eebc16), [`ebf9dd3`](https://github.com/rcmadruga/fredy-dk/commit/ebf9dd30d2), [`367adc9`](https://github.com/rcmadruga/fredy-dk/commit/367adc9126)
- **Danica-Ejendomme-Provider** (Provider; neu; Nutzen niedrig, Aufwand gering)  
  Provider für den Vermieter Danica Ejendomme (über 2.700 Wohnungen), dessen AngularJS-Seite per POST eine eigene JSON-API abfragt. Ein Request pro Lauf liefert Miete, Fläche, Zimmer, Adresse, Koordinaten und Mietkonditionen, und der Crawl-Delay von 5 s wird eingehalten. Reservierte Wohnungen werden ausgelassen.  
  _Upstream:_ Nicht in Upstream vorhanden.  
  Branch `master` · Dateien: `lib/provider/danicaejendomme.js`, `test/provider/danicaejendomme.test.js` · Commits: [`7cb9708`](https://github.com/rcmadruga/fredy-dk/commit/7cb9708b3c)
- **Jobs-Layer (Jobindex) für ein bestimmtes Berufsfeld** (Karte & Geodaten; neu; Nutzen niedrig, Aufwand mittel)  
  Liest die Suchseiten von Jobindex (ohne Key, eingebettetes JSON) für eine fest eingestellte Berufsfamilie (Ernæringsassistent und verwandte Titel) und klassifiziert die Überschriften. Jede Anzeige wird über Koordinaten, Postleitzahl oder Ortstext einer Kommune zugeordnet. Die Karte zeigt ein Choropleth pro Kommune und Punkte pro Anzeige: gefüllt bei exakter Adresse, als Ring bei ungefährer Lage. Der Cache hält zwei Wochen.  
  _Upstream:_ Kein Gegenstück in Upstream.  
  Branch `master` · Dateien: `lib/services/regionalData/jobsClient.js`, `lib/services/regionalData/jobTitles.js`, `lib/services/regionalData/jobPlacement.js`, `ui/src/components/map/JobsPanel.jsx` · Commits: [`e93ee33`](https://github.com/rcmadruga/fredy-dk/commit/e93ee33f3c), [`22df0ce`](https://github.com/rcmadruga/fredy-dk/commit/22df0ce13c)

_Nicht berücksichtigt:_ Ignoriert: Plan- und Ideendokumente (docs/plans, Branches feat/next-plans und feat/roulette, Boliga-Spike), der DK-eigene Release-Workflow (release-dk.yml, dkRelease.js, Versionen <upstream>-dk.<n>) samt eigenem 'What's new'-Teil (Migration 53), das LXC-Deploy-Skript rebuild-on-lxc.sh, der Upstream-Drift-Watcher, cache ignore-error im Docker-Build, Test-Fixes nach Rebases sowie Star-History- und Release-Bot-Commits. Die übrigen Branches sind Teilmengen von master.

## CappyT/fredy

[Repository](https://github.com/CappyT/fredy) · Zeitraum: 2026-08 bis 2026-09 · Branches: `master`, `upstream-pr/provider-dates`

Italien-/Schweiz-Fork vom Autor der upstream bereits gemergten italienischen Provider (casa.it, subito, tecnocasa/tecnorete, idealista). Er ergänzt Immobiliare.it, Homegate und ImmoScout24.ch über die Mobile-APIs, eine umfangreiche Anti-Bot-Infrastruktur (globaler Proxy für alle Portal-Aufrufe, IPRoyal-Exit-Rotation, DataDome-Lösung per Capsolver), CHF-Währungsunterstützung, italienische Breitbandquellen sowie robustere Pipeline-Logik (Preisänderung per Link statt Duplikat, lokal gespeicherte Fotos, nächtlicher Detail-Backfill).

- **Provider Immobiliare.it (Android-App-API mit Browser-Fallback)** (Provider; neu; Nutzen hoch, Aufwand hoch)  
  Neuer Provider für Italiens größtes Portal: Die eingefügte Such-URL wird in die Query der Android-App-API übersetzt, der Ort über den Geografie-Dienst der App aufgelöst, und alle Ergebnisseiten (bis 20) werden gedrosselt gelesen. Suchen, die die API nicht ausdrücken kann (z. B. gezeichnete Flächen), laufen über den Website-Endpoint im Job-Browser. Beschreibung kommt aus der App-Detail-API, die Aktiv-Prüfung ebenfalls über die Detail-API statt über die DataDome-geschützte Website.  
  _Upstream:_ Upstream hat casa, subito, tecnocasa, tecnorete und idealista für Italien, aber keinen Immobiliare.it-Provider.  
  Branch `master` · Dateien: `lib/provider/immobiliare.js`, `lib/services/immobiliare/appApi.js`, `lib/services/immobiliare/geography.js`, `lib/services/immobiliare/web-translator.js` · Commits: [`5e99e79`](https://github.com/CappyT/fredy/commit/5e99e7983c), [`e2bb649`](https://github.com/CappyT/fredy/commit/e2bb64963e), [`38c4204`](https://github.com/CappyT/fredy/commit/38c4204796) und 9 weitere
- **Provider Homegate und ImmoScout24.ch (SMG-Mobile-API mit Poisoning-Erkennung)** (Provider; neu; Nutzen hoch, Aufwand hoch)  
  Zwei Schweizer Portale der Swiss Marketplace Group werden über deren App-API gelesen: Such-URL-Filter (Angebotsart, Kategorie, Ort-Slug, Sortierung) werden in die strukturierte API-Query übersetzt, der Ort per Autocomplete aufgelöst, bis zu fünf Seiten gelesen. Ein nicht-leerer X-App-Id-Header verhindert, dass die API manipulierte Werte ausliefert; lib/services/smg/poison.js prüft jede Seite zusätzlich auf den 'vergifteten' Wertesatz und fordert sie erneut an bzw. verwirft sie. Homegate nutzt einen ungeschützten Primär-Host mit api.homegate.ch als Fallback.  
  _Upstream:_ Upstream deckt die Schweiz nur mit Flatfox und betterhomes ab; doc/providers.md vermerkt ausdrücklich, dass immoscout24.ch nicht unterstützt wird.  
  Branch `master` · Dateien: `lib/provider/homegate.js`, `lib/provider/immoscout24ch.js`, `lib/services/smg/poison.js`, `lib/services/smg/appHeaders.js` · Commits: [`969f096`](https://github.com/CappyT/fredy/commit/969f09676c), [`02eeb72`](https://github.com/CappyT/fredy/commit/02eeb72ff3), [`e449f60`](https://github.com/CappyT/fredy/commit/e449f60951) und 11 weitere
- **Preise in eigener Währung (CHF getrennt von EUR)** (Länder & Lokalisierung; neu; Nutzen hoch, Aufwand mittel)  
  Jedes Listing bekommt beim Scrape eine Währung aus dem Land des Providers (Spalte listings.currency, Migration 900, Backfill beim Start). Benachrichtigungen, MCP-Antworten und UI (Liste, Karte, Detail, Preis/m², Preisverlauf, Badges) zeigen CHF-Preise als CHF; Marktbenchmark und Dashboard-Mediane vergleichen nur gleiche Währungen, Finanzierungsrechner und Affordability-Verdict werden für Nicht-EUR-Listings ausgesetzt. Das Jobformular zeigt die Währungen der gewählten Provider am Maximalpreis an.  
  _Upstream:_ Upstream formatiert alle Preise fest als EUR (priceService.js, listingFacts.js), obwohl Flatfox und betterhomes Schweizer Franken liefern.  
  Branch `master` · Dateien: `lib/utils/currency.js`, `ui/src/services/price/currency.js`, `lib/services/providers/providerCurrency.js`, `lib/services/listings/currencyBackfill.js` · Commits: [`8ceff8b`](https://github.com/CappyT/fredy/commit/8ceff8b0ca), [`3dd34e7`](https://github.com/CappyT/fredy/commit/3dd34e7866)
- **Preisänderung per Link erkennen statt Duplikat anlegen** (Bugfix; neu; Nutzen hoch, Aufwand mittel)  
  Da der Hash den Preis enthält, landete ein Inserat nach Preissenkung bisher als neues Listing samt 'Neu'-Benachrichtigung neben dem alten. Die Neuheitsprüfung nutzt jetzt alle Hashes des Jobs (nicht nur eines Providers, wichtig für tecnocasa/tecnorete mit gemeinsamen IDs) und prüft hash-neue Listings zusätzlich per Link: bekannte Inserate laufen in die Preisänderungs-Spur (Historieneintrag, Schwelle, Preisänderungs-Benachrichtigung) und der Hash der Zeile wird umbenannt. Eine Migration führt bereits entstandene Duplikate zusammen.  
  _Upstream:_ Upstream-_findNew prüft weiterhin nur getKnownListingHashesForJobAndProvider und kennt keinen Link-Abgleich.  
  Branch `master` · Dateien: `lib/FredyPipelineExecutioner.js`, `lib/services/listings/scrapedPriceChange.js`, `lib/services/storage/listingsStorage.js`, `lib/services/storage/migrations/sql/42.dedupe-price-change-duplicates.js` · Commits: [`99037e7`](https://github.com/CappyT/fredy/commit/99037e7db7), [`5098c11`](https://github.com/CappyT/fredy/commit/5098c11aa0), [`4fd92f0`](https://github.com/CappyT/fredy/commit/4fd92f0ad2) und 3 weitere
- **DataDome-Challenges per Capsolver lösen und Cookie wiederverwenden** (Sonstiges; neu; Nutzen mittel, Aufwand hoch)  
  Optionaler, kostenpflichtiger Solver: Mit Capsolver-API-Key (Einstellungsseite oder CAPSOLVER_API_KEY) und Proxy wird eine lösbare DataDome-'fe'-Challenge gelöst und das Cookie mit Max-Age auf Platte (datadome-tokens.json) gespeichert. guardedRead.js versucht bei Ablehnung zuerst bis zu drei neue Proxy-Exits, erst dann einen Solve; Solves pro Host sind auf einen pro zehn Minuten begrenzt und gleichzeitige Anfragen teilen sich einen. Genutzt von Immobiliare, Homegate, ImmoScout24.ch und dem Idealista-Browser-Fallback; ohne Key verhält sich alles wie upstream.  
  _Upstream:_ Upstream behandelt eine DataDome-Challenge als fehlgeschlagenen Read und arbeitet nur mit Browser-Warm-up (warmPages.js), ohne externen Solver.  
  Branch `master` · Dateien: `lib/services/datadome.js`, `lib/services/http/guardedRead.js`, `lib/services/idealista/idealistaSearch.js` · Commits: [`100dbc6`](https://github.com/CappyT/fredy/commit/100dbc62db), [`b32475e`](https://github.com/CappyT/fredy/commit/b32475e87a), [`7c67c4f`](https://github.com/CappyT/fredy/commit/7c67c4fd6b) und 1 weitere
- **Italienische Breitband-Verfügbarkeit (Navigabene und fibermap.it)** (Karte & Geodaten; neu; Nutzen mittel, Aufwand mittel)  
  Zwei neue Konnektivitätsquellen für Italien: Der Navigabene-Checker wird per ISTAT-Ort, Straße und Hausnummer abgefragt und liefert das schnellste Angebot je Technologie; fibermap.it liefert die Wholesale-Netze (FiberCop, Open Fiber, Fastweb, EOLO, OpNet) pro Gebäude. Ein eigener Parser für italienische Adressen, Drosselung, Address-Cache und Pausieren nur bei echten Dienstausfällen bzw. Kontingentsperre sind enthalten.  
  _Upstream:_ Upstream hat Konnektivitätsquellen nur für DE, AT, ES und CH (breitbandatlas, coberturaEs, geoAdmin), keine für Italien.  
  Branch `master` · Dateien: `lib/services/connectivity/client/navigabeneClient.js`, `lib/services/connectivity/client/fibermapClient.js`, `lib/services/connectivity/italianAddress.js`, `lib/services/connectivity/sources.js` · Commits: [`2db8d5f`](https://github.com/CappyT/fredy/commit/2db8d5f5ae), [`41d2107`](https://github.com/CappyT/fredy/commit/41d2107802), [`33453e8`](https://github.com/CappyT/fredy/commit/33453e8c69) und 1 weitere
- **Listing-Fotos lokal speichern und ausliefern** (Daten & Speicherung; neu; Nutzen mittel, Aufwand mittel)  
  Nach den Ähnlichkeits- und Flächenfiltern lädt die Pipeline das Titelbild jedes gespeicherten Listings (max. 3 parallel) und legt es in der neuen Tabelle listing_images ab, weil Portal-URLs (z. B. signierte CloudFront-Links von idealista) verfallen. Die Route GET /api/listings/:id/image liefert die Bytes mit Zugriffsprüfung und Cache-Header (sonst Redirect zur Portal-URL), ein Start-Backfill holt fehlende Bilder nach, und das MCP-Tool get_photo_for_listing nutzt das gespeicherte Foto.  
  _Upstream:_ Upstream speichert nur image_url und lädt das Bild bei Bedarf vom Portal.  
  Branch `master` · Dateien: `lib/services/storage/migrations/sql/43.listing-images.js`, `lib/services/listings/imageFetcher.js`, `lib/services/listings/imageBackfillService.js`, `lib/api/routes/listingsRouter.js` · Commits: [`49edad2`](https://github.com/CappyT/fredy/commit/49edad2cc1), [`c07df77`](https://github.com/CappyT/fredy/commit/c07df77c3c), [`ce09956`](https://github.com/CappyT/fredy/commit/ce09956eaf) und 1 weitere
- **Idealista-Aktivprüfung über die App-Detail-API** (Provider; neu; Nutzen mittel, Aufwand gering)  
  Statt die DataDome-geschützte Inseratsseite abzufragen (liefert vom Server kein Urteil und führte zu fälschlichen Deaktivierungen), fragt die activityProbe von Idealista die Detail-API der App: state 'active' bedeutet online, 404 bedeutet entfernt, alles andere kein Urteil. Dasselbe Muster nutzt der Immobiliare-Provider.  
  _Upstream:_ Upstream-idealista.js nutzt weiterhin checkIfListingIsActive auf die Website-URL.  
  Branch `master` · Dateien: `lib/provider/idealista.js`, `lib/services/idealista/search.js` · Commits: [`2349cc9`](https://github.com/CappyT/fredy/commit/2349cc9bef)
- **Browser-Ressourcen-Cache und Bilder aus im Headless-Browser** (Performance; neu; Nutzen mittel, Aufwand gering)  
  CloakBrowser startet mit --blink-settings=imagesEnabled=false und einem persistenten --disk-cache-dir pro laufendem Browser (Slot-Verwaltung, 200 MB), sodass Skripte und Stylesheets der Portale zwischen Läufen gecacht werden, während das Profil mit Cookies wegwerfbar bleibt. Spart vor allem Traffic über bytebasiert abgerechnete Residential-Proxys; dazu kommt newIsolatedPage für isolierte Kontexte mit korrekter Proxy-Authentifizierung.  
  _Upstream:_ Upstream-launchBrowser setzt weder Disk-Cache noch Bildsperre.  
  Branch `master` · Dateien: `lib/services/extractor/puppeteerExtractor.js` · Commits: [`621e013`](https://github.com/CappyT/fredy/commit/621e013ea7), [`e57b637`](https://github.com/CappyT/fredy/commit/e57b637199)
- **Docker-Build nativ pro Architektur statt QEMU** (Deployment & Betrieb; neu; Nutzen mittel, Aufwand gering)  
  Der wiederverwendbare Docker-Workflow baut amd64 auf ubuntu-latest und arm64 auf ubuntu-24.04-arm, pusht jeweils per Digest mit eigenem GHA-Cache-Scope und führt die Digests in einem Merge-Job zum Multi-Arch-Manifest zusammen; Image-Namen werden kleingeschrieben. Laut Fork war die QEMU-Emulation rund fünfmal so teuer wie der native Teil.  
  _Upstream:_ Upstream baut beide Plattformen auf einem Runner mit docker/setup-qemu-action.  
  Branch `master` · Dateien: `.github/workflows/docker-build.yml` · Commits: [`ff363e7`](https://github.com/CappyT/fredy/commit/ff363e7a54), [`e38faf3`](https://github.com/CappyT/fredy/commit/e38faf32c3)
- **Einstellbares Datumsformat (TT/MM/JJJJ oder MM/TT/JJJJ)** (UI/UX; neu; Nutzen niedrig, Aufwand gering)  
  Neue Instanz-Einstellung dateFormat auf der System-Seite: leer folgt wie bisher der Locale, alternativ werden alle Datumsangaben der Oberfläche fest tag- oder monatszuerst formatiert. Validierung im generalSettingsRoute, Umsetzung zentral in timeService.format.  
  _Upstream:_ Upstream formatiert Daten ausschließlich per Intl.DateTimeFormat nach Locale.  
  Branch `master` · Dateien: `ui/src/services/time/timeService.js`, `lib/api/routes/generalSettingsRoute.js`, `ui/src/views/admin/pages/SystemPage.jsx` · Commits: [`1c046bb`](https://github.com/CappyT/fredy/commit/1c046bb92e), [`f5dbbb1`](https://github.com/CappyT/fredy/commit/f5dbbb1269)
- **Globaler Ausgangs-Proxy für alle Portal-Aufrufe inkl. IPRoyal-Steuerung** (Deployment & Betrieb; teilweise; Nutzen hoch, Aufwand mittel)  
  Die Proxy-URL (Einstellung oder neue Umgebungsvariable FREDY_PROXY_URL) wird über outboundProxy.js als globaler undici-Dispatcher installiert, sodass nicht nur der Headless-Browser, sondern auch API-Provider, Bild-Downloads und Alive-Checks darüber laufen; http/https/socks4/socks5 werden unterstützt, Änderungen greifen ohne Neustart. Benachrichtigungen, Geocoding und Konnektivität bleiben bewusst direkt (HTTP-Webhook mit explizitem Direct-Dispatcher). Für IPRoyal bietet die Einstellungsseite Land, Sticky/Rotating und Lebensdauer an und schreibt sie ins Passwort; bei Ablehnungen kann pro Request ein neuer Exit-Knoten erzwungen werden.  
  _Upstream:_ Upstream reicht proxyUrl nur an den Puppeteer-Browser weiter; kein globaler fetch-Dispatcher, kein SOCKS, keine Env-Variable und keine Exit-Rotation.  
  Branch `master` · Dateien: `lib/services/http/outboundProxy.js`, `lib/services/proxyUrl.js`, `lib/services/proxy/iproyal.js`, `ui/src/services/proxy/iproyal.js` · Commits: [`02e81fb`](https://github.com/CappyT/fredy/commit/02e81fbe7c), [`2e6f758`](https://github.com/CappyT/fredy/commit/2e6f758483), [`92b2637`](https://github.com/CappyT/fredy/commit/92b2637b96) und 1 weitere
- **Nächtlicher Detail-Backfill für Beschreibung und Veröffentlichungsdatum** (Daten & Speicherung; teilweise; Nutzen mittel, Aufwand mittel)  
  Ein Cron (04:30 und beim Start) sucht aktive bzw. ausgeblendete Listings ohne Beschreibung oder Portaldatum und ruft gedrosselt die fetchDetails des jeweiligen Providers auf; Provider deklarieren per detailFields, welche Spalten sie liefern können, und jeder Versuch wird markiert, damit nichts endlos neu gelesen wird. So werden Zeilen geheilt, die ein gedrosselter Lauf ohne Details gespeichert hat.  
  _Upstream:_ Upstream hat detailFetchDelayMs-Pacing und einen manuellen Detail-Refetch pro Listing (detailRefetchService.js), aber keinen automatischen Backfill-Cron.  
  Branch `master` · Dateien: `lib/services/crons/listing-detail-cron.js`, `lib/services/storage/migrations/sql/44.listing-detail-backfill.js`, `lib/services/storage/listingsStorage.js` · Commits: [`d8f83a7`](https://github.com/CappyT/fredy/commit/d8f83a751b), [`91be39e`](https://github.com/CappyT/fredy/commit/91be39ef3c), [`2e9607f`](https://github.com/CappyT/fredy/commit/2e9607f6d9)
- **Portaldatum für weitere Provider** (Provider; teilweise; Nutzen mittel, Aufwand gering)  
  Neue Helfer localPublicationDate (lokale Kalenderdaten in der Zeitzone des Portals) und relativePublicationDate (deutsche Angaben wie 'vor 3 Tagen', 'Heute, 09:30') in publicationDate.js. Damit lesen Kleinanzeigen (aus eingebetteten Astro-Props und Detailseite), ImmoScout (Mobile-API), 1A-Immobilien, inberlinwohnen, Schwarzes Brett, Subito und casa.it (Website-Pfad über die Detailseite) ihr Veröffentlichungsdatum aus. Auch als separater Branch upstream-pr/provider-dates für einen Upstream-PR vorbereitet.  
  _Upstream:_ Upstream hat published_at samt Sortierung und Daten für bienici, casa (API), engelVoelkers, flatfox, idealista, immowelt, leboncoin, tecnocasa und willhaben, aber nicht für Kleinanzeigen, ImmoScout, Subito usw.  
  Branch `master` · Dateien: `lib/utils/publicationDate.js`, `lib/provider/kleinanzeigen.js`, `lib/services/immoscout/mobileApi.js`, `lib/provider/casa.js` · Commits: [`8096abc`](https://github.com/CappyT/fredy/commit/8096abce40), [`f48ada9`](https://github.com/CappyT/fredy/commit/f48ada9620), [`25603fd`](https://github.com/CappyT/fredy/commit/25603fd7ed) und 1 weitere

_Nicht berücksichtigt:_ Ignoriert: die ursprünglichen Commits zu casa.it, subito, tecnocasa/tecnorete und idealista (inzwischen als PRs upstream), Sortierung nach Portaldatum und Datum in der Tabelle (upstream vorhanden), wieder entfernte Challenge-Solver-/Bypass-Versuche, zahlreiche Doku-Commits (ITALY.md, Divergenz-Logs, reverse-engineered-*.md), Wiederherstellungen von Upstream-Formulierungen, Prettier-Formatierung und Test-Umsortierungen.

## satty008/fredy

[Repository](https://github.com/satty008/fredy) · Zeitraum: 2026-07 bis 2026-09 · Branches: `master`, `roi-filter`

Der Fork richtet Fredy auf Kapitalanleger aus. Er schätzt für Kaufobjekte die Mietrendite (brutto/netto) aus einer pflegbaren Mietspiegel-Datei, zeigt Kaufpreisfaktor und ein cashflow-basiertes Investment-Urteil und lässt Inserate per KI mit GOOD/MAYBE/BAD bewerten, wahlweise über einen eigenen Anthropic- oder OpenAI-kompatiblen API-Schlüssel jedes Nutzers. Dazu kommen Mehrfachauswahl in den Filtern, PWA-Installierbarkeit, REST-Zugriff per MCP-Token und mobile Layout-Fixes. Branch `roi-filter` ist vollständig in `master` enthalten.

- **Mietrendite-Schätzung (brutto/netto) mit Mindestrendite-Filter und Kaltmiete-Override** (Filter & Suche; neu; Nutzen hoch, Aufwand mittel)  
  `rentYield.js` schätzt für Kaufinserate die erzielbare Kaltmiete aus `conf/rent-data.json`. Die Datei enthält Euro pro m² je Stadt, optional je Stadtteil laut Mietspiegel, und einen bundesweiten Fallback. Sie wird bei Änderung ohne Neustart neu geladen. Daraus berechnet der Fork `grossYieldPercent` und `netYieldPercent`; Letztere zieht nicht umlegbare Kosten von der Miete ab und schlägt die Kaufnebenkosten (inklusive Grunderwerbsteuer je Bundesland) auf den Kaufpreis auf. Beide Werte hängen an jeder Inseratszeile, und `coverage` gibt an, ob die Schätzung auf Stadtteil, Stadt, Fallback oder einem Override beruht. Der Job-Filter `minRoiPercent` sortiert Kaufinserate unter der Mindestrendite schon in der Pipeline aus. Auf der Detailseite kann der Nutzer die tatsächliche Kaltmiete pro Inserat eintragen (`cold_rent_override`), und alle Kennzahlen rechnen sich daraus neu.  
  _Upstream:_ Upstream bewertet Kaufobjekte nur nach Leistbarkeit für den eigenen Haushalt (`finance/affordability.js`) und vergleicht den Quadratmeterpreis (`marketBenchmark.js`); Mietrendite und Mindestrendite-Filter gibt es nicht. Die Mietdaten im Fork sind auf die eigenen Zielregionen zugeschnitten.  
  Branch `master` · Dateien: `lib/services/finance/rentYield.js`, `conf/rent-data.json`, `lib/FredyPipelineExecutioner.js`, `lib/types/filter.js` · Commits: [`a168b21`](https://github.com/satty008/fredy/commit/a168b21e3f), [`fd84d8d`](https://github.com/satty008/fredy/commit/fd84d8d042), [`8b45fd2`](https://github.com/satty008/fredy/commit/8b45fd2cc5) und 11 weitere
- **'Rate with my own AI': KI-Bewertung mit eigenem API-Schlüssel jedes Nutzers** (MCP & KI; neu; Nutzen hoch, Aufwand mittel)  
  Jeder Nutzer hinterlegt im neuen Einstellungs-Tab 'AI rating' einen Anthropic- oder OpenAI-kompatiblen API-Schlüssel. Die Schlüssel liegen in der Tabelle `configured_adapter`, sind fest privat und werden in Antworten geschwärzt. Wählbar sind auch ein Modell und eigene Bewertungsrichtlinien; voreingestellt ist eine Rubrik für Buy-to-let-Anleger. `plainRater.js` schickt Inseratsdaten, Renditekennzahlen samt Datenabdeckung und das Vorschaubild in einem einzigen, nicht-agentischen Aufruf und erzwingt die Antwort als Tool-Call (Urteil plus Begründung). Prompt-Injection kann deshalb höchstens ein falsches Urteil erzeugen. Für eine Übernahme müsste die frei wählbare `baseUrl` noch gegen interne Ziele abgesichert werden.  
  _Upstream:_ Upstream ruft selbst keine LLM-APIs auf und bindet KI nur von außen über den MCP-Server an. Die frei wählbare `baseUrl` im Fork läuft nicht durch Upstreams `security/outboundUrl.js`.  
  Branch `master` · Dateien: `lib/services/ai/plainRater.js`, `lib/services/ai/aiProviderAdapters.js`, `lib/services/ai/defaultRatingInstructions.js`, `lib/api/routes/aiProviderRouter.js` · Commits: [`c50c0af`](https://github.com/satty008/fredy/commit/c50c0af75f), [`ff03da5`](https://github.com/satty008/fredy/commit/ff03da5749), [`e67a9ef`](https://github.com/satty008/fredy/commit/e67a9ef89b)
- **Kaufpreisfaktor und Investment-Urteil (Cashflow, DSCR, Eigenkapitalrendite)** (Filter & Suche; neu; Nutzen mittel, Aufwand mittel)  
  `immocockpitVerdict.js` rechnet für Kaufinserate mit festen Annahmen: 85 % Finanzierung zu 4,6 % Zins und 2 % Tilgung, Grunderwerbsteuer je Bundesland, wobei das Bundesland aus der PLZ abgeleitet wird (`germanyTaxData.json`), sowie ein Steuerprofil. Daraus ergeben sich Bruttorendite, Nettorendite, Cashflow nach Steuern, DSCR und Eigenkapitalrendite im ersten Jahr, die zu einem Score von 0–8 und damit zu good/maybe/bad zusammengefasst werden. Badges in Grid, Tabelle und Detailseite zeigen dieses Urteil und den Kaufpreisfaktor (≤20 grün, ≤25 gelb), und für beide gibt es eigene Filter. Ein Button öffnet das Inserat mit vorbelegten Werten im externen Rechner Immocockpit des Fork-Autors.  
  _Upstream:_ Upstream hat Grunderwerbsteuer je Bundesland (`finance/constants.js`), rechnet damit aber nur die Selbstnutzer-Finanzierung; Kaufpreisfaktor, Cashflow- und DSCR-Urteil fehlen. Der Deep-Link hängt am privaten Tool des Fork-Autors.  
  Branch `master` · Dateien: `lib/services/finance/immocockpitVerdict.js`, `lib/services/finance/germanyTaxData.json`, `ui/src/components/listings/ImmocockpitVerdictBadge.jsx`, `ui/src/components/listings/PriceFactorBadge.jsx` · Commits: [`52cce17`](https://github.com/satty008/fredy/commit/52cce178ac), [`0ca5330`](https://github.com/satty008/fredy/commit/0ca5330c35), [`6c3aef0`](https://github.com/satty008/fredy/commit/6c3aef0d86) und 5 weitere
- **KI-Bewertung als strukturierte Spalte (GOOD/MAYBE/BAD) mit Filter, Badge und Sammelauswahl** (MCP & KI; neu; Nutzen mittel, Aufwand mittel)  
  Die neue Spalte `listings.ai_verdict` speichert ein KI-Urteil getrennt von den Notizen. Externe Agenten setzen es über `POST /api/listings/:id/ai-verdict`. In der Übersicht gibt es einen Filter GOOD/MAYBE/BAD/UNRATED und ein Badge am Titel. Über Checkboxen an Karten und Tabellenzeilen lassen sich Inserate auswählen und per 'Rate with AI' samt Modellwahl bewerten. Der Admin-Endpunkt `POST /rate` reicht die IDs an einen externen Rater-Dienst weiter (`FREDY_RATER_URL`/`FREDY_RATER_SECRET`).  
  _Upstream:_ Upstream hat MCP-Tools für Notizen und Merkliste, aber kein strukturiertes KI-Urteil und keine Sammelauswahl zum Bewerten. Der externe Rater-Dienst ist private Infrastruktur des Forks und für sich allein nicht nützlich.  
  Branch `master` · Dateien: `lib/services/storage/migrations/sql/27.ai-verdict.js`, `lib/api/routes/listingsRouter.js`, `ui/src/components/listings/AiVerdictBadge.jsx`, `ui/src/components/listings/ListingsOverview.jsx` · Commits: [`069725f`](https://github.com/satty008/fredy/commit/069725ffac), [`27f3472`](https://github.com/satty008/fredy/commit/27f34720ad), [`042aedf`](https://github.com/satty008/fredy/commit/042aedf85a) und 6 weitere
- **Mehrfachauswahl für Job-, Provider- und Urteilsfilter** (Filter & Suche; neu; Nutzen mittel, Aufwand gering)  
  In der Inseratsübersicht erlauben die Filter für Job, Provider, KI-Urteil und Investment-Urteil jetzt mehrere Werte gleichzeitig, etwa 'good oder maybe' oder zwei bestimmte Jobs. Die Werte stehen kommagetrennt in der URL (`useSearchParamState`). Im SQL entsteht daraus eine IN-Klausel, und für Werte, die sich nicht in WHERE abbilden lassen, wird in JS gegen ein Set geprüft. Ein Chip zeigt alle gewählten Werte.  
  _Upstream:_ In Upstream sind `providerFilter` und Job-Filter in `listingFilters.js` und `listingsStorage.js` nur Einzelwerte.  
  Branch `master` · Dateien: `lib/services/storage/listingsStorage.js`, `lib/api/routes/listingsRouter.js`, `ui/src/services/listings/listingFilters.js`, `ui/src/components/listings/ListingsFilterPanel.jsx` · Commits: [`c5edfc8`](https://github.com/satty008/fredy/commit/c5edfc814c), [`8d658b0`](https://github.com/satty008/fredy/commit/8d658b0403)
- **PWA: Fredy auf dem Homescreen installieren** (UI/UX; neu; Nutzen mittel, Aufwand gering)  
  `vite-plugin-pwa` erzeugt ein Manifest und einen Workbox-Service-Worker, der nur die App-Shell vorhält. `/api/*` geht immer ans Netz, Daten sind also nie veraltet. Die Icons (192/512, maskable) basieren auf dem Fredy-Maskottchen, und die Dockerfile kopiert `public/` mit in den Build. Für den Standalone-Modus unter Android nutzt die App-Höhe `100dvh`, damit unten nichts abgeschnitten wird.  
  _Upstream:_ Upstream hat weder Manifest noch Service Worker noch `vite-plugin-pwa`.  
  Branch `master` · Dateien: `vite.config.js`, `index.html`, `public/pwa/icon-512.png`, `Dockerfile` · Commits: [`9d4bea0`](https://github.com/satty008/fredy/commit/9d4bea073c), [`396ad13`](https://github.com/satty008/fredy/commit/396ad13a6e), [`207816c`](https://github.com/satty008/fredy/commit/207816c634)
- **REST-API-Zugriff mit MCP-Bearer-Token** (API & Integration; neu; Nutzen mittel, Aufwand gering)  
  `authHook` in `lib/api/security.js` akzeptiert ohne gültige Session auch `Authorization: Bearer fredy_<token>`. Geprüft wird mit derselben Logik wie beim MCP-Endpunkt (`mcpAuthentication.authenticateRequest`), danach gilt der Nutzer als angemeldet. Skripte und Cronjobs kommen so ohne Session-Cookie an die REST-API.  
  _Upstream:_ Upstream akzeptiert Bearer-Tokens nur am MCP-Endpunkt (`api.js`), die REST-Routen verlangen eine Session.  
  Branch `master` · Dateien: `lib/api/security.js`, `test/api/security.test.js` · Commits: [`09e9bfb`](https://github.com/satty008/fredy/commit/09e9bfbf6c)
- **Standortdaten (Kaufpreis, Miete, Zukunftsatlas-Rang) je Stadt** (Karte & Geodaten; neu; Nutzen niedrig, Aufwand gering)  
  `standortData.js` liest die von Hand gepflegte Datei `conf/standort-data.json` mit Kaufpreis/m², Kaltmiete/m², Bruttorendite und Prognos-Zukunftsatlas-Rängen (gesamt, Stärke, Dynamik) je Stadt und lädt sie bei Änderung neu. Die Zuordnung läuft über Substring-Match des Stadtnamens in Adresse und Titel. Die Listing-API liefert die Werte als `standortData` mit, damit eine KI-Bewertung die Lage einbeziehen kann.  
  _Upstream:_ Upstream hat keine Lagekennzahlen je Stadt. Die Daten im Fork stammen von Hand aus einem Drittanbieter-Tool und decken nur die eigenen Zielstädte ab.  
  Branch `master` · Dateien: `lib/services/finance/standortData.js`, `conf/standort-data.json`, `lib/api/routes/listingsRouter.js` · Commits: [`26cc567`](https://github.com/satty008/fredy/commit/26cc567c61), [`21b5877`](https://github.com/satty008/fredy/commit/21b587778f), [`0de04ce`](https://github.com/satty008/fredy/commit/0de04ce04e)
- **Mobile Layout-Fixes (Detailseite, Statusbutton, Beschreibung)** (UI/UX; teilweise; Nutzen niedrig, Aufwand gering)  
  Behoben werden mehrere Probleme auf schmalen Bildschirmen: Die Detailseite ragt seitlich über den Rand (fehlende explizite Breite im Column-Flex), unter dem Titel klafft eine große Lücke (flex-basis im Spaltenmodus), und lange URLs in der Beschreibung brechen nicht um. Außerdem zeigt der Statusbutton in Tabellenzeilen unter 560px nur noch das Icon, und Chart-Wrapper bekommen `position: relative`.  
  _Upstream:_ Upstream hat inzwischen `width: 100%` an `.listing-detail`, `flex: 0 0 auto` für die Titeladresse und `overflow-wrap: anywhere` in der Beschreibung. Der Statusbutton ohne Label und die Chart-Wrapper fehlen dort noch.  
  Branch `master` · Dateien: `ui/src/views/listings/ListingDetail.less`, `ui/src/views/listings/components/ListingTitleBlock.less`, `ui/src/components/table/ListingsTable.less`, `ui/src/views/listings/components/ListingDescriptionCard.less` · Commits: [`5fafac6`](https://github.com/satty008/fredy/commit/5fafac6ded), [`89484b5`](https://github.com/satty008/fredy/commit/89484b5709), [`08cc0eb`](https://github.com/satty008/fredy/commit/08cc0eb2e8) und 2 weitere

_Nicht berücksichtigt:_ Ignoriert wurden: Star-History-Commits des Bots, CI- und Docker-Anpassungen für das eigene Image (Builds auf `roi-filter`, eigenes ghcr-Image, Deploy-Umstellung), Lint- und Prettier-Fixes, eine Pfadkorrektur in `conf/config.json` und das Einmal-Skript `tools/setNtfyAdapter.js`, das den ntfy-Adapter in alle eigenen Jobs einträgt. Die Branches `claude/*` liegen nicht vor Upstream. Achtung beim Portieren: Die Migrationen 27, 45 und 46 kollidieren mit den Upstream-Nummern.

## MatthiasCK/fredy

[Repository](https://github.com/MatthiasCK/fredy) · Zeitraum: 2026-01 bis 2026-02 · Branches: `mk/master`, `mk/develop`

Der Fork (Stand Februar 2026) baut Fredy zu einem Archiv für ImmoScout-Inserate aus: Inserate bleiben dauerhaft gespeichert, werden mit Detaildaten und lokal gespeicherten Bildern angereichert, und Neueinstellungen derselben Immobilie werden automatisch oder von Hand zu einer Versionskette verknüpft. Vieles davon (Detailseite, Veröffentlichungsdatum, Papierkorb mit Wiederherstellung) hat Upstream inzwischen selbst gebaut. Neu sind weiterhin die Versionsketten, das manuelle Verknüpfen, die ImmoScout-Paginierung und dass Inserate das Löschen eines Jobs überstehen.

- **Manuelles Verknüpfen von Inseraten mit Ähnlichkeitssuche** (UI/UX; neu; Nutzen mittel, Aufwand hoch)  
  Über eine eigene Similarity-API (`similarityRouter.js`) sucht der Nutzer zu einem Inserat Kandidaten für dieselbe Immobilie. Die Treffer werden nach normalisierter Adresse (`addressNormalizer.js`), Geodistanz (`geoMatcher.js`), PLZ, Zimmerzahl und Preis bewertet (`enhancedSimilarityScorer.js`). Bestätigte Paare landen in der Tabelle `manual_property_links` und werden in die Versionskette eingehängt; beim Lösen der Verknüpfung werden manuelle und automatische Verbindungen sauber getrennt. Die Oberfläche besteht aus `SimilarListingSearch` und `SimilarityMatchCard` im Detail-Modal.  
  _Upstream:_ Upstream gleicht Dubletten nur automatisch ab (`listingFingerprint.js`). Es gibt keine Oberfläche, um Inserate von Hand zu verknüpfen, und keine Tabelle für manuelle Links.  
  Branch `mk/master` · Dateien: `lib/api/routes/similarityRouter.js`, `lib/services/similarity/enhancedSimilarityScorer.js`, `lib/services/similarity/manualLinkStorage.js`, `lib/services/similarity/addressNormalizer.js` · Commits: [`0f713f5`](https://github.com/MatthiasCK/fredy/commit/0f713f5fe5), [`cddcb53`](https://github.com/MatthiasCK/fredy/commit/cddcb533cf)
- **ImmoScout-Paginierung mit Abbruch bei bekannten Inseraten und Full-Fetch-Modus** (Provider; neu; Nutzen mittel, Aufwand mittel)  
  Der ImmoScout-Provider holt nicht mehr nur die erste Ergebnisseite der Mobile-API, sondern blättert mit `pagenumber` weiter, in Seiten zu 50 Treffern und höchstens 10 Seiten, mit zufälliger Pause von 1–2 s zwischen den Seiten. Er bricht früh ab, sobald eine Seite nur bekannte Hashes enthält. Ein pro Provider im `ProviderMutator` schaltbarer Full-Fetch-Modus lädt alle Seiten, etwa um ältere Inserate nachzuholen.  
  _Upstream:_ Upstream `lib/services/immoscout/mobileApi.js` ruft pro Lauf genau eine Ergebnisseite ab (`getListings`: "Fetches one page of search results") und kennt keine Paginierung.  
  Branch `mk/master` · Dateien: `lib/provider/immoscout.js`, `ui/src/views/jobs/mutation/components/provider/ProviderMutator.jsx`, `ui/src/services/transformer/providerTransformer.js` · Commits: [`081cde4`](https://github.com/MatthiasCK/fredy/commit/081cde424c)
- **Inserate überstehen das Löschen eines Jobs** (Daten & Speicherung; neu; Nutzen mittel, Aufwand mittel)  
  Der Fork speichert den Jobnamen als `job_name` direkt am Inserat und passt das Löschen von Jobs in `jobStorage.js` so an, dass die zugehörigen Inserate nicht kaskadierend mitgelöscht werden. Damit bleibt das gesammelte Archiv samt Herkunft erhalten, wenn ein Suchauftrag entfernt wird.  
  _Upstream:_ In Upstream löscht `jobStorage.js` die Inserate per `ON DELETE CASCADE` über `job_id` mit.  
  Branch `mk/master` · Dateien: `lib/services/storage/jobStorage.js`, `lib/services/storage/listingsStorage.js`, `lib/services/storage/userStorage.js` · Commits: [`f02375f`](https://github.com/MatthiasCK/fredy/commit/f02375f304)
- **Stadtteil-Anzeige für ImmoScout-Inserate** (Karte & Geodaten; neu; Nutzen niedrig, Aufwand gering)  
  Der Fork liest den Stadtteil aus `adTargetingParameters.obj_regio4` des ImmoScout-Exposés und setzt ihn in Grid und Detailansicht vor die Adresse, wenn er dort noch fehlt (z. B. "Pliensauvorstadt, 73734 Esslingen"). Das ist nützlich, wenn ImmoScout nur PLZ und Ort liefert.  
  _Upstream:_ Upstream wertet `obj_regio4` nirgends aus und nutzt für ImmoScout nur `item.address.line`.  
  Branch `mk/master` · Dateien: `lib/services/immoscout/immoscout-details-extractor.js`, `ui/src/components/grid/listings/ListingsGrid.jsx` · Commits: [`1c10d24`](https://github.com/MatthiasCK/fredy/commit/1c10d24e4c)
- **Versionserkennung für neu eingestellte Inserate (Property Identity + Fuzzy Matching)** (Daten & Speicherung; teilweise; Nutzen mittel, Aufwand hoch)  
  Beim Speichern berechnet der Fork aus Adresse, Größe, Zimmern, Preis und Geodaten eine exakte und eine unscharfe Objekt-Identität (`propertyIdentity.js`, `fuzzyPropertyMatcher.js`). Stellt ein Makler dieselbe Immobilie unter neuer ID wieder ein, verweist das neue Inserat über `previous_version_id` auf das alte, und `change_set` hält die Feldänderungen fest. Ältere Versionen gelten als `is_superseded` und verschwinden aus der Übersicht, auch wenn mehrere Versionen im selben Batch auftauchen. Eine Zeitleiste im Detail-Modal zeigt die ganze Historie samt Preisänderungen und Online-Dauer.  
  _Upstream:_ Upstream erkennt mit `similarity-check/listingFingerprint.js` Dubletten (auch portalübergreifend) und verwirft sie, und `priceHistoryService` verfolgt Preisänderungen am selben Inserat. Eine Versionskette über Neueinstellungen mit eigener Zeitleiste gibt es dort nicht.  
  Branch `mk/master` · Dateien: `lib/services/versioning/versionDetector.js`, `lib/services/versioning/fuzzyPropertyMatcher.js`, `lib/services/versioning/propertyIdentity.js`, `lib/FredyPipelineExecutioner.js` · Commits: [`2698eea`](https://github.com/MatthiasCK/fredy/commit/2698eea686), [`081cde4`](https://github.com/MatthiasCK/fredy/commit/081cde424c)
- **Erweiterte ImmoScout-Detaildaten und lokales Medienarchiv** (Daten & Speicherung; teilweise; Nutzen mittel, Aufwand mittel)  
  `immoscout-details-extractor.js` liest aus dem Exposé zusätzlich Zimmer, Etage, Energieklasse, Heizungsart, Baujahr und Dokumente aus. `mediaDownloader.js` lädt Bilder und Dokumente gedrosselt nach `db/media`, `mediaRouter.js` liefert sie wieder aus, und die Pfade stehen in `local_images` und `local_documents`. So bleiben Fotos und Grundrisse erhalten, auch wenn das Inserat offline geht.  
  _Upstream:_ Upstream hat Zimmer (Migration 16), Baujahr und Energieklasse (Migration 38), Detail-Refetch und vom Nutzer hochgeladene Anhänge (Migration 44). Portalbilder werden dort aber nicht automatisch lokal archiviert.  
  Branch `mk/master` · Dateien: `lib/services/immoscout/immoscout-details-extractor.js`, `lib/services/media/mediaDownloader.js`, `lib/api/routes/mediaRouter.js`, `lib/services/storage/listingsExtendedStorage.js` · Commits: [`2698eea`](https://github.com/MatthiasCK/fredy/commit/2698eea686)
- **Lebenszyklus-Tracking: Veröffentlichungsdatum, Deaktivierung, Online-Dauer** (Daten & Speicherung; teilweise; Nutzen niedrig, Aufwand gering)  
  Der Fork leitet `published_at` aus ImmoScouts relativer Zeitangabe ab, setzt `deactivated_at`, sobald ein Inserat inaktiv wird, und zeigt daraus die Online-Dauer in Tagen. Die Übersicht sortiert standardmäßig nach Veröffentlichungsdatum.  
  _Upstream:_ Upstream hat `published_at` (Migration 42) als Standardsortierung und `inactive_since` (Migration 27). Nur eine ausdrückliche Anzeige der Online-Dauer fehlt dort.  
  Branch `mk/master` · Dateien: `lib/provider/immoscout.js`, `lib/services/storage/listingsStorage.js`, `ui/src/components/listings/ListingDetailModal.jsx` · Commits: [`32f63fc`](https://github.com/MatthiasCK/fredy/commit/32f63fca76)

_Bereits in Upstream vorhanden:_ Ansicht gelöschter Inserate mit Wiederherstellung (Upstream hat eine Ansicht für ausgeblendete Inserate (`hiddenOnly` in `ListingsOverview.jsx`) und den Endpunkt `POST /restore` in `listingsRouter.js`.)

_Nicht berücksichtigt:_ Ignoriert wurden: eigene docker-compose-Dateien für die lokale Instanz (2a3dc3e520, d5ffc3b7a3), .gitignore- und Husky-Anpassungen sowie eine fork-eigene CLAUDE.md. Branch `master` liegt nicht vor Upstream, `mk/develop` ist identisch mit `mk/master`.

## realDayaa/fredy

[Repository](https://github.com/realDayaa/fredy) · Zeitraum: 2026-03 bis 2026-10 · Branches: `master`, `feat/persist-filters`, `fix/kleinanzeigen-address`

Aktiv gepflegter Fork, der auf aktuellem Upstream (29.x) aufsetzt und vor allem den Wohnungsmarkt in Halle (Saale) abdeckt: ein Dutzend Provider für lokale Wohnungsgenossenschaften und Vermieter sowie ISIHOME. Dazu kommen ein lokaler Bild-Cache für Inseratsfotos, einige Robustheits-Fixes (Engel & Völkers, Browser-Schließen) und kleinere UI-Anpassungen; ältere Nebenbranches (Filter-Persistenz, Kleinanzeigen-Straße) sind upstream größtenteils überholt.

- **Fehler beim Schließen des Browsers blockiert Job nicht mehr** (Bugfix; neu; Nutzen hoch, Aufwand gering)  
  In jobExecutionService wird closeBrowser im finally-Block in try/catch gekapselt. Vorher konnte eine Exception dort markFinished() überspringen, wodurch der Job dauerhaft als 'läuft' galt und bis zum Neustart nicht mehr ausgeführt wurde. Mit Tests.  
  _Upstream:_ Upstream ruft im finally-Block weiterhin ungeschützt await puppeteerExtractor.closeBrowser(browser) vor markFinished auf.  
  Branch `master` · Dateien: `lib/services/jobs/jobExecutionService.js`, `test/services/jobs/jobExecutionService.test.js` · Commits: [`6e86fd7`](https://github.com/realDayaa/fredy/commit/6e86fd751c)
- **12 Provider für Wohnungsgenossenschaften und Vermieter in Halle (Saale)** (Provider; neu; Nutzen mittel, Aufwand gering)  
  Neue Scraper für Frohe Zukunft, GWG Eigene Scholle, GWG Gartenstadt, GWG Halle-Neustadt, HA-NEUer WG, Hallesche BWG, HWG, LEUWO, living halle, TAG Wohnen, WG Eisenbahn und WG Freiheit. Meist cheerio-basiert über die Angebotsseiten; LEUWO holt sich ein Token von der Suchseite und fragt dann die JSON-Schnittstelle von ivm-professional ab, TAG Wohnen nutzt Puppeteer. Alle deklarieren countries und Preisbereichs-Abdeckung nach Upstream-Konvention und haben Fixture-Tests; damit werden Genossenschaftswohnungen erfasst, die auf den großen Portalen nicht erscheinen.  
  _Upstream:_ Upstream lib/provider enthält keinen dieser Anbieter und keinen Provider mit Bezug zu Halle.  
  Branch `master` · Dateien: `lib/provider/froheZukunft.js`, `lib/provider/leuwo.js`, `lib/provider/tagWohnen.js`, `lib/provider/hwg.js` · Commits: [`136fc2b`](https://github.com/realDayaa/fredy/commit/136fc2b3b2), [`e8af654`](https://github.com/realDayaa/fredy/commit/e8af654473), [`ef31c31`](https://github.com/realDayaa/fredy/commit/ef31c3184f) und 4 weitere
- **Lokaler Bild-Cache für Inseratsfotos mit manuellem Neuladen** (Daten & Speicherung; neu; Nutzen mittel, Aufwand mittel)  
  Neuer Pipeline-Schritt _cacheImages lädt das Titelbild jedes neuen Inserats einmalig herunter (Timeout, 8-MB-Limit, MIME-Erkennung per Magic Bytes) und speichert es als BLOB in der Tabelle listing_image_cache; UI, Kartenpopup und das MCP-Foto-Tool liefern danach diese Kopie statt Hotlinks aus. In der Detailansicht kann man das Bild neu laden; Provider können dafür optional rediscoverImage() anbieten, um eine verschobene Bild-URL von der Live-Seite neu zu ermitteln. Das verhindert, dass Fotos später durch Platzhalter oder tote Links ersetzt werden.  
  _Upstream:_ Upstream verlinkt image_url weiterhin direkt; es gibt keinen Bild-Cache, und die Migrationsnummer 32 ist upstream bereits durch configured-adapters belegt.  
  Branch `master` · Dateien: `lib/services/images/listingImageCache.js`, `lib/services/images/listingImageReload.js`, `lib/services/images/imageFormat.js`, `lib/services/storage/migrations/sql/32.listing-image-cache.js` · Commits: [`7412b96`](https://github.com/realDayaa/fredy/commit/7412b96255), [`28d9af1`](https://github.com/realDayaa/fredy/commit/28d9af1335), [`70e99aa`](https://github.com/realDayaa/fredy/commit/70e99aa24f) und 1 weitere
- **Engel & Völkers: HTTP 500 bei Postleitzahl als placeName vermeiden** (Bugfix; neu; Nutzen mittel, Aufwand gering)  
  Die Suche von Engel & Völkers antwortet mit HTTP 500, wenn der URL-Parameter placeName nur eine Postleitzahl ist. stripBrokenPlaceName() entfernt einen rein numerischen placeName vor dem Abruf, der eigentliche Geofilter über placeIds[] und searchRadius bleibt erhalten. Mit Test.  
  _Upstream:_ Upstream lib/provider/engelVoelkers.js behandelt placeName nicht.  
  Branch `master` · Dateien: `lib/provider/engelVoelkers.js`, `test/provider/engelVoelkers.test.js` · Commits: [`3109fb5`](https://github.com/realDayaa/fredy/commit/3109fb55f5)
- **Provider ISIHOME mit Paginierung und Detailabruf** (Provider; neu; Nutzen niedrig, Aufwand gering)  
  Scraper für isihome.de, der über /page/N/ alle Ergebnisseiten abläuft (mit Obergrenze gegen Endlosschleifen) und Zimmer, numerischen Preis und Fläche liest. Über fetchDetails werden aus dem Exposé die Abschnitte Objektbeschreibung, Ausstattung und Lage per Puppeteer als Beschreibung übernommen. Die Konfiguration wird pro Lauf neu erzeugt (createConfig), damit parallele Jobs sich nicht gegenseitig überschreiben.  
  _Upstream:_ Kein ISIHOME-Provider in Upstream lib/provider.  
  Branch `master` · Dateien: `lib/provider/isiHome.js`, `test/provider/isiHome.test.js`, `test/provider/isiHomeDetails.test.js` · Commits: [`50def12`](https://github.com/realDayaa/fredy/commit/50def12871), [`92655ba`](https://github.com/realDayaa/fredy/commit/92655bacd0), [`41d341d`](https://github.com/realDayaa/fredy/commit/41d341da53) und 3 weitere
- **Sidebar-Einträge als echte Links, Update-Hinweis nur für Admins** (UI/UX; neu; Nutzen niedrig, Aufwand gering)  
  Die Navigationsziele der in 29.x neu gebauten Sidebar sind wieder react-router-<Link>s statt Buttons mit navigate(), sodass Mittelklick bzw. Strg/Cmd-Klick einen neuen Tab öffnet. Der Footer zeigt den Hinweis auf eine neue Version nur Admins, weil normale Nutzer nicht updaten können.  
  _Upstream:_ Upstream Navigation.jsx nutzt onClick={() => navigate(...)}, FredyFooter zeigt hasUpdate allen Nutzern.  
  Branch `master` · Dateien: `ui/src/components/navigation/Navigation.jsx`, `ui/src/components/footer/FredyFooter.jsx`, `ui/src/App.jsx` · Commits: [`b0412c6`](https://github.com/realDayaa/fredy/commit/b0412c6f7d), [`9b5d36b`](https://github.com/realDayaa/fredy/commit/9b5d36b729)
- **Listen-Filter und Sortierung im localStorage merken** (UI/UX; teilweise; Nutzen niedrig, Aufwand gering)  
  Seite, Sortierung und die Filter für Merkliste, Job, Aktivität und Provider in der Listing-Übersicht werden in localStorage gespeichert und beim nächsten Öffnen wiederhergestellt (Upstream-PR #290, nicht gemergt).  
  _Upstream:_ Upstream hält Filter inzwischen per useUrlState in der URL (ListingsOverview.jsx), also teilbar und beim Zurücknavigieren erhalten, aber nicht sitzungsübergreifend gespeichert.  
  Branch `feat/persist-filters` · Dateien: `ui/src/components/grid/listings/ListingsGrid.jsx` · Commits: [`d5d67d9`](https://github.com/realDayaa/fredy/commit/d5d67d9400)

_Bereits in Upstream vorhanden:_ Kleinanzeigen: Straße aus der Detailseite, per Einstellung schaltbar (Upstream kleinanzeigen.js liest #street-address und JSON-LD von der Detailseite, gesteuert über die generische Benutzereinstellung provider_details.)

_Nicht berücksichtigt:_ Ignoriert: Lint-/Lockfile-Commits, CloakBrowser-Update, private docker-compose-Anpassungen (Lizenzschlüssel per .env, Favicon), das Entfernen des Support-Buttons, das Schwärzen von API-Keys in Fixtures sowie die Branches improvements, listing-management, 185-bug und feature/smtp, deren Inhalt upstream schon enthalten ist.

## aselekoglu/arpa-house-search

[Repository](https://github.com/aselekoglu/arpa-house-search) · Zeitraum: 2026-09 · Branches: `main`, `deploy/vercel-private`

Eigenständiges Derivat 'ARPA House Search' auf Basis des letzten MIT-lizenzierten Fredy-Stands (2025-12-10), umbenannt und neu gestaltet. Neben den unverändert übernommenen Fredy-Jobs baut es eine parallele 'M1'-Architektur auf: kanonisches Listing-Modell mit Provider-Registry, Realtor.ca (Kanada, Mietwohnungen), frei definierbare 'Custom Sources' per Selektor-Rezept mit SSRF-Schutz, Search Profiles mit eigenem Scheduler, ein quellenübergreifender Listing-Feed mit synchronisierter MapLibre-Karte sowie ein privates Vercel/Neon-Deployment.

- **Custom Sources: eigene Quellen per Selektor-Rezept mit Source Builder** (Provider; neu; Nutzen hoch, Aufwand hoch)  
  Nutzer definieren im neuen 'Sources'-Bereich eine Quelle ohne Code: Such-URL, CSS-Selektoren (listing, title, price, url, image, beds, baths, address), Paginierung über 'next'-Selektor mit maxPages und Modus static (fetch + Parser) oder browser (Puppeteer mit waitForSelector/waitUntil). Ein strikter Recipe-v1-Validator lehnt unbekannte Felder ab, eine 'Test Extraction' liefert vor der Aktivierung einen Bericht, und Quellen durchlaufen einen Lebenszyklus (Entwurf/aktiv, Aktivierung gesperrt bei ungespeicherten Änderungen). Die Datensätze werden auf das kanonische Listing gemappt und sind pro Nutzer abgegrenzt.  
  _Upstream:_ Upstream kennt nur fest programmierte Provider in lib/provider/*.js; benutzerdefinierte Quellen über Selektoren gibt es nicht.  
  Branch `main` · Dateien: `lib/providers/custom-source/recipe.js`, `lib/providers/custom-source/staticExtractor.js`, `lib/providers/custom-source/browserExtractor.js`, `lib/services/customSources/sourceTestService.js` · Commits: [`056e3ef`](https://github.com/aselekoglu/arpa-house-search/commit/056e3ef4f8), [`9f35889`](https://github.com/aselekoglu/arpa-house-search/commit/9f3588962a), [`bcc5df1`](https://github.com/aselekoglu/arpa-house-search/commit/bcc5df18c4) und 13 weitere
- **SSRF-Schutz für vom Nutzer angegebene Ziel-URLs** (Sicherheit; neu; Nutzen mittel, Aufwand gering)  
  Weil Custom Sources beliebige URLs abrufen, prüft networkSafety.js jede Anfrage: nur http(s), keine eingebetteten Zugangsdaten, kein localhost, und die per DNS aufgelösten Adressen müssen öffentlich sein (private, Loopback-, Link-Local-, CGNAT-, Dokumentations- und Multicast-Bereiche für IPv4/IPv6 werden abgelehnt). Die Prüfung wird bei jedem Request und jeder Weiterleitung wiederholt; im Browser-Modus geschieht das per Request-Interception, was DNS-Rebinding erschwert.  
  _Upstream:_ Upstream ruft nur bekannte Portal-Domains ab und hat daher keine solche Prüfung; relevant nur zusammen mit benutzerdefinierten Quellen.  
  Branch `main` · Dateien: `lib/providers/custom-source/networkSafety.js`, `lib/providers/custom-source/browserExtractor.js`, `lib/providers/custom-source/recipe.js` · Commits: [`9f35889`](https://github.com/aselekoglu/arpa-house-search/commit/9f3588962a), [`bcc5df1`](https://github.com/aselekoglu/arpa-house-search/commit/bcc5df18c4), [`c068161`](https://github.com/aselekoglu/arpa-house-search/commit/c06816189c) und 1 weitere
- **Provider Realtor.ca (Kanada, Mietangebote)** (Provider; neu; Nutzen mittel, Aufwand mittel)  
  Neuer Provider für das kanadische Portal Realtor.ca: Der Suchbereich wird über Location.svc/SubAreaSearch zu einem Viewport aufgelöst, danach wird AsyncPropertySearch_Post für Mietangebote mit RentMin/RentMax, BedRange und bis zu 50 Seiten abgefragt. Die Anfragen laufen in einer Puppeteer-Seite auf der realtor.ca-Origin mit persistentem Profil, Cloudflare-Challenges werden als eigener Fehler erkannt; ein Adapter mappt die Treffer (Adresse, Preis, Zimmer, Koordinaten, Bild) auf das kanonische Listing. Offline-Fixtures sichern das Verhalten ab.  
  _Upstream:_ Upstream hat keinen nordamerikanischen Provider und keinen Realtor.ca-Code.  
  Branch `main` · Dateien: `lib/clients/realtor/client.js`, `lib/clients/realtor/browserTransport.js`, `lib/providers/adapters/realtor-ca.js` · Commits: [`1570d1f`](https://github.com/aselekoglu/arpa-house-search/commit/1570d1f120), [`f36b666`](https://github.com/aselekoglu/arpa-house-search/commit/f36b666a6f), [`f5247f4`](https://github.com/aselekoglu/arpa-house-search/commit/f5247f4a06) und 2 weitere
- **Zustandsloser Betrieb auf Vercel mit Neon-Postgres** (Deployment & Betrieb; neu; Nutzen niedrig, Aufwand hoch)  
  Der Branch deploy/vercel-private ergänzt einen nativen Neon-HTTP-SQL-Client ohne zusätzliche Abhängigkeit, ein Postgres-Schema mit nutzerbezogenem Store, einen zustandslosen Server (server.js), ein Dockerfile mit System-Chromium für Vercel und einen täglichen Vercel-Cron für fällige Search Profiles (abgesichert über CRON_SECRET). Er deckt nur die neue M1-Oberfläche ab und ist auf eine private Einzelnutzer-Instanz zugeschnitten.  
  _Upstream:_ Upstream ist rein selbst gehostet mit SQLite und hat keine Postgres- oder Serverless-Variante.  
  Branch `deploy/vercel-private` · Dateien: `lib/production/neonSql.js`, `lib/production/store.js`, `lib/production/runtime.js`, `server.js` · Commits: [`b3db96c`](https://github.com/aselekoglu/arpa-house-search/commit/b3db96c830), [`d312aa6`](https://github.com/aselekoglu/arpa-house-search/commit/d312aa6683), [`7e3a178`](https://github.com/aselekoglu/arpa-house-search/commit/7e3a1782dd) und 4 weitere
- **Search Profiles mit Scheduler, Run Now und Laufhistorie** (Filter & Suche; teilweise; Nutzen niedrig, Aufwand hoch)  
  Ein Search Profile bündelt mehrere Quellen (eingebaute Provider und eigene Custom Sources, Eigentümerschaft wird geprüft), Filter (Preis, Zimmer) und einen Zeitplan von 1 bis 1440 Minuten. Ein Scheduler startet fällige Profile, 'Run Now' löst sofort aus, eine Sperre verhindert parallele Läufe, und jeder Lauf wird mit Status pro Quelle (completed/failed/partial) in eigenen Tabellen protokolliert. Dazu gibt es API und eine eigene UI-Seite.  
  _Upstream:_ Upstream-Jobs bieten bereits mehrere Provider pro Suche, Intervall und manuellen Start; neu wären nur die persistente Laufhistorie mit Status pro Quelle.  
  Branch `main` · Dateien: `lib/domain/search/searchProfile.js`, `lib/services/searchProfiles/searchProfileExecutionService.js`, `lib/services/searchProfiles/searchProfileScheduler.js`, `lib/services/storage/searchProfileRunStorage.js` · Commits: [`488bda7`](https://github.com/aselekoglu/arpa-house-search/commit/488bda7bee), [`67bda8b`](https://github.com/aselekoglu/arpa-house-search/commit/67bda8b27a), [`3018eb1`](https://github.com/aselekoglu/arpa-house-search/commit/3018eb1fa2) und 14 weitere
- **Kanonisches Listing-Modell und quellenübergreifender Listing-Feed** (Daten & Speicherung; teilweise; Nutzen niedrig, Aufwand hoch)  
  createCanonicalListing validiert und normalisiert jedes Listing (Pflichtfelder, Koordinatenbereiche, eindeutig kodierte Identität aus Quelle und ID), eine zustandslose ProviderRegistry mit Provider-Vertrag registriert Adapter. Treffer werden als canonical_listings plus Profil-Treffer gespeichert, Batches vor dem Schreiben komplett validiert (keine Teil-Schreibvorgänge), und ein Feed-API liefert die Listings eines Profils über alle Quellen sortiert nach neu, Preis auf- oder absteigend; die alte Listings-Seite wird durch diesen Feed ersetzt.  
  _Upstream:_ Upstream speichert Listings aller Provider bereits gemeinsam in einer Tabelle mit Sortierung und Filtern; der Fork baut dazu eine parallele, inkompatible Struktur.  
  Branch `main` · Dateien: `lib/domain/listing/canonicalListing.js`, `lib/providers/core/ProviderRegistry.js`, `lib/services/listingFeed/listingFeedService.js`, `lib/services/storage/canonicalListingStorage.js` · Commits: [`271e6b2`](https://github.com/aselekoglu/arpa-house-search/commit/271e6b23f3), [`eb35ce4`](https://github.com/aselekoglu/arpa-house-search/commit/eb35ce4d32), [`7f507c9`](https://github.com/aselekoglu/arpa-house-search/commit/7f507c929c) und 7 weitere
- **Listen- und Kartenansicht mit synchronisierter Auswahl** (UI/UX; teilweise; Nutzen niedrig, Aufwand mittel)  
  Die Listings-Seite zeigt Feed-Karten und eine MapLibre-Karte (OpenFreeMap-Stil, gepinnte Version per Runtime-Loader) nebeneinander; Auswahl in der Liste hebt den Marker hervor und umgekehrt. Die Auswahl ist per Tastatur bedienbar, ein eigenes Kartenmodell projiziert nur Listings mit gültigen Koordinaten.  
  _Upstream:_ Upstream hat eine eigene MapLibre-Kartenseite (ui/src/views/listings/Map.jsx) mit Popups und Filtern, aber keine kombinierte Listen-/Kartenansicht mit gekoppelter Auswahl.  
  Branch `main` · Dateien: `ui/src/views/listings/ListingMap.jsx`, `ui/src/views/listings/listingMapModel.js`, `ui/src/views/listings/maplibreRuntime.js`, `ui/src/views/listings/Listings.jsx` · Commits: [`3d1fe4d`](https://github.com/aselekoglu/arpa-house-search/commit/3d1fe4dd1f), [`e110700`](https://github.com/aselekoglu/arpa-house-search/commit/e110700d23), [`e890686`](https://github.com/aselekoglu/arpa-house-search/commit/e890686118) und 2 weitere

_Nicht berücksichtigt:_ Ignoriert: Umbenennung und neues Design als 'ARPA' (Logo, Tokens, UI-Primitives, Login, Navigation), MIT-Baseline- und Lizenzdokumente, deaktivierte Telemetrie (Upstream hat dafür einen Schalter), Planungsdokumente, eigene CI-Workflows und Contract- bzw. E2E-Tests (Ottawa) für die Fork-Architektur, ein 'noop'-Commit und die Feature-Branches m1/*, die vollständig in main enthalten sind (m1/custom-source-browser nur als Einzel-Commits statt des in main gesquashten c06816189c).

## sidneypiper/fredy

[Repository](https://github.com/sidneypiper/fredy) · Zeitraum: 2026-08 bis 2026-09 · Branches: `main`

Aktiver Fork (Basis 2026-08-13) mit Schwerpunkt auf schneller Bewerbung bei Mietwohnungen: KI-generierte, personalisierte Nachrichten an Vermieter direkt in den Benachrichtigungen, ein eigener Provider für das ImmoScout24-Mieter-Netzwerk, grobe Geokodierung für unvollständige Adressen und weniger Detailseitenabrufe gegen Bot-Erkennung. Einige Teile (Immowelt-BFF, Fahrzeit-Filter pro Job) hat Upstream inzwischen selbst.

- **Provider ImmoScout24 Mieter-Netzwerk** (Provider; neu; Nutzen mittel, Aufwand gering)  
  Neuer Provider immoscoutTenantNetwork (ID immoscout_tenant_network), der den ImmoScout-Provider vollständig wiederverwendet und nur die Such-URL um features=tenantNetwork ergänzt; weil die API tenantNetwork=true inzwischen mit 412 ablehnt, wird der gemischte Pool clientseitig über das tenantNetworkTag gefiltert. Dafür reicht der URL-Übersetzer den Parameter features nun an die Mobile-API durch. So lassen sich Nachmieter-Angebote aus dem Mieter-Netzwerk getrennt suchen und benachrichtigen.  
  _Upstream:_ Upstream erlaubt in lib/services/immoscout/param-support.js nur den Parameter tenantNetwork, kennt aber weder features noch einen eigenen Mieter-Netzwerk-Provider.  
  Branch `main` · Dateien: `lib/provider/immoscoutTenantNetwork.js`, `lib/provider/immoscout.js`, `lib/services/immoscout/immoscout-web-translator.js`, `test/provider/immoscoutTenantNetwork.test.js` · Commits: [`21023cc`](https://github.com/sidneypiper/fredy/commit/21023cccd1), [`28eb3e3`](https://github.com/sidneypiper/fredy/commit/28eb3e305f), [`75d1a88`](https://github.com/sidneypiper/fredy/commit/75d1a884de)
- **Detailseiten erst nach allen Filtern abrufen** (Performance; neu; Nutzen mittel, Aufwand mittel)  
  Die Pipeline geokodiert zuerst mit der Adresse aus der Trefferliste und ruft fetchDetails erst auf, wenn ein Listing alle Filter (Specs, Ähnlichkeit, Gebiet, Fahrzeit) passiert hat; der Blacklist-Nachfilter auf die Beschreibung läuft danach und löscht Treffer aus der DB. Neue Funktion updateListingDetails schreibt die angereicherten Felder (Beschreibung, Zimmer, Fläche) in die bereits gespeicherte Zeile zurück. Das spart Detailseiten-Requests und senkt so das Risiko von Bot-Sperren.  
  _Upstream:_ Im Upstream-Master läuft _fetchDetails weiterhin direkt nach _filterBySpecs und vor Ähnlichkeits-, Gebiets- und Pendelzeitfilter.  
  Branch `main` · Dateien: `lib/FredyPipelineExecutioner.js`, `lib/services/storage/listingsStorage.js`, `test/pipeline_filtering.test.js` · Commits: [`816e4fc`](https://github.com/sidneypiper/fredy/commit/816e4fc5b3), [`151b49e`](https://github.com/sidneypiper/fredy/commit/151b49e3ba)
- **ImmoScout: Einzugsdatum, Shape-Fix und pagesize** (Provider; neu; Nutzen mittel, Aufwand gering)  
  fetchDetails liest das Einzugsdatum aus dem Exposé (strukturiertes Attribut "Bezugsfrei ab" bzw. Freitextmuster wie "Nachmieter ab dem …") und speichert es als ISO-Datum in listing.moveInDate; die Datumslogik liegt in lib/utils/parse-date.js. Base64-Shapes mit Zeilenumbrüchen/Leerzeichen werden vor der Dekodierung bereinigt, sodass Polygon-Suchen nicht mehr mit 400 scheitern. Zusätzlich wird pagesize an die Mobile-API durchgereicht.  
  _Upstream:_ Upstream extrahiert kein Einzugsdatum, BASE64_SHAPE_PATTERN in lib/services/immoscout/shape.js lässt keine Leerzeichen zu, und pagesize wird in param-support.js bewusst als Rauschen verworfen.  
  Branch `main` · Dateien: `lib/provider/immoscout.js`, `lib/utils/parse-date.js`, `lib/services/immoscout/immoscout-web-translator.js` · Commits: [`0b394eb`](https://github.com/sidneypiper/fredy/commit/0b394eba62), [`8f78724`](https://github.com/sidneypiper/fredy/commit/8f78724ca0), [`e84e995`](https://github.com/sidneypiper/fredy/commit/e84e99584a)
- **Aktivitätsprüfung gespeicherter Listings abschaltbar** (Deployment & Betrieb; neu; Nutzen niedrig, Aufwand gering)  
  Der Checker, der gespeicherte Listings alle vier Stunden auf Erreichbarkeit prüft, läuft nur noch, wenn in den Ausführungseinstellungen activeCheckEnabled gesetzt ist (Standard aus, wirkt ohne Neustart). Das spart zusätzliche Requests an die Portale und verringert das Sperr-Risiko für Nutzer, die nur neue Angebote brauchen.  
  _Upstream:_ Upstream lib/services/crons/listing-alive-cron.js startet runActiveChecker immer, ohne Einstellungsschalter.  
  Branch `main` · Dateien: `lib/services/listings/listingActiveService.js`, `lib/api/routes/generalSettingsRoute.js`, `ui/src/views/admin/pages/ExecutionPage.jsx` · Commits: [`80b0d2d`](https://github.com/sidneypiper/fredy/commit/80b0d2da43)
- **KI-personalisierte Nachricht an Vermieter pro Listing** (MCP & KI; teilweise; Nutzen hoch, Aufwand hoch)  
  Pro Job lässt sich ein Basistext mit Platzhaltern ({{GREETING}}, {{AD_SENTENCE}}, {{MOVE_IN_DATE}}, {{AGREEMENTS}}) hinterlegen, optional mit eigenen Texten je Provider (z. B. Sie-Form für Makler, Du-Form fürs Mieter-Netzwerk). Nach allen Filtern erzeugt lib/services/ai/messageComposer.js über einen OpenAI-kompatiblen Ollama-Cloud-Client (Circuit-Breaker, Retry, Fail-open) für jedes überlebende Listing eine Nachricht mit Anrede aus dem Anbieternamen und einem kurzen Satz zur Anzeige; fällt das Modell aus, greift ein reiner Template-Fallback. Die Nachricht wird gespeichert (Migration 37), in der Detailansicht mit Kopierknopf gezeigt und in allen Benachrichtigungs-Adaptern mitgeschickt; Telegram kann sie optional als eigene, separat kopierbare Nachricht senden. Neue Einstellungsseite "AI" mit maskiertem API-Key; Kleinanzeigen liefert dafür zusätzlich den Verkäufernamen.  
  _Upstream:_ Upstream hat seit 2026-09 template-basierte Anschreiben auf Abruf (lib/services/application/, get_application_letter), aber keine LLM-Anbindung und keine automatisch erzeugte Nachricht in den Benachrichtigungen.  
  Branch `main` · Dateien: `lib/services/ai/messageComposer.js`, `lib/services/ai/ollamaClient.js`, `lib/notification/personalizedMessage.js`, `lib/FredyPipelineExecutioner.js` · Commits: [`eef7214`](https://github.com/sidneypiper/fredy/commit/eef7214132), [`ce90dc9`](https://github.com/sidneypiper/fredy/commit/ce90dc99d6), [`1da6086`](https://github.com/sidneypiper/fredy/commit/1da6086da6) und 10 weitere
- **Grobe Geokodierung für unvollständige Adressen** (Karte & Geodaten; teilweise; Nutzen mittel, Aufwand mittel)  
  Findet Nominatim die volle Adresse nicht, versucht geoCodingService.js schrittweise gröbere Anfragen (Stadtteil-Zusätze werden abgeschnitten, z. B. bis auf PLZ + Ort), statt den -1/-1-Marker zu setzen. Jede Koordinate erhält eine neue Spalte geocode_precision (exact/coarse, Migration 35); grobe Treffer bekommen Pin, Distanzen und Fahrzeit-Schätzung, werden vom Gebietsfilter mit konfigurierbarem Puffer (coarseAreaBufferMeters, Standard 5 km zur Polygonkante) großzügig behandelt und in Tabelle, Detailansicht und Karten-Popup mit einem "ca."-Badge markiert.  
  _Upstream:_ Upstream geoCodingService.js versucht als einzigen Fallback die Adresse ohne abschließende Klammer und kennt weder eine Genauigkeitsspalte noch einen Puffer im Gebietsfilter.  
  Branch `main` · Dateien: `lib/services/geocoding/geoCodingService.js`, `lib/services/listings/distanceCalculator.js`, `lib/FredyPipelineExecutioner.js`, `lib/services/storage/migrations/sql/35.listing-geocode-precision.js` · Commits: [`6bafa90`](https://github.com/sidneypiper/fredy/commit/6bafa90dc2)

_Bereits in Upstream vorhanden:_ Fahrzeit-Filter pro Job (Upstream hat seit 2026-08-16 einen Pendelzeit-Filter pro Job (lib/utils/commuteBudget.js, CommuteFilter.jsx) mit den Aktionen mark/notify/exclude und Toleranz für Schätzungen; nur der Extra-Grenzwert für grobe Geokodierung fehlt dort.)

_Nicht berücksichtigt:_ Ignoriert: Nachport des Upstream-Immowelt-BFF (01ddb8cb73, upstream seit fe7f443), übernommene Upstream-Kleinanzeigen-Fixes (ef4e61fe10, aa5f4a9841, 0deb933c1f), immobilien.de-JSON-LD-Fix (60b4ebc255, Provider upstream seit 2026-09 neu geschrieben), Prompt-Feintuning-Commits, Layout-Kleinkram der Detailansicht, Entfernen des Versionsbanners, CI-Trigger und Dependency-Bump.

## Gabko14/fredy-ch

[Repository](https://github.com/Gabko14/fredy-ch) · Zeitraum: 2026-01 bis 2026-02 · Branches: `master`, `feature/swiss-providers`, `claude/fix-flatfox-results-leBuP`

Schweiz-Anpassung auf einem Upstream-Stand von Januar/Februar 2026, größtenteils von Agenten erzeugt. Übrig bleiben ein ImmoScout24.ch-Provider über den kostenpflichtigen Bright Data Web Unlocker, Flatfox, CHF-Anzeige pro Provider und Schweizer Karten- und Geocoding-Voreinstellungen. Die Branches agent1/work, agent2/work und claude/sync-fork-upstream sind Teilmengen von master. feature/swiss-providers fasst den Endstand in einem Commit zusammen (Upstream-PR 272, nicht gemergt). Homegate, Newhome, Anibis und ein 2Captcha-DataDome-Solver wurden gebaut und später wieder entfernt.

- **ImmoScout24.ch-Provider über Bright Data Web Unlocker** (Provider; neu; Nutzen mittel, Aufwand mittel)  
  Provider für immoscout24.ch (SMG, technisch unabhängig von ImmoScout24.de). Er holt die Suchseite über die Bright-Data-Request-API, um DataDome zu umgehen, und liest die Inserate aus window.__INITIAL_STATE__ mit einem robusten Klammer-Parser (extractEmbeddedJson in lib/utils.js). Paginiert wird über den Parameter pn, standardmäßig bis 5 Seiten mit 2 s Pause, um die Kosten zu begrenzen. API-Token und Zone von Bright Data werden in den General Settings eingetragen und als globalSettings durch jobExecutionService und FredyPipelineExecutioner an die Provider gereicht.  
  _Upstream:_ Upstream hat keinen immoscout24.ch-Provider; flatfox.js nennt ImmoScout24.ch dort ausdrücklich als nicht erreichbar hinter Bot-Schutz. Die PRs 265, 269, 271 und 272 wurden nicht gemergt.  
  Branch `feature/swiss-providers` · Dateien: `lib/provider/immoscout24ch.js`, `lib/utils.js`, `ui/src/views/generalSettings/GeneralSettings.jsx`, `lib/services/jobs/jobExecutionService.js` · Commits: [`637496e`](https://github.com/Gabko14/fredy-ch/commit/637496e882), [`4fbc212`](https://github.com/Gabko14/fredy-ch/commit/4fbc212a23), [`e5b7c8c`](https://github.com/Gabko14/fredy-ch/commit/e5b7c8c471) und 6 weitere
- **Währung pro Provider (CHF statt €)** (Länder & Lokalisierung; neu; Nutzen mittel, Aufwand gering)  
  Jeder Provider bekommt in metaInformation ein Feld currency (EUR für deutsche, CHF für Schweizer Provider). Listings-Grid, Detailseite und Karte zeigen die Währung des jeweiligen Providers statt eines fest eingetragenen Euro-Zeichens, das Dashboard formatiert den Durchschnittspreis ohne Währungssymbol. Außerdem versteht das alte extractNumber in listingsStorage das Schweizer Tausendertrennzeichen (1'690) und Präfixe wie 'CHF 1500'.  
  _Upstream:_ Upstream formatiert Preise in priceService.js weiterhin fest als EUR, auch für flatfox.ch. Das Zahlen-Parsing ist überholt, weil Upstream-Provider heute numerische Preise liefern.  
  Branch `feature/swiss-providers` · Dateien: `ui/src/components/grid/listings/ListingsGrid.jsx`, `ui/src/views/listings/ListingDetail.jsx`, `ui/src/views/dashboard/Dashboard.jsx`, `lib/services/storage/listingsStorage.js` · Commits: [`e20376d`](https://github.com/Gabko14/fredy-ch/commit/e20376de36), [`466a0d0`](https://github.com/Gabko14/fredy-ch/commit/466a0d0740), [`4db5f7d`](https://github.com/Gabko14/fredy-ch/commit/4db5f7d110) und 2 weitere
- **Homegate-, Newhome- und Anibis-Provider sowie 2Captcha-DataDome-Solver (wieder entfernt)** (Provider; neu; Nutzen niedrig, Aufwand hoch)  
  In der Historie gab es Provider für Homegate (gleiche __INITIAL_STATE__-Struktur wie ImmoScout24.ch), Newhome.ch (Next.js-Daten, Angebote von Kantonalbanken und AXA) und Anibis, alle über Bright Data oder Puppeteer. Dazu kamen ein DataDome-Captcha-Solver über die 2Captcha-API und Residential-Proxy-Plumbing. Mit Commit 5fd4801990 wurde das alles als ungenutzt bzw. nicht funktionierend wieder entfernt, einschließlich zehn Anibis-Cache-Migrationen. Der Code liegt nur noch in der Historie.  
  _Upstream:_ Upstream hat weder Homegate, Newhome noch Anibis; einen Proxy für den Browser hat Upstream bereits (proxyUrl in puppeteerExtractor.js).  
  Branch `master` · Dateien: `lib/provider/homegate.js`, `lib/provider/newhome.js`, `lib/provider/anibis.js`, `lib/services/captcha/dataDomeSolver.js` · Commits: [`518f6df`](https://github.com/Gabko14/fredy-ch/commit/518f6df6ca), [`648ed8a`](https://github.com/Gabko14/fredy-ch/commit/648ed8a9bb), [`0c9b40b`](https://github.com/Gabko14/fredy-ch/commit/0c9b40bfda) und 8 weitere
- **Migration 9: doppelte Settings vor dem Unique-Index entfernen** (Bugfix; neu; Nutzen niedrig, Aufwand gering)  
  Vor dem Anlegen des Unique-Index auf (name, user_id) löscht die Migration doppelte Zeilen in settings und behält jeweils die neueste. Vorher schlug die Migration auf bestehenden Datenbanken mit Duplikaten fehl.  
  _Upstream:_ Upstreams Migration 9 legt den Index weiterhin ohne vorheriges Deduplizieren an.  
  Branch `master` · Dateien: `lib/services/storage/migrations/sql/9.user-settings-unique-constraint.js` · Commits: [`92e137d`](https://github.com/Gabko14/fredy-ch/commit/92e137d999)
- **Flatfox-Provider mit optionaler Schweizer IP über Bright Data und Batching** (Provider; teilweise; Nutzen niedrig, Aufwand gering)  
  Provider für flatfox.ch über dessen JSON-API: zuerst Pins mit max_count 400, danach Detaildaten über public-listing. Optional läuft der Abruf über Bright Data, um eine Schweizer IP zu bekommen, weil der Fork Geo-Beschränkungen beobachtet hat. Auf dem Branch claude/fix-flatfox-results-leBuP werden die Detailabfragen in Blöcken zu 20 PKs mit Fehlertoleranz pro Block geholt, weil sonst Treffer verloren gingen.  
  _Upstream:_ Upstream hat seit 2026-08-22 lib/provider/flatfox.js mit demselben Pin-plus-public-listing-Ansatz (100 Pins, ohne Batching); nur der Bright-Data-Weg und das Batching fehlen dort.  
  Branch `master` · Dateien: `lib/provider/flatfox.js` · Commits: [`4fc9571`](https://github.com/Gabko14/fredy-ch/commit/4fc95713ad), [`49cbbdd`](https://github.com/Gabko14/fredy-ch/commit/49cbbdd57f), [`46e8cbc`](https://github.com/Gabko14/fredy-ch/commit/46e8cbcedf) und 3 weitere

_Bereits in Upstream vorhanden:_ Schweizer Voreinstellungen für Karte, Geocoding und Distanzanzeige (Upstream leitet countrycodes und Kartengrenzen heute aus den Ländern der Provider ab (lib/services/providers/countries.js, ui/src/components/map/countryBounds.js).); Listing-Löschung: Similarity-Cache auffrischen, keine doppelte Antwort (Upstream entfernt gelöschte Inserate gezielt aus dem Cache (hardDeleteAndEvict/removeEntry in listingsStorage.js); der Router ist inzwischen neu geschrieben.)

_Nicht berücksichtigt:_ Ignoriert: etwa 50 'bd sync'-Commits und Beads-Issue-Tracking, CLAUDE.md, AGENTS.md und Playwright-MCP-Setup, Claude-Code-Review-Workflows, Railway-Deployment und Dockerfile-Umstellung von yarn auf npm, .npmrc und Lockfiles, Debug-Logging, zehn Anibis-Cache-Migrationen, das Verschieben deutscher Provider nach deprecated/ und zurück, Merge-Commits sowie kleine UI- und Tooling-Fixes (Buttons der Job-Karte, Copyright-Skript, Tippfehler), die Upstream inzwischen anders gelöst hat.

## domisko/fredy

[Repository](https://github.com/domisko/fredy) · Zeitraum: 2026-06 · Branches: `master`

Schweiz-Fork (Upstream-PRs #346/#348, nicht gemergt) für den Betrieb auf einem Raspberry Pi: Provider für Homegate.ch (CloakBrowser, DataDome-Umgehung) und ImmoScout24.ch (nachgebaute Android-API), Währungsspalte für CHF-Preise, Mehrfachbilder und DeepL-Übersetzung von Beschreibungen. Pendelzeiten über Transitous und der Similarity-Fix sind inzwischen gleichwertig upstream.

- **ImmoScout24.ch-Provider über die Android-Mobile-API** (Provider; neu; Nutzen hoch, Aufwand mittel)  
  Wandelt eine eingefügte immoscout24.ch-Such-URL (Ort, Angebots- und Objektart, in DE/FR/IT) in geoTags um und fragt POST /search/listings der App-API mit nachgebauten App-Headern ab. Bei HTTP 403 wiederholt er die Anfrage mit dem frischen DataDome-Cookie aus der Antwort und speichert es; fehlt es, kann man ein Cookie manuell in den Einstellungen hinterlegen. Sortiert nach Erstellungsdatum, filtert Preis/Zimmer zusätzlich clientseitig, sammelt alle Bilder, übernimmt die mitgelieferten EN/DE-Übersetzungen der Beschreibung und speichert die Adressgenauigkeit (Hinweis 'ca.' in der Detailansicht, wenn keine Straße vorliegt).  
  _Upstream:_ Upstream deckt die Schweiz nur über Flatfox und BETTERHOMES ab; doc/providers.md hält ausdrücklich fest, dass immoscout24.ch nicht unterstützt wird.  
  Branch `master` · Dateien: `lib/provider/immoscout24ch.js`, `test/provider/immoscout24ch.test.js`, `lib/services/storage/migrations/sql/24.add-address-accuracy-to-listings.js` · Commits: [`8d62fd3`](https://github.com/domisko/fredy/commit/8d62fd346a), [`557dad3`](https://github.com/domisko/fredy/commit/557dad35d1)
- **Homegate.ch-Provider mit CloakBrowser und DataDome-Umgehung** (Provider; neu; Nutzen mittel, Aufwand mittel)  
  Homegate wird per CloakBrowser/Puppeteer geladen. Ein Besuch der Startseite wärmt die Sitzung vor, danach wartet der Provider bis zu 25 s auf window.__INITIAL_STATE__ und liest die Inserate daraus statt aus dem lazy gerenderten DOM; das behebt, dass sonst nur rund vier Treffer kamen. Für die virtuelle Liste gibt es in puppeteerExtractor die Option autoScrollDedupeSelector (Deduplizierung nach stabilem href). Ein Pfad über die nachgebaute Mobile-API (HMAC-X-App-Id) ist enthalten, aber deaktiviert, weil DataDome ihn blockiert; die Proxy-Nutzung wird maskiert geloggt.  
  _Upstream:_ Upstream hat keinen Homegate-Provider; laut Kommentar in lib/provider/flatfox.js blockiert der Bot-Schutz von Homegate dort Rechenzentrums- und sogar private Anschlüsse.  
  Branch `master` · Dateien: `lib/provider/homegate.js`, `lib/services/extractor/puppeteerExtractor.js`, `test/provider/homegate.test.js` · Commits: [`130aa4c`](https://github.com/domisko/fredy/commit/130aa4ce96), [`89d10bf`](https://github.com/domisko/fredy/commit/89d10bfcdf), [`475abca`](https://github.com/domisko/fredy/commit/475abcab67) und 5 weitere
- **Währung pro Inserat und Bildergalerie** (Daten & Speicherung; neu; Nutzen mittel, Aufwand mittel)  
  Neue Spalte currency in listings; Tabelle, Grid, Karte und Detailansicht formatieren Preise damit (z. B. CHF statt €). Eine weitere Spalte image_urls (JSON-Array) speichert alle Bilder eines Inserats, die Detailansicht zeigt sie als Karussell mit Vor/Zurück und Zähler. Beides ist generisch angelegt, wird im Fork aber nur von den Schweizer Providern befüllt.  
  _Upstream:_ Upstream formatiert in ui/src/services/price/priceService.js fest mit currency 'EUR', auch für Flatfox/BETTERHOMES, und speichert nur ein Bild pro Inserat; die Migrationsnummern 10/23/24 sind upstream schon anders belegt.  
  Branch `master` · Dateien: `lib/services/storage/migrations/sql/10.add-currency-to-listings.js`, `lib/services/storage/migrations/sql/23.add-image-urls-to-listings.js`, `ui/src/services/price/priceService.js`, `ui/src/views/listings/ListingDetail.jsx` · Commits: [`130aa4c`](https://github.com/domisko/fredy/commit/130aa4ce96), [`557dad3`](https://github.com/domisko/fredy/commit/557dad35d1)
- **Übersetzung von Inseratsbeschreibungen per DeepL** (API & Integration; neu; Nutzen mittel, Aufwand gering)  
  In den Admin-Einstellungen wird ein DeepL-API-Key hinterlegt (Free- und Pro-Endpunkt werden am ':fx'-Suffix erkannt). Ein Button in der Detailansicht ruft POST /api/listings/:id/translate auf; das Ergebnis wird pro Zielsprache in der neuen Spalte translations zwischengespeichert, sodass jede Beschreibung nur einmal übersetzt wird. Nützlich für mehrsprachige Märkte wie die Schweiz.  
  _Upstream:_ Upstream hat keine Übersetzungsfunktion für Beschreibungen (kein DeepL o. Ä. in lib/).  
  Branch `master` · Dateien: `lib/services/translation/deeplClient.js`, `lib/api/routes/listingsRouter.js`, `lib/services/storage/migrations/sql/22.add-translations-to-listings.js`, `ui/src/views/listings/ListingDetail.jsx` · Commits: [`1698f24`](https://github.com/domisko/fredy/commit/1698f24667)
- **ARM64: Chromium mit SwiftShader starten gegen GPU-Fingerprinting** (Deployment & Betrieb; neu; Nutzen niedrig, Aufwand gering)  
  Auf ARM/ARM64 (z. B. Raspberry Pi) startet puppeteerExtractor Chromium mit --use-angle=swiftshader, damit der WebGL-Renderer nicht die auffällige ARM-GPU-Kennung (etwa 'V3D 4.2') meldet, an der DataDome Scraper auf dem Pi erkennt.  
  _Upstream:_ Upstream puppeteerExtractor.js/botPrevention.js unterscheidet nicht nach process.arch und setzt kein ANGLE-Backend.  
  Branch `master` · Dateien: `lib/services/extractor/puppeteerExtractor.js` · Commits: [`d9e4b90`](https://github.com/domisko/fredy/commit/d9e4b908f9)

_Bereits in Upstream vorhanden:_ Pendelzeiten in der Detailansicht (erst OpenRouteService, dann Transitous) (Upstream berechnet Fahrzeiten für ÖPNV/Auto/Rad/Fuß über Transitous mit serverseitigem Cache, Sweeper und Pendelfilter pro Job (lib/services/transit/).)

_Nicht berücksichtigt:_ Ignoriert: README-, .nvmrc- und docker-compose-Anpassungen, CI-Trigger, der Fix für das News-Modal (Upstream hat die News-Logik inzwischen umgebaut), der Admin-Knopf 'Alle Inserate und Cache zurücksetzen' und der Similarity-Soft-Delete-Fix, den Upstream gleichwertig umsetzt.

## yoolandes/fredy

[Repository](https://github.com/yoolandes/fredy) · Zeitraum: 2026-04 bis 2026-05 · Branches: `fork`

Fork vom Mai 2026, der Fredy teils als allgemeinen Preis-Watcher nutzt (Provider für eBay und asgoodasnew) und vor allem den Scheduler erweitert: eigenes Intervall pro Job mit zufälligem Jitter sowie ein wiederverwendeter Puppeteer-Browser-Pool. Dazu ein globaler Fehler-Toast bei nicht erreichbarem Backend.

- **Eigenes Abfrageintervall pro Job mit zufälligem Jitter** (Performance; neu; Nutzen hoch, Aufwand mittel)  
  Neue Spalte jobs.interval_minutes (Migration 18) und ein Eingabefeld 'Job interval (optional)' in JobMutation; der jobExecutionService startet pro aktivem Job einen eigenen Timer statt eines globalen setInterval und baut die Timer bei Job-Änderungen über das Event 'jobs:changed' neu auf. Vor jedem geplanten Lauf wird ein zufälliger Jitter (Standard 20 %, max. 50 % des Intervalls) gewartet, um Scraping-Muster zu verschleiern; manuelle Läufe überspringen den Jitter.  
  _Upstream:_ Upstream kennt nur ein globales, live änderbares Intervall (selbst-reschedulender setTimeout in jobExecutionService.js) und Jitter nur auf Seiten-/Detailabruf-Ebene, kein Intervall bzw. Jitter pro Job.  
  Branch `fork` · Dateien: `lib/services/jobs/jobExecutionService.js`, `lib/services/storage/migrations/sql/18.add-interval-to-jobs.js`, `lib/services/storage/jobStorage.js`, `lib/api/routes/jobRouter.js` · Commits: [`eef2c9b`](https://github.com/yoolandes/fredy/commit/eef2c9bf7b)
- **Puppeteer-Browser-Pool mit Idle-Timeout** (Performance; neu; Nutzen mittel, Aufwand mittel)  
  Neues Modul browserPool.js hält eine einzige Browser-Instanz, die Jobs nacheinander über eine Warteschlange (acquireBrowser/releaseBrowser) nutzen; nach 2 Minuten Leerlauf wird sie geschlossen, getrennte Instanzen werden neu gestartet. Spart wiederholte Chromium-Starts pro Job; inkl. Unit-Tests. Achtung: der Fork startet den Browser mit headless: false.  
  _Upstream:_ Upstream startet in jobExecutionService.js pro Joblauf einen Browser via puppeteerExtractor.launchBrowser und schließt ihn danach wieder; ein Pool existiert nicht.  
  Branch `fork` · Dateien: `lib/services/extractor/browserPool.js`, `lib/services/jobs/jobExecutionService.js`, `test/services/browserPool.test.js` · Commits: [`eef2c9b`](https://github.com/yoolandes/fredy/commit/eef2c9bf7b)
- **Globaler Fehler-Toast bei nicht erreichbarem Backend** (UI/UX; neu; Nutzen niedrig, Aufwand gering)  
  xhr.js erkennt Netzwerkfehler (TypeError/kein Status) und meldet sie über einen globalen Handler an den Store, App.jsx zeigt dann einen Toast 'Server is unreachable'; das Dashboard speichert zudem eine Fehlermeldung statt still zu scheitern.  
  _Upstream:_ Im Upstream-xhr.js gibt es keine globale Behandlung von Netzwerkfehlern.  
  Branch `fork` · Dateien: `ui/src/services/xhr.js`, `ui/src/App.jsx`, `ui/src/services/state/store.js` · Commits: [`eef2c9b`](https://github.com/yoolandes/fredy/commit/eef2c9bf7b)
- **Provider für eBay und asgoodasnew (Nicht-Immobilien)** (Provider; neu; Nutzen niedrig, Aufwand gering)  
  Zwei einfache Selektor-Provider: ebay.js scrapt eBay-Suchergebnisse (.s-card mit Titel, Preis, Bild), asgoodasnew.js die Zustandsvarianten von Refurbished-Artikeln inkl. Titel aus dem Link-Slug. Damit wird Fredy als allgemeiner Preis-Watcher für Produkte genutzt, nicht für Immobilien.  
  _Upstream:_ Upstream hat keine Produkt-/Marktplatz-Provider außerhalb von Immobilien; thematisch für Fredy kaum passend.  
  Branch `fork` · Dateien: `lib/provider/ebay.js`, `lib/provider/asgoodasnew.js` · Commits: [`f1cbf2f`](https://github.com/yoolandes/fredy/commit/f1cbf2fc55), [`7ab5898`](https://github.com/yoolandes/fredy/commit/7ab5898caf)
- **extractNumber robuster gegen Text vor der Zahl** (Bugfix; teilweise; Nutzen niedrig, Aufwand gering)  
  extractNumber sucht zuerst per Regex den ersten Zahlenblock, bevor Tausenderpunkte entfernt werden, sodass Strings wie 'EUR 1.234,00' korrekt geparst werden.  
  _Upstream:_ Upstream-extract-number.js hat inzwischen eine bessere Tausenderpunkt-Heuristik, nutzt aber weiter parseFloat auf dem ganzen String und liefert bei führendem Text (z. B. 'EUR 1.234') null; nur der Regex-Vorschritt wäre noch neu.  
  Branch `fork` · Dateien: `lib/utils/extract-number.js` · Commits: [`d27d63f`](https://github.com/yoolandes/fredy/commit/d27d63fb4e)

_Nicht berücksichtigt:_ Ignoriert: Umstellung von Yarn auf npm inkl. package-lock und Dockerfile-Anpassungen (--legacy-peer-deps) sowie .gitignore-Ergänzungen.

## lanschl/fredy

[Repository](https://github.com/lanschl/fredy) · Zeitraum: 2025-10 bis 2026-01 · Branches: `master`

Fork auf Upstream-Stand Oktober 2025, der die Scraper für ImmoScout, Kleinanzeigen und Immowelt um viele strukturierte Objektmerkmale aus den Detailseiten erweitert, diese in zusätzlichen DB-Spalten speichert und in einer breiten, sortierbaren Tabelle anzeigt. Die rund 21k Zeilen sind überwiegend kein Funktionscode, sondern Debug-HTML-Dumps (immowelt.html allein ca. 15,7k Zeilen), package-lock.json (ca. 14k), eine Beispiel-Exposé-JSON und ein CSV-Export. Der Code ist experimentell: Die Basis-Migration wurde umgeschrieben statt eine neue anzulegen, Provider schreiben Debug-Dateien auf die Platte und Puppeteer läuft mit headless=false.

- **Erweiterte ImmoScout-Exposédaten mit eigenen DB-Spalten** (Daten & Speicherung; teilweise; Nutzen mittel, Aufwand mittel)  
  Für jedes Suchergebnis wird zusätzlich /expose/{id} der Mobile-API geladen. Daraus werden rund 25 Felder gelesen: Baujahr, letzte Sanierung, Zustand, Ausstattungsqualität, Wohnungstyp, Heizungsart, Energieträger, Energieklasse, Hausgeld, Kaufnebenkosten, die Position in der Preisspanne, privat oder gewerblich, die Adresse aufgeteilt in Straße, PLZ und Ort sowie die Merkmale Balkon, Garten, Einbauküche, Keller, Aufzug und barrierefrei. Dazu berechnet der Fork den Preis pro m². Gespeichert wird alles in neuen Spalten der Tabelle listings (numeric_price, year_built, has_balcony, service_charge …), die in storeListings befüllt werden.  
  _Upstream:_ Upstream lädt Exposé-Details per fetchDetails (lib/services/immoscout/mobileApi.js) und speichert rooms, build_year, energy_class, price_per_sqm, charges und published_at. Ausstattungsmerkmale (Balkon, Keller, Aufzug …), Heizung, Zustand, Hausgeld, Kaufnebenkosten und der Preisindikator fehlen dort.  
  Branch `master` · Dateien: `lib/provider/immoscout.js`, `lib/services/storage/listingsStorage.js`, `lib/services/storage/migrations/sql/1.create-fredy-base-structure.js` · Commits: [`223634e`](https://github.com/lanschl/fredy/commit/223634ee69), [`cc15aac`](https://github.com/lanschl/fredy/commit/cc15aac7df), [`2be50f0`](https://github.com/lanschl/fredy/commit/2be50f0d6c) und 3 weitere
- **Breite, sortierbare Inseratstabelle mit allen Objektmerkmalen** (UI/UX; teilweise; Nutzen mittel, Aufwand mittel)  
  ListingsTable.jsx zeigt rund 30 Spalten: numerischer Preis, Fläche, €/m², Zimmer, Baujahr, Veröffentlichungsdatum, Energieklasse, Heizung, Hausgeld, Kaufnebenkosten, Preisindikator, PLZ, Ort und Ausstattungsmerkmale als Häkchen. Status und Aktionen sind links fixiert, eine Seite zeigt 50 Einträge. Im Backend erweitert queryListings die Whitelist der sortierbaren Felder um alle neuen Spalten, sodass man zum Beispiel nach €/m² oder Baujahr sortieren kann.  
  _Upstream:_ Upstream hat eine eigene Tabellen- und Kachelansicht mit Filterpanel und PricePerSqmBadge. Sortiert werden kann dort aber nur nach Datum, Preis, Fläche, Provider, Titel, Job, Aktiv-Status und Merkliste.  
  Branch `master` · Dateien: `ui/src/components/table/listings/ListingsTable.jsx`, `lib/services/storage/listingsStorage.js` · Commits: [`aacbe26`](https://github.com/lanschl/fredy/commit/aacbe2645a)
- **Kleinanzeigen: Detailseiten mit Ausstattungsmerkmalen auslesen** (Provider; teilweise; Nutzen niedrig, Aufwand gering)  
  Der Kleinanzeigen-Provider bekommt ein eigenes getListings. Es lädt die Ergebnisseite, ruft dann jede Anzeigen-Detailseite per fetch ab und parst sie mit Cheerio. Gelesen werden die Schlüssel-Wert-Liste (Wohnfläche, Zimmer, Baujahr, Hausgeld, Wohnungstyp, Objektzustand) und die Ausstattungs-Checkliste (Balkon, Einbauküche, Keller, Aufzug, stufenloser Zugang). Das Ergebnis landet in denselben strukturierten Feldern wie bei ImmoScout. Die Bezirks-Blacklist wird jetzt auf den Ort statt auf die Beschreibung angewendet.  
  _Upstream:_ Upstream hat für Kleinanzeigen fetchDetails mit Cheerio (Wohnfläche, Zimmer, Baujahr, Adresse, Beschreibung). Die Ausstattungs-Checkliste und das Hausgeld werden dort nicht ausgewertet.  
  Branch `master` · Dateien: `lib/provider/kleinanzeigen.js` · Commits: [`7fad8d1`](https://github.com/lanschl/fredy/commit/7fad8d1441)
- **ImmoScout: alle Ergebnisseiten laden, Details mit Parallelitätslimit** (Provider; teilweise; Nutzen niedrig, Aufwand gering)  
  Der Fork liest numberOfPages aus der ersten Antwort der Mobile-API und lädt alle weiteren Seiten (&pagenumber=N) parallel nach. Die Exposé-Details holt er danach in Fünferblöcken mit Promise.all, damit nicht hunderte Anfragen gleichzeitig laufen. So erfasst Fredy alle Treffer einer Suche und nicht nur die erste Seite.  
  _Upstream:_ Upstream ruft bewusst nur die erste, nach Datum sortierte Seite ab und holt Details nur für neue Inserate, gedrosselt über hostPacer und detailRefetchService. Das vollständige Paginieren fehlt dort, erhöht aber auch das Risiko, als Bot erkannt zu werden.  
  Branch `master` · Dateien: `lib/provider/immoscout.js` · Commits: [`7fad8d1`](https://github.com/lanschl/fredy/commit/7fad8d1441), [`a928cc6`](https://github.com/lanschl/fredy/commit/a928cc61c7)

_Bereits in Upstream vorhanden:_ Immowelt: Puppeteer-Paginierung und Parsing von Zimmern/Fläche/Preis (Upstream liest Immowelt inzwischen über die JSON-API der Ergebnisseite (lib/provider/immowelt.js) mit strukturierten Feldern. Der DOM- und Puppeteer-Ansatz des Forks ist damit überholt.); Anti-Bot-Härtung des Puppeteer-Extractors (Upstream hat lib/services/extractor/botPrevention.js mit User-Agent, Viewport-Jitter, de-DE-Sprache, AutomationControlled-Flag, humanDelay und zusätzlichen navigator-Patches. Dazu kommt CloakBrowser.); Parser-Fixes: Tausendertrennzeichen, SEO-Suchpfade, Provider ohne crawlFields (Upstream hat lib/utils/extract-number.js mit einer Tausenderpunkt-Heuristik, web-paths.js mit expliziten Einträgen wie 'wohnung-kaufen-mit-balkon' und prüft Pflichtfelder über requiredFieldNames.)

_Nicht berücksichtigt:_ Ignoriert wurden: package-lock.json und yarn.lock, Debug-HTML-Dumps (immowelt.html, Immowelt_listing.html, lib/htmls/*, detail_page.html, debug_selectors*.txt, immowelt_puppeteer_success_debug.html), Debug-Skripte (debug_fetch_listing.js, debug_parser.js, fix_line_endings.js), conf/expose_demo.json, export/listings.csv mit eigenen Suchergebnissen, conf/config_bak.json, db/delete_lisitings.sql, .gitattributes und das Deaktivieren des husky-Pre-Commit-Hooks (ab773ced70). Die Commits bc1ce4bf32 und fc1332543e enthalten nur HTML-Dumps.

## Jtingo/fredy

[Repository](https://github.com/Jtingo/fredy) · Zeitraum: 2026-07 bis 2026-08 · Branches: `master`

Auf Berlin ausgerichteter Fork (Stand Juli/August 2026) mit zusätzlichen Providern für große Wohnungsgesellschaften (Vonovia, Adler Group), Suchintervallen unter 5 Minuten mit Zufallsverzögerung samt exakter Anzeige des nächsten Laufs, live tickenden Dashboard-Timern und einer unscharfen portalübergreifenden Dublettenerkennung, die Upstream inzwischen besser gelöst hat. Die übrigen Branches (185-bug-…, improvements, listing-management) enthalten nur alte Upstream-Commits.

- **Provider Vonovia** (Provider; neu; Nutzen mittel, Aufwand gering)  
  Neuer Provider lib/provider/vonovia.js übernimmt die Query der normalen Vonovia-Such-URL und fragt damit die JSON-API /api/real-estate/list mit limit=200 ab, also ohne Puppeteer und ohne Paging. Preis und Fläche werden gerundet, damit Cent-Schwankungen keine doppelten Benachrichtigungen auslösen; die von der API gelieferten Koordinaten werden durchgereicht, sodass der Polygon-Filter ohne Geocoding greift. Mit Offline-Fixture und Test.  
  _Upstream:_ Upstream hat nur deutscheWohnen.js (gleiche Vonovia-Plattform), dort ist inzwischen ein Such-Token und ein Limit von 50 pro Seite nötig, was der Fork-Provider noch nicht berücksichtigt.  
  Branch `master` · Dateien: `lib/provider/vonovia.js`, `test/provider/vonovia.test.js`, `test/testFixtures/vonovia.json` · Commits: [`0af9fae`](https://github.com/Jtingo/fredy/commit/0af9faed92), [`574274f`](https://github.com/Jtingo/fredy/commit/574274ff6f)
- **Provider Adler Group** (Provider; neu; Nutzen mittel, Aufwand gering)  
  Neuer Provider lib/provider/adlergroup.js für adler-group.com: Die TYPO3/Everreal-Seite rendert alle Treffer serverseitig auf eine Seite, daher reicht ein einfacher HTTP-GET mit Cheerio-Parsing (crawlContainer/crawlFields), ohne Headless-Browser. Links werden absolut gemacht, Preis, Fläche und Zimmer extrahiert; Test mit HTML-Fixture liegt bei.  
  _Upstream:_ Kein Adler-Group-Provider im Upstream-Master (lib/provider/).  
  Branch `master` · Dateien: `lib/provider/adlergroup.js`, `test/provider/adlergroup.test.js`, `test/testFixtures/adlergroup.html` · Commits: [`c152897`](https://github.com/Jtingo/fredy/commit/c15289718e)
- **Suchintervall unter 5 Minuten mit Zufallsverzögerung** (Performance; neu; Nutzen mittel, Aufwand gering)  
  Das minimale Suchintervall in den Einstellungen sinkt von 5 auf 1 Minute; liegt es unter 5 Minuten, verzögert jobExecutionService.js jeden geplanten Lauf zusätzlich um bis zu 30 Sekunden (getScheduleJitterMs), damit die Abfragen weniger maschinell aussehen. Der Server merkt sich den exakten nächsten Startzeitpunkt (getNextScheduledRunAt) und das Dashboard zeigt ihn an; generalSettingsRoute.js validiert das Intervall serverseitig (1 bis 1440 Minuten).  
  _Upstream:_ Upstream erzwingt im UI weiterhin min=5, hat keinen Jitter und berechnet nextRun nur als lastRun + interval.  
  Branch `master` · Dateien: `lib/services/jobs/jobExecutionService.js`, `lib/api/routes/generalSettingsRoute.js`, `lib/api/routes/dashboardRouter.js`, `ui/src/views/admin/pages/ExecutionPage.jsx` · Commits: [`0fe9839`](https://github.com/Jtingo/fredy/commit/0fe9839251), [`4364a7f`](https://github.com/Jtingo/fredy/commit/4364a7f5f1), [`0f536c7`](https://github.com/Jtingo/fredy/commit/0f536c7c11)
- **Live aktualisiertes Dashboard** (UI/UX; neu; Nutzen niedrig, Aufwand gering)  
  Die relativen Zeitangaben für letzten und nächsten Lauf ticken im Sekundentakt weiter, statt beim Seitenaufruf einzufrieren. Das Dashboard lädt sich nach Abschluss eines Laufs (SSE-Event jobStatus) und nach Ablauf des geplanten Zeitpunkts neu; KPI-Karten wachsen mit, statt überzulaufen.  
  _Upstream:_ Das Upstream-Dashboard ruft relativeTime ohne laufende Uhr auf und hat keinen SSE-Refresh.  
  Branch `master` · Dateien: `ui/src/views/dashboard/Dashboard.jsx` · Commits: [`8fbf023`](https://github.com/Jtingo/fredy/commit/8fbf023f50), [`20cb91b`](https://github.com/Jtingo/fredy/commit/20cb91b121)

_Bereits in Upstream vorhanden:_ Unscharfe portalübergreifende Dublettenerkennung (Upstream hat seit 2026-08-20 lib/services/similarity-check/listingFingerprint.js mit Abgleich über Fläche, Zimmer, Ort sowie Titel-, Preis- und Beschreibungsähnlichkeit.)

_Nicht berücksichtigt:_ Ignoriert: CLAUDE.md-Update, der eigene inberlinwohnen-Provider samt Rundungsfix (d0b9e0b920; inzwischen durch den Upstream-Provider aus PR #367 ersetzt) sowie die Branches 185-bug-old-runs-filling-up-disk, improvements und listing-management, die nur alte Upstream-Commits enthalten.

## hugoschwabe/fredy-berlin

[Repository](https://github.com/hugoschwabe/fredy-berlin) · Zeitraum: 2026-10 bis 2026-10 · Branches: `master`

"fredy-berlin" (Basis 2026-09-03, als Upstream-PR #487 eingereicht, nicht gemergt) richtet Fredy auf Kaufobjekte in Berlin aus: lokal berechnete Investor- und Eigennutzer-Scores (GREIX-Wertentwicklung, Mietspiegel-Schätzung), eine lokal gespeicherte Bildergalerie pro Listing, Deduplizierung über Jobs hinweg und ein robusterer HTTP-Webhook-Adapter.

- **Deduplizierung desselben Listings über mehrere Jobs** (Daten & Speicherung; neu; Nutzen mittel, Aufwand hoch)  
  Neue Join-Tabelle listing_jobs (Migration 46): findet ein Job eine URL, die bereits unter einem anderen Job desselben Nutzers gespeichert ist, wird das Listing nur angehängt statt doppelt gespeichert; _findNew/_save in der Pipeline übernehmen die gemeinsame Zeilen-ID. Gebiets-, Pendelzeit- und Ähnlichkeitsfilter löschen gemeinsam genutzte Zeilen nicht mehr, und beim Löschen eines Jobs werden nur Listings ohne verbleibende Jobs entfernt. Bei überlappenden Suchen gibt es so nur eine Zeile pro Wohnung, jeder Job benachrichtigt aber weiterhin einmal seine eigenen Kanäle.  
  _Upstream:_ Im Upstream sind Hash, Fingerprint-Abgleich und UNIQUE-Index weiterhin auf einen einzelnen Job bezogen; eine Tabelle listing_jobs gibt es nicht.  
  Branch `master` · Dateien: `lib/services/storage/migrations/sql/46.listing-jobs.js`, `lib/FredyPipelineExecutioner.js`, `lib/services/storage/listingsStorage.js`, `lib/services/storage/jobStorage.js` · Commits: [`10fcca7`](https://github.com/hugoschwabe/fredy-berlin/commit/10fcca7975)
- **HTTP-Webhook-Adapter mit echtem Timeout und Fehlerauswertung** (Benachrichtigung; neu; Nutzen mittel, Aufwand gering)  
  Der HTTP-Adapter übergab timeout: 10000 an das native fetch, das diese Option ignoriert; ein hängender Endpunkt konnte so die Pipeline beim Benachrichtigen blockieren. Der Fork nutzt AbortSignal.timeout(10 s) für neue Listings und Preisänderungen, protokolliert Netzwerkfehler und wirft bei Nicht-2xx-Antworten einen Fehler mit dem Antworttext des Endpunkts.  
  _Upstream:_ Upstream lib/notification/adapter/http.js setzt weiterhin timeout: 10000 (Zeilen 45 und 90) und prüft den Antwortstatus nicht.  
  Branch `master` · Dateien: `lib/notification/adapter/http.js` · Commits: [`add48aa`](https://github.com/hugoschwabe/fredy-berlin/commit/add48aa384)
- **Investor-/Eigennutzer-Score für Berliner Kaufobjekte** (Daten & Speicherung; neu; Nutzen niedrig, Aufwand hoch)  
  lib/services/enrichment/ berechnet für jedes Listing lokal einen Investor-Score (Netto-Mietrendite + Wertzuwachs) und einen Eigennutzer-Score (Kaufpreis/Jahresmiete + Wertzuwachs). Eingehen eine größenabhängige Kaltmiete-Schätzung nach Mietspiegel-Tabelle, die jährliche Wertentwicklung 2000–2025 aus GREIX-Indizes per Punkt-in-Polygon über 13 Berliner Regionen (mitgelieferte GeoJSON-Daten) und eine grobe Luftlinien-Pendelzeit zu einem festen Ziel. Ein stündlicher Cron (enrichment-cron.js) bewertet alle noch unbewerteten Zeilen; Migrationen 41–49 legen die Spalten an. Die UI zeigt eine FredyScoreCard in der Detailansicht und Score-Chips in Karten und Tabelle.  
  _Upstream:_ Upstream hat seit 2026-09 einen Quadratmeterpreis-Vergleich mit dem lokalen Markt (marketBenchmark.js) und einen Finanzierungsrechner, aber keine Rendite- oder Wertzuwachs-Scores; die Fork-Logik ist fest auf Berlin zugeschnitten.  
  Branch `master` · Dateien: `lib/services/enrichment/scorer.js`, `lib/services/enrichment/greixLookup.js`, `lib/services/enrichment/mietspiegel.js`, `lib/services/enrichment/enrichListing.js` · Commits: [`add48aa`](https://github.com/hugoschwabe/fredy-berlin/commit/add48aa384), [`0a7b2d8`](https://github.com/hugoschwabe/fredy-berlin/commit/0a7b2d891b), [`10fcca7`](https://github.com/hugoschwabe/fredy-berlin/commit/10fcca7975)
- **Lokale Bildergalerie und Detailabruf per Klick mit dauerhaftem Browser** (UI/UX; teilweise; Nutzen mittel, Aufwand mittel)  
  Beim ersten Öffnen eines Listings ruft POST /api/listings/:id/details die Detailseite ab; die Provider ImmoScout, Immowelt und Kleinanzeigen liefern dabei alle Galerie-URLs. listingImages.js lädt bis zu 30 Bilder (Timeout, 10-MB-Grenze, JPEG statt WEBP) neben die Datenbank, ausgeliefert über GET /api/listings/:id/images/:index und angezeigt in ListingGallery.jsx. enrichmentBrowser.js hält dafür einen einzigen Chromium mit persistentem Profil offen, serialisiert Anfragen und pausiert einen von DataDome abgewiesenen Provider 15 Minuten, damit Klick-Abrufe nicht als Bot auffallen.  
  _Upstream:_ Upstream hat seit 2026-09-21 eine eigene Route POST /:listingId/details für den Abruf auf Klick, speichert aber keine Bildergalerie lokal und nutzt keinen dauerhaften Anreicherungs-Browser.  
  Branch `master` · Dateien: `lib/services/listings/listingImages.js`, `lib/services/listings/enrichmentBrowser.js`, `lib/api/routes/listingsRouter.js`, `ui/src/views/listings/components/ListingGallery.jsx` · Commits: [`add48aa`](https://github.com/hugoschwabe/fredy-berlin/commit/add48aa384), [`10fcca7`](https://github.com/hugoschwabe/fredy-berlin/commit/10fcca7975)

_Nicht berücksichtigt:_ Ignoriert: Score-Rückschreib-API mit Service-Token und Catch-up-Cron für ein externes Scoring-Backend (im letzten Commit wieder entfernt), README-/docker-compose-Anpassungen für den eigenen Fork, opencode.json und .gitignore.

## moleqnap/fredy

[Repository](https://github.com/moleqnap/fredy) · Zeitraum: 2026-08 · Branches: `master`

Der Fork bindet ein IMAP-Postfach an Fredy an: Antworten von Vermietern werden abgeholt, verschlüsselt gespeichert und automatisch den passenden Inseraten zugeordnet. Daraus pflegt Fredy einen erweiterten Bewerbungsstatus mit Einladungs- und Besichtigungsverfolgung. Dazu kommt ein Mindest-Scanintervall pro Provider. Die Mail-Funktionen sind als Upstream-PRs #414/#415 eingereicht, aber nicht gemergt.

- **IMAP-Postfach mit verschlüsselter Speicherung und Posteingangs-UI** (API & Integration; neu; Nutzen hoch, Aufwand hoch)  
  Jeder Nutzer kann in den Einstellungen (`MailboxPage`) ein eigenes IMAP-Konto hinterlegen. `imapSyncService.js` (ImapFlow + mailparser) holt neue Nachrichten inkrementell über einen UID-Cursor: anfangs die letzten 30 Tage, große Mails nur als Envelope, HTML wird zu Text. Ein Cron (`mail-sync-cron.js`) synchronisiert alle 10 Minuten. Passwort und Mailinhalte werden mit AES-256-GCM und einem Schlüssel aus `FREDY_MAIL_ENCRYPTION_KEY` verschlüsselt, die Aufbewahrung ist pro Konto begrenzt (30–365 Tage). `imapNetworkSecurity.js` erlaubt nur die Ports 143/993, erzwingt STARTTLS und sperrt private Adressen per DNS-Lookup-Hook gegen SSRF und DNS-Rebinding.  
  _Upstream:_ Upstream hat keinerlei IMAP- oder Mail-Eingangsfunktion; die Upstream-PRs #414/#415 dazu wurden nicht gemergt.  
  Branch `master` · Dateien: `lib/services/mail/imapSyncService.js`, `lib/services/mail/mailCredentialCrypto.js`, `lib/services/mail/imapNetworkSecurity.js`, `lib/services/storage/mailStorage.js` · Commits: [`026ff3c`](https://github.com/moleqnap/fredy/commit/026ff3c653), [`c19e740`](https://github.com/moleqnap/fredy/commit/c19e740140), [`7cb27bf`](https://github.com/moleqnap/fredy/commit/7cb27bf926) und 6 weitere
- **Automatische Zuordnung eingehender Mails zu Inseraten** (Daten & Speicherung; neu; Nutzen hoch, Aufwand mittel)  
  `mailListingMatcher.js` ordnet Mails konservativ einem Inserat zu, in dieser Reihenfolge: über Inserats-IDs aus dem Portal-Link (nur Tokens mit Ziffer, keine PLZ), über die normalisierte Adresse mit Pflicht-Hausnummer, oder über Thread-Referenzen (In-Reply-To/References). Jeder Treffer speichert Methode und Konfidenz in `mail_listing_matches`, Zuordnungen von Hand sind ebenfalls möglich. Auf der Detailseite eines Inserats zeigt `RelatedMailList` die zugehörige Korrespondenz.  
  _Upstream:_ Upstream speichert keine Mails und kann deshalb auch keine Mails Inseraten zuordnen.  
  Branch `master` · Dateien: `lib/services/mail/mailListingMatcher.js`, `lib/services/storage/mailStorage.js`, `ui/src/views/listings/components/RelatedMailList.jsx` · Commits: [`b6ccd03`](https://github.com/moleqnap/fredy/commit/b6ccd031fd), [`33ebe36`](https://github.com/moleqnap/fredy/commit/33ebe361d6), [`7b6552e`](https://github.com/moleqnap/fredy/commit/7b6552eace) und 2 weitere
- **Mindest-Scanintervall pro Provider** (Performance; neu; Nutzen mittel, Aufwand gering)  
  Im `ProviderMutator` lässt sich pro Provider eines Jobs ein Mindestintervall wählen (global, 1, 3, 6, 12 oder 24 Stunden), gespeichert als `scanIntervalMinutes` in der Provider-Konfiguration. `jobExecutionService.js` überspringt bei geplanten Läufen jeden Provider, der noch nicht fällig ist, und zählt auch fehlgeschlagene Versuche als Lauf. So entsteht ein Cooldown nach Bot-Erkennung. Manuelle Läufe ignorieren das Intervall.  
  _Upstream:_ Upstream hat nur das globale Intervall (`interval`-Setting in `jobExecutionService.js`), kein Intervall pro Provider.  
  Branch `master` · Dateien: `lib/services/jobs/jobExecutionService.js`, `ui/src/views/jobs/mutation/components/provider/ProviderMutator.jsx`, `ui/src/services/transformer/providerTransformer.js` · Commits: [`be0fa92`](https://github.com/moleqnap/fredy/commit/be0fa92c28), [`5cef947`](https://github.com/moleqnap/fredy/commit/5cef947aee), [`54a1174`](https://github.com/moleqnap/fredy/commit/54a1174cff)
- **Erweiterter Bewerbungsstatus mit Mail-Erkennung und Einladungs-Tracking** (UI/UX; teilweise; Nutzen hoch, Aufwand mittel)  
  Der Bewerbungsstatus kennt neben applied/accepted/rejected auch invited, visited, documents_sent und not_invited (`listingStatus.js`, `StatusControl`). `inferGermanApplicationUpdate` erkennt in deutschen Vermieter-Mails anhand starker Formulierungen Einladungen samt Termin, Unterlagenanforderungen, Absagen (auch vor der Besichtigung) und Eingangsbestätigungen und setzt den Status entsprechend. Die neue Ansicht `InvitationTracking` listet anstehende Besichtigungstermine und archiviert besuchte.  
  _Upstream:_ Upstream kennt nur die Status applied/rejected/accepted (`ui/src/components/listings/statusOptions.js`); weitere Stufen, Erkennung aus Mails und Terminverfolgung gibt es dort nicht.  
  Branch `master` · Dateien: `lib/services/listings/listingStatus.js`, `lib/services/mail/mailListingMatcher.js`, `ui/src/views/invitations/InvitationTracking.jsx`, `ui/src/components/listings/StatusControl.jsx` · Commits: [`f927619`](https://github.com/moleqnap/fredy/commit/f927619002), [`a163080`](https://github.com/moleqnap/fredy/commit/a163080d91), [`afe9b2a`](https://github.com/moleqnap/fredy/commit/afe9b2aa3b) und 2 weitere

_Nicht berücksichtigt:_ Ignoriert wurden: ein Gerüst für einen Fahrzeitfilter (`useTravelTimeFilter`, ungenutzt; Upstream hat längst Pendelfilter und Fahrzeiten) samt einer zwischenzeitlich eingecheckten Patch-Datei, ein CodeQL-Workflow nach Vorlage, `workflow_dispatch` für den Docker-Workflow, ein Dependabot-Bump, Formatierung und ein Dateimodus-Fix der README. Achtung beim Portieren: Die Mail-Migrationen 35–39 kollidieren mit den Upstream-Migrationsnummern.

## rustam-k0/fredy

[Repository](https://github.com/rustam-k0/fredy) · Zeitraum: 2026-08 bis 2026-09 · Branches: `master`

Ein kleiner Fork, der sich nach eigenem Bedarf an Upstream angehängt hat. Echt neu sind nur vier Dinge: WG-Gesucht filtert gewerbliche Anbieter heraus, bekannte Inserate gelten über alle Jobs eines Nutzers hinweg (keine doppelten Benachrichtigungen), Suchläufe starten zu festen Uhrzeiten, und der 'Open in Fredy'-Link in Telegram wird robuster gebaut. Die übrigen der 779 Commits sind umgeschriebene alte Historie.

- **WG-Gesucht: Anbieter und Anbietertyp auslesen und per Blacklist filtern** (Provider; neu; Nutzen mittel, Aufwand gering)  
  Der WG-Gesucht-Provider liest zusätzlich den Anbieternamen (`advertiser`) und den Kontotyp bzw. das Verifiziert-Label (`advertiserType`) aus der Ergebnisliste und der Kontaktbox der Detailseite. Außerdem setzt er die Beschreibung aus allen `freitext_*`-Tabs zusammen statt nur aus dem ersten. `applyBlacklist` prüft auch diese Felder, sodass sich gewerbliche Anbieter über Blacklist-Begriffe zuverlässig ausschließen lassen. Tests liegen bei.  
  _Upstream:_ Upstream `wgGesucht.js` liest nur `#freitext_0` und blacklistet nur Titel und Beschreibung, Anbieterfelder gibt es dort nicht.  
  Branch `master` · Dateien: `lib/provider/wgGesucht.js`, `test/provider/wgGesuchtFiltering.test.js` · Commits: [`4e64784`](https://github.com/rustam-k0/fredy/commit/4e64784997)
- **Bekannte Inserate jobübergreifend pro Nutzer erkennen** (Benachrichtigung; neu; Nutzen mittel, Aufwand gering)  
  `getKnownListingHashesForJobAndProvider` liefert nicht mehr nur die Hashes des eigenen Jobs, sondern die aller Jobs desselben Nutzers für diesen Provider (JOIN über `jobs.user_id`). Überschneiden sich mehrere Suchaufträge, wird dasselbe Inserat deshalb nur einmal gemeldet und gespeichert. Ein Test deckt das ab.  
  _Upstream:_ Upstream filtert bekannte Hashes nur pro `job_id`, und auch `similarityCache.js` vergleicht nur innerhalb desselben Jobs.  
  Branch `master` · Dateien: `lib/services/storage/listingsStorage.js`, `test/storage/listingKnownHashes.test.js` · Commits: [`4e64784`](https://github.com/rustam-k0/fredy/commit/4e64784997)
- **Geplante Suchläufe zu festen Uhrzeiten** (Deployment & Betrieb; neu; Nutzen niedrig, Aufwand gering)  
  Der Scheduler in `jobExecutionService.js` plant den nächsten Lauf über `nextClockBoundary()` (`lib/services/jobs/schedule.js`) auf die nächste volle Intervallgrenze. Bei 60 Minuten läuft die Suche also um 10:00, 11:00 usw., statt ein Intervall nach Prozessstart oder Laufende. Der sofortige Lauf beim Start entfällt, und das Dashboard zeigt den echten nächsten Termin. Das ergibt vorhersehbare Suchzeiten, die nicht wandern.  
  _Upstream:_ Upstream plant mit `setTimeout` relativ zum vorherigen Lauf und startet beim Hochfahren sofort einen Lauf.  
  Branch `master` · Dateien: `lib/services/jobs/schedule.js`, `lib/services/jobs/jobExecutionService.js`, `lib/api/routes/dashboardRouter.js` · Commits: [`3f02153`](https://github.com/rustam-k0/fredy/commit/3f02153ed0), [`7cfd73c`](https://github.com/rustam-k0/fredy/commit/7cfd73cfc3)
- **Robuster 'Open in Fredy'-Link in Telegram-Nachrichten** (Bugfix; teilweise; Nutzen niedrig, Aufwand gering)  
  Der neue Helfer `buildFredyListingUrl` in `lib/notification/fredyUrl.js` baut den Deep-Link ins Fredy-UI über `URL`. Er ergänzt ein fehlendes Schema, toleriert einen abschließenden Slash und überschreibt einen mitkopierten Hash-Pfad. Der Telegram-Adapter nutzt ihn an allen drei Stellen.  
  _Upstream:_ Upstream entfernt beim Speichern der `baseUrl` nur den abschließenden Slash (`generalSettingsRoute.js`) und setzt den Link in allen Adaptern per String-Konkatenation zusammen.  
  Branch `master` · Dateien: `lib/notification/fredyUrl.js`, `lib/notification/adapter/telegram.js` · Commits: [`4e64784`](https://github.com/rustam-k0/fredy/commit/4e64784997)

_Nicht berücksichtigt:_ Ignoriert wurden: Star-History-Commits des Bots, ein Workflow zur automatischen Upstream-Synchronisation, ein eingecheckter privater WG-Gesucht-Export (xlsx/ndjson/png unter `outputs/`), ein .gitignore für DB-Backups, das Pinnen der docker-compose-Datei auf ein Image mit Localhost-Port sowie zwei Commits von 2020 zu `conf/config.json`.

## yanicii/fredy

[Repository](https://github.com/yanicii/fredy) · Zeitraum: 2026-09 · Branches: `develop`

Hamburg-Fork auf aktuellem Upstream (Basis 2026-09) mit vier zusätzlichen Providern für Hamburger Vermieter und Makler sowie einen generischen Provider für ImmoScout24-Anbieterportale. Dazu zwei kleine, allgemein nützliche Fixes (Spezifikationsfilter nach Detailabruf, Providername im Job-Formular). Der Fork-Code ist bewusst in eigene Dateien ausgelagert, damit Upstream-Merges konfliktfrei bleiben.

- **Generischer Provider für ImmoScout24-Anbieterportale** (Provider; neu; Nutzen mittel, Aufwand gering)  
  Liest die Bestandslisten einzelner Vermieter und Hausverwaltungen unter portal.immobilienscout24.de/ergebnisliste/<Portal-ID>, die alle dasselbe Markup haben; man fügt einfach die Listen-URL ein. Weil die Liste nach Preis sortiert ist und 'neueste zuerst' nur per POST in einer Serversitzung setzbar ist, läuft ein Abruf in drei Schritten: Session-ID holen, Sortierung posten, Seiten mit dieser ID lesen. Büros und Stellplätze werden herausgefiltert, Details kommen über fetchDetails.  
  _Upstream:_ Upstream immoscout.js nutzt nur die ImmoScout24-Suche bzw. Mobile-API; portal.immobilienscout24.de kommt in Upstream lib/ nicht vor.  
  Branch `develop` · Dateien: `lib/provider/immoscoutPortal.js`, `test/provider/immoscoutPortal.test.js` · Commits: [`d946f9a`](https://github.com/yanicii/fredy/commit/d946f9ae5e), [`74ff5f8`](https://github.com/yanicii/fredy/commit/74ff5f8fbb)
- **Spezifikationsfilter nach dem Detailabruf erneut anwenden** (Filter & Suche; neu; Nutzen mittel, Aufwand gering)  
  _filterAfterDetails führt die Preis-, Flächen- und Zimmerfilter (_filterBySpecs) noch einmal auf den angereicherten Daten aus. Vorher kam ein Inserat, dessen Suchkarte z. B. keine Zimmerzahl nennt, durch einen Mindest-Zimmer-Filter, obwohl die Detailseite eine kleinere Zahl liefert. Mit eigenem Test.  
  _Upstream:_ Upstream _filterAfterDetails wendet nach der Anreicherung nur den Blacklist-Filter an, nicht die Spezifikationsfilter.  
  Branch `develop` · Dateien: `lib/FredyPipelineExecutioner.js`, `test/fork/specFilterAfterDetails.test.js` · Commits: [`c716fe2`](https://github.com/yanicii/fredy/commit/c716fe24af)
- **Provider für Hamburger Vermieter und Makler (Thor, Groth & Schneider, Wentzel Dr.)** (Provider; neu; Nutzen niedrig, Aufwand gering)  
  Thor (Erich Thor Wohnungsunternehmen) liest die einseitige Liste per Textmustern und meldet Warmmiete. Groth & Schneider (WordPress, GET-Filter) ergänzt Überschrift, Straße, Zimmer und Baujahr per Puppeteer-Detailabruf. Wentzel Dr. (Frymo-Plugin) spricht direkt den admin-ajax.php-Endpunkt mit dem frymo_query-JSON an, sodass die Filter von der Website wirklich gelten und neueste zuerst paginiert wird. Alle mit Fixture-Tests, dokumentiert in doc/fork-providers.md.  
  _Upstream:_ Keiner dieser Anbieter existiert in Upstream lib/provider.  
  Branch `develop` · Dateien: `lib/provider/thor.js`, `lib/provider/grothSchneider.js`, `lib/provider/wentzelDr.js`, `doc/fork-providers.md` · Commits: [`d946f9a`](https://github.com/yanicii/fredy/commit/d946f9ae5e), [`2b36d03`](https://github.com/yanicii/fredy/commit/2b36d035a0), [`3bb1bd0`](https://github.com/yanicii/fredy/commit/3bb1bd0fa1)
- **Providername in der Job-Tabelle auflösen, wenn der Eintrag keinen hat** (UI/UX; neu; Nutzen niedrig, Aufwand gering)  
  Über die API angelegte Jobs speichern beim Provider nur die ID, sodass die Namensspalte im Job-Formular leer blieb. providerDisplayName() ermittelt den Namen aus der geladenen Providerliste und fällt zuletzt auf die ID zurück.  
  _Upstream:_ Upstream ProviderTable.jsx zeigt weiterhin nur dataIndex 'name' ohne Fallback.  
  Branch `develop` · Dateien: `ui/src/components/table/ProviderTable.jsx`, `ui/src/services/jobs/providerName.js`, `test/ui/providerName.test.js` · Commits: [`680d728`](https://github.com/yanicii/fredy/commit/680d728a10)

_Nicht berücksichtigt:_ Ignoriert: Star-History-Bot-Commits, fork-eigene CLAUDE.md, das eigene Docker-Image-Tag und die Auslagerung von Fork-Code in separate Dateien (reine Merge-Hygiene).

## NoRiceToday/fredy

[Repository](https://github.com/NoRiceToday/fredy) · Zeitraum: 2026-07 · Branches: `local-patches`

Fork vom Juli 2026 mit einem Sammel-Commit 'local patches' für die eigene Wohnungssuche: Kleinanzeigen-Paginierung über mehrere Seiten, Blacklist auch auf die Adresse, Wiederherstellung des Immonet-Providers und keine Soft-Deletes mehr für Dubletten.

- **Kleinanzeigen: Paginierung über bis zu 5 Ergebnisseiten** (Provider; neu; Nutzen mittel, Aufwand gering)  
  Eigene getListings-Funktion im Kleinanzeigen-Provider lädt per Puppeteer nacheinander bis zu 5 Seiten, indem das Segment 'seite:N/' vor den Kategorie-Teil der URL eingefügt wird, parst die Artikel (article[data-adid]) mit Cheerio und stoppt, sobald keine Treffer oder kein Link zur nächsten Seite mehr vorhanden sind. Dazu angepasster crawlContainer/Selektoren.  
  _Upstream:_ Der Upstream-Kleinanzeigen-Provider liest nur die erste Ergebnisseite; Paginierung gibt es dort nicht.  
  Branch `local-patches` · Dateien: `lib/provider/kleinanzeigen.js` · Commits: [`765421e`](https://github.com/NoRiceToday/fredy/commit/765421e59c)
- **Blacklist auch auf die Adresse anwenden** (Filter & Suche; neu; Nutzen mittel, Aufwand gering)  
  applyBlacklist in den Providern Immoscout, Immowelt und Kleinanzeigen prüft zusätzlich das Adressfeld gegen die Blacklist, sodass sich unerwünschte Orte oder Straßen ausschließen lassen.  
  _Upstream:_ Upstream-Blacklists prüfen nur Titel und Beschreibung (Kleinanzeigen zusätzlich Bezirke in der Beschreibung), nicht die Adresse.  
  Branch `local-patches` · Dateien: `lib/provider/immoscout.js`, `lib/provider/immowelt.js`, `lib/provider/kleinanzeigen.js` · Commits: [`765421e`](https://github.com/NoRiceToday/fredy/commit/765421e59c)
- **Immonet-Provider wiederhergestellt** (Provider; teilweise; Nutzen niedrig, Aufwand gering)  
  Stellt lib/provider/immonet.js mit Selektoren für die aktuellen Immonet-Karten (data-testid 'cardmfe-…'), Sortierung nach Datum und activeTester wieder her.  
  _Upstream:_ Upstream hat Immonet 2026-02 (PR #270) bewusst entfernt, weil Immonet zu Immowelt gehört; dessen Inserate deckt der Immowelt-Provider ab.  
  Branch `local-patches` · Dateien: `lib/provider/immonet.js` · Commits: [`765421e`](https://github.com/NoRiceToday/fredy/commit/765421e59c)

_Bereits in Upstream vorhanden:_ Dubletten nicht mehr soft-löschen (Der Upstream-similarityCache schlüsselt inzwischen nach jobId, sodass ein Inserat in einem anderen Job nicht mehr als Dublette gilt und dort nicht gelöscht wird.)

_Nicht berücksichtigt:_ Ignoriert: yarn.lock-Änderungen und .gitignore für ein lokales Backup-Verzeichnis; die in der Commit-Message genannten Immoscout-/Immowelt-URL-Anpassungen sind im Diff nicht enthalten.

## andrey5608/fredy

[Repository](https://github.com/andrey5608/fredy) · Zeitraum: 2026-01 bis 2026-10 · Branches: `master`

Langlebiger Fork, der regelmäßig mit Upstream synchronisiert wird (master zuletzt 2026-09-17 gemergt). Der Schwerpunkt liegt auf mehreren Bildern pro Listing: Galerie in UI, Telegram-Alben und E-Mails, Bild-Proxy mit Cache. Dazu kommen Idealista-Fotos mit wählbarer Link-Sprache und kleinere Navigationsverbesserungen. Ältere Branches enthalten nur Upstream-Commits oder inzwischen überholte Arbeiten.

- **Mehrere Bilder pro Listing mit Bild-Proxy, Galerie und Telegram-Alben** (Benachrichtigung; neu; Nutzen hoch, Aufwand hoch)  
  Neue Tabelle listing_images (Migration 46, ON DELETE CASCADE); image_url bleibt als erstes Bild erhalten. Immowelt, immobilien.de, Engel & Völkers, ImmoScout (MEDIA-Abschnitt des Exposés) und Kleinanzeigen liefern ohne zusätzliche Requests die ganze Galerie. Ein Bild-Proxy GET /api/images/:imageId cacht auf der Festplatte und komprimiert über sharp auf etwa 1 MB; ein täglicher Cron räumt den Cache auf (Admin-Einstellungen maxImagesPerListing und imageCacheRetentionDays). Die Detailansicht zeigt eine Galerie mit Vorschauleiste, Telegram sendet Alben per sendMediaGroup (10er-Blöcke mit URL-Fallback), SMTP/Resend/SendGrid/Mailjet/Slack/HTTP enthalten alle Bilder, und das neue MCP-Tool get_photos_for_listing liefert die ganze Galerie.  
  _Upstream:_ Upstream speichert weiterhin nur ein image_url pro Listing, hat keine Tabelle listing_images, keinen Bild-Proxy und kein sendMediaGroup; get_photo_for_listing liefert nur ein Foto.  
  Branch `master` · Dateien: `lib/services/storage/migrations/sql/46.listing-images.js`, `lib/api/routes/imagesRouter.js`, `lib/services/images/imageCache.js`, `lib/services/images/imageProcessor.js` · Commits: [`5c127e9`](https://github.com/andrey5608/fredy/commit/5c127e99ad), [`6833890`](https://github.com/andrey5608/fredy/commit/68338909ce), [`dc9d823`](https://github.com/andrey5608/fredy/commit/dc9d8230fd) und 2 weitere
- **Idealista: Fotogalerie und Link-Sprache pro Job** (Provider; neu; Nutzen mittel, Aufwand gering)  
  Der ohnehin abgefragte Advert-Detail-Endpunkt wird zusätzlich nach multimedia.images ausgewertet (bis zu 10 signierte Bild-URLs, dedupliziert), sodass Idealista-Listings eine Galerie statt nur des Vorschaubilds bekommen. Außerdem kann im Job-Editor je Idealista-Eintrag eine Sprache für die Anzeigenlinks gewählt werden (Standard Englisch, "original" lässt sie unverändert); withLinkLanguage schreibt das Sprachsegment im Pfad um, erst nach dem Hashen der ID, damit ein Sprachwechsel keine Duplikate erzeugt.  
  _Upstream:_ Upstream idealista.js liest aus dem Detail-Endpunkt nur das Änderungsdatum (readAdvertModificationDate) und kennt keine Link-Sprache.  
  Branch `master` · Dateien: `lib/provider/idealista.js`, `lib/services/idealista/search.js`, `lib/services/idealista/portal.js`, `ui/src/views/jobs/mutation/components/provider/ProviderMutator.jsx` · Commits: [`ca623f9`](https://github.com/andrey5608/fredy/commit/ca623f9d7f)
- **Navigation als echte Links, klickbare Job-Karten und Logo** (UI/UX; neu; Nutzen niedrig, Aufwand mittel)  
  Menüpunkte werden als echte Anker (href="#/…") gerendert, sodass Mittelklick, Strg-Klick und "In neuem Tab öffnen" funktionieren; normale Klicks übernimmt weiter der Router, ohne mit der Hash-Navigation zu konkurrieren. Job-Karten öffnen per Klick den Editor, ein zusätzlicher Knopf führt zu den Listings des Jobs, Logo/Herz in der Seitenleiste verlinken auf das Dashboard. Außerdem wird das Versionsbanner als angedockter, schließbarer Hinweis dargestellt, und die Liste teilbarer Benutzer aktualisiert sich nach Anlegen oder Löschen.  
  _Upstream:_ Die Upstream-Navigation nutzt weiterhin reine onClick-Handler ohne href, Job-Karten sind nicht klickbar und das Logo ist kein Link; die Upstream-UI wurde seitdem allerdings stark umgebaut.  
  Branch `master` · Dateien: `ui/src/components/navigation/Navigation.jsx`, `ui/src/components/grid/jobs/JobGrid.jsx`, `ui/src/components/version/VersionBanner.jsx`, `ui/src/views/user/mutation/UserMutator.jsx` · Commits: [`cd21183`](https://github.com/andrey5608/fredy/commit/cd2118356c), [`d0cbf48`](https://github.com/andrey5608/fredy/commit/d0cbf48290)

_Nicht berücksichtigt:_ Ignoriert: Branches listing-management, improvements und 185-bug-old-runs-filling-up-disk (nur alte Upstream-Commits), Wiederverwendung von Benachrichtigungsadaptern und Navigationsschutz für ungespeicherte Job-Änderungen (beim Sync verworfen; Upstream hat dafür configured adapters (Migration 32) und useUnsavedWarning), Entfernen des Trackings, Workflow-, Test- und Lockfile-Änderungen, Migrations-Umbenennungen, Wiederherstellung des Demo-Cleanup-Crons, Löschen von readme-ru.md.

## C9H13NO3-dev/fredy

[Repository](https://github.com/C9H13NO3-dev/fredy) · Zeitraum: 2025-08 bis 2025-09 · Branches: `master`

Fork von Aug./Sept. 2025 (teils mit Codex erstellt), der drei 'Benachrichtigungs'-Adapter ergänzt, die neue Listings in externe Datenbanken schreiben: CouchDB, NocoDB (v2-API) und Supabase. Ein Branch heißt zwar 'add-postgresql-adapter', enthält aber keinen eigenen PostgreSQL-Adapter.

- **Supabase-Adapter mit optionaler Tabellenanlage** (Daten & Speicherung; neu; Nutzen mittel, Aufwand gering)  
  supabase.js schreibt Listings (serviceName, jobKey, id, size, rooms, price, address, title, link, description) per @supabase/supabase-js in eine konfigurierbare Tabelle, in 500er-Chunks. Ist zusätzlich ein Postgres-Connection-String hinterlegt, legt der Adapter die Tabelle vorher per pg mit CREATE TABLE IF NOT EXISTS an (alle Spalten TEXT, TLS ohne Zertifikatsprüfung).  
  _Upstream:_ Upstream hat als Datensenken nur den sqlite- und den generischen http-Adapter, keine Supabase/Postgres-Anbindung.  
  Branch `master` · Dateien: `lib/notification/adapter/supabase.js`, `lib/notification/adapter/supabase.md` · Commits: [`899b3fe`](https://github.com/C9H13NO3-dev/fredy/commit/899b3feb88)
- **NocoDB-Adapter (v2-API)** (Daten & Speicherung; neu; Nutzen niedrig, Aufwand gering)  
  nocodb.js postet jedes neue Listing als Datensatz an /api/v2/tables/<tableId>/records einer NocoDB-Instanz, authentifiziert per xc-token; Felder werden auf eine feste Liste gemappt. So lassen sich gefundene Wohnungen in einer Airtable-ähnlichen Oberfläche verwalten.  
  _Upstream:_ Upstream-http.js sendet einen verschachtelten Payload mit Bearer-Token und passt daher nicht direkt zur NocoDB-API; ein NocoDB-Adapter fehlt.  
  Branch `master` · Dateien: `lib/notification/adapter/nocodb.js`, `lib/notification/adapter/nocodb.md` · Commits: [`b3a55e7`](https://github.com/C9H13NO3-dev/fredy/commit/b3a55e7808), [`270d538`](https://github.com/C9H13NO3-dev/fredy/commit/270d53883c), [`905973d`](https://github.com/C9H13NO3-dev/fredy/commit/905973db47)
- **CouchDB-Adapter** (Daten & Speicherung; neu; Nutzen niedrig, Aufwand gering)  
  couchdb.js speichert neue Listings samt serviceName und jobKey per nano-Client als Bulk-Dokumente in einer CouchDB-Datenbank, die bei Bedarf angelegt wird; optional mit Benutzer/Passwort.  
  _Upstream:_ Kein CouchDB-Adapter in Upstream; Listings liegen dort ohnehin in der eigenen SQLite-Datenbank.  
  Branch `master` · Dateien: `lib/notification/adapter/couchdb.js`, `lib/notification/adapter/couchdb.md` · Commits: [`ba59515`](https://github.com/C9H13NO3-dev/fredy/commit/ba595150de)

_Nicht berücksichtigt:_ Ignoriert: Lockfile-Commits ('restore yarn lock', 'fix yarn freeze'); die codex/*-Branches enthalten nur Zwischenstände derselben Commits.

## johannesvedder/fredy

[Repository](https://github.com/johannesvedder/fredy) · Zeitraum: 2026-08 · Branches: `merged-feature-branch`, `feat/job-address-selection`, `fix/postcode-geocoding`, `fix/email-notification-localization`

Kleiner, sauber getesteter Fork auf Stand Ende August 2026 mit drei Verbesserungen: Jobs können gezielt auswählen, welche gespeicherten Referenzadressen (Pendelziele) sie nutzen, das Geocoding prüft die Postleitzahl des Nominatim-Treffers, und die HTML-E-Mail-Benachrichtigungen sind auf Deutsch/Englisch lokalisiert. Alles ist im Branch merged-feature-branch zusammengeführt.

- **Postleitzahl-Validierung beim Geocoding** (Karte & Geodaten; neu; Nutzen hoch, Aufwand gering)  
  Der Nominatim-Client fragt mit addressdetails=1 ab und akzeptiert nur Treffer, deren Postleitzahl zur PLZ in der Inseratsadresse passt (extractPostcode, 4-stellig für AT/CH, ohne Hausnummern zu verwechseln). Damit landet z. B. '45659 Stadtmitte' nicht mehr in Berlin; als Fallback werden Adresse ohne Klammerzusatz und die PLZ allein versucht, validierte Ergebnisse kommen in einen begrenzten In-Memory-Cache. Ändern sich die Koordinaten eines Inserats, werden gespeicherte Entfernungen und Fahrzeiten verworfen.  
  _Upstream:_ Upstream doGeocode nimmt weiterhin ungeprüft data[0] und kennt keine PLZ-Prüfung; updateListingGeocoordinates setzt Entfernungen nicht zurück.  
  Branch `fix/postcode-geocoding` · Dateien: `lib/services/geocoding/client/nominatimClient.js`, `lib/services/geocoding/geoCodingService.js`, `lib/services/storage/listingsStorage.js` · Commits: [`890f4e4`](https://github.com/johannesvedder/fredy/commit/890f4e4570), [`a778ac8`](https://github.com/johannesvedder/fredy/commit/a778ac8f4b), [`84f5173`](https://github.com/johannesvedder/fredy/commit/84f5173a63)
- **Referenzadressen pro Job auswählen (Pendelfilter)** (Filter & Suche; neu; Nutzen mittel, Aufwand mittel)  
  Der Pendelzeit-Abschnitt im Job-Formular (CommuteFilter.jsx) bekommt pro gespeicherter Adresse einen Schalter 'Für diesen Job verwenden'; der commuteFilter speichert dazu ein Feld addressLabels. Entfernungen, Fahrzeiten, Karte und Detailansicht berücksichtigen nur noch die gewählten Adressen (addressesForJob in commuteBudget.js, Neuberechnung bei Änderung der Auswahl in jobRouter/distanceService). Folgecommits härten das ab (XSS im Adress-Popup, keine Job-Daten-Lecks) und verhindern, dass laufende Routing-Abfragen veraltete Fahrzeiten speichern, wenn sich Adresse oder Koordinaten zwischenzeitlich ändern (routingSignature/isCurrent im travelTimeSweeper).  
  _Upstream:_ Upstream-Master kennt kein addressLabels/addressesForJob; jeder Job rechnet weiterhin gegen alle gespeicherten Adressen.  
  Branch `feat/job-address-selection` · Dateien: `lib/utils/commuteBudget.js`, `lib/api/routes/jobRouter.js`, `lib/api/routes/listingsRouter.js`, `lib/services/listings/travelTimeSweeper.js` · Commits: [`eaefa2e`](https://github.com/johannesvedder/fredy/commit/eaefa2edd9), [`58cc240`](https://github.com/johannesvedder/fredy/commit/58cc240348), [`756f0e1`](https://github.com/johannesvedder/fredy/commit/756f0e1a2c)
- **Lokalisierte E-Mail-Benachrichtigungen (DE/EN)** (Benachrichtigung; neu; Nutzen mittel, Aufwand gering)  
  Neues Modul emailLocalization.js baut Betreff und HTML für SMTP, Mailjet und Resend in der gespeicherten UI-Sprache des Job-Besitzers (Deutsch oder Englisch), inklusive Singular/Plural für neue Inserate und Preisänderungen. Das Handlebars-Template nutzt dafür Label-Platzhalter statt fester englischer Texte und zeigt zusätzlich Job und Dienst an; notify.send reicht die Sprache an die Adapter durch.  
  _Upstream:_ Das Upstream-Template enthält weiterhin fest verdrahtete englische Texte ('View Listing', 'Price'), notify.js kennt keinen Sprachparameter.  
  Branch `fix/email-notification-localization` · Dateien: `lib/notification/emailLocalization.js`, `lib/notification/emailTemplate/template.hbs`, `lib/notification/notify.js`, `lib/notification/adapter/smtp.js` · Commits: [`17e0c10`](https://github.com/johannesvedder/fredy/commit/17e0c10ffe)

_Nicht berücksichtigt:_ e2e8a1dcbd gleicht nur JSDoc-Typen nach dem Zusammenführen der Branches an; master ist identisch mit Upstream.

## JsonLord/fredy

[Repository](https://github.com/JsonLord/fredy) · Zeitraum: 2026-07 · Branches: `kleinanzeigen-api-integration-2270847634649632849`, `integration-kleinanzeigen`

Fork vom Juli 2026, dessen rund 12k Zeilen fast vollständig ein eingebettetes Fremdprojekt sind: der Python/FastAPI-Scraper DanielWTE/ebay-kleinanzeigen-api (MIT) im Ordner ebay-kleinanzeigen-api/. Darauf aufbauend stellen zwei von Google Jules erzeugte Commits den Kleinanzeigen-Provider auf diesen externen Dienst um und machen ihn zur allgemeinen Artikelsuche, also nicht mehr nur für Immobilien. Als allgemein nützliche Nebenprodukte kommen eine Positivliste (Whitelist) je Job und ein Mindestpreis im Kriterienfilter hinzu.

- **Positivliste (Include Words) je Suchauftrag** (Filter & Suche; neu; Nutzen mittel, Aufwand gering)  
  Jobs bekommen ein Feld whitelist mit einer neuen Spalte jobs.whitelist (Migration 22.add-whitelist-to-jobs.js), das in jobStorage und jobRouter gelesen und gespeichert wird. FredyPipelineExecutioner._filterByWhitelist läuft direkt nach dem Provider-Filter und behält nur Inserate, deren Titel oder Beschreibung mindestens einen der Begriffe enthält, ohne auf Groß- und Kleinschreibung zu achten. In JobMutation.jsx gibt es dafür ein TagInput samt Texten in en.json. So lassen sich Pflichtbegriffe wie 'Balkon' oder 'Altbau' erzwingen, als Gegenstück zur Blacklist.  
  _Upstream:_ Upstream kennt je Job nur eine Blacklist. Die Migrationsnummer 22 kollidiert mit dem Upstream-Stand (22.multi-address-distances.js) und müsste neu vergeben werden.  
  Branch `kleinanzeigen-api-integration-2270847634649632849` · Dateien: `lib/FredyPipelineExecutioner.js`, `lib/services/storage/jobStorage.js`, `lib/services/storage/migrations/sql/22.add-whitelist-to-jobs.js`, `ui/src/views/jobs/mutation/JobMutation.jsx` · Commits: [`0caba70`](https://github.com/JsonLord/fredy/commit/0caba7037c)
- **Kleinanzeigen-Provider über externe Python-API (allgemeine Artikelsuche)** (Provider; neu; Nutzen niedrig, Aufwand hoch)  
  lib/api/kleinanzeigenApiClient.js spricht einen separaten FastAPI/Playwright-Dienst an (Standard http://localhost:8000, Endpunkte /inserate, /inserate-by-url, /inserat/{id} und /convert-url). Der Provider scrapt nicht mehr selbst im DOM. Er wandelt eine Such-URL über /convert-url in strukturierte Parameter um, fällt sonst auf die URL-Suche zurück und akzeptiert auch reine Suchbegriffe. Details, Attribute und Verkäufer kommen über /inserat/{id}. Fläche und Zimmer sind keine Pflichtfelder mehr, und der Puppeteer-Test wird durch einen Mock-Test ersetzt. Der Python-Dienst selbst liegt als Kopie im Repo.  
  _Upstream:_ Upstream scrapt Kleinanzeigen direkt mit Puppeteer und Cheerio und ist auf Immobilien ausgelegt. Ein externer Python-Dienst und eine allgemeine Artikelsuche sind dort nicht vorgesehen.  
  Branch `kleinanzeigen-api-integration-2270847634649632849` · Dateien: `lib/api/kleinanzeigenApiClient.js`, `lib/provider/kleinanzeigen.js`, `test/provider/kleinanzeigen_api.test.js`, `ebay-kleinanzeigen-api/main.py` · Commits: [`8604a72`](https://github.com/JsonLord/fredy/commit/8604a7282f), [`7c7195f`](https://github.com/JsonLord/fredy/commit/7c7195f498), [`0caba70`](https://github.com/JsonLord/fredy/commit/0caba7037c)
- **Mindestpreis im Kriterienfilter des Jobs** (Filter & Suche; teilweise; Nutzen mittel, Aufwand gering)  
  specFilter erhält minPrice. _filterBySpecs verwirft Inserate unterhalb dieses Preises, und JobMutation.jsx zeigt das Feld neben maxPrice, minSize und minRooms an. Damit lassen sich zum Beispiel Stellplätze oder Lockangebote mit unrealistisch niedrigem Preis aussortieren. Im Fork fehlt der Übersetzungsschlüssel jobs.mutation.filterMinPrice.  
  _Upstream:_ Upstream kennt minPrice im Listenfilter und im MCP-Tool list_listings, und priceRange.js liest specFilter.minPrice. Der Job-Kriterienfilter in UI und Pipeline bietet aber nur maxPrice, minSize und minRooms.  
  Branch `kleinanzeigen-api-integration-2270847634649632849` · Dateien: `lib/FredyPipelineExecutioner.js`, `lib/types/filter.js`, `ui/src/views/jobs/mutation/JobMutation.jsx` · Commits: [`0caba70`](https://github.com/JsonLord/fredy/commit/0caba7037c)

_Nicht berücksichtigt:_ Commit 8604a7282f bettet das komplette Fremd-Repo DanielWTE/ebay-kleinanzeigen-api ein (ca. 12k Zeilen Python, Tests, Lasttests, uv.lock, README). Daneben gibt es nur die conf/config.json-Änderung mit der API-URL; der master-Branch hat keine eigenen Commits.

## madsbergstroem/fredy

[Repository](https://github.com/madsbergstroem/fredy) · Zeitraum: 2026-07 bis 2026-09 · Branches: `truffle-2210`

Fork für eine private Selbsthosting-Instanz, der mehrfach auf neue Upstream-Releases rebased wurde (aktueller Stand im Branch truffle-2210, Basis 2026-09-03). Er ergänzt OpenID-Connect-Login, einen Gebietsfilter beim Lesen über MCP und optionale MCP-Schreibtools; der früher lokal gepflegte InBerlinWohnen-Provider ist inzwischen upstream.

- **Single Sign-on über OpenID Connect** (Sicherheit; neu; Nutzen mittel, Aufwand mittel)  
  Neuer Dienst lib/services/security/oidc.js (openid-client) mit Authorization-Code-Flow inklusive state, nonce und PKCE; konfiguriert wird er über Umgebungsvariablen (FREDY_OIDC_ISSUER, _CLIENT_ID, optional _CLIENT_SECRET/_CLIENT_AUTH_METHOD, _REDIRECT_URI, _SUBJECT_MAP für die Zuordnung OIDC-Subject → Fredy-Benutzer, optional Auto-Login). loginRoute.js bekommt Start- und Callback-Route mit Binding-Cookie, begrenztem Transaktionsspeicher und Rate-Limit; die Login-Seite zeigt einen SSO-Knopf, der lokale Login bleibt erhalten. Gedacht für Identity Provider wie Pocket-ID, Authelia oder Keycloak hinter einem Reverse Proxy.  
  _Upstream:_ Upstream hat keine OIDC-/SSO-Anbindung; laut Commit-Text wurde natives OIDC upstream abgelehnt (orangecoding/fredy#368).  
  Branch `truffle-2210` · Dateien: `lib/services/security/oidc.js`, `lib/api/routes/loginRoute.js`, `lib/api/api.js`, `ui/src/views/login/Login.jsx` · Commits: [`a4144f6`](https://github.com/madsbergstroem/fredy/commit/a4144f637f), [`474ee50`](https://github.com/madsbergstroem/fredy/commit/474ee5055a), [`3417271`](https://github.com/madsbergstroem/fredy/commit/3417271a27)
- **Job-Gebietsfilter auch beim Lesen über MCP (list_listings)** (MCP & KI; neu; Nutzen niedrig, Aufwand gering)  
  Die Punkt-in-Polygon-Prüfung wird in lib/services/spatial.js ausgelagert und sowohl von der Crawl-Pipeline (_filterByArea) als auch von queryListings genutzt: list_listings filtert damit auch nachträglich nach dem gezeichneten Gebiet des Jobs, etwa für Listings, die beim Crawl noch keine Koordinaten hatten. Listings ohne Koordinaten bleiben sichtbar und werden in der MCP-Tabelle als "Gebiet noch nicht prüfbar" markiert. Damit das funktioniert, speichert der Geocoding-Cron den Nicht-gefunden-Marker -1/-1 nicht mehr, sondern lässt die Zeile für einen neuen Versuch offen.  
  _Upstream:_ Upstream wendet das Gebiet nur beim Crawl an (_filterByArea) und speichert im Geocoding-Cron weiterhin -1/-1; list_listings kennt keinen Gebietsfilter.  
  Branch `truffle-2210` · Dateien: `lib/services/spatial.js`, `lib/services/storage/listingsStorage.js`, `lib/FredyPipelineExecutioner.js`, `lib/mcp/mcpNormalizer.js` · Commits: [`533584c`](https://github.com/madsbergstroem/fredy/commit/533584c041), [`74c755f`](https://github.com/madsbergstroem/fredy/commit/74c755fda7), [`5854c6b`](https://github.com/madsbergstroem/fredy/commit/5854c6b766) und 1 weitere
- **Optionale MCP-Schreibtools (Status, Notizen, Merkliste)** (MCP & KI; teilweise; Nutzen niedrig, Aufwand gering)  
  lib/mcp/mcpWriteTools.js registriert nur bei FREDY_MCP_WRITE_ENABLED=true die Tools set_listing_status (applied/rejected/accepted/none), set_listing_notes und set_listing_watch; sie prüfen den Zugriff auf das Listing und geben den tatsächlich gespeicherten Zustand zurück. get_listing zeigt zusätzlich die Notizen.  
  _Upstream:_ Upstream hat seit 2026-09-10 MCP-Schreibtools mit eigenem OAuth-Scope mcp:write (add_listing_note, set_listing_notes, watch_listing, unwatch_listing); nur ein Tool zum Setzen des Listing-Status fehlt dort.  
  Branch `truffle-2210` · Dateien: `lib/mcp/mcpWriteTools.js`, `lib/mcp/mcpAdapter.js`, `lib/mcp/mcpNormalizer.js`, `test/mcp/mcpWriteTools.test.js` · Commits: [`e711951`](https://github.com/madsbergstroem/fredy/commit/e711951d1a), [`e0a6196`](https://github.com/madsbergstroem/fredy/commit/e0a6196331), [`3417271`](https://github.com/madsbergstroem/fredy/commit/3417271a27)

_Nicht berücksichtigt:_ Ignoriert: mehrere Rebase-/Backup-Branches mit denselben Änderungen (backup/*, upgrade/*, ct200-deploy-snapshot), der InBerlinWohnen-Provider (upstream seit PR #367), ein lokaler Build-Snapshot und Lockfile-Änderungen.

## netzkontrast/fredy

[Repository](https://github.com/netzkontrast/fredy) · Zeitraum: 2026-09 · Branches: `master`, `feat/koeln-bonn-providers`, `feat/vonovia-provider`

Kleiner, aktueller Fork (Basis 2026-09) mit zehn neuen browserlosen Providern: Vonovia als bundesweit größter Vermieter sowie Wohnungsunternehmen und Portale mit Schwerpunkt Köln/Bonn/NRW (LEG, GAG, Vivawest, Aachener SWG, VEBOWAG) und überregionale Anbieter (Grand City Property, Adler Group, Wunderflats, immosuchmaschine). Alle mit Fixture-Tests und nach Upstream-Konventionen eingebunden.

- **Vonovia-Provider über die JSON-Schnittstelle** (Provider; neu; Nutzen hoch, Aufwand gering)  
  Liest Angebote von vonovia.de über den JSON-Endpunkt /api/real-estate/list (Limit 50, Paginierung per offset) ohne Browser; Details und Preisprobe kommen aus dem data-vonovia-data-Record der Exposéseite. Kontaktdaten von Ansprechpartnern werden aus der Beschreibung entfernt. Nutzt dieselbe Plattform wie der bestehende Deutsche-Wohnen-Provider und teilt sich mit ihm Offline-Fetch-Mock und Fixture-Download.  
  _Upstream:_ Upstream hat nur lib/provider/deutscheWohnen.js auf derselben Plattform, aber keinen Vonovia-Provider.  
  Branch `feat/vonovia-provider` · Dateien: `lib/provider/vonovia.js`, `test/provider/vonovia.test.js`, `test/offlineFixtures.js`, `doc/providers.md` · Commits: [`e11d808`](https://github.com/netzkontrast/fredy/commit/e11d808a47)
- **Provider für Wohnungsunternehmen in Köln/Bonn/NRW** (Provider; neu; Nutzen mittel, Aufwand gering)  
  Neue Scraper für LEG Wohnen (Stadtseiten, Kaltmiete und Beschreibung von der Detailseite), GAG Köln (nur erste Seite, da Paging-URLs per robots.txt gesperrt), Vivawest (seitenweise), Aachener SWG (Listenabfrage per POST-Formular aus der eingefügten URL) und VEBOWAG Bonn (über den öffentlichen Immomio-Widget-Endpunkt). Alle kommen ohne Browser aus, sind in Preis-Tracking-, Preisbereichs- und Deal-Type-Tabellen eingetragen und haben Offline-Tests.  
  _Upstream:_ Keiner dieser Anbieter existiert in Upstream lib/provider.  
  Branch `feat/koeln-bonn-providers` · Dateien: `lib/provider/legWohnen.js`, `lib/provider/gagKoeln.js`, `lib/provider/vivawest.js`, `lib/provider/aachenerSwg.js` · Commits: [`e0b535a`](https://github.com/netzkontrast/fredy/commit/e0b535aee5)
- **Überregionale Provider: Grand City Property, Adler Group, Wunderflats, immosuchmaschine** (Provider; neu; Nutzen mittel, Aufwand gering)  
  Grand City Property über die Suchseite (URL muss cityText tragen), Adler Group über die komplette Angebotsseite (Warmmiete), Wunderflats (möblierte Wohnungen auf Zeit) über das in die Suchseite eingebettete JSON statt der gesperrten /api/ sowie die Metasuche immosuchmaschine.de über Ergebniskarten. Damit werden weitere große Bestandshalter und ein Möbliert-Portal ohne Browser abgedeckt; doc/providers.md ist ergänzt.  
  _Upstream:_ Keiner dieser Anbieter existiert in Upstream lib/provider oder doc/providers.md.  
  Branch `feat/koeln-bonn-providers` · Dateien: `lib/provider/grandCityProperty.js`, `lib/provider/adlerGroup.js`, `lib/provider/wunderflats.js`, `lib/provider/immosuchmaschine.js` · Commits: [`e0b535a`](https://github.com/netzkontrast/fredy/commit/e0b535aee5)

## oneskovic/fredy

[Repository](https://github.com/oneskovic/fredy) · Zeitraum: 2026-09 bis 2026-09 · Branches: `master`, `swka-scraper`

Kleiner, aktueller Fork (Basis 2026-09-08), der Fredy Richtung automatisierter Wohnungsbewerbung erweitert: vollständige Paginierung bei ImmoScout und WG-Gesucht, ein MCP-Tool, das Bewerbungen als Gmail-Entwurf anlegt, und ein eigenständiger Scraper für die Zimmervermittlung des Studierendenwerks Karlsruhe (sw-ka.de).

- **Alle Ergebnisseiten bei ImmoScout und WG-Gesucht abrufen** (Provider; neu; Nutzen hoch, Aufwand gering)  
  ImmoScout ruft über die Mobile-API nacheinander alle Seiten ab (Parameter pagenumber, Seitenzahl aus numberOfPages), WG-Gesucht liest die Paginierungslinks der ersten Seite aus und baut daraus die URLs der Folgeseiten (.N.html). Beide haben eine Sicherheitsgrenze von 100 Seiten und deduplizieren nach Listing-ID, weil Anzeigen während des Crawls zwischen Seiten wandern können. Dadurch gehen bei breiten Suchen keine Treffer jenseits der ersten Seite mehr verloren; Transport ist für Tests injizierbar.  
  _Upstream:_ Upstream-Master paginiert nur bei casa.js, deutscheWohnen.js und inberlinwohnen.js; immoscout.js und wgGesucht.js laden weiterhin nur die erste Seite.  
  Branch `master` · Dateien: `lib/provider/immoscout.js`, `lib/provider/wgGesucht.js`, `test/provider/immoscout.test.js`, `test/provider/wgGesucht.test.js` · Commits: [`279ff09`](https://github.com/oneskovic/fredy/commit/279ff0968a)
- **Bewerbung als Gmail-Entwurf per MCP-Tool apply_for_listing** (MCP & KI; neu; Nutzen mittel, Aufwand hoch)  
  Neues MCP-Tool apply_for_listing legt für ein gespeichertes Listing idempotent einen Bewerbungsentwurf im verbundenen Gmail-Konto an (nur Entwurf, kein Versand). Dazu kommen ein Gmail-OAuth-Flow unter Einstellungen → Verbindungen (Scope gmail.compose, Refresh-Token AES-256-GCM-verschlüsselt in SQLite), eine Tabelle für Bewerbungsdatensätze mit Statusmaschine (preparing/draft_created/delivery_unknown, Migration 42), ein eigener OAuth-Scope mcp:apply sowie Provider-Handler, die den Kontaktweg bestimmen und prüfen, dass die Empfängeradresse wörtlich in den gescrapten Vermieterdaten steht (LLM darf keine Adresse erfinden). get_listing liefert zusätzlich die Bewerbungsanforderungen; der Härtungs-Commit ergänzt RFC-2047-Betreffkodierung und CC.  
  _Upstream:_ Upstream erzeugt seit lib/services/application/ nur den Anschreibentext (get_application_letter, ApplicationModal), hat aber keine Gmail-Anbindung und kein Anlegen von Entwürfen; der Fork-Code ist ein Prototyp mit fest eingetragenen privaten Absender-/CC-Adressen und unterstützt E-Mail-Kontakt praktisch nur für sw-ka.  
  Branch `master` · Dateien: `lib/services/applications/applicationService.js`, `lib/services/applications/providerHandlers.js`, `lib/services/gmail/gmailService.js`, `lib/services/gmail/gmailOAuthService.js` · Commits: [`12dcfd2`](https://github.com/oneskovic/fredy/commit/12dcfd2d22), [`cf803aa`](https://github.com/oneskovic/fredy/commit/cf803aac35)
- **Eigenständiger Scraper für Studierendenwerk Karlsruhe (sw-ka.de)** (Provider; neu; Nutzen niedrig, Aufwand mittel)  
  Separates Paket swka-scraper/ (eigene package.json, eigene SQLite-DB, keine Abhängigkeit zu lib/), das die Privatzimmerbörse von sw-ka.de mit Login ausliest und ein sehr reichhaltiges Schema speichert (Nebenkosten-Art, Kaution, Energieausweis, Ausstattung/Präferenzen als Listen, Verfügbarkeit, ÖPNV-Entfernung, Vermieterkontakt) plus ein Markdown-rawText für spätere LLM-Auswertung. Upsert nach sw-ka-ID, Tests gegen echte HTML-Fixtures. copyright.js wird angepasst, damit das Verzeichnis keinen Fredy-Header bekommt.  
  _Upstream:_ Upstream hat keinen sw-ka-Provider; der Fork-Code ist bewusst kein Fredy-Provider, die Parser-Logik könnte aber als Grundlage für einen dienen.  
  Branch `swka-scraper` · Dateien: `swka-scraper/src/detailPage.js`, `swka-scraper/src/listPage.js`, `swka-scraper/src/auth.js`, `swka-scraper/src/storage.js` · Commits: [`17a7581`](https://github.com/oneskovic/fredy/commit/17a7581783), [`abb8486`](https://github.com/oneskovic/fredy/commit/abb848655c)

## paula003/fredy

[Repository](https://github.com/paula003/fredy) · Zeitraum: 2026-06 · Branches: `master`, `feat/date-filter`

Fork aus Juni 2026 mit zwei Providern für möblierte Zeitmiete (HousingAnywhere, Wunderflats) und einem Einzugsdatums-Filter, für den mehrere Provider das Verfügbarkeitsdatum ('Bezugsfrei ab') auslesen. master und feat/date-filter sind identisch.

- **Filter nach Einzugsdatum (frühestens/spätestens)** (Filter & Suche; neu; Nutzen hoch, Aufwand mittel)  
  Der Spec-Filter eines Jobs bekommt moveInEarliest/moveInLatest (Datumsauswahl im Job-Formular), _filterBySpecs in FredyPipelineExecutioner.js verwirft Inserate, deren Verfügbarkeitsdatum außerhalb des Bereichs liegt; Inserate ohne Datum bleiben erhalten. Dafür gibt es eine neue Spalte available_from (Migration) und den Parser normalize-availability-date.js (deutsche Datumsformate, 'ab sofort' usw. → ISO). ImmoScout (aus 'Bezugsfrei ab' in den Details), Immowelt, WG-Gesucht und die beiden neuen Provider füllen das Feld; mit Tests.  
  _Upstream:_ Upstream-SpecFilter (lib/types/filter.js) kennt nur minRooms, minSize und maxPrice; Inserate haben kein Verfügbarkeitsdatum.  
  Branch `master` · Dateien: `lib/FredyPipelineExecutioner.js`, `lib/utils/normalize-availability-date.js`, `lib/services/storage/migrations/sql/22.add-available-from-to-listings.js`, `lib/provider/immoscout.js` · Commits: [`24ddd0b`](https://github.com/paula003/fredy/commit/24ddd0b871)
- **Provider HousingAnywhere** (Provider; neu; Nutzen mittel, Aufwand gering)  
  Neuer Provider lib/provider/housingAnywhere.js fragt direkt den öffentlichen Algolia-Index ab, den die Website clientseitig nutzt (Replica 'most recent', 50 Treffer), statt die React-Seite zu scrapen. Titel werden aus Objekttyp und Ort gebaut, das erste freie Verfügbarkeitsdatum wird übernommen; Test mit JSON-Fixture.  
  _Upstream:_ Kein HousingAnywhere-Provider im Upstream-Master.  
  Branch `master` · Dateien: `lib/provider/housingAnywhere.js`, `test/provider/housingAnywhere.test.js` · Commits: [`96ecc19`](https://github.com/paula003/fredy/commit/96ecc19115)
- **Provider Wunderflats** (Provider; neu; Nutzen mittel, Aufwand gering)  
  Neuer Provider lib/provider/wunderflats.js lädt die Suchseite über den gemeinsamen Puppeteer-Browser und liest die Treffer aus dem eingebetteten data-hydrant-JSON statt aus dem DOM. Verfügbarkeitsdatum, Preis, Fläche und Zimmer werden übernommen; Tests mit Listen- und Detail-Fixture.  
  _Upstream:_ Kein Wunderflats-Provider im Upstream-Master.  
  Branch `master` · Dateien: `lib/provider/wunderflats.js`, `test/provider/wunderflats.test.js` · Commits: [`96ecc19`](https://github.com/paula003/fredy/commit/96ecc19115)

_Nicht berücksichtigt:_ Ignoriert: lokale .claude/settings.local.json und README-Anpassungen.

## Tee132me/fredy

[Repository](https://github.com/Tee132me/fredy) · Zeitraum: 2025-11 bis 2025-12 · Branches: `master`

Kein Fork mit gemeinsamer Historie. Ein Import-Commit kopiert Upstream-Stand v14.3.6 (Ende November 2025) komplett, das macht den Großteil der rund 12k Zeilen aus (allein yarn.lock ca. 8k). Darauf folgen Anpassungen für den Betrieb auf Railway und für die Anbindung eines eigenen Telegram-Bots: eine externe REST-API zur Job-Verwaltung per API-Key, ein Abgleich der Jobs aus config.json in die Datenbank sowie Umgebungsvariablen, begrenzte Parallelität und Health-Endpoint. Vieles davon ist eng auf die eigene Instanz zugeschnitten.

- **Jobs deklarativ aus config.json synchronisieren (mit File-Watcher)** (Deployment & Betrieb; neu; Nutzen mittel, Aufwand mittel)  
  configJobSync.js liest beim Start und bei jeder Änderung von config.json (fs.watch, 2 s Debounce) die dort definierten Jobs und legt sie per upsertJob unter dem technischen Nutzer config_sync an oder aktualisiert sie. Adapter im Format {id, args} oder globale Adapter werden dabei ins Datenbankformat {id, fields} umgewandelt. Jobs, die aus der Datei verschwunden sind, werden gelöscht. Damit lassen sich Suchaufträge als Konfiguration im Repository verwalten (Config-as-Code).  
  _Upstream:_ Upstream importiert jobs.json nur einmalig in der Basis-Migration (1.create-fredy-base-structure.js). Einen laufenden Abgleich aus einer Konfigurationsdatei gibt es nicht.  
  Branch `master` · Dateien: `lib/services/configSync/configJobSync.js`, `index.js` · Commits: [`abc0f1b`](https://github.com/Tee132me/fredy/commit/abc0f1b108), [`9985e4e`](https://github.com/Tee132me/fredy/commit/9985e4ee24)
- **Externe REST-API zur Job-Verwaltung mit API-Key** (API & Integration; teilweise; Nutzen mittel, Aufwand mittel)  
  Unter /api/external stellt fredyJobRouter.js Endpunkte bereit: GET /health, GET /jobs, GET /jobs/:id, POST /jobs, PATCH /jobs/:id und DELETE /jobs/:id. Authentifiziert wird über den Header X-API-Key gegen API_SECRET_KEY, eingeschaltet wird die API mit API_ENABLED=true. Angelegte Jobs gehören einem technischen Nutzer external_api und bekommen fest einen Telegram-Adapter mit den Platzhaltern ${BOT_TOKEN} und ${RAW_FEED_CHANNEL_ID}. Der Telegram-Adapter hängt Nutzer-IDs als Hashtags (#U123) an, damit der eigene Bot die Nachrichten weiterleiten kann. Schwächen: Der API-Key fällt ohne Konfiguration auf 'your_secret_key' zurück, und GET liest noch aus config.json, während die Schreibzugriffe in die Datenbank gehen.  
  _Upstream:_ Upstream bietet programmatischen Zugriff über den MCP-Server mit Bearer-Token (list_jobs, get_job, start_job_draft/create_job_from_draft), aber keine schlichte REST-CRUD-API für Jobs.  
  Branch `master` · Dateien: `lib/api/routes/fredyJobRouter.js`, `lib/api/api.js`, `lib/notification/adapter/telegram.js` · Commits: [`c709f0a`](https://github.com/Tee132me/fredy/commit/c709f0a736), [`d1c6ec6`](https://github.com/Tee132me/fredy/commit/d1c6ec6d3f), [`4b2155f`](https://github.com/Tee132me/fredy/commit/4b2155ff0c) und 4 weitere
- **Container/PaaS-Betrieb: Env-Konfiguration, Parallelitätslimit, Health-Endpoint** (Deployment & Betrieb; teilweise; Nutzen niedrig, Aufwand gering)  
  index.js lädt dotenv und liest PORT, FREDY_INTERVAL_MINUTES und MAX_PARALLEL_PIPELINES aus der Umgebung. Provider-Pipelines laufen über runWithConcurrency mit begrenzter Parallelität, und ein executionInFlight-Flag verhindert, dass sich Läufe überlappen. Für unhandledRejection und uncaughtException gibt es globale Handler, der Start ist in try/catch gekapselt. api.js liefert GET /health mit Uptime und Speicherverbrauch. Das Dockerfile startet Node ohne PM2 mit --max-old-space-size, die Puppeteer-Timeouts (protocolTimeout, goto) sind angepasst.  
  _Upstream:_ Upstream führt Jobs inzwischen sequenziell aus (jobExecutionService, run-state.js gegen Doppelläufe), startet Node unter tini ohne PM2 und hat einen Docker-HEALTHCHECK auf /. Es fehlen dort PORT per Umgebungsvariable, ein eigener /health-Endpoint und die globalen Fehler-Handler.  
  Branch `master` · Dateien: `index.js`, `lib/api/api.js`, `Dockerfile`, `lib/services/extractor/puppeteerExtractor.js` · Commits: [`987013d`](https://github.com/Tee132me/fredy/commit/987013d3fc), [`fff7977`](https://github.com/Tee132me/fredy/commit/fff7977a1f), [`013944e`](https://github.com/Tee132me/fredy/commit/013944ec79)

_Nicht berücksichtigt:_ Ignoriert wurden: der Import-Commit c709f0a736 als Kopie von Upstream v14.3.6 (bis auf die oben genannten Dateien), yarn.lock, railway.json und Railway-spezifische Dockerfile-Teile (VOLUME entfernt), die private conf/config.json mit eigenen Suchen und Telegram-Platzhaltern (3c7c5e8919, 013944ec79 in Teilen, 65d13bdfc3, 08eee5d24d), die versehentlich eingecheckte Datei 'tatus --short' und reine Logging-Commits.

## pposch/fredy_AT

[Repository](https://github.com/pposch/fredy_AT) · Zeitraum: 2026-07 bis 2026-10 · Branches: `master`, `backup-before-rebase`

Österreich-Fork ('fredy-AT'). Der erste Anlauf (Branch backup-before-rebase, 2026-07) brachte willhaben, ImmoScout24.at, immowelt.at, länderübergreifendes Geocoding und Proxy-Fixes; all das ist inzwischen gleichwertig upstream. Nach dem Rebase auf aktuellen Upstream bleiben als echte Ergänzung die Provider für kleinanzeigen.at und wg-gesucht.at; dazu kommt ein Docker-Image nur für die eigene Instanz.

- **kleinanzeigen.at-Provider** (Provider; neu; Nutzen mittel, Aufwand gering)  
  Scraper für das österreichische Kleinanzeigenportal kleinanzeigen.at (älteres, serverseitig gerendertes PHP-System) über Puppeteer, mit Vorab-Besuch der Startseite (preNavigateUrl). Über fetchDetails wird die gekürzte Kartenbeschreibung durch den Volltext der Detailseite ersetzt; eine genaue Straße liefert das Portal nicht. Zuerst auf backup-before-rebase entstanden (d2efac2ffe), nach dem Rebase auf die zustandslose createConfig-API portiert, mit countries ['at'] und Preisfilter außerhalb der URL.  
  _Upstream:_ Upstream hat nur kleinanzeigen.js für kleinanzeigen.de; kleinanzeigen.at kommt in lib/ und doc/ nicht vor.  
  Branch `master` · Dateien: `lib/provider/kleinanzeigenAt.js`, `test/provider/kleinanzeigenAt.test.js` · Commits: [`7f0a40e`](https://github.com/pposch/fredy_AT/commit/7f0a40e5be), [`714f7e1`](https://github.com/pposch/fredy_AT/commit/714f7e1218)
- **wg-gesucht.at als eigener Österreich-Provider** (Länder & Lokalisierung; teilweise; Nutzen niedrig, Aufwand gering)  
  Variante des WG-Gesucht-Scrapers für die österreichische Domain mit countries ['at'] (für länderbezogenes Geocoding und die Länderfilter der UI), Vorab-Besuch von wg-gesucht.at und Detailabruf per Puppeteer. Ersetzt die auf backup-before-rebase versuchten, wieder entfernten Provider für WG-Zimmer.at und derealitaet.at (bd4f9b6bf1).  
  _Upstream:_ Upstream lib/provider/wgGesucht.js ist auf wg-gesucht.de und countries ['de'] festgelegt; dieselbe Plattform wird gescrapt, aber österreichische Suchen werden nicht als AT erkannt.  
  Branch `master` · Dateien: `lib/provider/wgGesuchtAt.js`, `test/provider/wgGesuchtAt.test.js` · Commits: [`7f0a40e`](https://github.com/pposch/fredy_AT/commit/7f0a40e5be), [`714f7e1`](https://github.com/pposch/fredy_AT/commit/714f7e1218)

_Bereits in Upstream vorhanden:_ Österreich-Paket: willhaben, ImmoScout24.at, immowelt.at, DACH-Geocoding (Upstream hat seit 2026-08/09 willhaben.js (mit iad/-Links), immoscoutAt.js, immowelt.at über services/immowelt/site.js sowie länderbezogenes Geocoding und Kartengrenzen (countries.js, countryBounds.js).); Proxy auch für Puppeteer-Provider mit eigenem getListings (Upstream jobExecutionService startet den Browser inzwischen für jeden Provider mit dem konfigurierten proxyUrl, ohne Unterscheidung nach getListings.)

_Nicht berücksichtigt:_ Ignoriert: Star-History-Bot-Commit, package.json/package-lock.json, Fork-README sowie das eigene Docker-Image (ghcr pposch/fredy-at) mit Produktions-Compose für die eigene Instanz.

## Wodooman/fredy

[Repository](https://github.com/Wodooman/fredy) · Zeitraum: 2026-04 bis 2026-04 · Branches: `master`, `feature/proxy-support-combined`, `feature/job-health-tracking`, `feature/offline-provider-testing`, `fix/sparkasse-selector`

Fork von Anfang April 2026 (Basis 2026-03-31) mit mehreren Feature-Branches, teils als Upstream-PRs #295–#297 eingereicht und nicht gemergt: Proxy für alle Scraping-Anfragen, ein Health-Monitoring mit Ausführungsprotokollen pro Job und Provider, Offline-Provider-Tests und CI-Aufräumarbeiten. Offline-Tests und den Sparkasse-Fix hat Upstream inzwischen selbst gelöst.

- **Job-Health-Monitoring mit Ausführungsprotokollen** (Deployment & Betrieb; neu; Nutzen hoch, Aufwand hoch)  
  Speichert die letzten 20 Läufe pro Job in neuen Tabellen job_runs und job_run_providers. Ein ExecutionTracer misst in der Pipeline jede Stufe (Abruf, Normalisierung, Filter, Speichern, Benachrichtigen) mit Dauer, Status und Trefferzahlen. Eine nur für Admins sichtbare Health-Seite zeigt KPI-Kacheln, eine Zeitleiste der letzten Läufe als grün/gelb/rote Punkte pro Job und Detailkarten mit einem aufklappbaren Stufenprotokoll je Provider; Aktualisierungen kommen live per SSE (GET /api/admin/health…). So sieht man auf einen Blick, wann ein Provider kaputtgeht oder blockiert wird.  
  _Upstream:_ Upstream speichert pro Job nur last_run_at (Migration 21), hat optionales Debug-Logging (Migration 20) und Dashboard-Hinweise (attention.js), aber keine Laufhistorie mit Stufenprotokoll pro Provider.  
  Branch `feature/job-health-tracking` · Dateien: `lib/services/jobs/executionTracer.js`, `lib/services/storage/healthStorage.js`, `lib/api/routes/healthRouter.js`, `lib/FredyPipelineExecutioner.js` · Commits: [`3cf15a1`](https://github.com/Wodooman/fredy/commit/3cf15a163d), [`9934092`](https://github.com/Wodooman/fredy/commit/9934092a53), [`f40cef1`](https://github.com/Wodooman/fredy/commit/f40cef14c1)
- **Proxy für alle Scraping-Anfragen inklusive fetch-basierter Provider** (Deployment & Betrieb; teilweise; Nutzen mittel, Aufwand mittel)  
  Neuer zentraler HTTP-Client lib/services/http/httpClient.js: scrapingFetch leitet fetch-Anfragen der Provider (z. B. ImmoScout-Mobile-API, Aktivprüfung) über einen undici-ProxyAgent mit Basic-Auth. Die Proxy-URL kommt aus den Einstellungen (Tab Netzwerk) oder als Fallback aus FREDY_PROXY_URL/HTTPS_PROXY/HTTP_PROXY. Für Puppeteer werden Zugangsdaten aus der URL gelöst und per page.authenticate() gesetzt, weil --proxy-server keine Credentials unterstützt; auch eigenständige Browser-Starts lesen die Proxy-Konfiguration automatisch. Geocoding und Benachrichtigungen laufen bewusst ohne Proxy; dazu Doku und Screenshot.  
  _Upstream:_ Upstream übergibt die Einstellung proxyUrl inzwischen beim Browserstart (jobExecutionService.js, Aktivprüfung, Preis-Tracking), leitet aber fetch-basierte Provider-Anfragen nicht über den Proxy und kennt weder Umgebungsvariablen-Fallback noch eigenes Proxy-Auth-Handling.  
  Branch `feature/proxy-support-combined` · Dateien: `lib/services/http/httpClient.js`, `lib/services/extractor/puppeteerExtractor.js`, `lib/services/jobs/jobExecutionService.js`, `lib/provider/immoscout.js` · Commits: [`42585e1`](https://github.com/Wodooman/fredy/commit/42585e14df), [`5c4ddb9`](https://github.com/Wodooman/fredy/commit/5c4ddb9a8a), [`65f04be`](https://github.com/Wodooman/fredy/commit/65f04be68c) und 4 weitere

_Bereits in Upstream vorhanden:_ Offline-Provider-Tests mit gespeicherten HTML-Fixtures (Upstream hat seit 2026-04-21 offline lauffähige Provider-Tests mit test/offlineFixtures.js, test/testFixtures/ und tools/testFixtures/downloadFixtures.js.); Sparkasse-Selektor an neues Seiten-HTML angepasst (Upstream sparkasse.js nutzt inzwischen den Selektor [data-id="estate-list-item"].)

_Nicht berücksichtigt:_ Ignoriert: Umbau und Deaktivierung der Claude-Code-Review-Workflows, Zusammenlegung der GitHub-Actions zu ci.yml, Ausschluss von Live-Provider-Tests aus der CI, CLAUDE.md/OpenSpec-Planungsdokumente und Screenshot-Commits; die Branches enthalten dieselben Commits mehrfach.

## dnlfrst/fredy

[Repository](https://github.com/dnlfrst/fredy) · Zeitraum: 2024-10 · Branches: `master`, `feat/adapter/discord`

Kleiner Fork von 2024-10 mit einem Discord-Bot-Adapter, Provider-Namen statt IDs in Benachrichtigungen und Selektor-Korrekturen für Immobilien Südwestpresse. Discord (als Webhook) und die immoswp-Felder sind upstream inzwischen vorhanden.

- **Provider-Name statt Provider-ID in Benachrichtigungen** (Benachrichtigung; neu; Nutzen niedrig, Aufwand gering)  
  FredyRuntime bekommt zusätzlich den Anzeigenamen des Providers und reicht ihn an notify.send weiter, sodass Nachrichten z. B. 'Immoscout' statt der internen ID 'immoscout' zeigen. Rein kosmetisch, betrifft aber alle Adapter.  
  _Upstream:_ Upstream übergibt in lib/FredyPipelineExecutioner.js weiterhin this._providerId als serviceName an notify.send.  
  Branch `master` · Dateien: `lib/FredyRuntime.js`, `index.js` · Commits: [`126ce94`](https://github.com/dnlfrst/fredy/commit/126ce9462b)
- **Discord-Benachrichtigung per Bot** (Benachrichtigung; teilweise; Nutzen niedrig, Aufwand gering)  
  Neuer Adapter lib/notification/adapter/discord.js, der sich mit discord.js und einem Bot-Token anmeldet und pro neuem Inserat ein Embed (Titel, Link, Preis, Zimmer, Fläche, Adresse als Beschreibung) in einen konfigurierten Kanal schickt. Die Zimmeranzahl kam in einem Folge-Commit dazu. Für Nutzer, die lieber einen Bot statt eines Webhooks einsetzen.  
  _Upstream:_ Upstream hat seit 2025-09 lib/notification/adapter/discord_webhook.js (Webhook statt Bot, Embeds mit Preis/Größe/Adresse, aber ohne Zimmer).  
  Branch `master` · Dateien: `lib/notification/adapter/discord.js`, `lib/notification/adapter/discord.md` · Commits: [`78ab68a`](https://github.com/dnlfrst/fredy/commit/78ab68ad8b), [`2554f27`](https://github.com/dnlfrst/fredy/commit/2554f27e4d), [`db2c918`](https://github.com/dnlfrst/fredy/commit/db2c91880e)

_Bereits in Upstream vorhanden:_ Immobilien-Südwestpresse: Zimmer, Adresse, Titel- und Größen-Fix (Upstream-immoswp.js liest rooms und address (data-address) inzwischen selbst und normalisiert Zahlen per extractNumber.)

_Nicht berücksichtigt:_ Ignoriert: yarn.lock-Update für discord.js sowie host/port 80 in vite.config.js für die eigene Instanz.

## lolokraus/fredy

[Repository](https://github.com/lolokraus/fredy) · Zeitraum: 2026-07 · Branches: `master`

Fork mit einem einzigen großen Commit (Juli 2026), der Fredy für Österreich nutzbar macht: Provider für willhaben.at, Nominatim und Karte für AT, dazu eine Bildergalerie mit Karussell, strukturierte Detail-Attribute und ein Gelesen/Ungelesen-Status mit Filter für Inserate. Provider und Länderunterstützung hat Upstream inzwischen selbst, Galerie und Gelesen-Status nicht.

- **Gelesen/Ungelesen-Markierung mit Filter** (UI/UX; neu; Nutzen mittel, Aufwand gering)  
  Neue Spalte listings.viewed (Migration), ein Endpunkt POST /api/listings/:id/viewed und markListingViewed im Storage; beim Öffnen eines Inserats aus der Übersicht wird es als gesehen markiert. Die Übersicht bekommt einen Filter Alle/Gesehen/Ungesehen (viewedFilter in queryListings und URL-Parameter), gesehene Karten im Grid erhalten ein Augen-Badge. Der Status gilt pro Inserat, nicht pro Benutzer.  
  _Upstream:_ Upstream kennt weder eine viewed-Spalte noch einen Gesehen-Filter, nur Merkliste, Status und Aktivität.  
  Branch `master` · Dateien: `lib/services/storage/migrations/sql/23.add-listing-viewed.js`, `lib/services/storage/listingsStorage.js`, `lib/api/routes/listingsRouter.js`, `ui/src/components/listings/ListingsOverview.jsx` · Commits: [`dd794e1`](https://github.com/lolokraus/fredy/commit/dd794e18b3)
- **Bildergalerie und strukturierte Attribute pro Inserat** (UI/UX; teilweise; Nutzen mittel, Aufwand mittel)  
  Inserate können ein Array images (alle Galerie-URLs) und eine Liste attributes ({label, value}) mitbringen, die als JSON-Spalten gespeichert werden. Die Detailansicht zeigt bei mehreren Bildern ein Karussell mit Vollbild-Vorschau (Semi Carousel/ImagePreview) und die Attribute als eigene Tabelle neben der Beschreibung. Befüllt wird das bisher nur vom eigenen willhaben-Provider, der dafür die Detailseite lädt.  
  _Upstream:_ Upstream zeigt weiterhin nur ein Titelbild; strukturierte Fakten gibt es nur als feste Spalten (Listing-Specs, Building-Facts, Migrationen 15 und 38), nicht als freie Attributliste.  
  Branch `master` · Dateien: `lib/services/storage/migrations/sql/22.add-listing-images.js`, `lib/services/storage/migrations/sql/24.add-listing-attributes.js`, `lib/services/storage/listingsStorage.js`, `ui/src/views/listings/ListingDetail.jsx` · Commits: [`dd794e1`](https://github.com/lolokraus/fredy/commit/dd794e18b3)

_Bereits in Upstream vorhanden:_ Provider willhaben.at und Österreich-Unterstützung (Upstream hat seit 2026-08-22 lib/provider/willhaben.js, länderbezogenes Geocoding (providerCountries.js) und countryBounds.js für die Karte.)

_Nicht berücksichtigt:_ Ignoriert: abgeschaltete Upstream-Versionsprüfung im versionRouter (fork-spezifisch) und zusätzliche CloakBrowser-Schriftpakete im Dockerfile (inzwischen identisch im Upstream-Dockerfile).

## SanderDeweirdt/fredy

[Repository](https://github.com/SanderDeweirdt/fredy) · Zeitraum: 2026-07 bis 2026-08 · Branches: `master`

Fork von Juli/Aug. 2026, der einen Provider für das belgische Portal Immoweb ergänzt und dafür Geocoding, Karte und Zahlenformatierung von der festen Deutschland-Ausrichtung löst. Die Länder-Öffnung ist upstream inzwischen generisch gelöst, der Immoweb-Provider selbst fehlt dort weiterhin.

- **Immoweb-Provider (Belgien)** (Provider; neu; Nutzen hoch, Aufwand gering)  
  Neuer Provider immoweb.js scrapt Suchergebnisseiten von immoweb.be über den generischen Puppeteer-Extractor (li.card-list__item). Preis wird aus dem Screenreader-Text gelesen, Größe und Schlafzimmer per Regex an den Einheiten 'm²' bzw. 'bedroom(s)' verankert (robust gegen Neubau-Projektkarten mit Spannen), das Bild aus dem CSS-background-style; dazu activeTester und ausführliche Tests mit Fixtures.  
  _Upstream:_ Upstream hat keinen Immoweb- oder anderen belgischen Provider; für die Übernahme müsste nur metaInformation.countries: ['be'] ergänzt werden.  
  Branch `master` · Dateien: `lib/provider/immoweb.js`, `test/provider/immoweb.test.js`, `test/provider/testProvider.json` · Commits: [`3d056cb`](https://github.com/SanderDeweirdt/fredy/commit/3d056cb56b), [`6bf4e5e`](https://github.com/SanderDeweirdt/fredy/commit/6bf4e5e2c3), [`b075316`](https://github.com/SanderDeweirdt/fredy/commit/b075316c36)
- **Locale-sicherer Zahlenparser (en/fr/nl)** (Länder & Lokalisierung; teilweise; Nutzen niedrig, Aufwand gering)  
  parseImmowebNumber in lib/utils/parse-locale-number.js erkennt, ob Punkt oder Komma Tausender- bzw. Dezimaltrenner ist (Dezimal nur bei 1-2 Nachkommastellen), und verarbeitet so '425,000', '425.000' und '97,5' korrekt; mit NaN-Schutz und Tests.  
  _Upstream:_ Upstream-extractNumber hat eine Tausenderpunkt-Heuristik, behandelt aber ein Komma immer als Dezimaltrenner, sodass englisches '425,000' falsch wird.  
  Branch `master` · Dateien: `lib/utils/parse-locale-number.js` · Commits: [`651a430`](https://github.com/SanderDeweirdt/fredy/commit/651a430ee1), [`a34eeb9`](https://github.com/SanderDeweirdt/fredy/commit/a34eeb90b1), [`b075316`](https://github.com/SanderDeweirdt/fredy/commit/b075316c36)

_Bereits in Upstream vorhanden:_ Geocoding, Karte und Formatierung für Nicht-Deutschland-Listings (Upstream leitet countrycodes und maxBounds seit 2026-08/09 aus metaInformation.countries der Provider ab (lib/services/providers/countries.js, ui/src/components/map/countryBounds.js) und gruppiert Preise mit de-DE-Format.)

## Cenngo/fredy

[Repository](https://github.com/Cenngo/fredy) · Zeitraum: 2026-09 · Branches: `master`

Aktueller Fork (Sept. 2026) mit einer persönlichen API-Token-Authentifizierung für die REST-API, damit Skripte und externe Tools Fredy per Bearer-Token statt Login-Session nutzen können; dazu ein auf 1 Minute gesenktes Mindest-Suchintervall in der UI.

- **Persönliches API-Token (Bearer) für die REST-API** (API & Integration; neu; Nutzen mittel, Aufwand gering)  
  Jeder Nutzer kann unter Einstellungen > Verbindungen ein API-Token (32 Zufallsbytes) erzeugen bzw. neu generieren; gespeichert wird nur der SHA-256-Hash in users.api_token (Migrationen 45/47 mit Unique-Index). Ein neuer bearerAuthHook vor authHook in den Nutzer- und Admin-Routen löst 'Authorization: Bearer …' zum Nutzer auf, sodass die gesamte /api ohne Login-Session skriptbar wird. Schwäche: der Hook schreibt den Nutzer in die Session und lässt Bearer-Sessions nie ablaufen.  
  _Upstream:_ Upstream kennt Bearer-Tokens nur für den MCP-Endpunkt (mcp_token/OAuth), die übrige REST-API ist nur per Session-Cookie nutzbar.  
  Branch `master` · Dateien: `lib/api/security.js`, `lib/api/api.js`, `lib/api/routes/userSettingsRoute.js`, `lib/services/storage/userStorage.js` · Commits: [`5a6c302`](https://github.com/Cenngo/fredy/commit/5a6c30236b), [`ae38d10`](https://github.com/Cenngo/fredy/commit/ae38d109d6)
- **Mindest-Suchintervall 1 statt 5 Minuten** (Sonstiges; neu; Nutzen niedrig, Aufwand gering)  
  Senkt im Admin-Bereich (ExecutionPage) die Untergrenze des globalen Suchintervalls von 5 auf 1 Minute. Erhöht das Risiko, von Portalen geblockt zu werden.  
  _Upstream:_ Upstream erzwingt im Einstellungsformular weiterhin mindestens 5 Minuten, vermutlich bewusst zum Schutz vor Sperren.  
  Branch `master` · Dateien: `ui/src/views/admin/pages/ExecutionPage.jsx` · Commits: [`5a6c302`](https://github.com/Cenngo/fredy/commit/5a6c30236b)

_Nicht berücksichtigt:_ Der zweite Commit entfernt nur eine auskommentierte Plugin-Registrierung.

## daraarnt/oikos

[Repository](https://github.com/daraarnt/oikos) · Zeitraum: 2026-09 · Branches: `master`

Umbenannter Fork 'Oikos' (Sept. 2026) mit eigenem Branding/Skin und einer Spezialfunktion: einer Standortprüfung für Cannabis-Anbauvereinigungen (CSC) nach KCanG § 12 Abs. 1 Nr. 6, die per OpenStreetMap geschützte Einrichtungen im 200-m-Umkreis eines Listings sucht.

- **CSC-Standort-Screening (200-m-Abstand nach KCanG)** (Karte & Geodaten; neu; Nutzen niedrig, Aufwand gering)  
  Neuer Endpunkt GET /api/listings/:id/csc-siting ruft cscSitingService.screenCscSiting auf, der über den bestehenden POI-/Overpass-Dienst Schulen, Kitas, Kinderbetreuung, Jugendeinrichtungen und Spielplätze im 200-m-Radius sucht und 'reviewRequired', 'clearOnMapScreen' oder 'unavailable' liefert. In der Listing-Detailansicht startet die Komponente CscSitingScreen die Prüfung auf Knopfdruck und zeigt Treffer mit Distanz sowie einen rechtlichen Hinweis. Nischenfunktion für Vereinsräume, das Muster (Abstandsprüfung zu POI-Kategorien) ist aber allgemein wiederverwendbar.  
  _Upstream:_ Upstream hat den POI-Dienst (lib/services/poi), aber keine Abstands-/Ausschlussprüfung dieser Art.  
  Branch `master` · Dateien: `lib/services/poi/cscSitingService.js`, `lib/api/routes/listingsRouter.js`, `ui/src/components/csc/CscSitingScreen.jsx`, `ui/src/views/listings/ListingDetail.jsx` · Commits: [`972a5bb`](https://github.com/daraarnt/oikos/commit/972a5bb1a9)
- **Zusätzliche POI-Kategorien Spielplatz, Kinderbetreuung, Jugendzentrum** (Karte & Geodaten; neu; Nutzen niedrig, Aufwand gering)  
  PLACE_CATEGORIES wird um playground (leisure=playground), childcare (amenity=childcare) und youthCentre (amenity=youth_centre) ergänzt und steht damit auch der allgemeinen Umgebungssuche zur Verfügung, z. B. für Familien bei der Wohnungssuche.  
  _Upstream:_ Upstream-categories.js kennt kindergarten und school, aber keine Spielplätze, Kinderbetreuung oder Jugendzentren.  
  Branch `master` · Dateien: `lib/services/poi/categories.js` · Commits: [`972a5bb`](https://github.com/daraarnt/oikos/commit/972a5bb1a9)

_Nicht berücksichtigt:_ Ignoriert: Umbranding zu 'Aarnt Oikos' (Logo, Footer, Theme-Farben, Locale-Texte, Navigation), das nur die eigene Instanz betrifft.

## marvin-bay/fredy

[Repository](https://github.com/marvin-bay/fredy) · Zeitraum: 2026-04 · Branches: `master`

Fork vom April 2026 mit Paginierung für die meisten HTML-Provider über einen gemeinsamen paginatedScraper sowie Docker-Compose-Einstellungen gegen wachsenden Plattenverbrauch. Die übrigen Branches enthalten nur Upstream-Commits.

- **Paginierung für HTML-Provider** (Provider; neu; Nutzen mittel, Aufwand mittel)  
  Neues Modul lib/services/extractor/paginatedScraper.js lädt Ergebnisseiten nacheinander (bis 25) über Puppeteer und bricht ab, sobald eine Seite leer ist oder nur bereits gesehene IDs liefert (falls die Seite den Seitenparameter ignoriert). Kleinanzeigen (/seite:N/), WG-Gesucht (pfadbasiert), NeubauKompass (?Seite=N), Immowelt, 1A-Immobilien, Immobilien.de, immoswp, McMakler, ohneMakler, Regionalimmobilien24, Sparkasse und Wohnungsbörse bekommen damit ein getListings; ImmoScout fragt die Mobile-API mit pagesize=300 ab. Hilfreich für breite Suchen und den ersten Lauf, erhöht aber die Zahl der Anfragen pro Lauf.  
  _Upstream:_ Upstream paginiert nur einzelne API-Provider (casa, deutscheWohnen, inberlinwohnen) und verlässt sich sonst auf Sortierung nach Datum; Immowelt läuft dort inzwischen über eine BFF-API und Wohnungsbörse existiert nicht mehr.  
  Branch `master` · Dateien: `lib/services/extractor/paginatedScraper.js`, `lib/provider/kleinanzeigen.js`, `lib/provider/wgGesucht.js`, `lib/services/immoscout/immoscout-web-translator.js` · Commits: [`06ac1b8`](https://github.com/marvin-bay/fredy/commit/06ac1b880d)
- **Begrenztes Plattenwachstum im Docker-Betrieb** (Deployment & Betrieb; neu; Nutzen niedrig, Aufwand gering)  
  docker-compose.yml legt /tmp als tmpfs mit 512 MB an (Chromium-Profile und Temp-Dateien landen nicht im Container-Layer), schaltet Core-Dumps per ulimit ab und rotiert die Container-Logs (json-file, 5 × 20 MB).  
  _Upstream:_ Das Upstream-docker-compose.yml hat Speicherlimit und Healthcheck, aber weder tmpfs noch Log-Rotation oder core: 0.  
  Branch `master` · Dateien: `docker-compose.yml` · Commits: [`cb32676`](https://github.com/marvin-bay/fredy/commit/cb326766f4)

_Nicht berücksichtigt:_ Die Branches feature/kleinanzeigen_new, 185-bug-old-runs-filling-up-disk, improvements und listing-management enthalten nur Commits des Upstream-Autors; .env-Eintrag in .gitignore ignoriert.

## mrxder/fredy

[Repository](https://github.com/mrxder/fredy) · Zeitraum: 2026-09 · Branches: `master`

Ganz aktueller, auf Tirol/Österreich ausgerichteter Fork (Ende September 2026): neuer Provider für immo.tt.com (Tiroler Tageszeitung) und deutlich erweiterte Übersetzung von ImmoScout24.at-Such-URLs in die Mobile-API (mehr Typ-Slugs, Pfad-Filter, Außenflächen). Beides ist gut getestet und passt direkt auf den heutigen Upstream.

- **Provider immo.tt.com (Tirol)** (Provider; neu; Nutzen mittel, Aufwand gering)  
  Neuer Provider lib/provider/immoTt.js für den Immobilienmarkt der Tiroler Tageszeitung: Such- und Detailseite werden serverseitig gerendert und per einfachem Request mit Cheerio geparst (50 Treffer pro Seite, Sortierung nach Aktualität). Da die Karte nur die Gemeinde nennt, wird für das Geocoding das Bundesland aus dem Pfad ergänzt; fetchDetails liest Straße, Koordinaten, Volltext, Baujahr und HWB-Energieklasse (über buildingFacts.js und JSON-LD-Preis). Mit Fixtures, Tests, Doku und Eintrag in providerOrder.js.  
  _Upstream:_ Upstream hat für Österreich nur willhaben.js und immoscoutAt.js, kein immo.tt.com.  
  Branch `master` · Dateien: `lib/provider/immoTt.js`, `test/provider/immoTt.test.js`, `doc/providers.md`, `ui/src/services/providerOrder.js` · Commits: [`1fb5660`](https://github.com/mrxder/fredy/commit/1fb56602c0)
- **Erweiterte URL-Übersetzung für ImmoScout24.at** (Provider; teilweise; Nutzen mittel, Aufwand gering)  
  at-paths.js versteht zusätzliche Slugs (immobilie-kaufen/-mieten, grundstueck-kaufen, Kauf-Varianten von Neubau-, provisionsfreier, Garagen- und Aufzugswohnung, Penthouse, Dachgeschoss, Maisonette, Einfamilienhaus, Reihenhaus, Doppelhaushälfte, Villa) und nachgestellte Pfad-Filter wie /parkplatz/keller/aufzug/barrierefrei/neubau/provisionsfrei. Der Query-Parameter outdoorSpaces wird auf equipment (balcony/garden) abgebildet, Ausstattungslisten aus Pfad und Query werden zusammengeführt statt überschrieben; nicht übersetzbare Filter (moebliert, Garagen-Suchen) werden mit Warnung verworfen bzw. abgelehnt. Jede Zuordnung ist mit Trefferzahlen Website vs. API begründet und durch Tests abgedeckt.  
  _Upstream:_ Upstream hat seit 2026-09-23 at-paths.js mit Grund-Slugs, aber ohne AT_PATH_FILTERS, outdoorSpaces-Übersetzung und die Kauf-Varianten der Filter-Slugs.  
  Branch `master` · Dateien: `lib/services/immoscout/at-paths.js`, `lib/services/immoscout/immoscout-web-translator.js`, `test/services/immoscout/at-paths.test.js` · Commits: [`c9c02ff`](https://github.com/mrxder/fredy/commit/c9c02ffd36), [`b18f325`](https://github.com/mrxder/fredy/commit/b18f325404), [`a30c4a2`](https://github.com/mrxder/fredy/commit/a30c4a27a4)

_Nicht berücksichtigt:_ Ignoriert: tempDelte.txt ('chore: minor') und ein packageManager-Eintrag in package.json.

## pxldi/fredy

[Repository](https://github.com/pxldi/fredy) · Zeitraum: 2026-07 bis 2026-08 · Branches: `custom`, `feat/custom-konstanz-providers`

Fork mit zwei regionalen Providern für den Raum Konstanz/Bodensee: Kleinanzeigen des Südkurier (über die Algolia-Such-API der Seite) und das Wohnungsportal Vierwände (über dessen RSS-Feed). Die aktuelle Fassung liegt im Branch custom, eine ältere Version in feat/custom-konstanz-providers.

- **Provider Südkurier Anzeigen** (Provider; neu; Nutzen niedrig, Aufwand gering)  
  Neuer Provider lib/provider/suedkurier.js für anzeigen.suedkurier.de: Er übersetzt die Such-URL in eine Abfrage an den öffentlichen Algolia-Suchindex, den auch die Website nutzt (bis 80 Treffer), statt HTML zu parsen. Zimmer, Fläche und PLZ/Ort werden per Regex aus dem Anzeigentext gezogen, Bilder und Links absolut gemacht; ein Aktivitäts-Check und Offline-Tests mit Fixtures sind dabei.  
  _Upstream:_ Kein Südkurier-Provider im Upstream-Master; regionale Zeitungsportale fehlen dort bis auf schwarzesbrett/regionalimmobilien24.  
  Branch `custom` · Dateien: `lib/provider/suedkurier.js`, `test/provider/suedkurier.test.js`, `test/testFixtures/suedkurier.json` · Commits: [`3ee8912`](https://github.com/pxldi/fredy/commit/3ee8912454), [`f1c68ca`](https://github.com/pxldi/fredy/commit/f1c68ca964), [`02d1dc8`](https://github.com/pxldi/fredy/commit/02d1dc8035)
- **Provider Vierwände (RSS)** (Provider; neu; Nutzen niedrig, Aufwand gering)  
  Neuer Provider lib/provider/vierwaen.js für vierwaen.de liest immer den RSS-Feed rss_angebot.xml der Seite (die Job-URL dient nur als Bezeichnung) und parst ihn mit Cheerio. Zimmeranzahl wird aus Kategorien wie 'WG Zimmer' oder 'mehr als 3 Zimmer' abgeleitet, Ort und Miete aus der Beschreibung; Test mit XML-Fixture inklusive.  
  _Upstream:_ Kein Vierwände-Provider im Upstream-Master.  
  Branch `custom` · Dateien: `lib/provider/vierwaen.js`, `test/provider/vierwaen.test.js`, `test/testFixtures/vierwaen.xml` · Commits: [`3ee8912`](https://github.com/pxldi/fredy/commit/3ee8912454), [`f1c68ca`](https://github.com/pxldi/fredy/commit/f1c68ca964), [`02d1dc8`](https://github.com/pxldi/fredy/commit/02d1dc8035)

_Nicht berücksichtigt:_ Ignoriert: 'activate fork workflows' und 'retrigger provider workflow' (CI-Anstöße ohne Inhalt) sowie die Branches 185-bug-old-runs-filling-up-disk, improvements und listing-management mit alten Upstream-Commits.

## ivanovvladi/fredy

[Repository](https://github.com/ivanovvladi/fredy) · Zeitraum: 2024-07 bis 2024-09 · Branches: `update-telegram-provider`, `update-scraping-providers`

Kleiner Fork von 2024 mit zwei Themen: Telegram-Benachrichtigungen mit Bild ("Rich Message") inkl. Bild-Extraktion in einigen Providern und ein Austausch von ScrapingAnt gegen den kommerziellen Scraping-Dienst Scrapfly. Beides ist durch den heutigen Upstream überholt.

- **Scrapfly statt ScrapingAnt als Scraping-Backend** (Provider; teilweise; Nutzen niedrig, Aufwand hoch)  
  Ersetzt im requestDriver den ScrapingAnt-Treiber durch das scrapfly-sdk (ASP, JS-Rendering, Auto-Scroll, Land DE) mit bis zu 5 Retries; der Scraper wird pro Provider instanziiert, damit nur Immoscout/Immonet/Neubaukompass über den Dienst laufen. Erfordert einen kostenpflichtigen Scrapfly-API-Key.  
  _Upstream:_ Upstream nutzt heute gar keinen externen Scraping-Dienst mehr, sondern eigene Puppeteer-Extraktion mit Bot-Prevention (lib/services/extractor/); das Problem ist dort anders gelöst, die x-ray/ScrapingAnt-Architektur existiert nicht mehr.  
  Branch `update-scraping-providers` · Dateien: `lib/services/requestDriver.js`, `lib/services/scraper.js`, `lib/services/scrapingAnt.js`, `lib/FredyRuntime.js` · Commits: [`ef9c790`](https://github.com/ivanovvladi/fredy/commit/ef9c790e93)

_Bereits in Upstream vorhanden:_ Telegram-Rich-Message mit Listing-Foto (Upstream-telegram.js sendet heute Listings per sendPhoto (inkl. Multipart-Upload über telegramPhotoUploader.js) mit Fallback auf sendMessage und Drosselung per p-throttle.); Bild-Extraktion für 1A-Immobilien, Immoscout und Kleinanzeigen (Upstream-Provider (u. a. einsAImmobilien.js, kleinanzeigen.js) haben 'image' längst als Pflichtfeld in crawlFields/requiredFieldNames.)

_Nicht berücksichtigt:_ Keine nennenswerten Rauschen-Commits; die Commits liegen doppelt auf zwei Branches (gleiche Änderungen mit unterschiedlichen SHAs).

## ahmedwalid05/fredy

[Repository](https://github.com/ahmedwalid05/fredy) · Zeitraum: 2024-01 bis 2024-02 · Branches: `master`

Experimenteller Fork von Anfang 2024 (als Upstream-PR #86 eingereicht, nicht gemergt), der Teile von Fredy auf TypeScript umstellt und ein Plug-in-System für 'Listing-Prozessoren' einführt, darunter einen Fahrzeit-Prozessor über die Google Distance Matrix API. Ein SQS-Benachrichtigungsadapter ist nur als leeres Gerüst angelegt.

- **Plug-in-System für Listing-Prozessoren** (Sonstiges; neu; Nutzen niedrig, Aufwand hoch)  
  Neues Verzeichnis lib/processors mit abstrakter Klasse Processor (shouldFilterListing, processListing, notificationText) und einem Runner process.ts, der globale und pro Job konfigurierte Prozessoren nacheinander auf jedes neue Inserat anwendet. Prozessoren können Inserate verwerfen, um Daten anreichern und Text an die Benachrichtigung anhängen; die Ähnlichkeitsprüfung wurde als erster globaler Prozessor umgebaut. Die Job-Konfiguration bekommt dafür ein Feld für Prozessoren (jobStorage/jobRouter).  
  _Upstream:_ Upstream hat eine fest verdrahtete Pipeline in lib/FredyPipelineExecutioner.js ohne erweiterbare Prozessor-Schnittstelle.  
  Branch `master` · Dateien: `lib/processors/Processor.ts`, `lib/processors/process.ts`, `lib/processors/similarityCheckProcessor.ts`, `lib/FredyRuntime.ts` · Commits: [`e2ae582`](https://github.com/ahmedwalid05/fredy/commit/e2ae58255b), [`f7feaf1`](https://github.com/ahmedwalid05/fredy/commit/f7feaf1374), [`5c5d32b`](https://github.com/ahmedwalid05/fredy/commit/5c5d32b991) und 1 weitere

_Bereits in Upstream vorhanden:_ Fahrzeit zu Zielorten per Google Distance Matrix (Upstream berechnet heute Entfernungen und Fahrzeiten zu gespeicherten Adressen ohne API-Key über Transitous (lib/services/transit, travelTimeSweeper.js) inklusive Pendelzeit-Filter.)

_Nicht berücksichtigt:_ Ignoriert: teilweise Umstellung von Runtime, Providern und Utils auf TypeScript samt tsconfig/yarn.lock (reiner Refactor auf altem Stand), SQS-Adapter ohne Implementierung (send() ist nur ein TODO), Provider-Typ-Enum und ein Selektor-Fix für den längst ersetzten HTML-Scraper von ImmoScout.

## chbndrhnns/fredy

[Repository](https://github.com/chbndrhnns/fredy) · Zeitraum: 2026-08 · Branches: `fix/immowelt-expose-description-and-navigation`

Contributor-Fork für Upstream-PRs. Übrig bleibt nur ein nicht gemergter Immowelt-Fix (PR #422), dessen Beschreibungs-Extraktion upstream inzwischen gleichwertig umgesetzt ist; neu wäre nur das Laden der Exposés per echter Dokument-Navigation.

- **Immowelt: Exposé-Abruf per page.goto statt XHR** (Provider; teilweise; Nutzen niedrig, Aufwand gering)  
  fetchExposeHtml navigiert im vorgewärmten Puppeteer-Tab mit page.goto zum Exposé, damit echte Dokument-Header (Sec-Fetch-Dest: document) gesendet werden und DataDome seltener blockt; bei 403/429 wird die Session freigegeben. Zusätzlich wird in closeBrowser der Zugriff auf browser.process() mit try/catch abgesichert.  
  _Upstream:_ Der abgesicherte browser.process()-Zugriff ist upstream vorhanden; fetchExposeHtml lädt das Exposé dort aber weiterhin per fetch im Seitenkontext (mit blockedOrigins-Schutz), nicht per Navigation.  
  Branch `fix/immowelt-expose-description-and-navigation` · Dateien: `lib/services/immowelt/immoweltBff.js`, `lib/services/extractor/puppeteerExtractor.js` · Commits: [`f0de854`](https://github.com/chbndrhnns/fredy/commit/f0de854655)

_Bereits in Upstream vorhanden:_ Immowelt: vollständige Exposé-Beschreibung aus Server-State (Upstream hat extractExposeDescription heute in lib/services/immowelt/classified.js, ebenfalls mit __UFRN_LIFECYCLE_SERVERREQUEST__ und dem additional-description-Selektor.)

_Nicht berücksichtigt:_ Ignoriert: wöchentliche 'update star history'-Bot-Commits auf master; die Kleinanzeigen-Zeilenumbruch-Fixes sind als PR #439 bereits gemergt.

## CommanderTvis/fredy

[Repository](https://github.com/CommanderTvis/fredy) · Zeitraum: 2025-09 bis 2025-10 · Branches: `commandertvis/pages`

Zwei ImmoScout-Verbesserungen aus 2025-09/10 auf dem Branch commandertvis/pages: Paginierung der Suchergebnisse und Zimmer-Filter aus Web-URLs. Die Zimmer-Zuordnung ist upstream inzwischen vorhanden, die Paginierung nicht.

- **ImmoScout-Paginierung** (Provider; neu; Nutzen mittel, Aufwand mittel)  
  getListings in lib/provider/immoscout.js holt nacheinander pagenumber=1,2,... der Mobile-API, solange auf einer Seite noch unbekannte Inserate (Abgleich mit getKnownListingHashesForJobAndProvider) auftauchen. Zwischen den Seiten liegen 500 ms Pause, nach höchstens 20 Seiten ist Schluss. Damit gehen bei vielen neuen Treffern zwischen zwei Läufen keine Inserate verloren; mit Sinon/esmock-Tests.  
  _Upstream:_ Upstream (lib/services/immoscout/mobileApi.js) ruft nur eine Ergebnisseite ab.  
  Branch `commandertvis/pages` · Dateien: `lib/provider/immoscout.js`, `test/provider/immoscout-pagination.test.js` · Commits: [`4abccdb`](https://github.com/CommanderTvis/fredy/commit/4abccdb271)

_Bereits in Upstream vorhanden:_ Zimmeranzahl aus ImmoScout-Web-Pfaden (Upstream übersetzt '<n>-zimmer-wohnung-mieten' in lib/services/immoscout/web-paths.js bzw. at-paths.js.)

_Nicht berücksichtigt:_ Der eine master-Commit (Docker-Healthcheck) ist upstream bereits enthalten.

## crystalnet/fredy

[Repository](https://github.com/crystalnet/fredy) · Zeitraum: 2025-06 · Branches: `feature/enhancedProcessingAndStorage`

Experimenteller Feature-Branch (Upstream-PR #138, nicht gemergt) auf Basis des lowdb-Stands von 2025-06: Exposé-Seiten werden nachgeladen und per ChatGPT in frei definierbare Zusatzfelder pro Job zerlegt, dazu Fahrzeiten zu Wegpunkten über die Google Routes API und eine tabellarische Dashboard-Ansicht. Der KI-Teil ist upstream weiterhin neu, Fahrzeiten und Detailabruf sind inzwischen upstream anders gelöst.

- **KI-Extraktion frei definierbarer Zusatzfelder pro Job (ChatGPT)** (MCP & KI; neu; Nutzen mittel, Aufwand hoch)  
  Im Job-Formular lassen sich eigene Felder (Name, Frage-Prompt, Antwortlänge) anlegen. Nach dem Scrapen lädt ein ExposeExtractor die Detailseite (bei ImmoScout per API), zieht über provider-spezifische Selektoren den Text heraus und lässt ihn von der OpenAI Chat-Completions-API in ein striktes JSON mit diesen Feldern übersetzen (3 Versuche mit Fehlerrückmeldung im Prompt). Die Ergebnisse werden pro Job in einer eigenen Datei mit Schema-Validierung gespeichert und in einer Dashboard-Tabelle mit dynamischen Spalten angezeigt. Damit lassen sich z. B. Fragen wie 'Balkon?', 'Haustiere erlaubt?' automatisch aus Freitext beantworten.  
  _Upstream:_ Upstream holt Detaildaten (fetchDetails, detailRefetchService) und hat einen MCP-Server, aber keine LLM-Auswertung von Exposé-Texten in benutzerdefinierte Felder.  
  Branch `feature/enhancedProcessingAndStorage` · Dateien: `lib/services/extractor/prompter/chatgpt.js`, `lib/services/extractor/prompter/prompts.js`, `lib/services/extractor/exposeExtractor.js`, `lib/services/storage/enhancedListingsStorage.js` · Commits: [`90e2c06`](https://github.com/crystalnet/fredy/commit/90e2c06060), [`e270a3f`](https://github.com/crystalnet/fredy/commit/e270a3f227), [`4299871`](https://github.com/crystalnet/fredy/commit/4299871804) und 4 weitere

_Bereits in Upstream vorhanden:_ Fahrzeiten zu Wegpunkten pro Job (Google Routes API) (Upstream berechnet Fahrzeiten zu gespeicherten Orten für ÖPNV/Auto/Rad/Fuß über Transitous (lib/services/transit/travelTimeService.js, Migrationen 31/35/40) ohne kostenpflichtigen API-Key.)

_Nicht berücksichtigt:_ Ignoriert: Entfernen von config.json/yarn.lock aus dem Repo, VS-Code-Launch-Konfiguration, Umzug von utils/errors/logger und Test-Anpassungen an die neue Provider-Schnittstelle.

## FlorKi610/fredy

[Repository](https://github.com/FlorKi610/fredy) · Zeitraum: 2026-07 bis 2026-09 · Branches: `perf/sqlite-statement-cache`, `perf/findnew-set-lookup`

Zwei kleine Performance-Branches (2026-07/09): ein Cache für vorbereitete SQLite-Statements und eine Set-Suche bei bekannten Hashes. Die Set-Suche ist upstream bereits umgesetzt.

- **Cache für vorbereitete SQLite-Statements** (Performance; neu; Nutzen niedrig, Aufwand gering)  
  SqliteConnection.query/execute/tableExists rufen nicht mehr bei jedem Aufruf db.prepare(sql) auf, sondern nutzen über ein privates #prepare() einen Map-Cache nach SQL-Text. Der Cache wird beim Schließen der Verbindung geleert; ein Test prüft, dass identisches SQL nur einmal kompiliert wird. Spart CPU bei den vielen wiederkehrenden Storage-Abfragen.  
  _Upstream:_ Upstream-SqliteConnection.js ruft weiterhin db.prepare(sql) bei jedem query/execute auf.  
  Branch `perf/sqlite-statement-cache` · Dateien: `lib/services/storage/SqliteConnection.js`, `test/storage/SqliteConnection.test.js` · Commits: [`9fe55fa`](https://github.com/FlorKi610/fredy/commit/9fe55faaeb)

_Bereits in Upstream vorhanden:_ Set statt Array beim Abgleich bekannter Inserate (Upstream-FredyPipelineExecutioner.js nutzt bereits new Set(getKnownListingHashesForJobAndProvider(...)).)

## osinho/fredy

[Repository](https://github.com/osinho/fredy) · Zeitraum: 2026-09 · Branches: `map-mobile-fixes`, `mobile-fixes`

Fork mit reinen Mobil-Layout-Fixes vom 28.09.2026 (als Upstream-PRs #478 und #479 eingereicht): einklappbares Filterpanel auf der Karte und keine horizontale Überbreite der Inserats-Detailseite auf Smartphones. Upstream hat beide Probleme einen Tag später mit eigenen Implementierungen behoben.

- **Einklappbares Karten-Filterpanel auf Smartphones** (UI/UX; teilweise; Nutzen niedrig, Aufwand gering)  
  Unter 430 px Breite startet das Filterpanel der Karte eingeklappt (CSS-Checkbox-Toggle ohne React-State) und öffnet als schwebendes Bottom-Popup unten links, getrennt von der Pille, damit Zoom-Steuerung und Attribution frei bleiben (Map.mobile.less). Zusätzlich wird die MapLibre-Attribution auf schmalen Karten beim Laden auf ihr 'i' eingeklappt, indem die Klasse maplibregl-compact-show einmal entfernt wird.  
  _Upstream:_ Upstream hat am 2026-09-29 ('Fold the map's filter panel away on phones', MapFilterPanel.jsx) ein eigenes Einklappen unter 768 px umgesetzt; nur das Einklappen der Attribution beim Laden fehlt dort.  
  Branch `map-mobile-fixes` · Dateien: `ui/src/views/listings/Map.jsx`, `ui/src/views/listings/Map.mobile.less`, `ui/src/components/map/Map.jsx` · Commits: [`9fc4bbe`](https://github.com/osinho/fredy/commit/9fc4bbe300), [`c4dfb54`](https://github.com/osinho/fredy/commit/c4dfb549a5), [`d89f552`](https://github.com/osinho/fredy/commit/d89f552f3e) und 3 weitere

_Bereits in Upstream vorhanden:_ Keine horizontale Überbreite der Detailansicht auf Smartphones (Upstream-Commit 948f7c19 vom 2026-09-29 ('Keep the listing detail inside the screen on phones') behebt dasselbe Problem aus Issue #478.)

_Nicht berücksichtigt:_ 3b7aaed0b0 passt nur einen UI-Test an den geänderten Überschriftentext an; master ist identisch mit Upstream.

## ssch4tz/fredy

[Repository](https://github.com/ssch4tz/fredy) · Zeitraum: 2023-01 bis 2023-03 · Branches: `master`

Alter Fork (Jan./März 2023) für eine eigene Instanz auf einem Gratis-Hoster: ergänzt einen regionalen Provider für das Immobilienportal der Augsburger Allgemeinen und einen Kleinanzeigen-Selektor-Fix; der Rest sind Keep-alive-Hacks und private Konfiguration.

- **Provider Augsburger Allgemeine Immobilien** (Provider; neu; Nutzen niedrig, Aufwand mittel)  
  Neuer x-ray-Provider immobilienaa.js für immobilien.augsburger-allgemeine.de mit Paginierung, Normalisierung von ID/Link und Platzhaltern ('Preis auf Anfrage'). Fremd-Inserate, die das Portal von anderen Quellen einbindet ('Quelle'), werden herausgefiltert, um Dubletten zu vermeiden; inkl. Provider-Test.  
  _Upstream:_ Upstream hat keinen Provider für das Augsburger-Allgemeine-Portal; der Code nutzt aber die alte x-ray/CommonJS-Architektur und müsste neu geschrieben werden.  
  Branch `master` · Dateien: `lib/provider/immobilienaa.js`, `test/provider/immobilienaa.test.js` · Commits: [`0f45567`](https://github.com/ssch4tz/fredy/commit/0f455675fe)

_Bereits in Upstream vorhanden:_ Kleinanzeigen-Selektoren für Preis und Größe angepasst (Der Upstream-Kleinanzeigen-Provider wurde seither mehrfach komplett überarbeitet (u. a. JSON-LD-basierte Beschreibung, eigene Selektoren).)

_Nicht berücksichtigt:_ Ignoriert: httpGetSelf-Keep-alive-Ping auf die eigene onrender.com-Instanz, uid-/Debug-Logging, try/catch um den lowdb-Adapter, private config.json/jobs.json, Dockerfile-, vite.config- und .gitignore-Anpassungen.

## Sunil16666/fredy

[Repository](https://github.com/Sunil16666/fredy) · Zeitraum: 2026-03 · Branches: `add-fotocasa-provider`, `master`

Spanien-Fork von 2026-03 mit zwei Providern auf Basis nachgebauter Android-APIs: Idealista (inzwischen gleichwertig upstream, inklusive Polyline/GeoJSON-Zonen) und Fotocasa, das upstream weiterhin fehlt.

- **Fotocasa-Provider über die signierte Android-Mobile-API** (Provider; neu; Nutzen mittel, Aufwand mittel)  
  Liest Fotocasa (Spanien) über das App-Gateway apps.gw.fotocasa.es (/v3/placeholders/search) mit AES-128-CBC-Request-Signatur wie in der Android-App, ohne Browser. Eine eingefügte fotocasa.es-URL wird über /translatesemantic/search bzw. eigene Slug-Tabellen in Angebots-/Objektart, Orte und Sortierung übersetzt; es wird über alle Seiten paginiert (max. 200) mit Host-Fallback. Gegen die Imperva-WAF lassen sich optional ein X-D-Token und Cookies per Job-Konfiguration, Umgebungsvariable, Datei oder lokalem Token-Server einspeisen. Dazu umfangreiche Tests und ein Dokument zum Reverse Engineering.  
  _Upstream:_ Upstream nennt Fotocasa nur im spanischen Onboarding-Text als Beispiel, hat aber keinen Fotocasa-Provider in lib/provider.  
  Branch `add-fotocasa-provider` · Dateien: `lib/provider/fotocasa.js`, `test/provider/fotocasa.test.js`, `reverse-engineered-fotocasa.md` · Commits: [`1f93585`](https://github.com/Sunil16666/fredy/commit/1f9358583c), [`aa8a507`](https://github.com/Sunil16666/fredy/commit/aa8a50708e), [`808e1da`](https://github.com/Sunil16666/fredy/commit/808e1da2f3) und 2 weitere

_Bereits in Upstream vorhanden:_ Idealista-Provider über die Android-Mobile-API mit Polygon-Suchen (Upstream hat lib/provider/idealista.js mit Mobile-API für ES/IT/PT samt reverse-engineered-idealista.md, und lib/services/idealista/zones.js setzt Polylines in GeoJSON um.)

_Nicht berücksichtigt:_ Ignoriert: .gitignore-/ESLint-Anpassungen und eine versehentlich eingecheckte .pyc-Datei aus dem Reverse-Engineering-Ordner (im Commit 'test', der sonst Fotocasa-Arbeit enthält).

## alexanderroidl/fredy

[Repository](https://github.com/alexanderroidl/fredy) · Zeitraum: 2025-07 · Branches: `feat/immoscout-auto-contact`, `refactor/lodash-and-helper-functions`, `refactor/replace-runtime-imports-with-static-imports`

Contributor-Fork von 2025-07 mit vielen kleinen PR-Branches (Lint/Format, CI, npm-Skripte, Telegram-Drosselung, Mobile-UI). Was davon nützlich war, ist upstream übernommen; übrig bleiben Refactorings (lodash, statische Imports, Upstream-PRs #148/#149, nicht gemergt) und ein unfertiger WIP-Ansatz für automatische Kontaktanfragen bei ImmoScout24.

- **Automatische Kontaktanfrage bei ImmoScout24 (WIP)** (API & Integration; teilweise; Nutzen niedrig, Aufwand hoch)  
  Unfertiger Entwurf: Über die ImmoScout-Mobile-API wird das Exposé geladen (Zimmerzahl, Stadtteil per Reverse-Geocoding über Nominatim, Anrede und Nachname des Ansprechpartners aus dem Namen geparst). Eine Funktion contactListing() soll das Kontaktformular per POST mit Bearer-Token und SSO-ID absenden. Nachrichtenvorlage und Formulardaten sind noch leer, nichts davon ist in die Pipeline eingebunden.  
  _Upstream:_ Upstream erzeugt Anschreiben pro Inserat (lib/services/application/, MCP-Tool get_application_letter), versendet aber nichts automatisch über Portal-APIs.  
  Branch `feat/immoscout-auto-contact` · Dateien: `lib/provider/immoscout.js`, `lib/services/geocoding/geocoding.js` · Commits: [`2d680d9`](https://github.com/alexanderroidl/fredy/commit/2d680d90bd)

_Nicht berücksichtigt:_ Ignoriert: ESLint-/Prettier-Läufe und Pre-commit-Hook, Refactorings auf lodash bzw. statische Imports ohne Funktionsänderung, Formatierungs-Reverts, sowie npm-Startskripte mit x-var und Telegram-Drosselung pro Chat, die upstream bereits enthalten sind.

## Apfelwurm/fredy

[Repository](https://github.com/Apfelwurm/fredy) · Zeitraum: 2026-09 · Branches: `master`

Ein aktueller Commit (2026-09, offener Upstream-PR #477), der das Docker-Image als unprivilegierten node-Nutzer laufen lässt, mit einem Entrypoint, der die Rechte der Volumes repariert.

- **Docker-Image ohne Root-Rechte** (Sicherheit; neu; Nutzen mittel, Aufwand gering)  
  Das Dockerfile baut als node-Nutzer (COPY --chown, USER node). Ein neues docker-entrypoint.sh gibt beim Start als root /db und /conf per chown an node, setzt HOME und wechselt per setpriv zu node, wobei tini als Init erhalten bleibt. Mit --user gestartet prüft es, ob die Volumes beschreibbar sind, und bricht sonst mit einer verständlichen Meldung ab. test/docker/dockerfile.test.js prüft den Aufbau.  
  _Upstream:_ Upstream läuft heute als root; frühere Non-root-Versuche (#214 2025-10, 3ed17f44 2026-03) wurden wegen Volume-Rechten wieder zurückgenommen, was dieser Entrypoint löst.  
  Branch `master` · Dateien: `Dockerfile`, `docker-entrypoint.sh`, `test/docker/dockerfile.test.js`, `.gitattributes` · Commits: [`7e89d27`](https://github.com/Apfelwurm/fredy/commit/7e89d2772f)

## awerks/fredy

[Repository](https://github.com/awerks/fredy) · Zeitraum: 2026-07 · Branches: `master`

Ein Commit auf aktuellem Stand (2026-07): ein Filter 'Bezugsfrei ab' für ImmoScout-Inserate, inklusive UI-Feld, Pipeline-Filter, Telegram-Ausgabe und Tests. Die übrigen Branches sind Kopien von Upstream-Branches.

- **Filter 'Bezugsfrei ab' (ImmoScout)** (Filter & Suche; neu; Nutzen mittel, Aufwand mittel)  
  Liest aus der ImmoScout-Detail-API das Attribut 'Bezugsfrei ab:', normalisiert es zu einem ISO-Datum ('sofort' = heute, 'nach Absprache/Wunsch' = 'flexible') und speichert availableFrom/availableFromText am Inserat. Im Job-Formular gibt es ein neues Datumsfeld minAvailableFrom; _filterBySpecs verwirft ImmoScout-Inserate, die früher oder ohne Angabe bezugsfrei sind. Über das neue Provider-Feld detailSpecFilters wird die Detail-Anreicherung erzwungen, auch wenn Provider-Details in den Nutzereinstellungen aus sind, und Telegram zeigt 'Available from'.  
  _Upstream:_ Upstream-SpecFilter (lib/types/filter.js) kennt nur minRooms, minSize und maxPrice; ein Bezugsdatum wird nirgends gefiltert.  
  Branch `master` · Dateien: `lib/provider/immoscout.js`, `lib/FredyPipelineExecutioner.js`, `ui/src/views/jobs/mutation/JobMutation.jsx`, `lib/notification/adapter/telegram.js` · Commits: [`756e58b`](https://github.com/awerks/fredy/commit/756e58baf5)

_Nicht berücksichtigt:_ Branches 185-bug-old-runs-filling-up-disk, improvements, listing-management(-improvements) enthalten nur Upstream-Commits.

## bergo/fredy

[Repository](https://github.com/bergo/fredy) · Zeitraum: 2022-03 · Branches: `master`

Ein Commit von 2022, der die Markdown-Tabelle im Mattermost-Adapter repariert. Der Fehler steckt im heutigen Upstream noch immer.

- **Mattermost-Tabelle: fehlendes join und Pipe-Escaping** (Bugfix; neu; Nutzen mittel, Aufwand gering)  
  Die Zeilen der Inseratstabelle wurden per map() erzeugt, aber nicht mit join('') verbunden. Bei der String-Verkettung trennt JavaScript sie dann mit Kommas, wodurch ab der zweiten Zeile die Tabelle verrutscht. Der Fix ergänzt .join('') und ersetzt '\|' in Titeln durch '/', damit Titel die Tabellenspalten nicht zerbrechen.  
  _Upstream:_ Upstream-mattermost.js send() hängt newListings.map(...) weiterhin ohne join('') an (sendPriceChange hat es) und escapt '\|' nicht.  
  Branch `master` · Dateien: `lib/notification/adapter/mattermost.js` · Commits: [`629dc58`](https://github.com/bergo/fredy/commit/629dc58930)

## dosr1/fredy

[Repository](https://github.com/dosr1/fredy) · Zeitraum: 2025-10 bis 2025-11 · Branches: `features/additionalpictures`

Fork auf Stand Oktober 2025, der für ImmoScout zusätzlich alle Galeriebilder und als PDF verlinkte Exposé-Dokumente aus der Detailansicht der Mobile-API holt, lokal ablegt und in der Inseratstabelle anzeigt. Dazu kommen ein Docker-Volume für diese Dateien und ein Internet-Check beim Start.

- **Zusätzliche Bilder und Exposé-PDFs von ImmoScout speichern** (Provider; neu; Nutzen mittel, Aufwand hoch)  
  Der ImmoScout-Provider ruft für jedes Inserat die Detailansicht der Mobile-API ab und zieht aus den MEDIA-Abschnitten alle Bild-URLs, aus REFERENCE_LIST-Abschnitten die PDF-Dokumente (additionalpictures/additionaldocuments, neue DB-Spalten). Ein neuer Pipeline-Schritt _savePictures lädt die Dateien per axios nach data/<listingId>/, ein Endpunkt POST /api/listings/raw liefert sie base64-kodiert aus, und die Inseratstabelle zeigt eine Bildergalerie mit Fallback auf die öffentlichen URLs. Nützlich, weil Bilder und Exposés nach dem Entfernen des Inserats beim Portal erhalten bleiben.  
  _Upstream:_ Upstream speichert weiterhin nur ein Titelbild pro Inserat; es gibt seit Migration 44 zwar Anhänge (listing_attachments als BLOB), die aber nur manuell hochgeladen werden.  
  Branch `features/additionalpictures` · Dateien: `lib/provider/immoscout.js`, `lib/FredyPipeline.js`, `lib/api/routes/listingsRouter.js`, `lib/services/storage/listingsStorage.js` · Commits: [`d13a7fe`](https://github.com/dosr1/fredy/commit/d13a7fed63), [`0f653e5`](https://github.com/dosr1/fredy/commit/0f653e5be8), [`b90b353`](https://github.com/dosr1/fredy/commit/b90b3532d9) und 4 weitere

_Nicht berücksichtigt:_ Ignoriert: Internet-Check per DNS-Lookup auf google.com mit Prozessabbruch beim Start (1d3f2f4b2b, eher schädlich), Größen-Spalte in der Tabelle (a83256cb89, Upstream zeigt die Größe längst an), Aufräum- und gitignore-Commits.

## elijahross/fredy

[Repository](https://github.com/elijahross/fredy) · Zeitraum: 2025-10 · Branches: `master`

Ein Commit (2025-10), der einen Adapter ergänzt, der neue Inserate in eine PostgreSQL-Tabelle schreibt.

- **PostgreSQL-Export-Adapter** (Daten & Speicherung; neu; Nutzen niedrig, Aufwand gering)  
  Neuer Benachrichtigungs-Adapter lib/notification/adapter/postgres.js (Paket pg). Er legt bei Bedarf eine Tabelle 'listing' an (alle Spalten TEXT) und fügt jedes neue Inserat mit serviceName und jobKey ein, konfiguriert über einen Connection-String. Gedacht für spätere Auswertungen in einer externen Datenbank. Einschränkungen: neuer Pool pro Aufruf, kein Primärschlüssel und keine Deduplizierung.  
  _Upstream:_ Upstream hat nur den analogen lib/notification/adapter/sqlite.js und den HTTP-Webhook-Adapter, aber keinen PostgreSQL-Export.  
  Branch `master` · Dateien: `lib/notification/adapter/postgres.js`, `lib/notification/adapter/postgres.md`, `package.json` · Commits: [`8d4f8f0`](https://github.com/elijahross/fredy/commit/8d4f8f0b18)

## Jexome/fredy

[Repository](https://github.com/Jexome/fredy) · Zeitraum: 2022-11 · Branches: `gagKoeln`

Ein Commit von 2022, der einen Provider für die Kölner Wohnungsgesellschaft GAG ergänzt.

- **Provider GAG Köln** (Provider; neu; Nutzen niedrig, Aufwand mittel)  
  Neuer HTML-Scraper lib/provider/gagKoeln.js für gag-koeln.de: Container .property-details, Felder ID, Kaltmiete, Titel und Link, Sortierung nach Datum (im_order=datedesc) und Paginierung, dazu ein Test und ein Eintrag in testProvider.json. Nützlich für Wohnungssuchende in Köln, weil kommunale Angebote oft nicht auf den großen Portalen erscheinen.  
  _Upstream:_ Upstream hat keinen GAG-Provider (lib/provider/ ohne gag*).  
  Branch `gagKoeln` · Dateien: `lib/provider/gagKoeln.js`, `test/provider/gagKoeln.test.js` · Commits: [`84fe220`](https://github.com/Jexome/fredy/commit/84fe220990)

## Juliusxyz/fredy

[Repository](https://github.com/Juliusxyz/fredy) · Zeitraum: 2026-04 · Branches: `master`

Kleiner Fork vom April 2026, der der Inseratsübersicht einen Min/Max-Preisfilter hinzufügt; 13 Commits sind überwiegend Iterationen an derselben Funktion (Debounce, Race Condition, Eingabefelder).

- **Preisspanne als Filter in der Inseratsübersicht** (Filter & Suche; teilweise; Nutzen niedrig, Aufwand gering)  
  Die Kopfzeile der Inseratsübersicht (ListingsGrid.jsx) bekommt zwei Eingabefelder 'Min €'/'Max €', die nach 600 ms Debounce neu laden; listingsRouter.js reicht minPrice/maxPrice an queryListings durch, das die Spanne serverseitig filtert. Die Werte werden nicht in der URL gespeichert, Beschriftungen sind nicht übersetzt.  
  _Upstream:_ Upstream-Storage (buildListingWhere) filtert minPrice/maxPrice bereits für Karte, Finanzrechner und MCP, die Listen-Übersicht (ListingsOverview.jsx) bietet aber nur einen Leistbarkeitsfilter, keine freie Preisspanne.  
  Branch `master` · Dateien: `ui/src/components/grid/listings/ListingsGrid.jsx`, `lib/api/routes/listingsRouter.js` · Commits: [`8756310`](https://github.com/Juliusxyz/fredy/commit/8756310d84), [`fa43ae9`](https://github.com/Juliusxyz/fredy/commit/fa43ae9674), [`2ee3167`](https://github.com/Juliusxyz/fredy/commit/2ee3167651) und 9 weitere

_Nicht berücksichtigt:_ Ignoriert: Commit 94aeefb398 mit einem Design-Dokument (…/specs/2026-04-19-price-range-filter-design.md); die vielen 'fix:'-Commits sind Nachbesserungen derselben Funktion und oben gruppiert.

## kaicallback/fredy

[Repository](https://github.com/kaicallback/fredy) · Zeitraum: 2026-04 · Branches: `master`

Zwei vom Railway-Bot erzeugte Commits (2026-04): ein Worker-Modus ohne API/UI und das Entfernen der VOLUME-Deklarationen für Railway.

- **WORKER_MODE: nur Job-Ausführung ohne API** (Deployment & Betrieb; neu; Nutzen niedrig, Aufwand gering)  
  Mit WORKER_MODE=true startet index.js nur den Job-Execution-Service. API/UI, Admin- und Demo-User-Anlage sowie die Tracker-, Aktivitäts- und Geocoding-Crons werden übersprungen. Damit lassen sich Scraper-Worker und Web-Oberfläche getrennt betreiben.  
  _Upstream:_ Upstream index.js startet API und Scheduler immer gemeinsam; es gibt keine solche Umgebungsvariable.  
  Branch `master` · Dateien: `index.js` · Commits: [`60fcdc5`](https://github.com/kaicallback/fredy/commit/60fcdc5f2a)

_Nicht berücksichtigt:_ Ignoriert: Entfernen von VOLUME /db und /conf im Dockerfile (Railway-spezifisch).

## kercdbh/fredy

[Repository](https://github.com/kercdbh/fredy) · Zeitraum: 2026-02 · Branches: `base-url`

Kleiner Fork (Feb. 2026) mit genau einer Funktion: Fredy unter einem Pfad-Präfix (z. B. /fredy) hinter einem Reverse Proxy oder Ingress betreiben zu können.

- **Betrieb unter konfigurierbarem Base-Path (Reverse Proxy)** (Deployment & Betrieb; neu; Nutzen mittel, Aufwand mittel)  
  Neuer Konfigurationswert baseUrl in conf/config.json (normalisiert per normalizeBaseUrl): Das Backend hängt alle /api-Routen unter das Präfix, liefert index.html mit injiziertem <base href> und umgeschriebenen Asset-Pfaden aus und serviert statische Dateien unter dem Präfix. Im Frontend leitet apiBase.js den Präfix aus window.location bzw. window.__FREDY_BASE_URL__ ab und wird in xhr.js, SSE-EventSource und Backup-Client genutzt; die General-Settings-Route schreibt baseUrl mit in die Config, README dokumentiert das Setup.  
  _Upstream:_ Upstream bietet keinen Base-Path/Sub-Path-Betrieb; zudem ist das Backend inzwischen von restana auf fastify umgestellt, der Patch müsste neu aufgesetzt werden.  
  Branch `base-url` · Dateien: `lib/api/api.js`, `lib/utils.js`, `lib/defaultConfig.js`, `lib/api/routes/generalSettingsRoute.js` · Commits: [`cae3557`](https://github.com/kercdbh/fredy/commit/cae355728f)

## Lars147/fredy

[Repository](https://github.com/Lars147/fredy) · Zeitraum: 2026-02 · Branches: `master`

Ein Commit (2026-02), der die Inseratsbeschreibung in Apprise-Nachrichten aufnimmt und dafür die ImmoScout-Beschreibung durchreicht.

- **Beschreibung in Apprise-Benachrichtigungen** (Benachrichtigung; teilweise; Nutzen niedrig, Aufwand gering)  
  Der Apprise-Adapter hängt, sofern vorhanden, 'Description: ...' an den Nachrichtentext an, und ImmoScout nimmt description in die crawlFields auf. Laut Commit sollen nachgelagerte Dienste (z. B. eigene Enricher/Scorer) so den Volltext auswerten können.  
  _Upstream:_ Upstream befüllt description für ImmoScout per Detailabruf (mobileApi.js), apprise.js gibt sie aber nicht aus.  
  Branch `master` · Dateien: `lib/notification/adapter/apprise.js`, `lib/provider/immoscout.js` · Commits: [`64509be`](https://github.com/Lars147/fredy/commit/64509be26b)

## michiosw/fredy

[Repository](https://github.com/michiosw/fredy) · Zeitraum: 2026-06 · Branches: `fix/secure-bootstrap-admin`

Fork von 2026-06 mit mehreren Bugfix-Branches. Bis auf einen sind alle upstream gemergt; offen ist der Zwang zu einem eigenen Admin-Passwort beim ersten Start statt admin/admin.

- **Erst-Admin über Umgebungsvariablen statt admin/admin** (Sicherheit; neu; Nutzen mittel, Aufwand gering)  
  ensureAdminUserExists in lib/services/storage/userStorage.js legt auf einer leeren Datenbank den ersten Admin aus FREDY_BOOTSTRAP_ADMIN_USERNAME und FREDY_BOOTSTRAP_ADMIN_PASSWORD an. Fehlt das Passwort, hat es weniger als 12 Zeichen oder lautet es 'admin', startet Fredy nicht. README und docker-compose.yml sind angepasst (inkl. Coolify-Hinweis), dazu kommen Vitest-Tests. Das schließt das Standard-Login auf öffentlich erreichbaren Instanzen.  
  _Upstream:_ Upstream legt weiterhin admin mit DEFAULT_ADMIN_PASSWORD='admin' an (userStorage.js).  
  Branch `fix/secure-bootstrap-admin` · Dateien: `lib/services/storage/userStorage.js`, `test/storage/userStorage.test.js`, `docker-compose.yml`, `README.md` · Commits: [`e032719`](https://github.com/michiosw/fredy/commit/e0327191ea)

_Nicht berücksichtigt:_ Die Branches fix/email-listing-links, fix/immoscout-swapflat-exclusion und fix/spa-deep-link-assets sowie deren Kopien in fix/secure-bootstrap-admin sind upstream bereits enthalten; die übrigen Branches sind Upstream-Kopien.

## MikeW27/fredy

[Repository](https://github.com/MikeW27/fredy) · Zeitraum: 2026-09 · Branches: `master`

Sehr aktueller Fork (Basis September 2026), der einen Provider für das Schweizer Portal ImmoScout24.ch ergänzt. Sonst keine Änderungen.

- **Provider ImmoScout24.ch** (Provider; neu; Nutzen mittel, Aufwand mittel)  
  Neuer Provider lib/provider/immoscoutCh.js rendert die Suchseite über den gemeinsamen Puppeteer-Browser (Schweizer Locale de-CH, Zeitzone Europe/Zurich gegen DataDome) und liest die Inserate aus dem eingebetteten __NEXT_DATA__-JSON statt aus dem Markup. Er blättert bis zu 5 Ergebnisseiten (Parameter pn) mit zufälliger Pause durch, normalisiert Miete/Kaufpreis in CHF, Zimmer, Fläche, Adresse, Koordinaten und erstes Bild und meldet countries: ['ch']. Eine zusätzliche Helferfunktion extractEmbeddedJson in lib/utils.js wird nicht genutzt; die Option preNavigateUrl (Startseite zuerst aufrufen) unterstützt der Upstream-Extractor nicht, sie bleibt wirkungslos.  
  _Upstream:_ Upstream hat für die Schweiz nur flatfox.js und notiert dort ausdrücklich, dass ImmoScout24.ch wegen Bot-Schutz nicht angebunden ist.  
  Branch `master` · Dateien: `lib/provider/immoscoutCh.js`, `lib/utils.js` · Commits: [`b650642`](https://github.com/MikeW27/fredy/commit/b650642127), [`0ef6dec`](https://github.com/MikeW27/fredy/commit/0ef6dece01), [`b4e1495`](https://github.com/MikeW27/fredy/commit/b4e1495e3e) und 2 weitere

_Nicht berücksichtigt:_ Die Folgecommits 'Update', 'Fix', 'Fix2' sind Iterationen am selben Provider (inkl. einer wieder gelöschten Datei immoscoutCh2.js); keine Tests oder Fixtures vorhanden, ob der Bot-Schutz tatsächlich umgangen wird, ist offen.

## mkarlan/fredy

[Repository](https://github.com/mkarlan/fredy) · Zeitraum: 2026-06 · Branches: `apprise-images`

Ein Commit (2026-06, Upstream-PR #350, nicht gemergt), mit dem der Apprise-Adapter das Inseratsbild als Anhang mitschickt.

- **Inseratsbilder als Anhang bei Apprise** (Benachrichtigung; neu; Nutzen mittel, Aufwand gering)  
  Hat ein Inserat ein Bild, lädt der Apprise-Adapter es herunter und schickt die Nachricht als multipart/form-data mit attachment an die Apprise-API. Geht das schief, fällt er auf das bisherige JSON ohne Bild zurück. Die Nachrichten werden dabei nacheinander statt parallel gesendet. So zeigen Push-Dienste hinter Apprise (z. B. Signal oder Matrix) direkt ein Vorschaubild.  
  _Upstream:_ Upstream-apprise.js sendet nur JSON mit title/body, ohne Bild.  
  Branch `apprise-images` · Dateien: `lib/notification/adapter/apprise.js` · Commits: [`ad0a1c5`](https://github.com/mkarlan/fredy/commit/ad0a1c58ca)

_Nicht berücksichtigt:_ Die übrigen Branches sind Kopien von Upstream-Branches.

## n-athan/fredy

[Repository](https://github.com/n-athan/fredy) · Zeitraum: 2025-08 · Branches: `feature/run-as-is`

Betriebsnotizen von 2025-08 für den Docker-Betrieb auf einem Raspberry Pi: Speicherlimit beim Frontend-Build und eine systemd-Unit für den Container. Sonst README-Texte und eigene Konfiguration.

- **Raspberry-Pi-Build und systemd-Autostart** (Deployment & Betrieb; teilweise; Nutzen niedrig, Aufwand gering)  
  Das Dockerfile setzt beim Frontend-Build NODE_OPTIONS=--max-old-space-size=768, damit der Vite-Build auf einem Raspberry Pi mit wenig RAM durchläuft. Die README beschreibt eine systemd-Unit, die den Container per 'docker start -a' als Dienst startet.  
  _Upstream:_ Upstream baut fertige linux/arm64-Images (.github/workflows/docker-build.yml), hat aber kein Speicherlimit für den Build und keine systemd-Anleitung.  
  Branch `feature/run-as-is` · Dateien: `Dockerfile`, `README.md` · Commits: [`ca9b5a3`](https://github.com/n-athan/fredy/commit/ca9b5a3272), [`9aad06f`](https://github.com/n-athan/fredy/commit/9aad06fb84)

_Nicht berücksichtigt:_ Ignoriert: geänderte conf/config.json (Intervall, Analytics), jobs.json in .gitignore, README-Hinweise mit eigenen Pfaden.

## rugk/fredy

[Repository](https://github.com/rugk/fredy) · Zeitraum: 2025-10 · Branches: `container/nonroot`

Branch container/nonroot (2025-10, Upstream-PR #217, nicht gemergt): Docker-Container als node-Nutzer. Der Ansatz beruht auf dem alten pm2-Dockerfile und ist durch Apfelwurms neueren Entrypoint-Ansatz (PR #477) überholt.

- **Container läuft als Nicht-Root-Nutzer** (Sicherheit; neu; Nutzen niedrig, Aufwand mittel)  
  Das Dockerfile kopiert die Quellen mit --chown=node:node, gibt /fredy, /db und /conf an node, setzt die Rechte auf 770 statt 777 und wechselt am Ende auf USER node (behebt Upstream-Issue #207).  
  _Upstream:_ Upstream läuft heute als root; ähnliche Versuche (#214, 2026-03) wurden wegen Rechteproblemen mit bestehenden Volumes zurückgenommen.  
  Branch `container/nonroot` · Dateien: `Dockerfile` · Commits: [`50f7c04`](https://github.com/rugk/fredy/commit/50f7c04e21)

_Nicht berücksichtigt:_ Ignoriert: chmod +x für docker-test.sh (upstream schon 100755), benanntes Volume für /db in docker-compose (Geschmackssache); ui-redesign und weitere Branches sind Upstream-Kopien.

## severina19/fredy

[Repository](https://github.com/severina19/fredy) · Zeitraum: 2021-11 · Branches: `add-kafka-data-sink`

Alter Fork (Nov. 2021), der einen Kafka-Producer als 'Benachrichtigungs'-Adapter ergänzt, um neue Listings als Datenstrom in Kafka zu schreiben, inkl. docker-compose mit Zookeeper und Kafka. Prototyp-Qualität auf CommonJS-Stand von 2021.

- **Kafka-Adapter als Datensenke** (API & Integration; neu; Nutzen niedrig, Aufwand mittel)  
  kafkaProducer.js sendet jedes neue Listing als JSON-Nachricht (Key = Providername) per kafkajs an das per KAFKA_TOPIC konfigurierte Topic; Broker und optionale SASL-Zugangsdaten kommen aus Umgebungsvariablen (adapter_helper/kafka.js). Ein erweitertes docker-compose.yml startet Fredy zusammen mit Zookeeper und Kafka. Fehlerbehandlung fehlt weitgehend (send-Promises werden nicht abgewartet).  
  _Upstream:_ Upstream hat keinen Kafka-/Message-Queue-Adapter; nur generische http-, sqlite- und Messenger-Adapter.  
  Branch `add-kafka-data-sink` · Dateien: `lib/notification/adapter/kafkaProducer.js`, `lib/notification/adapter_helper/kafka.js`, `docker-compose.yml` · Commits: [`82d633f`](https://github.com/severina19/fredy/commit/82d633f2d6), [`ee049ef`](https://github.com/severina19/fredy/commit/ee049ef989), [`edfeadd`](https://github.com/severina19/fredy/commit/edfeadd93f)

_Nicht berücksichtigt:_ Ignoriert: Verschieben von build/Dockerfile, private config.json-Anpassung und .gitignore.

## tsteffek/fredy

[Repository](https://github.com/tsteffek/fredy) · Zeitraum: 2021-05 · Branches: `working_hours`

Sehr alter Fork (Mai 2021) mit einer Funktion: Arbeitszeiten (Zeitfenster) pro Job, außerhalb derer der Job nicht scrapt. Upstream hat inzwischen globale Arbeitszeiten, aber nicht pro Job.

- **Arbeitszeiten pro Job mit mehreren Zeitfenstern** (Filter & Suche; teilweise; Nutzen niedrig, Aufwand mittel)  
  Jobs erhalten ein Feld workingHours (Liste von Beginn/Ende-Zeitfenstern), das über einen neuen WorkingHoursMutator im Job-Formular gepflegt und in der Jobtabelle angezeigt wird. Der Scheduler in index.js überspringt Jobs, deren Fenster gerade nicht aktiv ist (isDuringWorkingHours in lib/utils.js), etwa um nachts keine Anfragen zu stellen.  
  _Upstream:_ Upstream hat globale Arbeitszeiten in den Einstellungen (duringWorkingHoursOrNotSet mit from/to und Zeitzone), aber keine Zeitfenster pro Job und nur ein Fenster.  
  Branch `working_hours` · Dateien: `lib/utils.js`, `index.js`, `lib/services/storage/jobStorage.js`, `ui/src/views/jobs/mutation/components/workingHours/WorkingHoursMutator.js` · Commits: [`4283022`](https://github.com/tsteffek/fredy/commit/4283022c1d)

## Edsol/fredy

[Repository](https://github.com/Edsol/fredy) · Zeitraum: 2023-09 · Branches: `master`

Alter Fork von September 2023 mit einem rudimentären Subito.it-Provider sowie Job-Aktionen zum manuellen Starten und zum Löschen aller gefundenen Inserate eines Jobs. Alles davon hat der heutige Upstream in ausgereifterer Form.


_Bereits in Upstream vorhanden:_ Provider Subito.it (Upstream hat lib/provider/subito.js samt italienischer Lokalisierung.); Job manuell starten und Verlauf eines Jobs löschen (Upstream hat POST /api/jobs/:jobId/run (Event jobs:runOne) und 'Delete all found Listings of this Job' über deleteListingsByJobId.)

_Nicht berücksichtigt:_ Ignoriert: yarn.lock-Neuaufbau, private Änderung an conf/config.json und .gitignore.

## strech345/fredy

[Repository](https://github.com/strech345/fredy) · Zeitraum: 2026-03 bis 2026-05 · Branches: `fix/listing-id-mismatch`, `fix/kill_chrome_processes`

Aktiver Contributor-Fork (Kartenflächenfilter, Spec-Filter u. a. bereits als PRs #273/#276/#288/#308 gemergt). Übrig sind zwei nicht gemergte Bugfixes – Listing-ID-Mismatch nach dem Speichern und Aufräumen abgestürzter Chromium-Prozesse –, die upstream inzwischen gleichwertig gelöst sind.


_Bereits in Upstream vorhanden:_ Fix: Listing-ID-Mismatch nach dem Speichern und -1-Geokoordinaten (Upstream-storeListings setzt item.id inzwischen auf die DB-ID (mit ON CONFLICT-Behandlung) und _geocode prüft ebenfalls auf lat/lng !== -1.); Aufräumen abgestürzter Chromium-Prozesse (tini, Force-Kill) (Upstream-Dockerfile startet node unter tini -g, closeBrowser killt den Prozessbaum hart (killProcessTree); eigene Temp-Profile, die aufgeräumt werden müssten, legt Upstream nicht mehr an.)

_Nicht berücksichtigt:_ Die übrigen Branches (feature/map_area_filter, feature/spec_filter, fix/map_drawing, fix/kleinanzeige_general_structure, listing-management, improvements u. a.) bestehen aus bereits gemergten Upstream-PRs; EXPLANATION.md ist nur Begleitdoku zum Fix.

## tmbo/fredy

[Repository](https://github.com/tmbo/fredy) · Zeitraum: 2022-02 · Branches: `resiliance`, `master`

Zwei Commits von 2022 auf altem Codestand: robusteres Fehlerverhalten des alten Request-Treibers und ein formatierter Zeitpunkt des letzten Laufs. Beides ist durch den heutigen Upstream überholt.


_Bereits in Upstream vorhanden:_ Robustheit bei fehlgeschlagenen Scrape-Requests (requestDriver.js existiert upstream nicht mehr; Scraping läuft über lib/services/extractor/* mit eigener Fehlerbehandlung, ImmoScout über die Mobile-API.); Letzter Lauf als lesbare Uhrzeit (Upstream speichert last_run_at pro Job und zeigt es im UI als relative Zeit (JobGrid/JobsTable).)

_Nicht berücksichtigt:_ Derselbe Commit entfernt den authInterceptor für /api/jobs; das öffnet die Job-API ohne Login und ist nicht übernehmbar.

## bilalelhaj/fredy

[Repository](https://github.com/bilalelhaj/fredy) · Zeitraum: 2026-04 · Branches: `fix/persist-last-run-timestamp`

Ein Fix (2026-04, Upstream-PR #303, nicht gemergt), mit dem das Dashboard den letzten und nächsten Suchlauf wieder richtig anzeigt. Upstream hat das inzwischen mit einer eigenen DB-Spalte gelöst.


_Bereits in Upstream vorhanden:_ Letzten Scheduler-Lauf dauerhaft speichern (Upstream speichert seit 2026-06 last_run_at pro Job (Migration 21.add-last-run-to-jobs.js), und dashboardRouter berechnet lastRun/nextRun daraus.)

_Nicht berücksichtigt:_ Die übrigen Branches sind Kopien von Upstream-Branches.

## bozturk10/fredy

[Repository](https://github.com/bozturk10/fredy) · Zeitraum: 2025-09 · Branches: `listing_pageview`

Fork vom September 2025 mit einem einzigen Commit (Upstream-PR #167, nicht gemergt), der eine Inseratsseite in der Web-UI ergänzt, die die vom SQLite-Benachrichtigungsadapter geschriebene Datenbank ausliest. Upstream hat inzwischen eine weit umfangreichere Inseratsverwaltung.


_Bereits in Upstream vorhanden:_ Inseratsübersicht in der Web-UI (Upstream hat seit 2025-09-25 ('New Listings view', #192) eine eigene Inseratsverwaltung (listingsRouter.js, ListingsOverview/ListingDetail mit Filtern, Karte, Merkliste) mit Zugriffsprüfung pro Benutzer.)

_Nicht berücksichtigt:_ Private Änderung an conf/config.json ignoriert.

## daniel17903/fredy

[Repository](https://github.com/daniel17903/fredy) · Zeitraum: 2022-06 · Branches: `patch-1`

Ein Commit von 2022 (Upstream-PR #58, nicht gemergt), der Telegram-Nachrichten drosselt, damit die API nicht mit 429 antwortet. Upstream drosselt inzwischen selbst.


_Bereits in Upstream vorhanden:_ Telegram-Rate-Limit gegen HTTP 429 (Upstream-telegram.js drosselt per p-throttle auf einen Request pro Sekunde und Chat.)

## datenwurm/fredy

[Repository](https://github.com/datenwurm/fredy) · Zeitraum: 2026-05 · Branches: `feat/jobs-view-toggle`

Kleiner Fork vom Mai 2026 mit einem Umschalter Kachel-/Tabellenansicht für die Job-Übersicht und einem Sortierfix für die Inseratsliste. Beides ist inzwischen in Upstream enthalten, der Fork bringt heute nichts Neues mehr.


_Bereits in Upstream vorhanden:_ Umschalter Kachel-/Tabellenansicht für Jobs (Upstream hat seit 2026-05-07 ('table overview for jobs') JobsTable.jsx, jobs_view_mode und setJobsViewMode in nahezu identischer Form.)

_Nicht berücksichtigt:_ Der Sortierrichtungs-Fix im Branch fix/listings-sort-direction ist bereits als PR in Upstream übernommen; master ist identisch mit Upstream.

## dekiesel/fredy

[Repository](https://github.com/dekiesel/fredy) · Zeitraum: 2024-09 · Branches: `master`

Ein Selektor-Fix von 2024 (Upstream-PR #111, nicht gemergt) für den Preis bei 1A-Immobilienmarkt. Upstream löst das inzwischen anders.


_Bereits in Upstream vorhanden:_ 1A-Immobilien: Preis ohne Zusatztext (Upstream-einsAImmobilien.js holt den reinen Preis per normalizePrice (Regex) und extractNumber aus dem Text.)

## majbootred/fredy

[Repository](https://github.com/majbootred/fredy) · Zeitraum: 2026-07 bis 2026-08 · Branches: `master`

Fork vom Juli 2026 mit einem eigenen Provider für das Berliner Portal inberlinwohnen.de (Wohnungen der landeseigenen Gesellschaften) plus persönlicher Betriebsdoku. Upstream hat wenige Tage später einen eigenen, ausgereifteren inberlinwohnen-Provider übernommen, sodass nichts Neues übrig bleibt.


_Bereits in Upstream vorhanden:_ Provider inberlinwohnen.de (Upstream hat seit 2026-07-23 (PR #367) lib/provider/inberlinwohnen.js mit Paginierung, gesellschaftsspezifischen Detail-Selektoren und Building-Facts.)

_Nicht berücksichtigt:_ Ignoriert: persönliches Docker-Cheatsheet (Cheatsheet.md), LOCAL_DEVELOPMENT.md, ein Debug-Skript tools/check_listings.mjs, .eslintrc/.gitignore-Anpassungen und zwei leere 'trigger GitHub Actions'-Commits.

## noctarius/fredy

[Repository](https://github.com/noctarius/fredy) · Zeitraum: 2018-09 · Branches: `email`

Ein Commit von 2018 mit einer sehr einfachen E-Mail-Benachrichtigung über nodemailer. Upstream hat längst mehrere E-Mail-Adapter.


_Bereits in Upstream vorhanden:_ E-Mail-Benachrichtigung (SMTP via nodemailer) (Upstream hat smtp.js, sendGrid.js, mailJet.js und resend.js als E-Mail-Adapter.)

## Pr0mises/fredy

[Repository](https://github.com/Pr0mises/fredy) · Zeitraum: 2026-03 · Branches: `immoscout-shape`

Branch immoscout-shape (2026-03, Upstream-PR #277, nicht gemergt) für ImmoScout-Suchen mit auf der Karte gezeichneten Gebieten. Upstream unterstützt das inzwischen selbst und robuster.


_Bereits in Upstream vorhanden:_ ImmoScout-Suche mit gezeichneter Fläche (shape) (Upstream unterstützt die Shape-Suche seit 2026-05 (92105725) und seit 2026-08 robuster in lib/services/immoscout/shape.js (toPolyline: rohe und URL-safe-base64-Shapes).)

_Nicht berücksichtigt:_ Zwei reine Formatierungs-Commits.

## renee-schultz-wu/fredy

[Repository](https://github.com/renee-schultz-wu/fredy) · Zeitraum: 2022-06 · Branches: `esm`

Alter Fork (Juni 2022) mit einem einzigen, nicht gemergten Refactoring-Commit (PR #62), der erste Teile von CommonJS auf ES-Module umstellt. Upstream ist inzwischen vollständig auf ESM migriert, eine eigene Funktion gibt es nicht.


_Bereits in Upstream vorhanden:_ Teilweise Umstellung auf ES-Module (Upstream ist längst komplett ESM ("type": "module" in package.json).)

_Nicht berücksichtigt:_ yarn.lock-Änderungen im selben Commit.

## TomTomNavigator/fredy

[Repository](https://github.com/TomTomNavigator/fredy) · Zeitraum: 2026-08 · Branches: `fix/immoscout-shape-base64`

Ein Fix (2026-08, Upstream-PR #405, nicht gemergt) für ImmoScout-Suchen mit gezeichneter Fläche, deren roher Polyline-Parameter fälschlich base64-dekodiert wurde. Upstream hat das Problem kurz darauf selbst gelöst.


_Bereits in Upstream vorhanden:_ ImmoScout-Shape: rohe Polyline nicht base64-dekodieren (Upstream lib/services/immoscout/shape.js (toPolyline, seit 2026-08-13/#445) unterscheidet rohe und base64-Shapes und dekodiert nur gültige Kandidaten.)

_Nicht berücksichtigt:_ Die übrigen Branches sind Kopien von Upstream-Branches.

## yzaimoglu/fredy

[Repository](https://github.com/yzaimoglu/fredy) · Zeitraum: 2022-12 · Branches: `master`

Kleiner Fork von 2022, der einen Discord-Webhook-Benachrichtigungsadapter ergänzt. Upstream hat seit 2025-09 einen eigenen Discord-Webhook-Adapter, damit ist der Fork überholt.


_Bereits in Upstream vorhanden:_ Discord-Webhook-Adapter mit Chunking und Rate-Limit (Upstream hat seit 2025-09 lib/notification/adapter/discord_webhook.js (PR #196).)

_Nicht berücksichtigt:_ Ignoriert: Lockfile-Wechsel (package-lock/yarn.lock) und ein Commit, der versehentlich .github-Workflows, Issue-Templates und Lockfiles löscht.
