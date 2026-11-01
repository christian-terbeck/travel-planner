# Architecture and Implementation Plan

This document records how the requirements in the [README](../README.md) are implemented, and
the decisions taken where the README left room. It is updated whenever the implementation changes
these decisions.

## 1. Decisions beyond the README

| Topic | Decision | Reason |
| --- | --- | --- |
| Planning model | **Slot → Option → Scenario**, bookings hold an immutable snapshot of the booked option (§3) | Replaces the overlapping *TripComponent*/*Alternative* pair; makes "editing an alternative never changes a booking" structural |
| Multi-stop trips | **Stations** (ordered stops) are part of the MVP | Road trips need accommodation coverage per stop |
| Other transport | Slot kind **transport** for train, bus, ferry and transfer: segments in the same table as flight segments with a `mode` per segment and free-text places with optional coordinates. Slot kinds **parking** and **insurance** keep their period in activity details | One journey model for connections, nights in transit, calendar, ICS and map; a slot can compare train vs. bus |
| Airports | Bundled offline airport list (IATA → name, city, country, IANA time zone) | Correct overnight/time-zone handling without manual time-zone entry |
| Tasks | Manual tasks plus derived tasks from warnings; warnings can be dismissed per trip | README mentions "outstanding tasks" without an entity; dismissal avoids repeated false positives |
| Notifications | Reminders of selected kinds become Windows notifications (Rust command via `tauri-plugin-notification`), once when they come up and once on the day before; shown keys are kept in the settings. Optional: keep running in the tray when the window closes, start with Windows hidden in the tray (`tauri-plugin-autostart`, `--minimized`) | README asks for deadline reminders that do not depend on the window being open; no background service needed |
| Price history | Price checks are drawn per alternative (own SVG chart, saved and target price as labelled reference lines; sparkline on Price Watch). An optional target price per option raises a reminder and notification when the latest check is at or below it | Phase 4 without a price provider: works with manual checks today and with provider data later |
| Travel companion | Export of one self-contained, mobile-first HTML file (no scripts, no external resources): bookings with references on top, open tasks, then day by day with local times, contacts and OSM / `geo:` map links; light/dark and print styles | Readable offline on any phone without an app; prints to PDF |
| Confirmation import | Optional, **off by default**: a picked PDF/image/mail is sent by the Rust core to the Anthropic Messages API (`claude-opus-5-5`, structured JSON output, `fallbacks: "default"`; raw HTTP because there is no Rust SDK). The answer only pre-fills the normal option and booking forms; every value is format-checked and dropped if it does not fit; the file is attached to the booking on save. The API key is kept in the Windows Credential Manager (`keyring`), never in the database, backups or the UI | README §12 "extract candidate details and ask the user to confirm"; AI stays optional (README Phase 5) |
| Automatic backup | Optional, **off** until a folder is chosen: a thread in the Tauri shell checks every 30 min; when the last automatic backup is ≥ 20 h old and the data changed (trip count, last trip change, documents, rates), a normal full backup `travel-planner-auto-YYYYMMDD-HHMMSS.zip` is written there and the oldest beyond the limit (default 10) are deleted. Errors are kept in the settings and shown on the settings page | A synced folder (OneDrive) protects against a lost PC without a sync service; runs while the app waits in the tray |
| Packing lists | Own rows per trip (category, quantity, optional traveler, packed), not tasks: tasks are dated to-dos, packing is a checklist per person. Starting lists ship with the UI in English and German; own lists are saved as `packing_templates` (JSON items) and merged without duplicates. Trip copies take the list unpacked | Reused every trip; a template per trip type saves retyping |
| Travel documents | Per traveler: kind (passport, ID card, visa, driving licence, other), optional name and expiry; no numbers are stored. A document expiring before the trip ends is a critical (non-blocking) warning, a passport valid for less than 6 months after it an info; both also appear as reminders before the trip. A traveler added under a name known from another trip takes over their category, birth date and documents | Expired passports are a costly surprise; travelers are per trip, so known names avoid retyping |
| Trip review | Optional, **off by default**, same key as the import: on request the UI builds a compact JSON summary of one trip (plan, alternatives, dates, prices, terms, computed warnings, budget; people only as "Person n"; no references, notes, contacts, links or files; viewable before sending) and the Rust core asks Claude Opus 5.5 (structured output, effort high, `fallbacks: "default"`) for findings (missing, cost, timing, risk, idea) with importance and the assumptions they rest on. Advice only, kept for the session; nothing is changed | README Phase 5: recommendations based on available data with stated assumptions, never claiming global optimality |
| Pasted offers | Each need has “Paste a link or offer”. Links are read offline (`src/lib/offerLink.ts`): dates and travelers from the query of booking, rental and search links (Booking.com incl. split dates, Airbnb, Expedia, generic `checkin`/`arrival`/`pickup…` keys; ISO, compact, German and US date forms), airports and dates from flight search paths (Kayak, momondo, Skyscanner), a name from hotel page slugs, and a price only when the text states one clearly (next to “total”/“Gesamt”, or the only amount named). The result opens in the normal option form; the pasted text goes into the notes, dates the form cannot hold (no times) are named there. Optional, with the confirmation import turned on: “Read with Claude” sends only the pasted text (≤ 60,000 characters) with the need's kind; the answer passes the same checks as an imported confirmation, and what the link says for sure (URL, platform) wins | Collecting alternatives from browser tabs is the most frequent input; most sites put dates and travelers in the link, so the common case needs no service |
| Dropped files | `dragDropEnabled` is on (no screen uses HTML5 drag and drop; the map pans with pointer events). Files dropped on a trip page open a dialog: attach them as documents to the trip, an active booking or an alternative, or — one file Claude can read, with the confirmation import on — “Read as booking”, which opens the bookings page and starts the normal import with that file | Confirmations arrive as mail attachments and downloads; dragging them in saves the file dialog. Nothing is sent without the explicit button |
| Travel journal | Own rows `journal_entries` (one per trip day, unique per trip; headline and text), not notes: the journal is ordered by day and listed for every day of the plan's period (up to 120 days) with that day's stays and starting items as a reminder; days outside the period can be added. Photos are ordinary documents with `journal_entry_id` (deleting an entry keeps them as trip documents). Pictures are shown from a `document_image` command that returns raw bytes (`tauri::ipc::Response`) turned into blob URLs (CSP `img-src blob:`), only for JPEG/PNG/GIF/WebP up to 40 MB; HEIC shows a tile that opens the file. Exports, backups, search and undo include the journal; trip copies start without one | The trip's memories stay next to its plan and bookings, offline and in the same backups |
| Expenses on the way | “Quick expense” (budget tab, the dashboard's “On the way” card for ongoing trips, Ctrl+K “Record an expense – trip”) asks for amount, what for (defaults to the category name), category, who paid and for whom; currency and payer default to the trip's last actual expense, “Save and next” keeps the dialog open. A split other than everyone is stored as equal cost shares. Suggested transfers can be marked as paid: a `settlements` row (from, to, amount, date) counts as paid by the giver and as money back for the receiver in the settlement, and does not change the trip's costs. Trip copies leave settlements behind | Recording costs right when they happen is the only way the settlement stays right; settling up in the app closes the loop instead of leaving an open balance forever |
| Weighing scenarios | The explorer orders combinations by weights 0–3 (default: price only, the old order) for price, time on the way (journeys door to door, each change counted as an hour), the average of the user's own ratings of the chosen alternatives, and the share of items that can still be cancelled for free (booked terms for booked items, offered terms otherwise; deadlines respected). Each measure is scaled between the best and worst combination shown; missing price or time counts as worst, missing ratings or terms as the middle. Weights live in the per-trip UI state for the session. The top combination gets “Best by your weights”; “Cheapest saved” stays as it was. Below the list, “Travel dates compared” groups compatible, complete combinations by travel period (only those with the fewest uncovered nights, so a stay for other dates does not make a window look cheap) and shows the cheapest per period and its difference to the cheapest dates | README Phase 2/5: compare trade-offs between cost, duration, convenience and flexibility, relative to the saved options only and without claiming an optimum |
| Statistics | Own page over the trips actually taken: an active booking, started (period start ≤ today) and not cancelled, measured on the bookings only (`confirmed` evaluation), not the plan. Per trip and per year: days, nights, flights, km (flights great circle; ground estimates or road routes), countries from the airports used without the home country (the first departure's), spent = bookings + cancellation costs + actual expenses − expense refunds, converted to the display currency where a rate exists (the rest shown separately). The basis is stated on the page | A look back that needs no extra input: everything comes from records the user keeps anyway |
| Calendar export | ICS export of a trip's itinerary | Offline, works with Outlook/Google Calendar |
| Travelers | Travelers are entities; payments record who paid, costs can be split | Cost splitting and per-traveler settlement |
| Calendar rendering | Own month/week/agenda/itinerary views | Needs plan/booking/preview semantics, stays and time zones; FullCalendar 7 is a new headless API with v6 plugins |
| Map | Offline SVG map (Natural Earth via `world-atlas`, `d3-geo`); no tile server | Works offline and sends no locations anywhere |
| Distances | Flights: great-circle between airports. Ground: straight line × 1.25, labelled "estimated"; "car" when a rental car covers that day | Works offline |
| Road routes | Optional, **off by default**: ground legs are routed by an OSRM server (default: free FOSSGIS server `routing.openstreetmap.de`, OpenStreetMap data; URL configurable). Only the leg's coordinates are sent, by the Rust core (CSP unchanged), ≤ 1 request/s, own User-Agent; answers (incl. "no road") are cached in `road_routes`, failures are retried. OSM attribution and "fix the map" link on the map | Exact road km, driving time and road lines without an API key; offline after the first fetch |
| Locations | Optional lat/lon, parsed offline from pasted coordinates or Google Maps/OSM links. Optional, **off by default**: online address search (Nominatim, OpenStreetMap; URL configurable) on an explicit click; only the search text and UI language are sent by the Rust core, ≤ 1 request/s, answers cached in `geocode_cache` | Works offline; the online search saves copying coordinates by hand |
| Weather | Optional, **off by default**: for stays with coordinates the Rust core asks Open-Meteo (no key; CC BY 4.0, attributed on the card) for daily code, min/max temperature and precipitation: the forecast when the stay ends within 15 days (and started at most 60 days ago), the archive for trips that are over, and otherwise the same dates one year earlier, labelled as a guide. Coordinates are rounded to 0.01° before sending; answers are cached in `weather_cache` (forecasts 3 h, the past for good) | Helps packing and planning; nothing is sent unless turned on |
| Provider logos | Offline registry (`src/lib/providers.ts`) of ~130 airlines, car rental firms, stay platforms, hotel chains, rail, bus, tour and ride providers, matched against links, typed names and (for flights only) IATA flight numbers. Bundled simple-icons glyphs (CC0, extracted by `scripts/build-provider-logos.mjs`) or a monogram in the brand colour; a tile opens the provider's website. Optional, **off by default**: for brands without a glyph the Rust core fetches the provider's home page once, picks the best `<link rel=icon>` (else `/favicon.ico`), accepts only bytes that sniff as an image (≤ 256 KB) and keeps it as a data URI in `site_icons` (sites without one are asked again after 30 days) | Recognisable bookings at a glance; works offline, CSP stays `img-src 'self' data:` |
| Updates | Optional, **off by default** (also "Check now"): the Rust core asks the GitHub API for the latest release of the public repository (no data sent besides the request). A newer version is shown in the sidebar and in Settings with its notes and a link to the release page; it can be skipped. Nothing is downloaded or installed by the app | An in-app installer (`tauri-plugin-updater`) needs a signing key pair whose private key must be kept safe; the release page works for the installer and the portable zip alike. Publishing a release: `node scripts/bump-version.mjs`, `bash scripts/build-windows.sh`, then a GitHub release tagged `vX.Y.Z` with the two files from `release/` |
| Exchange rates | Entered by hand, or optional (**off by default**) ECB euro reference rates fetched once a day at start (or on demand). Stored as normal dated rates with source "ECB"; only the newest ECB rate per currency is kept, manual rates are never changed | Conversions stay explicit about rate and date |
| Linting | Biome (lint + format) | typescript-eslint does not support TypeScript 7 |
| UI language | English and German, every string through i18next keys; the language follows the formats (`de-*` → German) unless chosen in Settings. German texts are typed against the English ones and tested for matching placeholders | Translations cannot miss keys or variables |

## 2. Technology

- **Tauri 2** shell (`src-tauri`), **Rust core crate** `crates/tp-core` (SQLite via `rusqlite` with
  bundled SQLite, migrations, repositories, transactions, change history, backup/import validation).
  The core has no Tauri dependency and is tested with `cargo test -p tp-core`.
- **React 19 + TypeScript 7 (strict) + Vite 8 + Tailwind CSS 4.**
- **Domain logic in TypeScript** (`src/domain`): money, dates/time zones, nights, rental days,
  scenario combinations, compatibility and conflict detection, cancellation state, budget
  aggregation, cost splitting, reminders and derived tasks, ICS. Pure functions with an injected
  clock, tested with **Vitest**. The UI computes everything from the persisted trip graph, so a
  change anywhere updates all views.
- **Types shared across the boundary** are generated from Rust with `ts-rs` (`src/api/bindings`).
- Libraries: `@tanstack/react-query` (server state, invalidation after mutations), `react-router`
  (hash routing), `react-hook-form` + `zod` (forms and validation), `temporal-polyfill` (dates and
  time zones), `radix-ui` (accessible primitives), `lucide-react` (icons), `i18next`.
- Online access only through the core: `ureq` (rustls) for the optional route service.
- Tauri plugins: `dialog` (file pickers), `opener` (external URLs in the system browser, documents
  in their default app). No shell plugin, no raw SQL from the frontend.

### Build workflow

Development happens in WSL; the Windows app is cross-compiled with `cargo-xwin`
(`scripts/build-windows.sh`, toolchain from `~/.local/opt/wincross`, same as media-library).
On a Windows machine the same script builds natively in Git Bash.

Checks after every step: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`,
`cargo test -p tp-core`, `cargo xwin check` for the Tauri crate.

## 3. Domain model

All IDs are UUIDv7 strings. Money is stored as integer **minor units** plus an ISO 4217 currency
code. Times for travel events are stored as **local date-time + IANA time zone** (what the
ticket says); instants are derived. Record timestamps (`created_at`, `checked_at`, …) are UTC.

```
Trip ─┬─ Traveler ── TravelerDocument* (kind + validity, no numbers)
      ├─ Station (ordered stops)
      ├─ Slot (a need: "Flights", "Stay Lisbon", "Rental car", "Boat tour")
      │    └─ Option (an alternative; kind-specific details)
      │         ├─ Segment* (flight or train/bus/ferry/transfer) / AccommodationDetail / RentalCarDetail / ActivityDetail
      │         ├─ OptionFee*
      │         ├─ CancellationPolicy (as offered)
      │         ├─ PriceObservation* (manual price checks, later provider data)
      │         └─ Booking* (confirmed reservation, snapshot of the option)
      │              ├─ CancellationPolicy (as booked), cancellation request + refund
      │              ├─ Payment* (payment or refund, paid by traveler)
      │              └─ CostShare* (split between travelers)
      ├─ Scenario ── ScenarioSelection (slot → option | intentionally none)
      ├─ Expense* (planned or actual, category, optional booking) ── CostShare*
      ├─ Settlement* (money passed between two travelers)
      ├─ Task*, DismissedWarning*, OpenNight* (nights intentionally left unbooked)
      ├─ PackingItem* (optionally per traveler)
      ├─ JournalEntry* (one per day) ── Document* (photos)
      ├─ Document* (local file reference), Note*
ExchangeRate* (explicit rate + date + source), PackingTemplate* (reusable lists), Setting*, ChangeLog*
```

### Key rules

- **Slots** have a kind (`flight`, `transport`, `accommodation`, `rental_car`, `activity`, `parking`,
  `insurance`, `other`), an optional station and a `required` flag. Flight segments have no `mode`;
  transport segments must have one (`train`, `bus`, `ferry`, `transfer`, `other`). A scenario is incomplete when a required slot has no option or
  the option has no price.
- **Option lifecycle status:** `idea`, `planned`, `booked`, `cancelled`, `completed`, `archived`.
  *Preferred* is derived: the option is selected in the trip's preferred scenario. *Completed* is
  also shown automatically for booked items in the past. The user's **decision** is separate:
  `none`, `favorite`, `rejected`, plus a 0–5 rating.
- **Bookings** belong to an option. A flight option may have several bookings, each covering some
  segments (separate outbound and return reservations). Creating a booking copies the option into
  `snapshot` and sets the option to `booked` in one transaction. Editing a booked option needs an
  explicit confirmation and is written to the change log.
- **Prices** have a basis (`total`, `per_person`, `per_night`, `per_day`); the domain layer turns them
  into totals. Missing prices are `null` and make totals *incomplete*, never zero.
- **Payment status** is stored explicitly (`not_applicable`, `unpaid`, `partially_paid`, `paid`,
  `refunded`, `partially_refunded`, `unknown`). Recording payments suggests the matching status.
- **Cancellation policy** types: `free_until`, `with_fee`, `partially_refundable`,
  `non_refundable`, `unknown`. No policy means *unknown*, never *free*.
- **Currencies** are never summed directly. Totals per display currency use explicit exchange
  rates; amounts without a rate are reported separately as "not convertible".
- **Duplicating an option** deep-copies details, fees and policy; bookings and observations are not copied.
- **Copying a trip** (plan it again) takes the needs, stops and planned expenses, and optionally the
  alternatives with details, fees, terms and scenarios (archived and rejected ones are left
  behind), the travelers, and the tasks (reopened) and notes. Every date moves by the chosen
  number of days. Bookings, payments, actual expenses, price history, documents and history stay
  with the original.
- **Deletion:** a trip deletes all its rows (FK `ON DELETE CASCADE`). Document files are removed
  only when no row references them any more. Options with bookings cannot be deleted, only archived.
- **Undo:** before a delete the core captures every row it removes and every reference it clears,
  found through the schema's foreign keys (plus the option whose status a booking delete changes).
  The last 10 deletions can be undone in the same session; their document files stay until then
  (removed at the next start). Undo fails without changes if the data no longer fits.
- **Change log:** booking prices, cancellation policies and status transitions.

### Derived values (TypeScript domain)

- *Effective trip period:* from the preferred scenario's transport (first departure → last
  arrival), else accommodation, else the preferred date range. The *confirmed period* uses
  bookings only.
- *Required nights:* local dates from arrival to departure, minus nights spent on overnight
  flights. *Gaps* are required nights not covered by an accommodation of the scenario and not
  marked as intentionally open.
- *Rental days:* 24-hour blocks with a configurable grace period (default 59 min), or calendar
  days, per option.
- *Conflicts:* activities outside the period, overlapping timed activities, accommodation gaps
  and overlaps, rental period not covering driving days, pickup before flight arrival + buffer, connections shorter than the trip's change time (same means, default 45 min; change of means or airport, default 90 min), activities within the arrival/departure buffers, a wait of 3 h or more for check-in or after check-out (only when the stay states its times),
  duplicate bookings, deadlines, travel insurance not covering the trip, travel documents expiring before the end (passports: within 6 months after it). Connections are checked
  across flights and other transport; parking and insurance are not activities. Each warning has a stable key (for dismissal) and references
  the components involved.
- *Combinations:* cartesian product over the options of each slot (booked options are fixed,
  rejected options are excluded), filtered by compatibility, ranked by total. The cheapest one is
  labelled "cheapest **saved** combination". Above 5,000 combinations the explorer asks the user
  to narrow the options instead of truncating silently.
- *Budget:* target, maximum, preferred scenario, cheapest saved scenario, confirmed (active
  bookings), paid (payments − refunds), outstanding, planned and actual expenses — each sourced
  from exactly one kind of record, so nothing is counted twice.

## 4. Milestones

| # | Milestone | Done when |
| --- | --- | --- |
| M0 | Plan, scaffold, tooling, Windows cross-build, app shell with navigation | App window opens on Windows |
| M1 | Domain library (money, time, nights, rental, combinations, conflicts, budget, splits, cancellation, reminders, ICS) | Vitest suite green |
| M2 | Rust core: schema, migrations, repositories, transactions, change log, Tauri commands | `cargo test` green, commands callable |
| M3 | Trips: list, creation without dates, overview, travelers, stations | Acceptance 1–2 |
| M4 | Slots and options for flights, stays, cars, activities; duplicate, decide, price checks | Acceptance 3–4 |
| M5 | Combination explorer, scenario comparison, preferred scenario | Acceptance 5–6 |
| M6 | Booking workflow, direct bookings, payments, cancellation policies, history | Acceptance 8–9, 12 |
| M7 | Calendar (month, week, agenda, itinerary), scenario preview, conflict panel | Acceptance 7, 10, 13 |
| M8 | Budget and expenses, exchange rates, cost splitting | Acceptance 14 |
| M9 | Dashboard, cancellation dashboard, reminders, tasks, Price Watch | Acceptance 11 |
| M10 | Documents and notes, exports (JSON, HTML, ICS, CSV), backup, restore, import preview | Acceptance 15–16 |
| M11 | Settings, polish, accessibility pass, end-to-end acceptance run on Windows | All acceptance criteria |
| M12 | Route map with flight/drive distances | Map tab shows the plan's route and km per mode |
| M13 | Optional online road routes (OSRM) | Ground legs show road km, driving time and road lines when enabled |
| M14 | Train, bus, ferry, transfer, parking, insurance | Transport segments work like flights in checks, calendar, ICS and map |
| M15 | German interface | All texts translated, language follows the formats or the setting |
| M16 | Windows notifications, tray, start with Windows | Reminders arrive as notifications while the app runs |
| M17 | Optional address search and ECB exchange rates | Coordinates found by name; daily reference rates |
| M18 | Price history and price alerts | Chart per alternative; reminder at or below a target price |
| M19 | Travel companion export | One offline HTML file for the phone |
| M20 | Optional confirmation import with Claude | A confirmation pre-fills the booking forms |
| M21 | UI tests | Booking lifecycle runs in the real screens (jsdom) |
| M22 | Undo deletions | Every delete can be undone from its toast during the session |
| M23 | Command palette and search | Ctrl+K finds trips, bookings, references, places, notes and opens pages |
| M24 | Copy a trip | A trip is planned again with moved dates, without bookings |
| M25 | Automatic backups | A daily backup lands in a chosen folder, the oldest are pruned |
| M26 | Packing lists | Lists per trip and traveler, from suggested or saved lists |
| M27 | Travel documents | Expiring passports, IDs and visas show as warnings and reminders |
| M28 | Weather | Forecast, last year's or measured weather at the stays (optional) |
| M29 | Update check | A newer GitHub release is announced (optional) |
| M30 | Trip review | Claude points out gaps, costs, timing and risks (optional) |
| M31 | Smaller screens, accessibility | Settings, map and budget split; labels translated; skip link |
| M32 | Alternatives from links and offer texts | A pasted booking/search link or offer fills in the option form (offline; Claude optional) |
| M33 | Drop files on a trip | Dropped files are attached as documents or read as a booking |
| M34 | Travel journal | Text and photos per trip day, with the day's plan as a reminder |
| M35 | Expenses on the way, settling up | An expense is recorded in a few taps; a paid transfer evens out the balances |
| M36 | Configurable buffers | Change times per trip; tight activities and long waits at the stay are flagged |
| M37 | Weighing scenarios, travel dates | Combinations are ordered by price, time, ratings and flexibility as weighted; the possible travel dates are compared by price |
| M38 | Statistics | Days, km, countries and spending of the trips taken, per year |

## 5. Status

M0–M10 and M12–M38 are implemented. For M11, every acceptance criterion is covered by automated
tests ([ACCEPTANCE.md](ACCEPTANCE.md)); the manual run on Windows listed there is still pending.
