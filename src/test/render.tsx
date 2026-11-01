// Renders trip screens in the test DOM with the app's providers and a trip model as route context.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { defaultReminderSettings } from "@/domain/reminders";
import { Temporal } from "@/domain/time";
import type { TripGraph } from "@/domain/types";
import { buildModel } from "@/lib/model";
import { PrefsProvider } from "@/lib/prefs";
import { ConfirmProvider } from "@/ui/dialog";
import { ToastProvider } from "@/ui/toast";

/** `state` is the navigation state the screen is opened with (e.g. a dropped file to import). */
export function renderInTrip(graph: TripGraph, ui: ReactNode, state?: unknown) {
  const model = buildModel(
    graph,
    [],
    { timeZone: "Europe/Berlin", reminders: defaultReminderSettings },
    Temporal.Instant.from("2027-05-01T10:00:00Z"),
  );
  const router = createMemoryRouter(
    [{ path: "/", element: <Outlet context={model} />, children: [{ index: true, element: ui }] }],
    { initialEntries: [{ pathname: "/", state }] },
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    model,
    ...render(
      <QueryClientProvider client={qc}>
        <PrefsProvider>
          <ToastProvider>
            <ConfirmProvider>
              <RouterProvider router={router} />
            </ConfirmProvider>
          </ToastProvider>
        </PrefsProvider>
      </QueryClientProvider>,
    ),
  };
}
