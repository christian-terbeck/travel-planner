import { describe, expect, it } from "vitest";
import { trimmed } from "./client";

describe("saving", () => {
  it("trims text in rows, nested ones included, and leaves other values alone", () => {
    expect(
      trimmed({ title: " Casa ", notes: null, price: 5, ok: true, fees: [{ label: "Tax " }], tags: [" a"] }),
    ).toEqual({ title: "Casa", notes: null, price: 5, ok: true, fees: [{ label: "Tax" }], tags: ["a"] });
  });
});
