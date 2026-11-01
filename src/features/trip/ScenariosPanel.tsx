import { CalendarSearch, Info, Pencil, Plus, Save, Sparkles, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "@/api/client";
import { useAction, useRemove } from "@/api/queries";
import { estimateCo2 } from "@/domain/co2";
import { buildRoute } from "@/domain/geo";
import { travelerCount } from "@/domain/items";
import {
  cheapest,
  type DateWindow,
  type Evaluation,
  evaluate,
  explore,
  type Selection,
  sameSelection,
  scenarioSelection,
  travelWindows,
} from "@/domain/scenarios";
import type { Scenario } from "@/domain/types";
import {
  CRITERIA,
  DEFAULT_WEIGHTS,
  isPriceOnly,
  type Metrics,
  type Weights,
  weigh,
} from "@/domain/weighting";
import { useT } from "@/i18n";
import { useAirports } from "@/lib/airports";
import { useFormat } from "@/lib/prefs";
import { newScenario, nil } from "@/lib/rows";
import { useTripUi } from "@/lib/tripUi";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  cn,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  Textarea,
} from "@/ui/core";
import { Dialog, useConfirm } from "@/ui/dialog";
import { Certainty, KindIcon } from "@/ui/status";
import { useTrip } from "./TripLayout";
import { useWarningText } from "./warnings";

const SHOWN = 30;

export function ScenariosPanel() {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const run = useAction();
  const remove = useRemove();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [ui, setUi] = useTripUi(m.graph.trip.id);
  const weights = ui.weights ?? DEFAULT_WEIGHTS;
  const [editing, setEditing] = useState<{ scenario: Scenario; selection: Selection } | null>(null);
  const [explored, setExplored] = useState(false);
  const cur = m.graph.trip.currency;

  const saved = useMemo(
    () =>
      m.graph.scenarios.map((s) => ({ scenario: s, e: evaluate(m.ctx, scenarioSelection(m.graph, s.id)) })),
    [m],
  );
  const preferred = saved.find((s) => s.scenario.preferred);
  const bestSaved = cheapest(saved.map((s) => s.e));
  const exploration = useMemo(() => (explored ? explore(m.ctx) : null), [explored, m]);
  const bestCombo = exploration ? cheapest(exploration.results) : null;
  const airports = useAirports();
  const weighed = useMemo(() => {
    if (!exploration || exploration.tooMany) return null;
    const people = travelerCount(m.graph) ?? 1;
    const co2Of = (e: Evaluation) =>
      airports
        ? estimateCo2(
            buildRoute(e.items, (c) => airports.get(c) ?? null, m.tz),
            e.items,
            people,
          ).perPerson
        : null;
    return weigh(exploration.results, m.graph, weights, m.now, m.tz, co2Of);
  }, [exploration, m, weights, airports]);
  const windows = useMemo(() => (exploration ? travelWindows(exploration.results) : []), [exploration]);
  const bestWeighed =
    weighed && !isPriceOnly(weights)
      ? (weighed.find((w) => w.e.compatible && w.e.complete)?.e ?? null)
      : null;

  const preview = (id: string) => {
    setUi({ previewScenarioId: id });
    navigate(`/trips/${m.graph.trip.id}/itinerary`);
  };
  const saveCombination = (e: Evaluation) =>
    setEditing({
      scenario: newScenario(
        m.graph.trip.id,
        t("scenario.combinationName", { n: m.graph.scenarios.length + 1 }),
      ),
      selection: e.selection,
    });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title={t("scenario.saved")}
          subtitle={t("scenario.savedHint")}
          actions={
            <Button
              size="sm"
              icon={<Plus className="size-3.5" />}
              onClick={() =>
                setEditing({
                  scenario: newScenario(m.graph.trip.id, t("scenario.newName")),
                  selection: new Map(m.plan.selection),
                })
              }
            >
              {t("scenario.new")}
            </Button>
          }
        />
        {saved.length === 0 ? (
          <EmptyState title={t("scenario.emptyTitle")} text={t("scenario.emptyText")} />
        ) : (
          <ScenarioTable
            rows={saved.map(({ scenario, e }) => ({ key: scenario.id, scenario, e }))}
            reference={preferred?.e ?? null}
            best={bestSaved}
            currency={cur}
            actions={(row) => (
              <div className="flex items-center justify-end gap-0.5">
                {!row.scenario?.preferred && (
                  <Button
                    size="sm"
                    variant="subtle"
                    icon={<Star className="size-3.5" />}
                    onClick={() =>
                      run(
                        () => api.setPreferredScenario(m.graph.trip.id, row.scenario?.id ?? null),
                        t("scenario.preferredSet"),
                      )
                    }
                  >
                    {t("scenario.makePreferred")}
                  </Button>
                )}
                <IconButton
                  label={t("scenario.preview")}
                  onClick={() => row.scenario && preview(row.scenario.id)}
                >
                  <CalendarSearch className="size-4" />
                </IconButton>
                <IconButton
                  label={t("common.edit")}
                  onClick={() =>
                    row.scenario && setEditing({ scenario: row.scenario, selection: row.e.selection })
                  }
                >
                  <Pencil className="size-3.5" />
                </IconButton>
                <IconButton
                  label={t("common.delete")}
                  onClick={async () => {
                    if (
                      row.scenario &&
                      (await confirm({
                        title: t("scenario.deleteTitle", { name: row.scenario.name }),
                        confirm: t("common.delete"),
                        danger: true,
                      }))
                    ) {
                      await remove("scenario", [row.scenario?.id ?? ""]);
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                </IconButton>
              </div>
            )}
          />
        )}
        {bestSaved &&
          preferred &&
          bestSaved !== preferred.e &&
          bestSaved.converted.minor < preferred.e.converted.minor &&
          preferred.e.complete && (
            <p className="flex items-center gap-1.5 border-line border-t px-4 py-2 text-ok text-sm">
              <Sparkles className="size-4" aria-hidden />
              {t("scenario.cheaperSaved", {
                amount: f.minor(preferred.e.converted.minor - bestSaved.converted.minor, cur),
              })}
            </p>
          )}
      </Card>

      <Card>
        <CardHeader
          title={t("scenario.explorer")}
          subtitle={t("scenario.explorerHint")}
          actions={
            <Button
              size="sm"
              variant={explored ? "secondary" : "primary"}
              icon={<Sparkles className="size-3.5" />}
              onClick={() => setExplored(true)}
            >
              {explored ? t("scenario.recalculate") : t("scenario.explore")}
            </Button>
          }
        />
        <p className="flex items-start gap-1.5 border-line border-b bg-info-soft/50 px-4 py-2 text-info text-xs">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("scenario.disclaimer")}
        </p>
        <WeightsBar weights={weights} onChange={(w) => setUi({ weights: w })} />
        {!exploration ? (
          <p className="px-4 py-4 text-fg-3 text-sm">{t("scenario.exploreIntro")}</p>
        ) : exploration.tooMany ? (
          <p className="px-4 py-4 text-sm text-warn">{t("scenario.tooMany", { count: exploration.count })}</p>
        ) : exploration.results.length === 0 ? (
          <p className="px-4 py-4 text-fg-3 text-sm">{t("scenario.noCombinations")}</p>
        ) : (
          <>
            <p className="px-4 pt-3 text-fg-2 text-sm">
              {t("scenario.summary", {
                count: exploration.count,
                compatible: exploration.results.filter((r) => r.compatible).length,
              })}
              {bestCombo &&
                preferred?.e.complete &&
                !sameSelection(bestCombo.selection, preferred.e.selection) &&
                bestCombo.converted.minor < preferred.e.converted.minor && (
                  <span className="ml-1 font-medium text-ok">
                    {t("scenario.cheaperCombination", {
                      amount: f.minor(preferred.e.converted.minor - bestCombo.converted.minor, cur),
                    })}
                  </span>
                )}
            </p>
            <ScenarioTable
              rows={(weighed ?? exploration.results.map((e) => ({ e, metrics: null })))
                .slice(0, SHOWN)
                .map(({ e, metrics }, i) => ({
                  key: String(i),
                  scenario: saved.find((s) => sameSelection(s.e.selection, e.selection))?.scenario ?? null,
                  e,
                  metrics,
                }))}
              reference={preferred?.e ?? null}
              best={bestCombo}
              bestWeighed={bestWeighed}
              currency={cur}
              showSlots
              actions={(row) =>
                row.scenario ? (
                  <Badge tone="primary">{row.scenario.name}</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="subtle"
                    icon={<Save className="size-3.5" />}
                    onClick={() => saveCombination(row.e)}
                  >
                    {t("scenario.saveAs")}
                  </Button>
                )
              }
            />
            <DateWindows
              windows={windows}
              currency={cur}
              plan={preferred?.e ?? null}
              onSave={saveCombination}
            />
            {exploration.results.length > SHOWN && (
              <p className="px-4 py-2 text-fg-3 text-xs">
                {t("scenario.moreHidden", { count: exploration.results.length - SHOWN })}
              </p>
            )}
          </>
        )}
      </Card>
      <ScenarioDialog state={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

interface Row {
  key: string;
  scenario: Scenario | null;
  e: Evaluation;
  /** Measures for weighing (explorer only). */
  metrics?: Metrics | null;
}

function ScenarioTable({
  rows,
  reference,
  best,
  bestWeighed,
  currency,
  actions,
  showSlots,
}: {
  rows: Row[];
  reference: Evaluation | null;
  best: Evaluation | null;
  bestWeighed?: Evaluation | null;
  currency: string;
  actions: (r: Row) => React.ReactNode;
  showSlots?: boolean;
}) {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const warningText = useWarningText(m);
  const withMetrics = rows.some((r) => r.metrics);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-line border-b text-left text-fg-3 text-xs">
            <th className="px-4 py-1.5 font-medium">
              {showSlots ? t("scenario.col.combination") : t("scenario.col.name")}
            </th>
            <th className="px-2 py-1.5 font-medium">{t("scenario.col.period")}</th>
            <th className="px-2 py-1.5 font-medium">{t("scenario.col.nights")}</th>
            <th className="px-2 py-1.5 text-right font-medium">{t("scenario.col.transport")}</th>
            <th className="px-2 py-1.5 text-right font-medium">{t("scenario.col.stay")}</th>
            <th className="px-2 py-1.5 text-right font-medium">{t("scenario.col.car")}</th>
            <th className="px-2 py-1.5 text-right font-medium">{t("scenario.col.total")}</th>
            <th className="px-2 py-1.5 text-right font-medium">{t("scenario.col.vsPreferred")}</th>
            {withMetrics && <th className="px-2 py-1.5 font-medium">{t("scenario.col.tradeOffs")}</th>}
            <th className="px-2 py-1.5 font-medium">{t("scenario.col.check")}</th>
            <th className="px-4 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const e = row.e;
            const diff =
              reference?.complete && e.complete && reference !== e
                ? e.converted.minor - reference.converted.minor
                : null;
            const issues = e.warnings.filter((w) => w.severity !== "info");
            return (
              <tr
                key={row.key}
                className={cn(
                  "border-line border-b align-top last:border-0",
                  !e.compatible && "text-fg-3",
                  best === e && "bg-ok-soft/40",
                )}
              >
                <td className="px-4 py-2">
                  {showSlots ? (
                    <ul className="flex flex-col gap-0.5 text-xs">
                      {m.graph.slots.map((s) => {
                        const id = e.selection.get(s.id);
                        if (id === undefined) return null;
                        return (
                          <li key={s.id} className="flex items-center gap-1.5">
                            <KindIcon kind={s.kind} className="size-3 text-fg-3" />
                            <span className="truncate">
                              {id ? (m.item(id)?.option.title ?? "?") : t("scenario.leftOut")}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="flex items-center gap-1.5 font-medium">
                      {row.scenario?.preferred && (
                        <Star
                          className="size-3.5 fill-primary text-primary"
                          aria-label={t("scenario.preferred")}
                        />
                      )}
                      {row.scenario?.name}
                    </div>
                  )}
                  {best === e && (
                    <Badge tone="ok" className="mt-1">
                      {t("scenario.cheapestSaved")}
                    </Badge>
                  )}
                  {bestWeighed === e && (
                    <Badge tone="primary" className="mt-1">
                      {t("scenario.bestWeighed")}
                    </Badge>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-xs">
                  {e.period.start ? f.dateRange(e.period.start, e.period.end) : "—"}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-xs">
                  {e.nights.evaluable ? e.nights.required.length : "—"}
                  {e.nights.gaps.length > 0 && (
                    <span className="ml-1 text-warn">
                      ({t("overview.gaps", { count: e.nights.gaps.length })})
                    </span>
                  )}
                </td>
                <td className="tabular whitespace-nowrap px-2 py-2 text-right">
                  {costCell(e.costs.transport, currency, f)}
                </td>
                <td className="tabular whitespace-nowrap px-2 py-2 text-right">
                  {costCell(e.costs.accommodation, currency, f)}
                </td>
                <td className="tabular whitespace-nowrap px-2 py-2 text-right">
                  {costCell(e.costs.rental_car, currency, f)}
                </td>
                <td className="tabular whitespace-nowrap px-2 py-2 text-right font-semibold">
                  {f.cost(e.total, currency)}
                  {!e.complete && (
                    <div className="mt-0.5">
                      <Certainty kind="incomplete" />
                    </div>
                  )}
                  {e.budgetDelta !== null && (
                    <div
                      className={cn(
                        "font-normal text-[11px]",
                        e.budgetDelta < 0 ? "text-danger" : "text-fg-3",
                      )}
                    >
                      {e.budgetDelta >= 0
                        ? t("scenario.belowBudget", {
                            amount: f.minor(e.budgetDelta, currency, { compact: true }),
                          })
                        : t("scenario.aboveBudget", {
                            amount: f.minor(-e.budgetDelta, currency, { compact: true }),
                          })}
                    </div>
                  )}
                </td>
                <td
                  className={cn(
                    "tabular whitespace-nowrap px-2 py-2 text-right text-xs",
                    diff !== null && diff < 0
                      ? "text-ok"
                      : diff !== null && diff > 0
                        ? "text-danger"
                        : "text-fg-3",
                  )}
                >
                  {diff === null
                    ? "—"
                    : diff === 0
                      ? "±0"
                      : f.minor(diff, currency, { signed: true, compact: true })}
                </td>
                {withMetrics && (
                  <td className="whitespace-nowrap px-2 py-2 text-fg-2 text-xs">
                    {row.metrics && <MetricsCell m={row.metrics} />}
                  </td>
                )}
                <td className="px-2 py-2 text-xs">
                  {!e.compatible ? (
                    <Badge
                      tone="danger"
                      title={e.warnings
                        .filter((w) => w.blocking)
                        .map(warningText)
                        .join("\n")}
                    >
                      {t("scenario.incompatible")}
                    </Badge>
                  ) : issues.length > 0 ? (
                    <Badge tone="warn" title={issues.map(warningText).join("\n")}>
                      {t("trips.warningCount", { count: issues.length })}
                    </Badge>
                  ) : (
                    <Badge tone="ok">{t("scenario.ok")}</Badge>
                  )}
                </td>
                <td className="px-4 py-2">{actions(row)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The travel dates the saved alternatives allow, cheapest combination each; shown when there is a choice. */
function DateWindows({
  windows,
  currency,
  plan,
  onSave,
}: {
  windows: DateWindow[];
  currency: string;
  plan: Evaluation | null;
  onSave: (e: Evaluation) => void;
}) {
  const t = useT();
  const f = useFormat();
  if (windows.length < 2) return null;
  const min = Math.min(...windows.map((w) => w.best.converted.minor));
  const planKey = plan?.period.start && plan.period.end ? `${plan.period.start}/${plan.period.end}` : null;
  return (
    <div className="border-line border-t">
      <h4 className="px-4 pt-3 font-semibold text-sm">{t("scenario.dates.title")}</h4>
      <p className="px-4 text-fg-3 text-xs">{t("scenario.dates.hint")}</p>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-line border-b text-left text-fg-3 text-xs">
            <th className="px-4 py-1.5 font-medium">{t("scenario.col.period")}</th>
            <th className="px-2 py-1.5 font-medium">{t("scenario.col.nights")}</th>
            <th className="px-2 py-1.5 text-right font-medium">{t("scenario.dates.from")}</th>
            <th className="px-2 py-1.5 text-right font-medium">{t("scenario.dates.vsCheapest")}</th>
            <th className="px-2 py-1.5 font-medium">{t("scenario.dates.combinations")}</th>
            <th className="px-4 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {windows.map((w) => {
            const diff = w.best.converted.minor - min;
            const isPlan = planKey === `${w.start}/${w.end}`;
            return (
              <tr
                key={`${w.start}/${w.end}`}
                className={cn("border-line border-b last:border-0", diff === 0 && "bg-ok-soft/40")}
              >
                <td className="whitespace-nowrap px-4 py-1.5">
                  {f.dateRange(w.start, w.end)}
                  {isPlan && (
                    <Badge tone="primary" className="ml-2">
                      {t("scenario.dates.plan")}
                    </Badge>
                  )}
                </td>
                <td className="px-2 py-1.5">{w.nights}</td>
                <td className="tabular whitespace-nowrap px-2 py-1.5 text-right font-medium">
                  {f.minor(w.best.converted.minor, currency)}
                </td>
                <td
                  className={cn(
                    "tabular whitespace-nowrap px-2 py-1.5 text-right text-xs",
                    diff === 0 ? "text-ok" : "text-fg-3",
                  )}
                >
                  {diff === 0 ? t("scenario.dates.cheapest") : f.minor(diff, currency, { signed: true })}
                </td>
                <td className="px-2 py-1.5 text-fg-3 text-xs">{w.count}</td>
                <td className="px-4 py-1.5 text-right">
                  <Button
                    size="sm"
                    variant="subtle"
                    icon={<Save className="size-3.5" />}
                    onClick={() => onSave(w.best)}
                  >
                    {t("scenario.saveAs")}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MetricsCell({ m }: { m: Metrics }) {
  const t = useT();
  const f = useFormat();
  return (
    <ul className="flex flex-col gap-0.5">
      <li>
        {m.travelMinutes === null ? "—" : f.duration(m.travelMinutes)}
        {m.changes > 0 && ` · ${t("scenario.changes", { count: m.changes })}`}
      </li>
      {m.rating !== null && <li>{t("scenario.avgRating", { rating: m.rating.toFixed(1) })}</li>}
      {m.flexible !== null && (
        <li>{t("scenario.flexibleShare", { percent: Math.round(m.flexible * 100) })}</li>
      )}
      {m.co2 !== null && m.co2 > 0 && <li>{t("scenario.co2", { kg: f.number(Math.round(m.co2)) })}</li>}
    </ul>
  );
}

const LEVELS = [0, 1, 2, 3];

/** How much each measure counts when the explorer orders combinations. */
function WeightsBar({ weights, onChange }: { weights: Weights; onChange: (w: Weights | null) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-end gap-3 border-line border-b px-4 py-2.5">
      <span className="w-full text-fg-3 text-xs">{t("scenario.weightsHint")}</span>
      {CRITERIA.map((c) => (
        <Field key={c} label={t(`scenario.criterion.${c}`)} htmlFor={`w-${c}`} className="w-40">
          <Select
            id={`w-${c}`}
            value={weights[c]}
            onChange={(e) => onChange({ ...weights, [c]: Number(e.target.value) })}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {t(`scenario.weight.${l}`)}
              </option>
            ))}
          </Select>
        </Field>
      ))}
      {!isPriceOnly(weights) && (
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
          {t("scenario.byPrice")}
        </Button>
      )}
    </div>
  );
}

function costCell(c: Evaluation["costs"]["transport"], currency: string, f: ReturnType<typeof useFormat>) {
  if (Object.keys(c.totals).length === 0 && c.missing.length === 0)
    return <span className="text-fg-3">—</span>;
  return (
    <>
      {Object.keys(c.totals).length ? f.cost(c, currency) : ""}
      {c.missing.length > 0 && <span className="ml-1 text-warn">?</span>}
    </>
  );
}

function ScenarioDialog({
  state,
  onClose,
}: {
  state: { scenario: Scenario; selection: Selection } | null;
  onClose: () => void;
}) {
  const t = useT();
  const m = useTrip();
  const run = useAction();
  const [s, setS] = useState<Scenario | null>(null);
  const [sel, setSel] = useState<Selection>(new Map());
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (state && lastKey !== state.scenario.id) {
    setLastKey(state.scenario.id);
    setS(state.scenario);
    setSel(new Map(state.selection));
  }
  if (!state && lastKey !== null) setLastKey(null);
  if (!state || !s) return null;
  const save = async () => {
    const selections = [...sel].map(([slot_id, option_id]) => ({ scenario_id: s.id, slot_id, option_id }));
    if (
      (await run(
        () => api.saveScenario({ ...s, name: s.name.trim() }, selections),
        t("scenario.savedToast"),
      )) !== undefined
    )
      onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={m.graph.scenarios.some((x) => x.id === s.id) ? t("scenario.edit") : t("scenario.new")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" disabled={!s.name.trim()} onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t("scenario.name")} htmlFor="sc-name">
          <Input
            id="sc-name"
            autoFocus
            value={s.name}
            onChange={(e) => setS({ ...s, name: e.target.value })}
          />
        </Field>
        {m.graph.slots.map((slot) => {
          const value = sel.has(slot.id) ? (sel.get(slot.id) ?? "__none") : "";
          return (
            <Field
              key={slot.id}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <KindIcon kind={slot.kind} className="size-3.5" />
                  {slot.title}
                </span>
              }
              htmlFor={`sc-${slot.id}`}
            >
              <Select
                id={`sc-${slot.id}`}
                value={value}
                onChange={(e) => {
                  const next = new Map(sel);
                  if (e.target.value === "") next.delete(slot.id);
                  else next.set(slot.id, e.target.value === "__none" ? null : e.target.value);
                  setSel(next);
                }}
              >
                <option value="">{t("scenario.notChosen")}</option>
                <option value="__none">{t("scenario.leaveOut")}</option>
                {m.graph.options
                  .filter((o) => o.slot_id === slot.id)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                      {o.decision === "rejected" ? ` (${t("decision.rejected")})` : ""}
                    </option>
                  ))}
              </Select>
            </Field>
          );
        })}
        <Field label={t("option.notesField")} htmlFor="sc-notes">
          <Textarea
            id="sc-notes"
            rows={2}
            value={s.notes ?? ""}
            onChange={(e) => setS({ ...s, notes: nil(e.target.value) })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.preferred}
            onChange={(e) => setS({ ...s, preferred: e.target.checked })}
            className="size-4 accent-[var(--primary)]"
          />
          {t("scenario.setPreferred")}
        </label>
      </div>
    </Dialog>
  );
}
