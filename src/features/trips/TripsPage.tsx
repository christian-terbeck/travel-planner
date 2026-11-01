import { Luggage, MapPin, Plus, Upload, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useTrips } from "@/api/queries";
import type { TripStatus } from "@/domain/types";
import { useT } from "@/i18n";
import { type TripModel, useTripModels } from "@/lib/model";
import { useFormat } from "@/lib/prefs";
import { Button, Card, EmptyState, PageHeader, Segmented } from "@/ui/core";
import { Certainty, TripStatusBadge } from "@/ui/status";
import { ImportDialog } from "../settings/ImportDialog";
import { TripForm } from "./TripForm";

type Filter = "active" | "past" | "all";

const PAST: TripStatus[] = ["completed", "cancelled", "archived"];

export function TripsPage() {
  const t = useT();
  const trips = useTrips();
  const models = useTripModels(trips.data);
  const navigate = useNavigate();
  const location = useLocation();
  const [creating, setCreating] = useState(false);
  // "New trip" from the command palette.
  useEffect(() => {
    if ((location.state as { create?: boolean } | null)?.create) {
      setCreating(true);
      navigate(".", { replace: true, state: null });
    }
  }, [location.state, navigate]);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState<Filter>("active");

  const shown = useMemo(() => {
    const list = models.filter((m) =>
      filter === "all" ? true : filter === "past" ? PAST.includes(m.status) : !PAST.includes(m.status),
    );
    const key = (m: TripModel) => m.plan.period.start?.toString() ?? "9999";
    return list.sort((a, b) => key(a).localeCompare(key(b)));
  }, [models, filter]);

  return (
    <div>
      <PageHeader
        title={t("nav.trips")}
        subtitle={t("trips.subtitle", { count: models.length })}
        actions={
          <>
            <Button icon={<Upload className="size-4" />} onClick={() => setImporting(true)}>
              {t("trips.import")}
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              {t("trips.new")}
            </Button>
          </>
        }
      >
        <div className="pb-3">
          <Segmented
            label={t("trips.filter")}
            value={filter}
            onChange={setFilter}
            options={[
              { value: "active", label: t("trips.filterActive") },
              { value: "past", label: t("trips.filterPast") },
              { value: "all", label: t("trips.filterAll") },
            ]}
          />
        </div>
      </PageHeader>
      <div className="p-6">
        {shown.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Luggage />}
              title={models.length === 0 ? t("trips.emptyTitle") : t("trips.emptyFiltered")}
              text={models.length === 0 ? t("trips.emptyText") : undefined}
              action={
                models.length === 0 && (
                  <Button
                    variant="primary"
                    icon={<Plus className="size-4" />}
                    onClick={() => setCreating(true)}
                  >
                    {t("trips.new")}
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
            {shown.map((m) => (
              <TripCard key={m.graph.trip.id} m={m} />
            ))}
          </div>
        )}
      </div>
      <TripForm open={creating} onOpenChange={setCreating} onCreated={(id) => navigate(`/trips/${id}`)} />
      <ImportDialog
        open={importing}
        onOpenChange={setImporting}
        onImported={(id) => navigate(`/trips/${id}`)}
      />
    </div>
  );
}

export function TripCard({ m }: { m: TripModel }) {
  const t = useT();
  const f = useFormat();
  const trip = m.graph.trip;
  const b = m.budget;
  const planned = b.converted.plan;
  const booked = m.graph.bookings.filter((x) => x.status === "active").length;
  return (
    <Link to={`/trips/${trip.id}`} className="group block">
      <Card className="h-full p-4 transition-colors group-hover:border-line-strong">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate font-semibold">{trip.title}</h3>
          <TripStatusBadge status={m.status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-3 text-xs">
          {trip.destination && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" aria-hidden />
              {trip.destination}
            </span>
          )}
          <span>
            {m.plan.period.start ? f.dateRange(m.plan.period.start, m.plan.period.end) : t("trips.noDates")}
          </span>
          {m.graph.travelers.length > 0 && (
            <span className="flex items-center gap-1">
              <Users className="size-3" aria-hidden />
              {m.graph.travelers.length}
            </span>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-fg-3 text-xs">{t("budget.plan")}</div>
            <div className="tabular flex items-center gap-1.5 font-semibold">
              {m.plan.items.length > 0 ? f.minor(planned.minor, planned.currency, { compact: true }) : "—"}
              {m.plan.items.length > 0 && !m.plan.complete && <Certainty kind="incomplete" />}
            </div>
          </div>
          <div>
            <div className="text-fg-3 text-xs">{t("budget.confirmed")}</div>
            <div className="tabular font-semibold">
              {f.minor(b.converted.confirmed.minor, b.currency, { compact: true })}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 text-fg-3 text-xs">
          <span>{t("trips.bookedCount", { count: booked })}</span>
          <span>{t("trips.optionCount", { count: m.graph.options.length })}</span>
          {m.plan.warnings.filter((w) => w.severity !== "info").length > 0 && (
            <span className="text-warn">
              {t("trips.warningCount", {
                count: m.plan.warnings.filter((w) => w.severity !== "info").length,
              })}
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}
