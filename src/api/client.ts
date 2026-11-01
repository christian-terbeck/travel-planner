// Typed wrappers around the Tauri commands of the Rust core.

import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AppInfo } from "./bindings/AppInfo";
import type { BackupManifest } from "./bindings/BackupManifest";
import type { Booking } from "./bindings/Booking";
import type { BookingInput } from "./bindings/BookingInput";
import type { CancelInput } from "./bindings/CancelInput";
import type { CancellationPolicy } from "./bindings/CancellationPolicy";
import type { CopyTripInput } from "./bindings/CopyTripInput";
import type { Document } from "./bindings/Document";
import type { Entity } from "./bindings/Entity";
import type { EntityKind } from "./bindings/EntityKind";
import type { ErrorPayload } from "./bindings/ErrorPayload";
import type { ExtractedBooking } from "./bindings/ExtractedBooking";
import type { ImportMode } from "./bindings/ImportMode";
import type { ImportPreview } from "./bindings/ImportPreview";
import type { OptionBundle } from "./bindings/OptionBundle";
import type { Place } from "./bindings/Place";
import type { RestorePreview } from "./bindings/RestorePreview";
import type { RoadQuery } from "./bindings/RoadQuery";
import type { RoadResult } from "./bindings/RoadResult";
import type { Scenario } from "./bindings/Scenario";
import type { ScenarioSelection } from "./bindings/ScenarioSelection";
import type { TripGraph } from "./bindings/TripGraph";
import type { TripReview } from "./bindings/TripReview";
import type { UpdateCheck } from "./bindings/UpdateCheck";
import type { WeatherQuery } from "./bindings/WeatherQuery";
import type { WeatherResult } from "./bindings/WeatherResult";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly field: string | null,
    message: string,
  ) {
    super(message);
  }
}

export const inDesktopApp = isTauri();

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!inDesktopApp)
    throw new ApiError("no_backend", null, "The Travel Planner core is only available in the desktop app.");
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    const p = e as Partial<ErrorPayload>;
    if (p && typeof p === "object" && typeof p.code === "string") {
      throw new ApiError(p.code, p.field ?? null, p.message ?? p.code);
    }
    throw new ApiError("unknown", null, String(e));
  }
}

/** Rows as typed in forms, with leading and trailing whitespace removed from every text value. */
export function trimmed<T>(value: T): T {
  if (typeof value === "string") return value.trim() as T;
  if (Array.isArray(value)) return value.map(trimmed) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trimmed(v)])) as T;
  return value;
}

export const api = {
  appInfo: () => call<AppInfo>("app_info"),
  setSetting: (key: string, value: string | null) => call<void>("set_setting", { key, value }),
  listTrips: () => call<TripGraph[]>("list_trips"),
  getTrip: (id: string) => call<TripGraph>("get_trip", { id }),
  save: (entity: Entity) => call<void>("save", { entity: trimmed(entity) }),
  /** Resolves to an ID for `undoDelete`. */
  remove: (kind: EntityKind, ...keys: string[]) => call<string>("delete", { kind, keys }),
  undoDelete: (id: string) => call<void>("undo_delete", { id }),
  saveOption: (bundle: OptionBundle, confirmBookedEdit = false) =>
    call<void>("save_option", { bundle: trimmed(bundle), confirmBookedEdit }),
  duplicateOption: (id: string, title: string) => call<string>("duplicate_option", { id, title }),
  createBooking: (input: BookingInput) => call<string>("create_booking", { input: trimmed(input) }),
  updateBooking: (booking: Booking, policy: CancellationPolicy | null) =>
    call<void>("update_booking", { booking: trimmed(booking), policy: trimmed(policy) }),
  cancelBooking: (input: CancelInput) => call<void>("cancel_booking", { input }),
  saveScenario: (scenario: Scenario, selections: ScenarioSelection[]) =>
    call<void>("save_scenario", { scenario, selections }),
  setPreferredScenario: (tripId: string, scenarioId: string | null) =>
    call<void>("set_preferred_scenario", { tripId, scenarioId }),
  attachDocument: (tripId: string, path: string, optionId: string | null, bookingId: string | null) =>
    call<Document>("attach_document", { tripId, path, optionId, bookingId }),
  updateDocumentNotes: (id: string, notes: string | null) =>
    call<void>("update_document_notes", { id, notes }),
  openDocument: (id: string) => call<void>("open_document", { id }),
  openUrl: (url: string) => call<void>("open_url", { url }),
  copyTrip: (input: CopyTripInput) => call<string>("copy_trip", { input }),
  exportTrip: (tripId: string, path: string) => call<void>("export_trip", { tripId, path }),
  writeExport: (path: string, contents: string) => call<void>("write_export", { path, contents }),
  previewImport: (path: string) => call<ImportPreview>("preview_import", { path }),
  importTrip: (path: string, mode: ImportMode) => call<string>("import_trip", { path, mode }),
  createBackup: (path: string) => call<BackupManifest>("create_backup", { path }),
  runAutoBackup: () => call<string | null>("run_auto_backup"),
  previewRestore: (path: string) => call<RestorePreview>("preview_restore", { path }),
  restoreBackup: (path: string) => call<string>("restore_backup", { path }),
  geocode: (query: string, language: string) => call<Place[]>("geocode", { query, language }),
  weather: (queries: WeatherQuery[]) => call<Array<WeatherResult | null>>("weather", { queries }),
  checkUpdate: () => call<UpdateCheck>("check_update"),
  fetchReferenceRates: () => call<number>("fetch_reference_rates"),
  aiKeyStored: () => call<boolean>("ai_key_stored"),
  setAiKey: (key: string | null) => call<void>("set_ai_key", { key }),
  extractConfirmation: (path: string, language: string) =>
    call<ExtractedBooking>("extract_confirmation", { path, language }),
  extractOffer: (text: string, kind: string, language: string) =>
    call<ExtractedBooking>("extract_offer", { text, kind, language }),
  reviewTrip: (input: string, language: string) => call<TripReview>("review_trip", { input, language }),
  notify: (title: string, body: string) => call<void>("notify", { title, body }),
  autostartEnabled: () => call<boolean>("autostart_enabled"),
  setAutostart: (enabled: boolean) => call<void>("set_autostart", { enabled }),
  roadRoutes: (queries: RoadQuery[]) => call<RoadResult[]>("road_routes", { queries }),
  clearRoadCache: () => call<number>("clear_road_cache"),
  siteIcon: (url: string) => call<string | null>("site_icon", { url }),
  clearSiteIcons: () => call<number>("clear_site_icons"),
};
