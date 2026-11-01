// Replaces the Tauri commands with spies; tests set return values where a screen needs them.
// Commands without a result answer null, as Tauri does (the UI reads undefined as a failure).

import { vi } from "vitest";

export const settings: Array<[string, string]> = [["locale", "en-GB"]];

export const api = {
  appInfo: vi.fn(async (..._args: unknown[]) => ({
    data_dir: "C:\\data",
    schema_version: 6,
    settings,
    exchange_rates: [],
  })),
  listTrips: vi.fn(async (..._args: unknown[]): Promise<unknown> => []),
  save: vi.fn(async (..._args: unknown[]) => null),
  saveOption: vi.fn(async (..._args: unknown[]) => null),
  createBooking: vi.fn(async (..._args: unknown[]) => "booking-1"),
  cancelBooking: vi.fn(async (..._args: unknown[]) => null),
  remove: vi.fn(async (..._args: unknown[]) => "undo-1"),
  copyTrip: vi.fn(async (..._args: unknown[]) => "trip-copy"),
  undoDelete: vi.fn(async (..._args: unknown[]) => null),
  attachDocument: vi.fn(async (..._args: unknown[]) => ({})),
  extractConfirmation: vi.fn(async (..._args: unknown[]): Promise<unknown> => null),
  documentImage: vi.fn(async (..._args: unknown[]): Promise<unknown> => new ArrayBuffer(4)),
  extractOffer: vi.fn(async (..._args: unknown[]): Promise<unknown> => null),
  setSetting: vi.fn(async (..._args: unknown[]) => null),
  openUrl: vi.fn(async (..._args: unknown[]) => null),
};
