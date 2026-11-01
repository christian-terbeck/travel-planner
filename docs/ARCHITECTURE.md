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
| Calendar export | ICS export of a trip's itinerary | Offline, works with Outlook/Google Calendar |
| Travelers | Travelers are entities; payments record who paid, costs can be split | Cost splitting and per-traveler settlement |
| Calendar rendering | Own month/week/agenda/itinerary views | Needs plan/booking/preview semantics, stays and time zones; FullCalendar 7 is a new headless API with v6 plugins |
| Map | Offline SVG map (Natural Earth via `world-atlas`, `d3-geo`); no tile server | Works offline and sends no locations anywhere |
| Distances | Flights: great-circle between airports. Ground: straight line × 1.25, labelled "estimated"; "car" when a rental car covers that day | Works offline |
| Road routes | Optional, **off by default**: ground legs are routed by an OSRM server (default: free FOSSGIS server `routing.openstreetmap.de`, OpenStreetMap data; URL configurable). Only the leg's coordinates are sent, by the Rust core (CSP unchanged), ≤ 1 request/s, own User-Agent; answers (incl. "no road") are cached in `road_routes`, failures are retried. OSM attribution and "fix the map" link on the map | Exact road km, driving time and road lines without an API key; offline after the first fetch |
| Locations | Optional lat/lon, parsed offline from pasted coordinates or Google Maps/OSM links. Optional, **off by default**: online address search (Nominatim, OpenStreetMap; URL configurable) on an explicit click; only the search text and UI language are sent by the Rust core, ≤ 1 request/s, answers cached in `geocode_cache` | Works offline; the online search saves copying coordinates by hand |
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
Trip ─┬─ Traveler
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
      ├─ Task*, DismissedWarning*, OpenNight* (nights intentionally left unbooked)
      ├─ Document* (local file reference), Note*
ExchangeRate* (explicit rate + date + source), Setting*, ChangeLog*
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
- **Deletion:** a trip deletes all its rows (FK `ON DELETE CASCADE`). Document files are removed
  only when no row references them any more. Options with bookings cannot be deleted, only archived.
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
  and overlaps, rental period not covering driving days, pickup before flight arrival + buffer,
  duplicate bookings, deadlines, travel insurance not covering the trip. Connections are checked
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

## 5. Status

M0–M10 and M12–M21 are implemented. For M11, every acceptance criterion is covered by automated
tests ([ACCEPTANCE.md](ACCEPTANCE.md)); the manual run on Windows listed there is still pending.
