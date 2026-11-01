import {
  CalendarDays,
  Compass,
  LayoutDashboard,
  Luggage,
  Settings,
  ShieldAlert,
  TrendingDown,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import { inDesktopApp } from "@/api/client";
import { useTrips } from "@/api/queries";
import { useT } from "@/i18n";
import { useTripModels } from "@/lib/model";
import { useOsNotifications } from "@/lib/notifications";
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
  const urgent = models.flatMap((m) => m.reminders).filter((r) => r.kind === "cancellation_deadline").length;

  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col border-line border-r bg-surface">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-on-primary">
            <Compass className="size-4" aria-hidden />
          </div>
          <span className="font-semibold tracking-tight">Travel Planner</span>
        </div>
        <nav className="flex flex-col gap-0.5 px-2" aria-label={t("nav.label")}>
          <NavItem to="/" icon={<LayoutDashboard />} label={t("nav.dashboard")} />
          <NavItem to="/trips" icon={<Luggage />} label={t("nav.trips")} />
          <NavItem to="/calendar" icon={<CalendarDays />} label={t("nav.calendar")} />
          <NavItem to="/cancellations" icon={<ShieldAlert />} label={t("nav.cancellations")} count={urgent} />
          <NavItem to="/price-watch" icon={<TrendingDown />} label={t("nav.priceWatch")} />
        </nav>
        <div className="mt-auto px-2 pb-3">
          <NavItem to="/settings" icon={<Settings />} label={t("nav.settings")} />
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
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
    </div>
  );
}
