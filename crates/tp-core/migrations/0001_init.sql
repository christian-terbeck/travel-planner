-- Initial schema. Conventions:
--   *_minor   money in minor units of the row's currency (always paired with a currency column)
--   *_local   local date-time 'YYYY-MM-DDTHH:MM' as printed on the ticket, paired with an IANA *_tz
--   *_at      UTC timestamps (RFC 3339); plain DATE columns are 'YYYY-MM-DD'

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE exchange_rates (
  id         TEXT PRIMARY KEY,
  base       TEXT NOT NULL,
  quote      TEXT NOT NULL,
  rate       TEXT NOT NULL,          -- decimal string: 1 base = rate quote
  as_of      TEXT NOT NULL,
  source     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX exchange_rates_pair ON exchange_rates(base, quote, as_of);

CREATE TABLE trips (
  id                   TEXT PRIMARY KEY,
  title                TEXT NOT NULL,
  description          TEXT,
  destination          TEXT,
  status_override      TEXT,       -- NULL: derived from dates and bookings
  earliest_departure   TEXT,
  latest_return        TEXT,
  preferred_start      TEXT,
  preferred_end        TEXT,
  preferred_month      TEXT,       -- 'YYYY-MM'
  min_nights           INTEGER,
  max_nights           INTEGER,
  home_airports        TEXT,       -- comma-separated IATA codes
  budget_target_minor  INTEGER,
  budget_max_minor     INTEGER,
  currency             TEXT NOT NULL,
  travel_style         TEXT,
  notes                TEXT,
  arrival_buffer_min   INTEGER NOT NULL DEFAULT 60,
  departure_buffer_min INTEGER NOT NULL DEFAULT 120,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE TABLE travelers (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'adult',
  birth_date TEXT,
  notes      TEXT,
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX travelers_trip ON travelers(trip_id);

CREATE TABLE stations (
  id          TEXT PRIMARY KEY,
  trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  location    TEXT,
  arrive_date TEXT,
  depart_date TEXT,
  notes       TEXT,
  sort        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX stations_trip ON stations(trip_id);

CREATE TABLE slots (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  station_id TEXT REFERENCES stations(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  required   INTEGER NOT NULL DEFAULT 1,
  notes      TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX slots_trip ON slots(trip_id);

CREATE TABLE options (
  id                TEXT PRIMARY KEY,
  slot_id           TEXT NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'planned',
  decision          TEXT NOT NULL DEFAULT 'none',
  rating            INTEGER,
  provider          TEXT,
  platform          TEXT,
  url               TEXT,
  price_minor       INTEGER,        -- NULL: price unknown (never treated as zero)
  currency          TEXT NOT NULL,
  price_basis       TEXT NOT NULL DEFAULT 'total',
  party_size        INTEGER,
  included_services TEXT,
  pros              TEXT,
  cons              TEXT,
  notes             TEXT,
  source            TEXT,
  price_verified_at TEXT,
  contact           TEXT,
  sort              INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX options_slot ON options(slot_id);

CREATE TABLE bookings (
  id                        TEXT PRIMARY KEY,
  option_id                 TEXT NOT NULL REFERENCES options(id) ON DELETE RESTRICT,
  status                    TEXT NOT NULL DEFAULT 'active',
  provider                  TEXT,
  platform                  TEXT,
  reference                 TEXT,
  booked_on                 TEXT,
  price_minor               INTEGER,
  currency                  TEXT NOT NULL,
  payment_status            TEXT NOT NULL DEFAULT 'unknown',
  contact                   TEXT,
  url                       TEXT,
  notes                     TEXT,
  snapshot                  TEXT NOT NULL,  -- JSON copy of the option as planned when booked
  cancellation_requested_at TEXT,
  cancelled_at              TEXT,
  refund_final_minor        INTEGER,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);
CREATE INDEX bookings_option ON bookings(option_id);

CREATE TABLE flight_segments (
  id            TEXT PRIMARY KEY,
  option_id     TEXT NOT NULL REFERENCES options(id) ON DELETE CASCADE,
  booking_id    TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  seq           INTEGER NOT NULL,
  airline       TEXT,
  flight_number TEXT,
  from_airport  TEXT,
  to_airport    TEXT,
  depart_local  TEXT,
  depart_tz     TEXT,
  arrive_local  TEXT,
  arrive_tz     TEXT,
  cabin         TEXT,
  fare_class    TEXT,
  baggage       TEXT,
  notes         TEXT
);
CREATE INDEX flight_segments_option ON flight_segments(option_id);

CREATE TABLE accommodation_details (
  option_id          TEXT PRIMARY KEY REFERENCES options(id) ON DELETE CASCADE,
  accommodation_type TEXT NOT NULL DEFAULT 'hotel',
  address            TEXT,
  map_url            TEXT,
  check_in           TEXT,
  check_out          TEXT,
  check_in_time      TEXT,
  check_out_time     TEXT,
  tz                 TEXT,
  room_type          TEXT,
  meal_plan          TEXT
);

CREATE TABLE rental_car_details (
  option_id                  TEXT PRIMARY KEY REFERENCES options(id) ON DELETE CASCADE,
  vehicle_category           TEXT,
  vehicle_model              TEXT,
  pickup_location            TEXT,
  pickup_local               TEXT,
  pickup_tz                  TEXT,
  return_location            TEXT,
  return_local               TEXT,
  return_tz                  TEXT,
  mileage                    TEXT,
  fuel_policy                TEXT,
  insurance                  TEXT,
  excess_minor               INTEGER,
  deposit_minor              INTEGER,
  additional_driver_fee_minor INTEGER,
  day_rule                   TEXT NOT NULL DEFAULT '24h',
  grace_minutes              INTEGER NOT NULL DEFAULT 59
);

-- Used by activities and by the generic 'other' kind.
CREATE TABLE activity_details (
  option_id    TEXT PRIMARY KEY REFERENCES options(id) ON DELETE CASCADE,
  category     TEXT,
  location     TEXT,
  start_date   TEXT,
  start_time   TEXT,
  end_date     TEXT,
  end_time     TEXT,
  tz           TEXT,
  duration_min INTEGER,
  flexible     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE option_fees (
  id           TEXT PRIMARY KEY,
  option_id    TEXT NOT NULL REFERENCES options(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  amount_minor INTEGER,
  currency     TEXT NOT NULL,
  included     INTEGER NOT NULL DEFAULT 0,  -- already contained in the option price
  sort         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX option_fees_option ON option_fees(option_id);

CREATE TABLE cancellation_policies (
  id                 TEXT PRIMARY KEY,
  option_id          TEXT UNIQUE REFERENCES options(id) ON DELETE CASCADE,
  booking_id         TEXT UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  policy_type        TEXT NOT NULL DEFAULT 'unknown',
  deadline_local     TEXT,
  deadline_tz        TEXT,
  fee_minor          INTEGER,
  refundable_minor   INTEGER,
  refundable_percent INTEGER,
  currency           TEXT NOT NULL,
  policy_text        TEXT,
  source             TEXT,
  checked_at         TEXT,
  notes              TEXT,
  updated_at         TEXT NOT NULL,
  CHECK ((option_id IS NULL) <> (booking_id IS NULL))
);

CREATE TABLE payments (
  id           TEXT PRIMARY KEY,
  booking_id   TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'payment',
  amount_minor INTEGER NOT NULL,
  currency     TEXT NOT NULL,
  paid_on      TEXT,
  method       TEXT,
  traveler_id  TEXT REFERENCES travelers(id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX payments_booking ON payments(booking_id);

CREATE TABLE expenses (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  booking_id   TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL DEFAULT 'actual',
  category     TEXT NOT NULL DEFAULT 'misc',
  title        TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency     TEXT NOT NULL,
  spent_on     TEXT,
  paid_by      TEXT REFERENCES travelers(id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX expenses_trip ON expenses(trip_id);

-- Missing rows for a booking/expense mean an equal split between all travelers.
CREATE TABLE cost_shares (
  id          TEXT PRIMARY KEY,
  booking_id  TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  expense_id  TEXT REFERENCES expenses(id) ON DELETE CASCADE,
  traveler_id TEXT NOT NULL REFERENCES travelers(id) ON DELETE CASCADE,
  weight      INTEGER NOT NULL DEFAULT 1,
  CHECK ((booking_id IS NULL) <> (expense_id IS NULL))
);
CREATE INDEX cost_shares_booking ON cost_shares(booking_id);
CREATE INDEX cost_shares_expense ON cost_shares(expense_id);

CREATE TABLE scenarios (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  preferred  INTEGER NOT NULL DEFAULT 0,
  notes      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX scenarios_trip ON scenarios(trip_id);
CREATE UNIQUE INDEX scenarios_one_preferred ON scenarios(trip_id) WHERE preferred = 1;

-- option_id NULL: the slot is intentionally left out of this scenario.
CREATE TABLE scenario_selections (
  scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  slot_id     TEXT NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  option_id   TEXT REFERENCES options(id) ON DELETE CASCADE,
  PRIMARY KEY (scenario_id, slot_id)
);

CREATE TABLE price_observations (
  id          TEXT PRIMARY KEY,
  option_id   TEXT NOT NULL REFERENCES options(id) ON DELETE CASCADE,
  observed_at TEXT NOT NULL,
  price_minor INTEGER NOT NULL,
  currency    TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'manual_check',
  provider    TEXT,
  attributes  TEXT,
  notes       TEXT
);
CREATE INDEX price_observations_option ON price_observations(option_id, observed_at);

CREATE TABLE tasks (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  option_id  TEXT REFERENCES options(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  due_date   TEXT,
  done_at    TEXT,
  notes      TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX tasks_trip ON tasks(trip_id);

CREATE TABLE dismissed_warnings (
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  note         TEXT,
  dismissed_at TEXT NOT NULL,
  PRIMARY KEY (trip_id, key)
);

CREATE TABLE open_nights (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  night   TEXT NOT NULL,
  note    TEXT,
  PRIMARY KEY (trip_id, night)
);

CREATE TABLE documents (
  id          TEXT PRIMARY KEY,
  trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  option_id   TEXT REFERENCES options(id) ON DELETE SET NULL,
  booking_id  TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  stored_name TEXT NOT NULL,     -- file name inside the documents folder
  filename    TEXT NOT NULL,     -- original name, shown to the user
  mime        TEXT,
  size_bytes  INTEGER NOT NULL,
  sha256      TEXT NOT NULL,
  notes       TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX documents_trip ON documents(trip_id);

CREATE TABLE notes (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  option_id  TEXT REFERENCES options(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX notes_trip ON notes(trip_id);

CREATE TABLE change_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id   TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  entity    TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field     TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  at        TEXT NOT NULL
);
CREATE INDEX change_log_trip ON change_log(trip_id, at);
