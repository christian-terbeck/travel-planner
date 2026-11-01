# Acceptance (M11)

The Phase 1 acceptance criteria from the [README](../README.md#phase-1-acceptance-criteria), with the
automated tests that cover each one and what still has to be checked by hand in the Windows app.
Run the automated part with `npm test` and `cargo test -p tp-core`.

## Automated coverage

| # | Criterion | Covered by |
| --- | --- | --- |
| 1 | Create a trip without fixed dates | `tests.rs`: `trip_without_dates_is_valid_and_round_trips` |
| 2 | Optional date boundaries and a budget | `tests.rs`: `invalid_rows_are_rejected`; `scenarios.test.ts` (date limits, budget delta) |
| 3 | Several outbound and return flights | `scenarios.test.ts` (README example); `tests.rs`: `outbound_and_return_can_be_separate_bookings` |
| 4 | Accommodation and rental car options | `scenarios.test.ts` (README example), `items.test.ts` (nights, rental days) |
| 5 | Compare compatible alternatives with combined costs | `scenarios.test.ts`: `finds incompatible combinations and the cheapest valid one`, `totals a compatible scenario …` |
| 6 | Preferred scenario without booking | `tests.rs`: `only_one_preferred_scenario_per_trip`; `events.test.ts` |
| 7 | Inspect the itinerary in the calendar | `calendar/events.test.ts`: `shows the plan …`, `lists planned items without a date separately` |
| 8 | Book with actual prices and references | `tests.rs`: `booking_snapshots_the_plan_and_protects_the_option`; `bookingFlow.test.tsx`: `books an alternative …` |
| 9 | Payment and cancellation information | `tests.rs`: `cancelling_keeps_booking_payments_and_history`; `bookingFlow.test.tsx`: `cancels a booking …`; `misc.test.ts` (cancellation) |
| 10 | Confirmed bookings highlighted in the calendar | `calendar/events.test.ts`: `marks bookings as booked …` |
| 11 | Upcoming cancellation deadlines | `misc.test.ts`: `reminds about deadlines within the lead time only`; `notify.test.ts` |
| 12 | Change an alternative without changing the booking | `tests.rs`: `booking_snapshots_the_plan_and_protects_the_option` |
| 13 | Activity with a scheduling conflict | `scenarios.test.ts`: `detects activities outside the period and overlapping activities`; `events.test.ts` |
| 14 | Estimated, confirmed, paid and additional costs separately | `scenarios.test.ts`: `uses booked prices …`, `separates refunds and cancellation costs` |
| 15 | Close and reopen without losing data | `tests.rs`: `data_survives_closing_and_reopening_the_app` |
| 16 | Export and restore from a validated backup | `tests.rs`: `export_and_import_as_new_trip`, `backup_and_restore_round_trip`, `restore_rejects_foreign_or_unsafe_archives` |

No criterion needs external API credentials.

## Manual run on Windows

The automated tests cannot see layout, focus, file dialogs or the operating system. Go through
these once per release in the installed app (a portable copy in a scratch folder keeps real data
untouched):

1. Create a trip with only a title; edit it to add date limits, a budget and two travelers.
2. Add flight, train, stay, rental car, parking and insurance needs with two alternatives each;
   type multi-word names, addresses and notes.
3. Explore combinations, save two scenarios, make one preferred, preview the other in the itinerary
   and on the map.
4. Open the calendar (month, week, agenda): the plan is shown, an overlapping activity is flagged.
5. Book the flight with a reference and a payment; record cancellation terms with a deadline a few
   days ahead. The calendar shows it as booked; the dashboard and Cancellations list the deadline.
6. Edit the booked alternative: the confirmation appears and the booking keeps its price.
7. Budget: estimated, confirmed, paid and additional expenses appear separately.
8. Settings: switch the language to Deutsch and back; turn on notifications, close-to-tray and start
   with Windows; restart Windows (or sign out and in) and check that the app waits in the tray and
   a deadline notification arrives.
9. Turn on address search and ECB rates; find a station by name; fetch rates.
10. Optional, with an Anthropic API key: import a PDF booking confirmation and check the proposed
    values before saving.
11. Export the trip (JSON, ICS, HTML, travel companion, CSV); open the companion file on a phone.
12. Create a backup, change something, restore the backup; close and reopen the app.
