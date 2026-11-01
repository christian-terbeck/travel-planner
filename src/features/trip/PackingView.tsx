import { Backpack, CheckSquare, ListPlus, Plus, Save, Square, Trash2, Undo2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { PackingItem } from "@/api/bindings/PackingItem";
import type { PackingTemplateItem } from "@/api/bindings/PackingTemplateItem";
import { api } from "@/api/client";
import { useAction, useAppInfo, useRemove } from "@/api/queries";
import { useT } from "@/i18n";
import {
  BUILT_IN_LISTS,
  builtInItems,
  groupByCategory,
  mergeItems,
  progress,
  templateFrom,
  templateItems,
} from "@/lib/packing";
import { usePrefs } from "@/lib/prefs";
import {
  Button,
  Card,
  CardHeader,
  cn,
  EmptyState,
  Field,
  IconButton,
  Input,
  Segmented,
  Select,
} from "@/ui/core";
import { Dialog } from "@/ui/dialog";
import { NumberInput } from "@/ui/inputs";
import { useTrip } from "./TripLayout";

/** "all", "shared" (no traveler) or a traveler ID. */
type Who = string;

export function PackingView() {
  const t = useT();
  const m = useTrip();
  const run = useAction();
  const remove = useRemove();
  const [who, setWho] = useState<Who>("all");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const travelers = m.graph.travelers;
  const name = (id: string | null) => travelers.find((x) => x.id === id)?.name;

  const items = useMemo(
    () =>
      m.graph.packing_items.filter((i) =>
        who === "all" ? true : who === "shared" ? i.traveler_id === null : i.traveler_id === who,
      ),
    [m.graph.packing_items, who],
  );
  const { packed, total } = progress(items);

  const save = (row: PackingItem) => run(() => api.save({ type: "packing_item", row }));
  const unpackAll = () =>
    run(async () => {
      for (const i of items.filter((x) => x.packed))
        await api.save({ type: "packing_item", row: { ...i, packed: false } });
    }, t("packing.unpacked"));

  return (
    <div className="flex flex-col gap-4 p-6">
      <Card>
        <CardHeader
          icon={<Backpack className="size-4" />}
          title={t("packing.title")}
          subtitle={total ? t("packing.progress", { packed, total }) : t("packing.hint")}
          actions={
            <>
              <Button size="sm" icon={<ListPlus className="size-4" />} onClick={() => setAdding(true)}>
                {t("packing.addList")}
              </Button>
              {m.graph.packing_items.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Save className="size-4" />}
                  onClick={() => setSaving(true)}
                >
                  {t("packing.saveList")}
                </Button>
              )}
              {packed > 0 && (
                <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} onClick={unpackAll}>
                  {t("packing.unpackAll")}
                </Button>
              )}
            </>
          }
        />
        {total > 0 && (
          <div className="h-1.5 bg-surface-2" aria-hidden>
            <div className="h-full bg-ok transition-all" style={{ width: `${(packed / total) * 100}%` }} />
          </div>
        )}
        {travelers.length > 0 && (
          <div className="border-line border-b px-4 py-2.5">
            <Segmented
              label={t("packing.whose")}
              value={who}
              onChange={setWho}
              options={[
                { value: "all", label: t("packing.everyone") },
                { value: "shared", label: t("packing.shared") },
                ...travelers.map((x) => ({ value: x.id, label: x.name })),
              ]}
            />
          </div>
        )}
        <QuickAdd who={who} />
        {items.length === 0 ? (
          <EmptyState icon={<Backpack />} title={t("packing.emptyTitle")} text={t("packing.emptyText")} />
        ) : (
          <div className="grid gap-x-6 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {groupByCategory(items).map((g) => (
              <section key={g.category ?? ""} className="mb-4 break-inside-avoid">
                <h4 className="mb-1 flex items-center justify-between font-medium text-fg-2 text-xs uppercase tracking-wide">
                  <span>{g.category ?? t("packing.noCategory")}</span>
                  <span className="tabular">
                    {progress(g.items).packed}/{g.items.length}
                  </span>
                </h4>
                <ul>
                  {g.items.map((i) => (
                    <li
                      key={i.id}
                      className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-surface-2"
                    >
                      <button
                        type="button"
                        onClick={() => save({ ...i, packed: !i.packed })}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                        aria-pressed={i.packed}
                      >
                        {i.packed ? (
                          <CheckSquare className="size-4 shrink-0 text-ok" aria-hidden />
                        ) : (
                          <Square className="size-4 shrink-0 text-fg-3" aria-hidden />
                        )}
                        <span className={cn("min-w-0 flex-1 truncate", i.packed && "text-fg-3 line-through")}>
                          {i.title}
                          {i.quantity && i.quantity > 1 && <span className="text-fg-3"> ×{i.quantity}</span>}
                        </span>
                        {who === "all" && i.traveler_id && (
                          <span className="shrink-0 rounded bg-surface-2 px-1.5 text-fg-3 text-xs">
                            {name(i.traveler_id)}
                          </span>
                        )}
                      </button>
                      <IconButton
                        label={t("common.delete")}
                        className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                        onClick={() => remove("packing_item", [i.id])}
                      >
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
      {adding && <AddListDialog initialWho={who} onClose={() => setAdding(false)} />}
      {saving && <SaveListDialog onClose={() => setSaving(false)} />}
    </div>
  );
}

function QuickAdd({ who }: { who: Who }) {
  const t = useT();
  const m = useTrip();
  const run = useAction();
  const ids = { title: useId(), category: useId(), qty: useId(), who: useId(), list: useId() };
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState<number | null>(null);
  const [traveler, setTraveler] = useState<string>("");
  const forWho = who === "all" ? traveler || null : who === "shared" ? null : who;
  const categories = [
    ...new Set(m.graph.packing_items.map((i) => i.category).filter((c): c is string => !!c)),
  ];

  const add = async () => {
    const [row] = mergeItems(m.graph.trip.id, [], [{ title, category, quantity }], forWho);
    if (!row) return;
    row.sort = m.graph.packing_items.reduce((x, i) => Math.max(x, i.sort), 0) + 1;
    if ((await run(() => api.save({ type: "packing_item", row }))) !== undefined) {
      setTitle("");
      setQuantity(null);
    }
  };

  return (
    <form
      className="flex flex-wrap items-end gap-2 border-line border-b px-4 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <Field label={t("packing.item")} htmlFor={ids.title} className="min-w-48 flex-[2]">
        <Input
          id={ids.title}
          placeholder={t("packing.itemPlaceholder")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label={t("packing.category")} htmlFor={ids.category} className="min-w-36 flex-1">
        <Input
          id={ids.category}
          list={ids.list}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <datalist id={ids.list}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label={t("packing.quantity")} htmlFor={ids.qty} className="w-20">
        <NumberInput id={ids.qty} min={1} max={999} value={quantity} onChange={setQuantity} />
      </Field>
      {who === "all" && m.graph.travelers.length > 0 && (
        <Field label={t("packing.for")} htmlFor={ids.who} className="w-36">
          <Select id={ids.who} value={traveler} onChange={(e) => setTraveler(e.target.value)}>
            <option value="">{t("packing.shared")}</option>
            {m.graph.travelers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Button type="submit" icon={<Plus className="size-4" />} disabled={!title.trim()}>
        {t("packing.add")}
      </Button>
    </form>
  );
}

function AddListDialog({ initialWho, onClose }: { initialWho: Who; onClose: () => void }) {
  const t = useT();
  const m = useTrip();
  const prefs = usePrefs();
  const info = useAppInfo();
  const run = useAction();
  const remove = useRemove();
  const whoId = useId();
  const [traveler, setTraveler] = useState(initialWho === "all" || initialWho === "shared" ? "" : initialWho);
  const saved = info.data?.packing_templates ?? [];

  const apply = async (items: PackingTemplateItem[]) => {
    const rows = mergeItems(m.graph.trip.id, m.graph.packing_items, items, traveler || null);
    const done = await run(
      async () => {
        for (const row of rows) await api.save({ type: "packing_item", row });
        return true;
      },
      t("packing.added", { count: rows.length }),
    );
    if (done !== undefined) onClose();
  };

  const entry = (key: string, label: string, items: PackingTemplateItem[], onDelete?: () => void) => (
    <li key={key} className="flex items-center gap-2 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        <span className="block truncate text-fg-3 text-xs">
          {items
            .slice(0, 6)
            .map((i) => i.title)
            .join(", ")}
          {items.length > 6 && ` … (${items.length})`}
        </span>
      </span>
      {onDelete && (
        <IconButton label={t("common.delete")} onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </IconButton>
      )}
      <Button size="sm" onClick={() => void apply(items)}>
        {t("packing.add")}
      </Button>
    </li>
  );

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("packing.addList")}
      description={t("packing.addListHint")}
    >
      <div className="flex flex-col gap-4">
        {m.graph.travelers.length > 0 && (
          <Field label={t("packing.for")} htmlFor={whoId} className="w-56">
            <Select id={whoId} value={traveler} onChange={(e) => setTraveler(e.target.value)}>
              <option value="">{t("packing.shared")}</option>
              {m.graph.travelers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {saved.length > 0 && (
          <section>
            <h4 className="font-medium text-fg-2 text-xs">{t("packing.savedLists")}</h4>
            <ul className="divide-y divide-line">
              {saved.map((s) =>
                entry(s.id, s.name, templateItems(s), () => void remove("packing_template", [s.id])),
              )}
            </ul>
          </section>
        )}
        <section>
          <h4 className="font-medium text-fg-2 text-xs">{t("packing.builtInLists")}</h4>
          <ul className="divide-y divide-line">
            {BUILT_IN_LISTS.map((l) => entry(l.id, l.name[prefs.language], builtInItems(l, prefs.language)))}
          </ul>
        </section>
      </div>
    </Dialog>
  );
}

function SaveListDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const m = useTrip();
  const run = useAction();
  const nameId = useId();
  const [name, setName] = useState(m.graph.trip.title);
  const save = async () => {
    const row = templateFrom(name, m.graph.packing_items);
    if ((await run(() => api.save({ type: "packing_template", row }), t("packing.listSaved"))) !== undefined)
      onClose();
  };
  return (
    <Dialog
      open
      size="sm"
      onOpenChange={(o) => !o && onClose()}
      title={t("packing.saveList")}
      description={t("packing.saveListHint")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <Field label={t("packing.listName")} htmlFor={nameId}>
        <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
    </Dialog>
  );
}
