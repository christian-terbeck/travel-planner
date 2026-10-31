# Travel Planner

## 1. Vision

Travel Planner is a premium desktop application for planning, comparing, organizing, and managing complete trips — from the first travel idea to the journey home.

The application should help users make better travel decisions by combining flights, rental cars, accommodation, and activities into one coherent itinerary.

Instead of collecting links, prices, and booking confirmations across browser tabs, emails, and spreadsheets, Travel Planner provides a single, structured workspace for the entire travel lifecycle.

The application must support both flexible trip planning and confirmed bookings. Users should be able to explore several alternatives, compare complete travel scenarios, identify potential savings, and turn their preferred options into actual bookings without losing the original planning information.

**Core principle: The application must be genuinely useful without any external travel API.** Manual entry, comparison, calculations, calendar management, booking tracking, and cancellation management are first-class features, not temporary fallbacks.

External integrations should enhance the application without becoming prerequisites for its core functionality.

## 2. Product Goals

Travel Planner should provide:

- A central overview of all past, current, and planned trips.
- Flexible trip planning without requiring fixed travel dates from the beginning.
- Multiple flight, accommodation, rental car, and activity alternatives per trip.
- A unified comparison of total trip costs and travel duration.
- A calendar that combines travel periods, overnight stays, transportation, and activities.
- Clear visual differentiation between planned, booked, cancelled, and completed items.
- Centralized booking information, provider links, prices, reference numbers, and confirmation documents.
- Cancellation deadlines, cancellation conditions, and refundable amounts.
- Budget planning and comparisons between estimated and actual costs.
- The ability to identify conflicts, missing reservations, and opportunities to save money.
- An extensible integration architecture for future travel search APIs and price monitoring.

The user should always understand what is merely being considered, what has been booked, what has already been paid, and what still requires attention.

## 3. Target Platform and Technology

Build a modern, native-feeling desktop application using:

- **Tauri 2** for the desktop application framework.
- **Rust** for native functionality, filesystem access, and secure desktop integrations.
- **React and TypeScript** for the user interface.
- **Vite** for the frontend development and build workflow.
- **Tailwind CSS** for styling.
- A modern, reusable component system for consistent UI patterns.
- **SQLite** for persistent local storage.
- A well-defined data access layer and database migrations.

Use stable, actively maintained libraries where appropriate. Claude Code should evaluate suitable libraries for calendar rendering, date handling, forms, validation, and data visualization before introducing dependencies.

The application should run primarily on Windows. The architecture should remain portable to macOS and Linux wherever practical.

The MVP must work completely offline after installation, except for explicitly requested external links or optional integrations.

No account, mandatory cloud service, or self-hosted backend should be required.

## 4. Core User Experience

The interface should feel like a premium travel management workspace rather than a simple booking spreadsheet.

### 4.1 Main Navigation

Provide the following primary sections:

1. **Dashboard** — overview of upcoming trips, planning progress, budgets, and important deadlines.
2. **Trips** — all trips, including planned, upcoming, ongoing, and completed journeys.
3. **Calendar** — a unified chronological view of trip components.
4. **Price Watch** — price observations and potential savings for supported integrations.
5. **Settings** — application preferences, currencies, data management, and integrations.

Price Watch may initially be a prepared interface with a clear empty state if no live price provider has been configured.

### 4.2 Dashboard

The dashboard should provide actionable information, including:

- Upcoming trips and their start dates.
- Trips currently in the planning phase.
- Estimated versus confirmed trip costs.
- Booking and payment status.
- Upcoming cancellation deadlines.
- Activities and travel segments that require attention.
- Missing accommodation nights or transportation arrangements.
- Potential overlaps and scheduling conflicts.
- Recently updated prices or newly detected alternatives, when integrations are available.

Use compact cards, clear status indicators, timelines, and meaningful summaries. Avoid unnecessary visual clutter.

### 4.3 Trip Creation

Creating a trip must be possible without knowing the exact dates.

The user should be able to create a trip with only a title, such as "Portugal Road Trip" or "Japan Spring Adventure".

Optional information includes:

- Destination or several destinations.
- Earliest possible departure date.
- Latest possible return date.
- Preferred travel month or date range.
- Preferred trip duration or minimum and maximum number of nights.
- Number of travelers.
- Traveler categories, where relevant for pricing.
- Preferred departure airports.
- Budget target and maximum budget.
- Preferred currency.
- Travel style and notes.

Date constraints must be optional. A trip may begin as a destination idea with no dates, prices, or reservations.

The application should derive the effective travel period from the selected flight itinerary or other relevant travel components.

When dates or components change, all dependent calculations and calendar views must update automatically.

Do not force users to enter dates twice when they can be derived from existing information.

## 5. Trip Workspace

Each trip should have its own detailed workspace with the following views:

- Overview.
- Planning and alternatives.
- Itinerary and calendar.
- Bookings.
- Budget and expenses.
- Documents and notes.

The trip overview should display the current travel period, destinations, number of travelers, estimated duration, confirmed duration, planned budget, confirmed costs, and outstanding tasks.

The interface must distinguish between the preferred plan and the alternatives still under consideration.

A user should be able to move between these views without losing their current selection or context.

## 6. Planning and Alternatives

Planning alternatives are a central part of the application.

A trip may contain multiple alternatives for each component:

- Flights.
- Rental cars.
- Accommodation.
- Activities and excursions.
- Other transportation or travel services.

For example, the user might compare:

- Flight A: €280, departing on June 10.
- Flight B: €340, departing on June 12.
- Accommodation A: €620 for the resulting travel period.
- Accommodation B: €490 for a different date range.
- Rental car A: €240 for seven days.
- Rental car B: €195 for six days.

The application should calculate which combinations are actually compatible and compare their total costs and durations.

### 6.1 Alternative Management

Each alternative should support:

- A descriptive name.
- Provider and booking platform.
- External URL.
- Price and currency.
- Relevant dates and times.
- Duration.
- Included services and additional fees.
- Notes and advantages or disadvantages.
- Cancellation conditions, where known.
- Source of the information.
- Date and time when the price was last verified.
- A user-defined preference or rating.

Users must be able to mark an alternative as a favorite, preferred option, rejected option, or current selection.

They should also be able to duplicate an alternative and edit its values without losing the original.

An alternative is not automatically a booking.

### 6.2 Comparing Complete Scenarios

The application should support comparing complete trip scenarios rather than only individual components.

A scenario combines compatible flight, accommodation, rental car, and activity options.

For each scenario, calculate:

- Total estimated cost.
- Transportation costs.
- Accommodation costs.
- Rental car costs.
- Activity costs.
- Known additional fees.
- Number of travel days and overnight stays.
- Arrival and departure times.
- Number of days with a rental car.
- Uncovered nights.
- Potential scheduling conflicts.
- Difference from the target budget.

If an essential component has no price, clearly mark the total as incomplete rather than treating missing costs as zero.

Where possible, identify the least expensive valid scenario and the difference between it and the currently preferred scenario.

The application must not claim that a scenario is the cheapest available option unless the available alternatives have actually been compared. Clearly distinguish between the cheapest saved option and a globally cheapest offer verified through a supported search provider.

### 6.3 Date and Compatibility Rules

The application should understand basic travel dependencies.

Examples:

- A return flight determines the end of the flight itinerary.
- Accommodation dates should cover the required overnight stays.
- A rental car should have compatible pickup and return dates.
- An activity must fit within the relevant travel period.
- An airport pickup must be checked against the flight arrival time.
- A rental car pickup and drop-off may occur at different locations.
- Overnight flights may depart on one calendar day and arrive on another.

Support configurable arrival and departure buffers where they are relevant to the user's plans.

Show warnings for inconsistencies, but do not silently change a user's dates or bookings.

Some travel arrangements are intentionally flexible. Warnings should therefore be informative rather than unnecessarily restrictive.

## 7. Travel Components

### 7.1 Flights

A flight entry should support:

- Airline.
- Booking platform or travel agency.
- Departure and arrival airports.
- Departure and arrival dates and times.
- Time zones where available.
- Flight numbers and individual flight segments.
- Layovers and connection durations.
- Total itinerary duration.
- Baggage allowance.
- Fare class and relevant restrictions.
- Passenger count.
- Total price and currency.
- Booking reference.
- External search or booking URL.
- Cancellation and change conditions.
- Notes and attached documents.

Support one-way, return, and multi-leg itineraries.

Users must be able to compare several flight options with different departure and return dates.

Do not assume that a round trip must be purchased as a single booking. Outbound and return flights may belong to separate reservations.

### 7.2 Rental Cars

A rental car entry should support:

- Provider and booking platform.
- Vehicle category and model, if known.
- Pickup and return locations.
- Pickup and return dates and times.
- Rental duration.
- Total price.
- Currency.
- Included mileage.
- Fuel policy.
- Insurance and excess information.
- Additional driver fees.
- Deposit and other relevant charges.
- Booking reference.
- Cancellation deadline and conditions.
- External booking URL.
- Notes and documents.

Calculate the rental duration from the pickup and return timestamps using a configurable, provider-aware approach.

Do not assume that the number of calendar days is always the same as the number of chargeable rental days.

### 7.3 Accommodation

An accommodation entry should support:

- Property name.
- Provider or booking platform.
- Address and optional map URL.
- Check-in and check-out dates.
- Number of nights.
- Room type or accommodation category.
- Guest count.
- Total price.
- Price per night.
- Taxes and additional fees, when known.
- Meal plan and included services.
- Booking reference.
- Cancellation deadline and policy.
- Payment status.
- External booking URL.
- Notes, confirmation details, and attachments.

Support hotels, apartments, vacation rentals, campsites, and other accommodation types.

The application should detect nights that are not covered by any selected accommodation, while allowing the user to intentionally leave nights unbooked.

### 7.4 Activities and Excursions

An activity entry should support:

- Activity name and category.
- Provider.
- Location.
- Start and end date and time.
- Time zone where relevant.
- Duration.
- Number of participants.
- Total price.
- Booking status.
- Booking reference.
- External URL.
- Cancellation conditions.
- Notes and documents.

Examples include guided hikes, outdoor tours, boat trips, national park visits, museum tickets, and other reservations.

Activities should appear directly in the itinerary calendar.

Allow users to create unbooked activities and flexible ideas without a confirmed date.

### 7.5 Extensible Component Model

Design the application so that additional travel components can be introduced later, including:

- Trains and buses.
- Ferries.
- Airport transfers.
- Flights between destinations.
- Travel insurance.
- Parking.
- Additional reservations.
- Custom user-defined expenses.

Avoid implementing all of these in the initial MVP. The underlying data model should make future expansion straightforward.

## 8. Planning Status and Booking Lifecycle

Every travel component must have an explicit lifecycle status.

Recommended statuses:

- Idea.
- Planned.
- Preferred.
- Booked.
- Cancelled.
- Completed.
- Archived.

Use a separate payment status:

- Not applicable.
- Unpaid.
- Partially paid.
- Paid.
- Refunded.
- Partially refunded.
- Unknown.

The distinction between booking status and payment status is essential.

A booking can be confirmed while still unpaid. An activity can be booked but only partially paid. A cancelled booking may have resulted in a full, partial, or no refund.

### 8.1 Converting an Alternative into a Booking

The user should be able to convert a selected alternative into a confirmed booking.

The conversion workflow should:

1. Preserve the selected option and its original price.
2. Request or confirm the actual booking price.
3. Capture the provider and booking platform.
4. Capture the booking reference, if available.
5. Record the booking date.
6. Record payment information.
7. Record cancellation and change conditions.
8. Preserve the original external URL.
9. Update the trip's confirmed itinerary and financial overview.
10. Keep other alternatives available for reference.

Do not delete rejected alternatives automatically.

When the actual booking differs from the selected plan, preserve both values and show the difference.

The user should also be able to create a booking directly without going through the alternatives workflow.

## 9. Calendar and Itinerary

The calendar is one of the application's primary views.

Provide:

- Month view.
- Week view.
- Agenda or chronological list.
- A dedicated trip itinerary view.
- A chronological timeline for transportation and activities.

Display flights, accommodation periods, rental car periods, activities, and other scheduled components.

Flights should be represented as timed events. Accommodation should be represented as a stay spanning the check-in and check-out dates. Activities should use their actual scheduled times where available.

Use distinct visual styles for:

- Planned components.
- Preferred alternatives.
- Confirmed bookings.
- Cancelled items.
- Completed activities.
- Items requiring attention.

Use both color and text or icons to communicate status. Color must not be the only indicator.

For alternatives with different dates, the calendar should allow the user to preview how selecting an option would affect the trip without changing the confirmed itinerary.

A user should be able to select a calendar item and open its corresponding detail view.

Changes made to a component must be reflected in the calendar and all dependent summaries.

### 9.1 Conflict Detection

Detect and explain potential conflicts, including:

- Activities outside the effective trip period.
- Overlapping activities.
- Accommodation gaps.
- Rental car periods that do not cover the planned driving days.
- Pickup times that conflict with flight arrival.
- Duplicate or conflicting reservations.
- Important booking deadlines.

Warnings should provide enough information to understand the issue and offer a direct way to inspect the relevant components.

Avoid false positives when a conflict is intentional or cannot be evaluated reliably.

## 10. Cancellation Management

Cancellation tracking must be a first-class feature.

For every relevant booking, allow the user to record:

- Whether cancellation is possible.
- Whether cancellation is free.
- The exact cancellation deadline.
- The deadline's time zone, when known.
- The time at which the policy was checked.
- The applicable cancellation fee.
- The amount or percentage refundable.
- Any relevant policy text.
- The source of the cancellation information.
- Whether a cancellation request has already been initiated.
- The final refund amount, if applicable.

Support cancellation policies such as:

- Free cancellation until a specified date.
- Cancellation with a fee.
- Partially refundable bookings.
- Non-refundable bookings.
- Unknown or unverified conditions.

Do not assume that a booking is refundable simply because no cancellation fee has been entered.

If the conditions are unknown, display "Unknown" rather than "Free cancellation".

### 10.1 Cancellation Dashboard

Provide a dedicated overview showing:

- Bookings that are still freely cancellable.
- Bookings approaching their cancellation deadlines.
- Bookings that have become non-refundable.
- Bookings with unknown conditions.
- Estimated refundable amounts.

Allow filtering by trip, component type, provider, cancellation status, and deadline.

The user should be able to sort bookings by their upcoming deadlines and quickly open the original booking page.

### 10.2 Reminders

Implement local reminders for configurable events such as:

- Cancellation deadlines.
- Upcoming departures.
- Outstanding payments.
- Upcoming activities.
- Missing reservations or documents.

For the MVP, reminders may appear inside the application.

Operating-system notifications may be added where reliable cross-platform support is available.

The application must not claim that a reminder has been delivered if the operating system or application was not running and the notification could not be delivered.

## 11. Budget and Financial Overview

Provide both estimated and confirmed financial views.

### 11.1 Trip Budget

Track:

- Target budget.
- Maximum budget.
- Preferred scenario cost.
- Lowest saved scenario cost.
- Confirmed booking costs.
- Paid amounts.
- Outstanding amounts.
- Actual expenses.
- Refunds.
- Additional costs not included in reservations.

Display clear differences between estimated, confirmed, paid, and actual amounts.

For example, a trip could show:

- Budget target: €2,500.
- Preferred plan: €2,250 estimated.
- Confirmed bookings: €1,780.
- Paid so far: €1,100.
- Additional planned expenses: €250.

These figures must be derived from the underlying data and must not be double-counted.

### 11.2 Cost Calculation

All prices must be associated with an explicit currency.

Use decimal-safe monetary calculations. Do not use floating-point arithmetic for financial totals.

Support a configurable display currency.

If multiple currencies are used, retain the original amounts and currencies. Currency conversion should be based on an explicitly recorded exchange rate and date, or on a configured rate source in a future integration.

Never silently treat different currencies as directly comparable.

Allow additional expenses to be assigned to categories such as food, fuel, tolls, public transportation, parking, and miscellaneous costs.

### 11.3 Price and Cost Comparisons

Show the difference between alternatives in both absolute and relative terms.

Examples:

- "€85 cheaper than the preferred flight."
- "€120 saved by choosing the alternative accommodation."
- "This scenario is €175 below the target budget."

Only compare scenarios whose relevant costs are sufficiently complete. Clearly mark missing prices and assumptions.

## 12. Provider and Booking Management

Each booked or planned component must make it easy to identify where it was found or purchased.

Store:

- Provider name.
- Booking platform.
- External URL.
- Booking reference.
- Booking date.
- Booking status.
- Payment status.
- Price and currency.
- Cancellation conditions.
- Relevant contact information.
- Confirmation documents.

Examples of providers and platforms include Google Flights, airlines, Booking.com, Airbnb, Check24, Budget, and MietwagenBilliger.de.

These names are examples of manually entered providers, not a promise of existing API integrations.

The application should open external links using the system browser.

Validate external URLs and avoid automatically navigating to arbitrary URLs without an explicit user action.

## 13. Documents and Notes

Allow users to attach documents and notes to trips and individual components.

Support common formats such as:

- PDF booking confirmations.
- Images and screenshots.
- Tickets and vouchers.
- Travel documents.
- Exported itineraries.
- Text notes.

Store files locally and maintain references to them in the database.

Provide clear feedback when a file is missing or cannot be opened.

The MVP should not attempt to automatically parse every booking confirmation. A future document-import feature may extract candidate details and ask the user to confirm them before saving.

Sensitive documents should not be uploaded to external services automatically.

## 14. Travel Search and External Integrations

External integrations are an extension of the application, not a dependency of the core product.

The architecture must allow travel data providers to be added without rewriting the planning, booking, calendar, or budgeting modules.

### 14.1 Integration Architecture

Define provider-neutral interfaces for supported operations, such as:

- Searching for flights.
- Searching for accommodation.
- Searching for rental cars.
- Retrieving current or indicative prices.
- Retrieving provider and cancellation information where available.
- Opening a booking or search result.

Each integration should implement only the capabilities actually supported by its provider.

Use a provider registry or adapter pattern to isolate external API details from the rest of the application.

An integration should explicitly declare:

- Supported search types.
- Supported regions and currencies.
- Whether prices are live, indicative, or cached.
- Whether cancellation data is available.
- Whether deep links are supported.
- Required credentials.
- Rate limits and applicable restrictions.
- Whether the integration requires a paid account or partner approval.

### 14.2 Flight Search

The long-term goal is to search and compare flight options directly from a trip.

Potential sources include:

- Airline and booking-provider APIs.
- Skyscanner Travel APIs, subject to eligibility and access approval.
- Other licensed flight-data providers.
- Third-party flight-search services, where their pricing, reliability, and terms are acceptable.

Do not assume that Google Flights provides a generally available public flight-search API. Treat Google Flights primarily as an external search destination unless a legitimate, permitted integration becomes available.

Do not rely on scraping websites, bypassing access controls, or undocumented endpoints as a core product feature.

If an integration is unavailable, the user must still be able to save a search URL and manually enter the results.

### 14.3 Accommodation and Rental Car Search

Investigate suitable providers separately for accommodation and rental cars.

Do not assume that an API providing flight data also provides hotel or rental car data.

Search capabilities, data freshness, pricing, cancellation information, and provider access must be evaluated independently.

The initial implementation should support manual alternatives with external links.

### 14.4 Price Monitoring

Allow a user to associate a saved alternative or search definition with an optional price watch.

When supported by a legitimate provider, the application should:

1. Store the search criteria.
2. Retrieve a new price at an appropriate interval.
3. Save a timestamped price observation.
4. Compare the observation with the previous price.
5. Compare the current price with the user's saved reference price.
6. Display the difference and the source.
7. Notify the user when a configured threshold is reached.

Price observations must distinguish between:

- Original saved price.
- Last observed price.
- Current verified price.
- Estimated or indicative price.

A price change should never overwrite the historical booking price or an earlier observation.

If a provider returns a different itinerary, room type, vehicle class, baggage allowance, or cancellation policy, the application must not treat it as an identical offer without checking the relevant attributes.

Do not promise continuous price monitoring when the provider does not support it or the application cannot execute scheduled checks.

### 14.5 Search Results and Manual Comparison

A search result should be importable into the trip as a new alternative.

Preserve the provider, source URL, retrieved price, retrieval timestamp, currency, and relevant search criteria.

If a provider is not configured, allow users to open a search URL in their browser and create an alternative manually.

Avoid implementing a large, fragile collection of provider-specific integrations in the MVP.

## 15. Data Model

Design the data model around explicit entities and clear relationships.

The following entities represent the conceptual minimum. Claude Code may adjust the physical schema where necessary to achieve a clean implementation.

### Trip

- ID.
- Title.
- Description.
- Destination information.
- Optional earliest and latest travel dates.
- Optional preferred date range.
- Optional minimum and maximum duration.
- Traveler information.
- Target and maximum budgets.
- Display currency.
- Trip status.
- Created and updated timestamps.

### TripComponent

A common abstraction for a travel-related item.

- ID.
- Trip ID.
- Component type.
- Title.
- Description.
- Lifecycle status.
- Payment status.
- Provider information.
- External URL.
- Original price and currency.
- Start and end timestamps, where applicable.
- Source and verification timestamps.
- Notes.

Use explicit component-specific fields or related tables for flight segments, accommodation stays, rental car details, and activity details.

Do not force every component type into an excessively generic collection of unrelated nullable fields.

### Alternative

- ID.
- Trip ID.
- Component type.
- Title.
- Relevant dates and details.
- Price and currency.
- Provider and source URL.
- Preferred or rejected state.
- Cancellation information.
- Price verification timestamp.
- Notes.

Alternatives must be able to exist without a confirmed booking.

### Scenario

- ID.
- Trip ID.
- Name.
- Selected alternative references.
- Comparison metadata.
- Preferred status.
- Notes.

Scenario totals should be derived from their underlying components rather than stored as the only source of truth.

### Booking

- ID.
- Trip component ID.
- Provider.
- Booking platform.
- Booking reference.
- Booking date.
- Confirmed price and currency.
- Payment status.
- Cancellation policy.
- Confirmation document references.
- Notes.

Support the distinction between an itinerary component and a booking record so that separate outbound and return reservations can be represented accurately.

### CancellationPolicy

- ID.
- Booking ID.
- Cancellation type.
- Deadline timestamp and time zone, where known.
- Fee or refund rules.
- Refundable amount or percentage, where known.
- Policy source.
- Verification timestamp.
- Notes.

### PriceObservation

- ID.
- Alternative or search reference.
- Provider.
- Observed price and currency.
- Observation timestamp.
- Relevant itinerary or product attributes.
- Source metadata.

### Expense

- ID.
- Trip ID.
- Optional component or booking reference.
- Category.
- Amount and currency.
- Expense date.
- Payment or refund classification.
- Notes.

### Document

- ID.
- Trip ID.
- Optional component or booking reference.
- Local file reference.
- Filename.
- MIME type, where available.
- Created timestamp.
- Notes.

Use foreign keys, appropriate indexes, database migrations, and transactional operations.

Define deletion behavior explicitly. Deleting a trip must not accidentally leave orphaned records or remove files that are still referenced elsewhere.

Store timestamps consistently and retain time-zone information where necessary for travel scheduling and cancellation deadlines.

## 16. Data Integrity and Business Rules

The application must preserve the difference between plans and reality.

Important rules:

- Editing a planned alternative must not silently change a confirmed booking.
- Updating a live price must not overwrite the original price.
- Cancelling a booking must not automatically delete the itinerary history.
- Refunds must be represented explicitly.
- Missing prices must not be treated as zero.
- Different currencies must not be summed without conversion.
- Overnight flights and stays must retain correct date boundaries.
- Confirmed bookings must remain identifiable even if the preferred scenario changes.
- A scenario must not be marked as fully costed when required prices are missing.
- Cancellation conditions must retain their verification status and source.
- All important changes must be saved persistently.

Where appropriate, retain a lightweight history of important changes, especially booking prices, cancellation policies, and status transitions.

## 17. User Interface and Design Principles

The application should have a polished, modern, premium dashboard design.

Use:

- A consistent spacing and typography system.
- Clear visual hierarchy.
- Reusable components.
- Compact, information-rich layouts.
- Accessible contrast and keyboard navigation.
- Thoughtful empty states.
- Loading, error, and confirmation states.
- Responsive layouts for different desktop window sizes.
- Consistent date, time, and currency formatting.

Prefer tables and comparison layouts when users need to evaluate several alternatives.

Use calendars and timelines for temporal information.

Use summary cards for budgets, trip duration, and important deadlines.

Avoid excessive gradients, oversized decorative elements, unnecessary animations, and generic dashboard clutter.

The interface must communicate uncertainty honestly. An estimate, an unverified price, a confirmed reservation, and an actual expense should never look like equivalent facts.

Support German and English as future localization targets, but implement English as the initial interface language. Use proper locale-aware formatting and avoid hardcoded date or currency assumptions.

## 18. Security and Privacy

Travel Planner is a local-first application and should keep user data on the user's device by default.

Requirements:

- No mandatory account.
- No mandatory cloud synchronization.
- No automatic upload of personal documents.
- No transmission of trip data to third parties without explicit user action or configured integration.
- Store API credentials securely using appropriate operating-system facilities where available.
- Never embed private API keys in the frontend or commit them to the repository.
- Validate external URLs and imported data.
- Use safe filesystem operations and prevent path traversal.
- Apply appropriate security settings for Tauri.
- Avoid enabling unrestricted shell access from the frontend.
- Clearly communicate when external services receive search criteria or other data.
- Provide export and deletion options.

Optional integrations must be disabled until configured.

Document which data is sent to each external provider and why.

## 19. Backup, Export, and Import

The user must retain control over their data.

Provide:

- Export of trip information to JSON.
- Export of trip summaries and itineraries to a human-readable format.
- Export of relevant financial summaries.
- A local backup workflow for the SQLite database and associated documents.
- A safe import workflow for previously exported data.

Validate imported data before changing the database.

Provide a preview and useful error messages when an import cannot be completed.

Do not overwrite existing trips silently. Support explicit merge or replacement behavior where appropriate.

CSV import and export may be added for selected entities when a clear use case exists.

## 20. MVP Scope

The first version must deliver a complete and useful travel planning workflow without external travel APIs.

### Phase 1 — Functional Core

Implement:

1. Desktop application shell and navigation.
2. Local SQLite database and migrations.
3. Trip creation with optional date constraints.
4. Trip overview and lifecycle status.
5. Manual creation and editing of flights.
6. Manual creation and editing of rental cars.
7. Manual creation and editing of accommodation.
8. Manual creation and editing of activities.
9. Multiple alternatives for each component type.
10. Preferred alternative selection.
11. Basic compatible scenario comparison.
12. Automatic trip duration and overnight calculations where sufficient data exists.
13. Calendar and itinerary views.
14. Planned-versus-booked visual differentiation.
15. Booking references, provider information, and external links.
16. Cancellation conditions and deadlines.
17. Budget overview with estimated and confirmed costs.
18. Payment status and additional expenses.
19. Dashboard with important upcoming dates.
20. Local document attachments and notes.
21. Persistent storage, validation, and error handling.
22. Data export and local backup.
23. Automated tests for core business rules.

### Phase 1 Acceptance Criteria

The MVP is complete only when the following workflow works end to end:

1. Create a trip without fixed dates.
2. Define optional travel-date boundaries and a budget.
3. Add several alternative outbound and return flights.
4. Add different accommodation options and rental car options.
5. Compare compatible alternatives and see their combined estimated costs.
6. Select a preferred scenario without booking anything.
7. Inspect the selected itinerary in the calendar.
8. Book selected components and enter the actual prices and booking references.
9. Record payment and cancellation information.
10. See confirmed bookings highlighted in the calendar.
11. Identify upcoming cancellation deadlines.
12. Change a planned alternative without unintentionally modifying an existing booking.
13. Add an activity and detect a scheduling conflict.
14. See the trip's estimated, confirmed, paid, and additional costs separately.
15. Close and reopen the application without losing data.
16. Export the trip and restore it from a validated backup.

No external API credentials should be required to complete these workflows.

## 21. Future Roadmap

### Phase 2 — Advanced Planning

- More sophisticated scenario comparison.
- Better multi-destination trip planning.
- Advanced compatibility and conflict detection.
- Configurable travel buffers.
- Improved budget forecasting.
- Cancellation reminders and operating-system notifications.
- Richer itinerary exports.
- More complete expense tracking.
- Enhanced change history.

### Phase 3 — Search Integrations

- Provider adapter framework.
- Flight search through an eligible API provider.
- Accommodation search through supported providers.
- Rental car search through supported providers.
- Import of provider results into saved alternatives.
- Provider-aware comparison and filtering.
- Secure API credential management.
- Integration health and error reporting.

Each integration must be independently optional.

### Phase 4 — Price Monitoring

- Saved search definitions.
- Scheduled price observations.
- Historical price charts.
- Price-drop notifications.
- Price thresholds.
- Comparisons with saved alternatives.
- Detection of materially different itineraries or booking conditions.
- Clear distinction between indicative and verified offers.

Scheduled monitoring must respect provider restrictions and should not require the desktop application to remain open unless the feature explicitly states that limitation.

### Phase 5 — Intelligent Travel Assistant

Potential future capabilities include:

- Suggesting travel dates that fit the user's constraints.
- Identifying cheaper combinations of flights, accommodation, and rental cars.
- Recommending alternative airports or nearby destinations.
- Highlighting expensive or poorly aligned itinerary components.
- Suggesting missing reservations or useful activities.
- Comparing the trade-offs between cost, duration, convenience, and flexibility.
- Summarizing cancellation exposure and upcoming decisions.

Recommendations must be based on available data and clearly state their assumptions.

Do not claim that a suggested trip is globally optimal when the search space is incomplete.

AI functionality must remain optional and must not be required for ordinary planning.

## 22. Testing Strategy

Create automated tests for business logic before relying on manual UI testing.

Important test areas:

- Date-range calculations.
- Overnight stays and accommodation gaps.
- Flights crossing midnight or time zones.
- Multi-leg flight duration.
- Rental car duration and date boundaries.
- Scenario compatibility.
- Cost calculations and currency handling.
- Missing and incomplete prices.
- Estimated versus confirmed costs.
- Payment and refund accounting.
- Booking status transitions.
- Cancellation deadlines and time zones.
- Calendar conflicts.
- Data persistence and migrations.
- Import validation and export consistency.
- Referential integrity.
- File attachment handling.

Use deterministic test data and a controllable clock for time-dependent behavior.

Test that changing one alternative cannot unintentionally mutate another alternative or a confirmed booking.

Provide a repeatable development and test workflow.

## 23. Implementation Instructions for Claude Code

Work incrementally and deliver a functional application rather than a collection of mockups.

Before implementation:

1. Inspect the repository and existing project conventions.
2. Create a concise implementation plan.
3. Define the domain model and important business rules.
4. Identify suitable libraries for the calendar, date handling, and UI components.
5. Establish the initial database schema and migration strategy.
6. Define the MVP milestones and acceptance tests.

Then implement the application in small, verifiable steps.

### Engineering Requirements

- Use strict TypeScript settings.
- Keep business logic separate from UI components.
- Use explicit types and validated domain inputs.
- Keep database access behind a well-defined repository or service layer.
- Use transactional operations for changes that affect multiple related records.
- Centralize monetary calculations.
- Centralize date and time handling.
- Use database migrations from the beginning.
- Handle errors explicitly.
- Avoid unnecessary abstractions and premature complexity.
- Do not use mock data as a substitute for working persistence.
- Do not introduce external integrations that cannot be tested or legitimately accessed.
- Do not leave essential MVP functionality as TODOs or placeholder buttons.

The UI must reflect persisted data, and user actions must produce real, validated changes.

### Development Workflow

After each major implementation step:

1. Run the relevant automated tests.
2. Run TypeScript checks and linting.
3. Build the frontend.
4. Build or check the Tauri application where supported.
5. Fix regressions before proceeding.
6. Update the README if implementation decisions change the documented architecture.

Keep the application runnable throughout development.

When a requirement is ambiguous, choose a sensible, maintainable default, document the decision, and continue unless it would materially change the product architecture or expected behavior.

Do not stop after generating a project scaffold or a visual prototype.

## 24. Definition of Done

Travel Planner is ready for its first usable release when a user can independently plan, compare, organize, and manage a complete trip using manual data entry.

The application must provide a coherent workflow from an initial destination idea through alternative comparison, preferred itinerary selection, booking management, calendar visualization, cancellation tracking, and financial overview.

All core information must persist locally, and the application must work without API credentials or an internet connection for its core planning features.

External integrations must be additive, optional, and isolated behind clearly defined interfaces.

**The ultimate goal is a dependable personal travel workspace that helps users make better decisions, save money where possible, and never lose track of an important booking or deadline.**
