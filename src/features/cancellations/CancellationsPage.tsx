import { ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { api } from "@/api/client";
import { useAction, useTrips } from "@/api/queries";
import { type CancellationState, isApproaching } from "@/domain/cancellation";
import { addTo, type Totals } from "@/domain/money";
import type { SlotKind } from "@/domain/types";
import { useT } from "@/i18n";
import { useTripModels } from "@/lib/model";
import { useFormat } from "@/lib/prefs";
import { Card, cn, EmptyState, Input, PageHeader, Select, Stat } from "@/ui/core";
import { KindIcon } from "@/ui/status";
import { CancellationCell } from "../trip/BookingsView";

type Group = "all" | "free" | "approaching" | "non_refundable" | "unknown";

export function CancellationsPage() {
  const t = useT();
  const f = useFormat();
  const run = useAction();
  const trips = useTrips();
  const models = useTripModels(trips.data);
  const [trip, setTrip] = useState("");
  const [kind, setKind] = useState<SlotKind | "">("");
  const [group, setGroup] = useState<Group>("all");
  const [provider, setProvider] = useState("");
  const [sort, setSort] = useState<"deadline" | "trip">("deadline");

  const rows = useMemo(
    () =>
      models.flatMap((m) =>
        m.graph.bookings
          .filter((b) => b.status === "active")
          .map((b) => ({ m, b, item: m.item(b.option_id), s: m.cancellation(b) })),
      ),
    [models],
  );
  const inGroup = (s: (typeof rows)[number]["s"], g: Group) =>
    g === "all" ||
    (g === "free" && s.state === "free") ||
    (g === "approaching" && isApproaching(s)) ||
    (g === "non_refundable" &&
      (["non_refundable", "deadline_passed"] as CancellationState[]).includes(s.state)) ||
    (g === "unknown" && s.state === "unknown");
  const filtered = rows
    .filter(
      (r) => (!trip || r.m.graph.trip.id === trip) && (!kind || r.item?.kind === kind) && inGroup(r.s, group),
    )
    .filter(
      (r) =>
        !provider ||
        [r.b.provider, r.b.platform].some((p) => p?.toLowerCase().includes(provider.toLowerCase())),
    )
    .sort((a, b) =>
      sort === "trip"
        ? a.m.graph.trip.title.localeCompare(b.m.graph.trip.title)
        : (a.s.deadline?.epochMilliseconds ?? Number.MAX_SAFE_INTEGER) -
          (b.s.deadline?.epochMilliseconds ?? Number.MAX_SAFE_INTEGER),
    );
  const refundable: Totals = {};
  for (const r of rows) if (r.s.state === "free" && r.s.refundable) addTo(refundable, r.s.refundable);
  const count = (g: Group) => rows.filter((r) => inGroup(r.s, g)).length;

  return (
    <div>
      <PageHeader title={t("nav.cancellations")} subtitle={t("cancellations.subtitle")} />
      <div className="flex flex-col gap-6 p-6">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {(["free", "approaching", "non_refundable", "unknown"] as Group[]).map((g) => (
            <button
              key={g}
              type="button"
              className="text-left"
              onClick={() => setGroup(group === g ? "all" : g)}
              aria-pressed={group === g}
            >
              <div className={cn("rounded-lg", group === g && "ring-2 ring-primary")}>
                <Stat
                  label={t(`cancellations.group.${g}`)}
                  value={count(g)}
                  tone={
                    g === "approaching" && count(g) > 0
                      ? "warn"
                      : g === "non_refundable"
                        ? "danger"
                        : g === "free"
                          ? "ok"
                          : undefined
                  }
                />
              </div>
            </button>
          ))}
          <Stat
            label={t("cancellations.refundable")}
            value={Object.keys(refundable).length ? f.totals(refundable) : "—"}
            sub={t("cancellations.refundableHint")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label={t("calendar.tripFilter")}
            className="w-52"
            value={trip}
            onChange={(e) => setTrip(e.target.value)}
          >
            <option value="">{t("calendar.allTrips")}</option>
            {models.map((m) => (
              <option key={m.graph.trip.id} value={m.graph.trip.id}>
                {m.graph.trip.title}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t("cancellations.kind")}
            className="w-44"
            value={kind}
            onChange={(e) => setKind(e.target.value as SlotKind | "")}
          >
            <option value="">{t("cancellations.allKinds")}</option>
            {(["flight", "accommodation", "rental_car", "activity", "other"] as SlotKind[]).map((k) => (
              <option key={k} value={k}>
                {t(`kind.${k}`)}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t("cancellations.status")}
            className="w-48"
            value={group}
            onChange={(e) => setGroup(e.target.value as Group)}
          >
            {(["all", "free", "approaching", "non_refundable", "unknown"] as Group[]).map((g) => (
              <option key={g} value={g}>
                {t(`cancellations.group.${g}`)}
              </option>
            ))}
          </Select>
          <Input
            aria-label={t("option.provider")}
            className="w-48"
            placeholder={t("cancellations.providerFilter")}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          />
          <Select
            aria-label={t("cancellations.sort")}
            className="ml-auto w-48"
            value={sort}
            onChange={(e) => setSort(e.target.value as "deadline" | "trip")}
          >
            <option value="deadline">{t("cancellations.sortDeadline")}</option>
            <option value="trip">{t("cancellations.sortTrip")}</option>
          </Select>
        </div>
        <Card>
          {filtered.length === 0 ? (
            <EmptyState icon={<ShieldAlert />} title={t("cancellations.empty")} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-line border-b text-left text-fg-3 text-xs">
                  <th className="px-4 py-2 font-medium">{t("bookings.col.booking")}</th>
                  <th className="px-2 py-2 font-medium">{t("cancellations.trip")}</th>
                  <th className="px-2 py-2 font-medium">{t("option.provider")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("bookings.col.price")}</th>
                  <th className="px-2 py-2 font-medium">{t("planning.col.cancellation")}</th>
                  <th className="px-4 py-2 font-medium">{t("cancellations.link")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ m, b, item, s }) => (
                  <tr key={b.id} className="border-line border-b align-top last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 font-medium">
                        {item && <KindIcon kind={item.kind} className="size-4 text-fg-3" />}
                        {item?.option.title}
                      </div>
                      {b.reference && <div className="font-mono text-fg-3 text-xs">{b.reference}</div>}
                    </td>
                    <td className="px-2 py-2.5">
                      <Link to={`/trips/${m.graph.trip.id}/bookings`} className="hover:underline">
                        {m.graph.trip.title}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 text-fg-2">
                      {[b.provider, b.platform].filter(Boolean).join(" · ")}
                    </td>
                    <td className="tabular px-2 py-2.5 text-right">{f.minor(b.price_minor, b.currency)}</td>
                    <td className="px-2 py-2.5">
                      <CancellationCell s={s} />
                    </td>
                    <td className="px-4 py-2.5">
                      {(b.url ?? item?.option.url) && (
                        <button
                          type="button"
                          className="text-primary text-xs hover:underline"
                          onClick={() => run(() => api.openUrl((b.url ?? item?.option.url) as string))}
                        >
                          {t("cancellations.openBooking")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
