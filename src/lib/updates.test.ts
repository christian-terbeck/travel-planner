import { describe, expect, it } from "vitest";
import { availableUpdate } from "./updates";

const latest = { version: "0.2.0", page_url: "https://github.com/x", published_at: null, notes: null };

describe("update check", () => {
  it("offers a newer version unless it was skipped", () => {
    expect(availableUpdate({ current: "0.1.0", latest, newer: true }, null)).toBe(latest);
    expect(availableUpdate({ current: "0.1.0", latest, newer: true }, "0.2.0")).toBeNull();
    expect(availableUpdate({ current: "0.2.0", latest, newer: false }, null)).toBeNull();
    expect(availableUpdate(undefined, null)).toBeNull();
  });
});
