import { useQuery } from "@tanstack/react-query";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { BedDouble, BookOpen, ImageOff, ImagePlus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import { useAction, useRemove } from "@/api/queries";
import type { Document, JournalEntry } from "@/domain/types";
import { useT } from "@/i18n";
import { isShownImage, type JournalDay, journalDays, MAX_LISTED_DAYS, newJournalEntry } from "@/lib/journal";
import { useFormat } from "@/lib/prefs";
import { nil } from "@/lib/rows";
import { Button, Card, Checkbox, cn, EmptyState, Field, IconButton, Input, Textarea } from "@/ui/core";
import { KindIcon } from "@/ui/status";
import { useTrip } from "./TripLayout";

const PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "heic"];

export function JournalView() {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const run = useAction();
  const [onlyWritten, setOnlyWritten] = useState(false);
  const [extraDay, setExtraDay] = useState("");
  const all = useMemo(() => journalDays(m), [m]);
  const days = onlyWritten ? all.filter((d) => d.entry) : all;
  const { start, end } = m.plan.period;
  const tooLong = !!(start && end && start.until(end).days >= MAX_LISTED_DAYS);

  const addDay = async () => {
    if (!extraDay || all.some((d) => d.day === extraDay && d.entry)) return;
    await run(() => api.save({ type: "journal_entry", row: newJournalEntry(m.graph.trip.id, extraDay) }));
    setExtraDay("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-fg-3 text-sm">
          {t("journal.hint")}
          {tooLong && ` ${t("journal.tooLong")}`}
        </p>
        <Checkbox
          label={t("journal.onlyWritten")}
          checked={onlyWritten}
          onChange={(e) => setOnlyWritten(e.target.checked)}
        />
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label={t("journal.otherDay")}
            value={extraDay}
            onChange={(e) => setExtraDay(e.target.value)}
            className="w-40"
          />
          <Button disabled={!extraDay} onClick={addDay}>
            {t("journal.addDay")}
          </Button>
        </div>
      </div>
      {days.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen />}
            title={t("journal.emptyTitle")}
            text={onlyWritten ? t("journal.emptyWritten") : t("journal.emptyText")}
          />
        </Card>
      ) : (
        days.map((d) => <DayCard key={d.day} day={d} label={f.date(d.day, "long")} tripDays={all} />)
      )}
    </div>
  );
}

function DayCard({ day, label, tripDays }: { day: JournalDay; label: string; tripDays: JournalDay[] }) {
  const t = useT();
  const m = useTrip();
  const run = useAction();
  const remove = useRemove();
  const [title, setTitle] = useState(day.entry?.title ?? "");
  const [body, setBody] = useState(day.entry?.body ?? "");
  useEffect(() => {
    setTitle(day.entry?.title ?? "");
    setBody(day.entry?.body ?? "");
  }, [day.entry]);
  const number = tripDays.filter((d) => d.inTrip).findIndex((d) => d.day === day.day) + 1;

  /** Saves the entry if anything changed; creates it on first use. Returns the saved entry. */
  const save = async (): Promise<JournalEntry | undefined> => {
    const base = day.entry ?? newJournalEntry(m.graph.trip.id, day.day);
    const row = { ...base, title: nil(title), body };
    if (day.entry && day.entry.title === row.title && day.entry.body === row.body) return day.entry;
    if (!day.entry && !row.title && !row.body.trim()) return undefined;
    return (await run(() => api.save({ type: "journal_entry", row }))) === undefined ? undefined : row;
  };
  const addPhotos = async () => {
    const picked = await openDialog({
      multiple: true,
      filters: [{ name: t("journal.photos"), extensions: PHOTO_EXTENSIONS }],
    });
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
    if (paths.length === 0) return;
    let entry = day.entry ?? undefined;
    if (!entry) {
      const fresh = { ...newJournalEntry(m.graph.trip.id, day.day), title: nil(title), body };
      if ((await run(() => api.save({ type: "journal_entry", row: fresh }))) === undefined) return;
      entry = fresh;
    }
    const id = entry.id;
    for (const p of paths) await run(() => api.attachDocument(m.graph.trip.id, p, null, null, id));
  };

  return (
    <Card className={cn(!day.inTrip && "border-dashed")}>
      <div className="flex items-center gap-2 border-line border-b px-4 py-2.5">
        <h3 className="font-semibold text-sm">
          {number > 0 && <span className="mr-2 text-fg-3">{t("journal.dayN", { n: number })}</span>}
          {label}
        </h3>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" icon={<ImagePlus className="size-3.5" />} onClick={addPhotos}>
            {t("journal.addPhotos")}
          </Button>
          {day.entry && (
            <IconButton
              label={t("journal.delete")}
              onClick={() => day.entry && void remove("journal_entry", [day.entry.id], t("journal.deleted"))}
            >
              <Trash2 className="size-3.5" />
            </IconButton>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3 p-4">
        {(day.stays.length > 0 || day.events.length > 0) && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-fg-3 text-xs">
            {day.events.map((i) => (
              <li key={i.option.id} className="flex items-center gap-1">
                <KindIcon kind={i.slot.kind} className="size-3.5" />
                {i.option.title}
              </li>
            ))}
            {day.stays.map((i) => (
              <li key={i.option.id} className="flex items-center gap-1">
                <BedDouble className="size-3.5" aria-hidden />
                {i.option.title}
              </li>
            ))}
          </ul>
        )}
        <Field label={t("journal.title")} htmlFor={`j-title-${day.day}`}>
          <Input
            id={`j-title-${day.day}`}
            value={title}
            placeholder={t("journal.titlePlaceholder")}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void save()}
          />
        </Field>
        <Field label={t("journal.text")} htmlFor={`j-body-${day.day}`}>
          <Textarea
            id={`j-body-${day.day}`}
            rows={day.entry?.body ? 5 : 2}
            value={body}
            placeholder={t("journal.textPlaceholder")}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => void save()}
          />
        </Field>
        {day.photos.length > 0 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
            {day.photos.map((p) => (
              <Photo key={p.id} doc={p} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Photo({ doc }: { doc: Document }) {
  const t = useT();
  const run = useAction();
  const remove = useRemove();
  const shown = isShownImage(doc);
  const image = useQuery({
    queryKey: ["document-image", doc.id],
    enabled: shown,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () =>
      URL.createObjectURL(new Blob([await api.documentImage(doc.id)], { type: doc.mime ?? "" })),
  });
  return (
    <li className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-surface-2">
      <button
        type="button"
        className="size-full"
        title={doc.filename}
        aria-label={t("journal.openPhoto", { name: doc.filename })}
        onClick={() => run(() => api.openDocument(doc.id))}
      >
        {image.data ? (
          <img src={image.data} alt={doc.notes ?? doc.filename} className="size-full object-cover" />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-1 p-2 text-fg-3 text-xs">
            <ImageOff className="size-5" aria-hidden />
            <span className="max-w-full truncate">{doc.filename}</span>
          </span>
        )}
      </button>
      <IconButton
        label={t("journal.deletePhoto")}
        className="absolute top-1 right-1 bg-surface/80 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        onClick={() => void remove("document", [doc.id], t("journal.photoDeleted"))}
      >
        <Trash2 className="size-3.5" />
      </IconButton>
    </li>
  );
}
