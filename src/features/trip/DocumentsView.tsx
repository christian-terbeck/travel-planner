import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  CheckSquare,
  FileText,
  FolderOpen,
  Paperclip,
  Pencil,
  Plus,
  Square,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import type { Note, Task } from "@/domain/types";
import { useT } from "@/i18n";
import { useFormat } from "@/lib/prefs";
import { newId, newTask, nil, nowIso } from "@/lib/rows";
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
import { DateInput } from "@/ui/inputs";
import { useTrip } from "./TripLayout";
import { useReminderText } from "./warnings";

export function DocumentsView() {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
      <div className="flex flex-col gap-6">
        <DocumentsCard />
        <NotesCard />
      </div>
      <TasksCard />
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DocumentsCard() {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const run = useAction();
  const confirm = useConfirm();
  const [link, setLink] = useState("");
  const [noteEdit, setNoteEdit] = useState<{ id: string; notes: string } | null>(null);
  const docs = m.graph.documents;
  const targets = [
    ...m.graph.bookings.map((b) => ({
      value: `b:${b.id}`,
      label: `${t("documents.booking")}: ${m.item(b.option_id)?.option.title ?? ""}${b.reference ? ` (${b.reference})` : ""}`,
    })),
    ...m.graph.options.map((o) => ({ value: `o:${o.id}`, label: `${t("documents.option")}: ${o.title}` })),
  ];
  const attach = async () => {
    const picked = await openDialog({
      multiple: true,
      directory: false,
      filters: [
        {
          name: t("documents.filterCommon"),
          extensions: [
            "pdf",
            "png",
            "jpg",
            "jpeg",
            "webp",
            "heic",
            "txt",
            "md",
            "html",
            "eml",
            "ics",
            "pkpass",
            "docx",
          ],
        },
        { name: t("documents.filterAll"), extensions: ["*"] },
      ],
    });
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
    const optionId = link.startsWith("o:") ? link.slice(2) : null;
    const bookingId = link.startsWith("b:") ? link.slice(2) : null;
    for (const p of paths)
      await run(() => api.attachDocument(m.graph.trip.id, p, optionId, bookingId), t("documents.attached"));
  };
  return (
    <Card>
      <CardHeader
        icon={<Paperclip className="size-4" />}
        title={t("documents.title")}
        subtitle={t("documents.hint")}
        actions={
          <div className="flex items-center gap-2">
            <Select
              aria-label={t("documents.linkTo")}
              className="h-7 w-56 text-xs"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            >
              <option value="">{t("documents.wholeTrip")}</option>
              {targets.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </Select>
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={attach}>
              {t("documents.attach")}
            </Button>
          </div>
        }
      />
      {docs.length === 0 ? (
        <EmptyState icon={<FileText />} title={t("documents.empty")} text={t("documents.emptyText")} />
      ) : (
        <ul className="divide-y divide-line">
          {docs.map((d) => {
            const booking = m.graph.bookings.find((b) => b.id === d.booking_id);
            const option = m.item(d.option_id ?? booking?.option_id)?.option;
            return (
              <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                <FileText className="size-5 shrink-0 text-fg-3" aria-hidden />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="truncate text-left font-medium text-sm hover:underline"
                    onClick={() => run(() => api.openDocument(d.id))}
                  >
                    {d.filename}
                  </button>
                  <div className="flex flex-wrap items-center gap-2 text-fg-3 text-xs">
                    <span>{formatSize(Number(d.size_bytes))}</span>
                    <span>{f.timestamp(d.created_at)}</span>
                    {option && <Badge>{option.title}</Badge>}
                    {booking?.reference && <Badge tone="ok">{booking.reference}</Badge>}
                    {d.notes && <span className="truncate">{d.notes}</span>}
                  </div>
                </div>
                <IconButton label={t("documents.open")} onClick={() => run(() => api.openDocument(d.id))}>
                  <FolderOpen className="size-4" />
                </IconButton>
                <IconButton
                  label={t("documents.editNote")}
                  onClick={() => setNoteEdit({ id: d.id, notes: d.notes ?? "" })}
                >
                  <Pencil className="size-3.5" />
                </IconButton>
                <IconButton
                  label={t("common.delete")}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: t("documents.deleteTitle", { name: d.filename }),
                        text: t("documents.deleteText"),
                        confirm: t("common.delete"),
                        danger: true,
                      })
                    ) {
                      await run(() => api.remove("document", d.id));
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
      {noteEdit && (
        <Dialog
          open
          size="sm"
          onOpenChange={(o) => !o && setNoteEdit(null)}
          title={t("documents.editNote")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setNoteEdit(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                onClick={async () =>
                  (await run(() => api.updateDocumentNotes(noteEdit.id, nil(noteEdit.notes)))) !==
                    undefined && setNoteEdit(null)
                }
              >
                {t("common.save")}
              </Button>
            </>
          }
        >
          <Textarea
            aria-label={t("documents.notePrompt")}
            autoFocus
            rows={3}
            value={noteEdit.notes}
            onChange={(e) => setNoteEdit({ ...noteEdit, notes: e.target.value })}
          />
        </Dialog>
      )}
    </Card>
  );
}

function NotesCard() {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const run = useAction();
  const confirm = useConfirm();
  const [edit, setEdit] = useState<Note | null>(null);
  const create = (): Note => ({
    id: newId(),
    trip_id: m.graph.trip.id,
    option_id: null,
    title: "",
    body: "",
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return (
    <Card>
      <CardHeader
        icon={<StickyNote className="size-4" />}
        title={t("notes.title")}
        actions={
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEdit(create())}>
            {t("notes.add")}
          </Button>
        }
      />
      {m.graph.notes.length === 0 ? (
        <p className="px-4 py-3 text-fg-3 text-sm">{t("notes.empty")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {m.graph.notes.map((n) => (
            <li key={n.id} className="group px-4 py-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex-1 text-left font-medium text-sm hover:underline"
                  onClick={() => setEdit(n)}
                >
                  {n.title}
                </button>
                {n.option_id && <Badge>{m.item(n.option_id)?.option.title}</Badge>}
                <span className="text-fg-3 text-xs">{f.timestamp(n.updated_at)}</span>
                <IconButton
                  label={t("common.delete")}
                  className="opacity-0 group-hover:opacity-100"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: t("notes.deleteTitle", { title: n.title }),
                        confirm: t("common.delete"),
                        danger: true,
                      })
                    )
                      await run(() => api.remove("note", n.id));
                  }}
                >
                  <Trash2 className="size-3.5" />
                </IconButton>
              </div>
              {n.body && (
                <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-fg-2 text-sm">{n.body}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {edit && (
        <Dialog
          open
          onOpenChange={(o) => !o && setEdit(null)}
          title={m.graph.notes.some((n) => n.id === edit.id) ? t("notes.edit") : t("notes.add")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEdit(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={!edit.title.trim()}
                onClick={async () =>
                  (await run(() =>
                    api.save({ type: "note", row: { ...edit, title: edit.title.trim() } }),
                  )) !== undefined && setEdit(null)
                }
              >
                {t("common.save")}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <Field label={t("notes.noteTitle")} htmlFor="n-title">
              <Input
                id="n-title"
                autoFocus
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </Field>
            <Field label={t("notes.relatedOption")} htmlFor="n-opt">
              <Select
                id="n-opt"
                value={edit.option_id ?? ""}
                onChange={(e) => setEdit({ ...edit, option_id: e.target.value || null })}
              >
                <option value="">{t("documents.wholeTrip")}</option>
                {m.graph.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("notes.body")} htmlFor="n-body">
              <Textarea
                id="n-body"
                rows={10}
                value={edit.body}
                onChange={(e) => setEdit({ ...edit, body: e.target.value })}
              />
            </Field>
          </div>
        </Dialog>
      )}
    </Card>
  );
}

function TasksCard() {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const run = useAction();
  const reminderText = useReminderText();
  const [edit, setEdit] = useState<Task | null>(null);
  const [quick, setQuick] = useState("");
  const tasks = [...m.graph.tasks].sort(
    (a, b) =>
      Number(!!a.done_at) - Number(!!b.done_at) || (a.due_date ?? "9").localeCompare(b.due_date ?? "9"),
  );
  const suggestions = m.reminders.filter((r) =>
    ["missing_accommodation", "missing_document", "payment_due", "cancellation_deadline"].includes(r.kind),
  );
  const toggle = (x: Task) =>
    run(() => api.save({ type: "task", row: { ...x, done_at: x.done_at ? null : nowIso() } }));
  const add = async (title: string, due: string | null = null, optionId: string | null = null) => {
    if (!title.trim()) return;
    await run(() =>
      api.save({
        type: "task",
        row: {
          ...newTask(m.graph.trip.id, m.graph.tasks.length),
          title: title.trim(),
          due_date: due,
          option_id: optionId,
        },
      }),
    );
  };
  return (
    <Card className="self-start">
      <CardHeader
        icon={<CheckSquare className="size-4" />}
        title={t("tasks.title")}
        subtitle={t("tasks.hint")}
      />
      <form
        className="flex gap-2 border-line border-b px-4 py-2.5"
        onSubmit={async (e) => {
          e.preventDefault();
          await add(quick);
          setQuick("");
        }}
      >
        <Input
          aria-label={t("tasks.new")}
          placeholder={t("tasks.newPlaceholder")}
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
        />
        <Button type="submit" icon={<Plus className="size-4" />} disabled={!quick.trim()}>
          {t("tasks.add")}
        </Button>
      </form>
      {tasks.length === 0 ? (
        <p className="px-4 py-3 text-fg-3 text-sm">{t("tasks.empty")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {tasks.map((x) => {
            const overdue = !x.done_at && x.due_date && x.due_date < nowIso().slice(0, 10);
            return (
              <li key={x.id} className="group flex items-start gap-2.5 px-4 py-2">
                <button
                  type="button"
                  onClick={() => toggle(x)}
                  className="mt-0.5 text-fg-3 hover:text-primary"
                  aria-label={x.done_at ? t("tasks.reopen") : t("tasks.complete")}
                >
                  {x.done_at ? <CheckSquare className="size-4 text-ok" /> : <Square className="size-4" />}
                </button>
                <button
                  type="button"
                  className={cn("min-w-0 flex-1 text-left text-sm", x.done_at && "text-fg-3 line-through")}
                  onClick={() => setEdit(x)}
                >
                  {x.title}
                  {(x.due_date || x.option_id) && (
                    <span className={cn("block text-xs", overdue ? "text-danger" : "text-fg-3")}>
                      {x.due_date && t("tasks.due", { date: f.date(x.due_date, "short") })}
                      {x.option_id && ` · ${m.item(x.option_id)?.option.title ?? ""}`}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {suggestions.length > 0 && (
        <div className="border-line border-t px-4 py-2.5">
          <h4 className="mb-1 font-medium text-fg-2 text-xs">{t("tasks.suggested")}</h4>
          <ul className="flex flex-col gap-1">
            {suggestions.map((r) => (
              <li key={r.key} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 text-fg-2">{reminderText(r)}</span>
                <Button size="sm" variant="ghost" onClick={() => add(reminderText(r), r.date, r.optionId)}>
                  {t("tasks.addSuggested")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {edit && (
        <Dialog
          open
          size="sm"
          onOpenChange={(o) => !o && setEdit(null)}
          title={t("tasks.edit")}
          footer={
            <>
              <Button
                variant="ghost"
                className="mr-auto text-danger"
                icon={<Trash2 className="size-4" />}
                onClick={async () =>
                  (await run(() => api.remove("task", edit.id))) !== undefined && setEdit(null)
                }
              >
                {t("common.delete")}
              </Button>
              <Button variant="ghost" onClick={() => setEdit(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={!edit.title.trim()}
                onClick={async () =>
                  (await run(() => api.save({ type: "task", row: edit }))) !== undefined && setEdit(null)
                }
              >
                {t("common.save")}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <Field label={t("tasks.taskTitle")} htmlFor="tk-title">
              <Input
                id="tk-title"
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </Field>
            <Field label={t("tasks.dueDate")} htmlFor="tk-due">
              <DateInput
                id="tk-due"
                value={edit.due_date}
                onChange={(v) => setEdit({ ...edit, due_date: v })}
              />
            </Field>
            <Field label={t("notes.relatedOption")} htmlFor="tk-opt">
              <Select
                id="tk-opt"
                value={edit.option_id ?? ""}
                onChange={(e) => setEdit({ ...edit, option_id: e.target.value || null })}
              >
                <option value="">—</option>
                {m.graph.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("option.notesField")} htmlFor="tk-notes">
              <Textarea
                id="tk-notes"
                rows={3}
                value={edit.notes ?? ""}
                onChange={(e) => setEdit({ ...edit, notes: nil(e.target.value) })}
              />
            </Field>
          </div>
        </Dialog>
      )}
    </Card>
  );
}
