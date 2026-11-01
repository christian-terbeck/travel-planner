// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { addBooking, addFlight, addSlot, graph } from "@/domain/fixture.test-util";
import i18n from "@/i18n";
import { CommandPalette, useCommandPaletteShortcut } from "./CommandPalette";

beforeAll(async () => {
  await i18n.changeLanguage("en");
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(cleanup);

function Shell() {
  const [open, setOpen] = useState(false);
  useCommandPaletteShortcut(() => setOpen(true));
  const g = graph();
  const slot = addSlot(g, "flight");
  addBooking(g, addFlight(g, slot, 1, [], { title: "TAP direct" }), 1, { reference: "XK7Q2L" });
  return (
    <>
      <output>{useLocation().pathname}</output>
      <CommandPalette open={open} onOpenChange={setOpen} graphs={[g]} />
    </>
  );
}

describe("command palette", () => {
  it("opens with Ctrl+K and goes to a booking found by its reference", async () => {
    const user = userEvent.setup();
    render(<RouterProvider router={createMemoryRouter([{ path: "*", element: <Shell /> }])} />);
    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByRole("combobox");
    await user.type(input, "xk7");
    expect(screen.getByRole("option", { selected: true }).textContent).toContain("TAP direct");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("status").textContent).toBe("/trips/trip/bookings");
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
