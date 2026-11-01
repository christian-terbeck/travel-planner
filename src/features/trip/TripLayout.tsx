import { ChevronLeft, Copy, Download, FileDown, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams } from "react-router";
import { api } from "@/api/client";
import { useAction, useRemove, useTripGraph } from "@/api/queries";
import type { TripStatus } from "@/domain/types";
import { useT } from "@/i18n";
import { useFileDrop } from "@/lib/fileDrop";
import { type TripModel, useTripModel } from "@/lib/model";
import { useFormat } from "@/lib/prefs";
import { Button, cn, EmptyState, Spinner } from "@/ui/core";
import { useConfirm } from "@/ui/dialog";
import { TripStatusBadge } from "@/ui/status";
import { TripForm } from "../trips/TripForm";
import { CopyTripDialog } from "./CopyTripDialog";
import { ExportDialog } from "./ExportDialog";
import { FileDropDialog } from "./FileDropDialog";

export function useTrip(): TripModel {
  return useOutletContext<TripModel>();
}

const TABS = [
  { to: "", key: "overview" },
  { to: "planning", key: "planning" },
  { to: "itinerary", key: "itinerary" },
  { to: "map", key: "map" },
  { to: "bookings", key: "bookings" },
  { to: "budget", key: "budget" },
  { to: "documents", key: "documents" },
  { to: "packing", key: "packing" },
] as const;

const OVERRIDES: Array<TripStatus | null> = [null, "cancelled", "archived", "completed"];

export function TripLayout() {
  const { tripId } = useParams();
  const t = useT();
  const f = useFormat();
  const query = useTripGraph(tripId);
  const model = useTripModel(query.data);
  const navigate = useNavigate();
  const run = useAction();
  const removeRow = useRemove();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [dropped, setDropped] = useState<string[] | null>(null);
  const hovering = useFileDrop(setDropped, !!model);

  if (query.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!model) {
    return <EmptyState title={t("trip.notFound")} action={<Link to="/trips">{t("nav.trips")}</Link>} />;
  }
  const trip = model.graph.trip;
  const period = model.plan.period;

  const remove = async () => {
    const ok = await confirm({
      title: t("trip.deleteTitle", { title: trip.title }),
      text: t("trip.deleteText"),
      confirm: t("common.delete"),
      danger: true,
    });
    if (!ok) return;
    if (await removeRow("trip", [trip.id], t("trip.deleted"))) navigate("/trips");
  };

  const setOverride = (status: TripStatus | null) =>
    run(() => api.save({ type: "trip", row: { ...trip, status_override: status } }));

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-line border-b bg-surface px-6 pt-3">
        <Link to="/trips" className="mb-1 inline-flex items-center gap-1 text-fg-3 text-xs hover:text-fg">
          <ChevronLeft className="size-3.5" aria-hidden />
          {t("nav.trips")}
        </Link>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-semibold text-xl tracking-tight">{trip.title}</h1>
              <TripStatusBadge status={model.status} />
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-fg-3 text-sm">
              {trip.destination && <span>{trip.destination}</span>}
              <span>
                {period.start ? f.dateRange(period.start, period.end) : t("trips.noDates")}
                {period.start && period.source !== "transport" && (
                  <span className="ml-1 text-xs">({t(`period.source.${period.source}`)})</span>
                )}
              </span>
              {model.graph.travelers.length > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="size-3.5" aria-hidden />
                  {model.graph.travelers.map((x) => x.name).join(", ")}
                </span>
              )}
            </p>
          </div>
          <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
            {t("common.edit")}
          </Button>
          <Button icon={<Download className="size-4" />} onClick={() => setExporting(true)}>
            {t("export.button")}
          </Button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button aria-label={t("common.more")} icon={<MoreHorizontal className="size-4" />} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className="z-50 min-w-52 rounded-lg border border-line bg-surface p-1 text-sm shadow-lg"
              >
                <DropdownMenu.Label className="px-2 py-1 text-fg-3 text-xs">
                  {t("trip.statusOverride")}
                </DropdownMenu.Label>
                {OVERRIDES.map((s) => (
                  <DropdownMenu.CheckboxItem
                    key={s ?? "auto"}
                    checked={trip.status_override === s}
                    onSelect={() => void setOverride(s)}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-surface-2"
                  >
                    <span className="w-3">{trip.status_override === s ? "✓" : ""}</span>
                    {s ? t(`tripStatus.${s}`) : t("trip.statusAuto")}
                  </DropdownMenu.CheckboxItem>
                ))}
                <DropdownMenu.Separator className="my-1 h-px bg-line" />
                <DropdownMenu.Item
                  onSelect={() => setCopying(true)}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-surface-2"
                >
                  <Copy className="size-4" aria-hidden />
                  {t("copyTrip.menu")}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => void remove()}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-danger outline-none data-[highlighted]:bg-danger-soft"
                >
                  <Trash2 className="size-4" aria-hidden />
                  {t("trip.delete")}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
        <nav className="-mb-px mt-3 flex gap-1" aria-label={t("trip.views")}>
          {TABS.map((tab) => (
            <NavLink
              key={tab.key}
              to={tab.to === "" ? `/trips/${trip.id}` : `/trips/${trip.id}/${tab.to}`}
              end={tab.to === ""}
              className={({ isActive }) =>
                cn(
                  "border-b-2 px-3 py-2 font-medium text-sm transition-colors",
                  isActive ? "border-primary text-fg" : "border-transparent text-fg-3 hover:text-fg",
                )
              }
            >
              {t(`trip.tab.${tab.key}`)}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="flex-1 p-6">
        <Outlet context={model} />
      </div>
      <TripForm open={editing} onOpenChange={setEditing} graph={model.graph} />
      <ExportDialog open={exporting} onOpenChange={setExporting} model={model} />
      {copying && <CopyTripDialog model={model} onClose={() => setCopying(false)} />}
      <FileDropDialog model={model} paths={dropped} onClose={() => setDropped(null)} />
      {hovering && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-primary/10 p-8">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-primary border-dashed bg-surface px-10 py-8 shadow-lg">
            <FileDown className="size-8 text-primary" aria-hidden />
            <p className="font-medium">{t("drop.overlay", { title: trip.title })}</p>
          </div>
        </div>
      )}
    </div>
  );
}
