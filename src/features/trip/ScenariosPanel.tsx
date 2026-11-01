import { CalendarSearch, Info, Pencil, Plus, Save, Sparkles, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "@/api/client";
import { useAction, useRemove } from "@/api/queries";
import {
  cheapest,
  type Evaluation,
  evaluate,
  explore,
  type Selection,
  sameSelection,
  scenarioSelection,
} from "@/domain/scenarios";
import type { Scenario } from "@/domain/types";
import { useT } from "@/i18n";
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
  const [, setUi] = useTripUi(m.graph.trip.id);
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
              rows={exploration.results.slice(0, SHOWN).map((e, i) => ({
                key: String(i),
                scenario: saved.find((s) => sameSelection(s.e.selection, e.selection))?.scenario ?? null,
                e,
              }))}
              reference={preferred?.e ?? null}
              best={bestCombo}
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
}

function ScenarioTable({
  rows,
  reference,
  best,
  currency,
  actions,
  showSlots,
}: {
  rows: Row[];
  reference: Evaluation | null;
  best: Evaluation | null;
  currency: string;
  actions: (r: Row) => React.ReactNode;
  showSlots?: boolean;
}) {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const warningText = useWarningText(m);
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
