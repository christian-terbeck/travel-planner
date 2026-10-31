import { createHashRouter, Navigate } from "react-router";
import { CalendarPage } from "@/features/calendar/CalendarPage";
import { CancellationsPage } from "@/features/cancellations/CancellationsPage";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { PriceWatchPage } from "@/features/pricewatch/PriceWatchPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { BookingsView } from "@/features/trip/BookingsView";
import { BudgetView } from "@/features/trip/BudgetView";
import { DocumentsView } from "@/features/trip/DocumentsView";
import { ItineraryView } from "@/features/trip/ItineraryView";
import { MapView } from "@/features/trip/MapView";
import { OverviewView } from "@/features/trip/OverviewView";
import { PlanningView } from "@/features/trip/PlanningView";
import { TripLayout } from "@/features/trip/TripLayout";
import { TripsPage } from "@/features/trips/TripsPage";
import { Layout } from "./Layout";

export const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "trips", element: <TripsPage /> },
      {
        path: "trips/:tripId",
        element: <TripLayout />,
        children: [
          { index: true, element: <OverviewView /> },
          { path: "planning", element: <PlanningView /> },
          { path: "itinerary", element: <ItineraryView /> },
          { path: "map", element: <MapView /> },
          { path: "bookings", element: <BookingsView /> },
          { path: "budget", element: <BudgetView /> },
          { path: "documents", element: <DocumentsView /> },
        ],
      },
      { path: "calendar", element: <CalendarPage /> },
      { path: "cancellations", element: <CancellationsPage /> },
      { path: "price-watch", element: <PriceWatchPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
