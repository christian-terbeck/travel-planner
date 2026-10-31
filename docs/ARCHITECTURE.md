# Architecture and Implementation Plan

This document records how the requirements in the [README](../README.md) are implemented, and
the decisions taken where the README left room. It is updated whenever the implementation changes
these decisions.

## 1. Decisions beyond the README

| Topic | Decision | Reason |
| --- | --- | --- |
| Planning model | **Slot → Option → Scenario**, bookings hold an immutable snapshot of the booked option (§3) | Replaces the overlapping *TripComponent*/*Alternative* pair; makes "editing an alternative never changes a booking" structural |
| Multi-stop trips | **Stations** (ordered stops) are part of the MVP | Road trips need accommodation coverage per stop |
| Airports | Bundled offline airport list (IATA → name, city, country, IANA time zone) | Correct overnight/time-zone handling without manual time-zone entry |
| Tasks | Manual tasks plus derived tasks from warnings; warnings can be dismissed per trip | README mentions "outstanding tasks" without an entity; dismissal avoids repeated false positives |
| Calendar export | ICS export of a trip's itinerary | Offline, works with Outlook/Google Calendar |
| Travelers | Travelers are entities; payments record who paid, costs can be split | Cost splitting and per-traveler settlement |
| Calendar rendering | Own month/week/agenda/itinerary views | Needs plan/booking/preview semantics, stays and time zones; FullCalendar 7 is a new headless API with v6 plugins |
| Linting | Biome (lint + format) | typescript-eslint does not support TypeScript 7 |
| UI language | English, every string through i18next keys | German later is translation work only |

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
      │         ├─ FlightSegment* / AccommodationDetail / RentalCarDetail / ActivityDetail
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

- **Slots** have a kind (`flight`, `accommodation`, `rental_car`, `activity`, `other`), an optional
  station and a `required` flag. A scenario is incomplete when a required slot has no option or
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
  duplicate bookings, deadlines. Each warning has a stable key (for dismissal) and references
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
