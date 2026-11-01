import {
  CalendarDays,
  Compass,
  Download,
  LayoutDashboard,
  Luggage,
  Search,
  Settings,
  ShieldAlert,
  TrendingDown,
} from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { NavLink, Outlet } from "react-router";
import { inDesktopApp } from "@/api/client";
import { useTrips } from "@/api/queries";
import { CommandPalette, useCommandPaletteShortcut } from "@/features/search/CommandPalette";
import { useT } from "@/i18n";
import { useTripModels } from "@/lib/model";
import { useOsNotifications } from "@/lib/notifications";
import { usePrefs } from "@/lib/prefs";
import { useReferenceRateRefresh } from "@/lib/referenceRates";
import { availableUpdate, useUpdateCheckAtStart, useUpdateResult } from "@/lib/updates";
import { cn, EmptyState, Spinner } from "@/ui/core";

function NavItem({ to, icon, label, count }: { to: string; icon: ReactNode; label: string; count?: number }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "flex h-8.5 items-center gap-2.5 rounded-md px-2.5 font-medium text-sm transition-colors [&_svg]:size-4",
          isActive ? "bg-primary-soft text-primary" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
        )
      }
    >
      {icon}
      <span className="flex-1">{label}</span>
      {count ? (
        <span
          className="tabular rounded-full bg-warn-soft px-1.5 font-semibold text-[11px] text-warn"
          title={label}
        >
          {count}
        </span>
      ) : null}
    </NavLink>
  );
}

export function Layout() {
  const t = useT();
  const trips = useTrips();
  const models = useTripModels(trips.data);
  useOsNotifications(models, trips.isSuccess);
  useReferenceRateRefresh();
  useUpdateCheckAtStart();
  const update = availableUpdate(useUpdateResult(), usePrefs().updates.skipped);
  const [searching, setSearching] = useState(false);
  useCommandPaletteShortcut(useCallback(() => setSearching(true), []));
  const urgent = models.flatMap((m) => m.reminders).filter((r) => r.kind === "cancellation_deadline").length;

  return (
    <div className="flex h-full">
      <button
        type="button"
        className="sr-only z-[200] rounded-md bg-primary px-3 py-2 text-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        onClick={() => document.getElementById("main")?.focus()}
      >
        {t("nav.skipToContent")}
      </button>
      <aside className="flex w-56 shrink-0 flex-col border-line border-r bg-surface">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-on-primary">
            <Compass className="size-4" aria-hidden />
          </div>
          <span className="font-semibold tracking-tight">Travel Planner</span>
        </div>
        <div className="px-2 pb-2">
          <button
            type="button"
            onClick={() => setSearching(true)}
            className="flex h-8.5 w-full items-center gap-2.5 rounded-md border border-line px-2.5 text-fg-3 text-sm hover:bg-surface-2 hover:text-fg"
          >
            <Search className="size-4" aria-hidden />
            <span className="flex-1 text-left">{t("nav.search")}</span>
            <kbd className="text-[11px]">{t("nav.searchKey")}</kbd>
          </button>
        </div>
        <nav className="flex flex-col gap-0.5 px-2" aria-label={t("nav.label")}>
          <NavItem to="/" icon={<LayoutDashboard />} label={t("nav.dashboard")} />
          <NavItem to="/trips" icon={<Luggage />} label={t("nav.trips")} />
          <NavItem to="/calendar" icon={<CalendarDays />} label={t("nav.calendar")} />
          <NavItem to="/cancellations" icon={<ShieldAlert />} label={t("nav.cancellations")} count={urgent} />
          <NavItem to="/price-watch" icon={<TrendingDown />} label={t("nav.priceWatch")} />
        </nav>
        <div className="mt-auto px-2 pb-3">
          {update && (
            <NavLink
              to="/settings"
              className="mb-2 flex items-center gap-2 rounded-md bg-primary-soft px-2.5 py-2 text-primary text-xs hover:underline"
            >
              <Download className="size-3.5 shrink-0" aria-hidden />
              {t("updates.available", { version: update.version })}
            </NavLink>
          )}
          <NavItem to="/settings" icon={<Settings />} label={t("nav.settings")} />
        </div>
      </aside>
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto focus:outline-none">
        {!inDesktopApp ? (
          <EmptyState title={t("app.noBackendTitle")} text={t("app.noBackendText")} className="h-full" />
        ) : trips.isPending ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : trips.isError ? (
          <EmptyState title={t("app.loadErrorTitle")} text={String(trips.error.message)} className="h-full" />
        ) : (
          <Outlet />
        )}
      </main>
      <CommandPalette open={searching} onOpenChange={setSearching} graphs={trips.data ?? []} />
    </div>
  );
}
