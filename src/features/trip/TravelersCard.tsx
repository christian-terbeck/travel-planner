import { Award, IdCard, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { api } from "@/api/client";
import { useAction, useRemove } from "@/api/queries";
import type { LoyaltyMembership, TravelDocumentKind, TravelerDocument } from "@/domain/types";
import { useT } from "@/i18n";
import { KNOWN_PROGRAMS } from "@/lib/loyalty";
import { useFormat } from "@/lib/prefs";
import { newId, nil } from "@/lib/rows";
import { Button, Card, CardHeader, cn, Field, IconButton, Input, Select, Textarea } from "@/ui/core";
import { Dialog } from "@/ui/dialog";
import { DateInput } from "@/ui/inputs";
import { useTrip } from "./TripLayout";

export const DOCUMENT_KINDS: TravelDocumentKind[] = [
  "passport",
  "id_card",
  "visa",
  "driving_licence",
  "other",
];

/** Travelers with the validity of their passports, ID cards, visas and licences. */
export function TravelersCard() {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const run = useAction();
  const remove = useRemove();
  const [edit, setEdit] = useState<TravelerDocument | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyMembership | null>(null);
  const docs = m.graph.traveler_documents;
  // The plan's warnings say which documents are not valid long enough.
  const issue = (d: TravelerDocument) => m.plan.warnings.find((w) => w.key.endsWith(`|${d.id}`));

  return (
    <Card>
      <CardHeader
        icon={<IdCard className="size-4" />}
        title={t("travelDocument.title")}
        subtitle={t("travelDocument.hint")}
      />
      {m.graph.travelers.length === 0 ? (
        <p className="px-4 py-3 text-fg-3 text-sm">{t("travelDocument.noTravelers")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {m.graph.travelers.map((p) => (
            <li key={p.id} className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium text-sm">{p.name}</span>
                <IconButton
                  label={t("loyalty.add", { name: p.name })}
                  onClick={() =>
                    setLoyalty({
                      id: newId(),
                      traveler_id: p.id,
                      program: "",
                      provider: null,
                      number: "",
                      tier: null,
                      notes: null,
                    })
                  }
                >
                  <Award className="size-4" />
                </IconButton>
                <IconButton
                  label={t("travelDocument.add", { name: p.name })}
                  onClick={() =>
                    setEdit({
                      id: newId(),
                      traveler_id: p.id,
                      kind: "passport",
                      label: null,
                      expires_on: null,
                      notes: null,
                    })
                  }
                >
                  <Plus className="size-4" />
                </IconButton>
              </div>
              <ul>
                {docs
                  .filter((d) => d.traveler_id === p.id)
                  .map((d) => {
                    const w = issue(d);
                    return (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => setEdit(d)}
                          className="flex w-full items-baseline gap-2 rounded py-0.5 text-left text-sm hover:text-primary"
                        >
                          <span className="min-w-0 flex-1 truncate text-fg-2">
                            {d.label || t(`travelDocument.kind.${d.kind}`)}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 text-xs",
                              w?.severity === "critical" ? "text-danger" : w ? "text-warn" : "text-fg-3",
                            )}
                          >
                            {d.expires_on
                              ? t("travelDocument.validUntil", { date: f.date(d.expires_on, "short") })
                              : t("travelDocument.noExpiry")}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                {m.graph.loyalty_memberships
                  .filter((l) => l.traveler_id === p.id)
                  .map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => setLoyalty(l)}
                        className="flex w-full items-baseline gap-2 rounded py-0.5 text-left text-sm hover:text-primary"
                      >
                        <span className="min-w-0 flex-1 truncate text-fg-2">
                          {l.program}
                          {l.tier && <span className="text-fg-3"> · {l.tier}</span>}
                        </span>
                        <span className="shrink-0 font-mono text-fg-3 text-xs">{l.number}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {loyalty && (
        <LoyaltyDialog
          membership={loyalty}
          isNew={!m.graph.loyalty_memberships.some((l) => l.id === loyalty.id)}
          onClose={() => setLoyalty(null)}
          onSave={async (row) => {
            if ((await run(() => api.save({ type: "loyalty_membership", row }))) !== undefined)
              setLoyalty(null);
          }}
          onDelete={async () => {
            if (await remove("loyalty_membership", [loyalty.id])) setLoyalty(null);
          }}
        />
      )}
      {edit && (
        <DocumentDialog
          doc={edit}
          isNew={!docs.some((d) => d.id === edit.id)}
          onClose={() => setEdit(null)}
          onSave={async (row) => {
            if ((await run(() => api.save({ type: "traveler_document", row }))) !== undefined) setEdit(null);
          }}
          onDelete={async () => {
            if (await remove("traveler_document", [edit.id])) setEdit(null);
          }}
        />
      )}
    </Card>
  );
}

function DocumentDialog({
  doc,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  doc: TravelerDocument;
  isNew: boolean;
  onClose: () => void;
  onSave: (d: TravelerDocument) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const m = useTrip();
  const ids = { kind: useId(), label: useId(), expires: useId(), notes: useId() };
  const [d, setD] = useState(doc);
  const name = m.graph.travelers.find((x) => x.id === d.traveler_id)?.name ?? "";
  return (
    <Dialog
      open
      size="sm"
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? t("travelDocument.add", { name }) : t("travelDocument.edit", { name })}
      description={t("travelDocument.privacy")}
      footer={
        <>
          {!isNew && (
            <Button
              variant="ghost"
              className="mr-auto text-danger"
              icon={<Trash2 className="size-4" />}
              onClick={onDelete}
            >
              {t("common.delete")}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={() => onSave(d)}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("travelDocument.kindLabel")} htmlFor={ids.kind}>
          <Select
            id={ids.kind}
            value={d.kind}
            onChange={(e) => setD({ ...d, kind: e.target.value as TravelDocumentKind })}
          >
            {DOCUMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`travelDocument.kind.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("travelDocument.expires")} htmlFor={ids.expires}>
          <DateInput id={ids.expires} value={d.expires_on} onChange={(v) => setD({ ...d, expires_on: v })} />
        </Field>
        <Field label={t("travelDocument.label")} htmlFor={ids.label} className="col-span-2">
          <Input
            id={ids.label}
            placeholder={t("travelDocument.labelPlaceholder")}
            value={d.label ?? ""}
            onChange={(e) => setD({ ...d, label: nil(e.target.value) })}
          />
        </Field>
        <Field label={t("travelDocument.notes")} htmlFor={ids.notes} className="col-span-2">
          <Textarea
            id={ids.notes}
            rows={2}
            value={d.notes ?? ""}
            onChange={(e) => setD({ ...d, notes: nil(e.target.value) })}
          />
        </Field>
      </div>
    </Dialog>
  );
}

function LoyaltyDialog({
  membership,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  membership: LoyaltyMembership;
  isNew: boolean;
  onClose: () => void;
  onSave: (l: LoyaltyMembership) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const m = useTrip();
  const ids = {
    program: useId(),
    list: useId(),
    provider: useId(),
    number: useId(),
    tier: useId(),
    notes: useId(),
  };
  const [l, setL] = useState(membership);
  const [missing, setMissing] = useState(false);
  const name = m.graph.travelers.find((x) => x.id === l.traveler_id)?.name ?? "";
  const save = () => {
    if (!l.program.trim() || !l.number.trim()) return setMissing(true);
    onSave({ ...l, program: l.program.trim(), number: l.number.trim() });
  };
  return (
    <Dialog
      open
      size="sm"
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? t("loyalty.add", { name }) : t("loyalty.edit", { name })}
      description={t("loyalty.hint")}
      footer={
        <>
          {!isNew && (
            <Button
              variant="ghost"
              className="mr-auto text-danger"
              icon={<Trash2 className="size-4" />}
              onClick={onDelete}
            >
              {t("common.delete")}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t("loyalty.program")}
          htmlFor={ids.program}
          className="col-span-2"
          error={missing && !l.program.trim() ? t("errors.required") : undefined}
        >
          <Input
            id={ids.program}
            list={ids.list}
            autoFocus
            placeholder="Miles & More"
            value={l.program}
            onChange={(e) => setL({ ...l, program: e.target.value })}
          />
          <datalist id={ids.list}>
            {KNOWN_PROGRAMS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field
          label={t("loyalty.number")}
          htmlFor={ids.number}
          error={missing && !l.number.trim() ? t("errors.required") : undefined}
        >
          <Input
            id={ids.number}
            className="font-mono"
            value={l.number}
            onChange={(e) => setL({ ...l, number: e.target.value })}
          />
        </Field>
        <Field label={t("loyalty.tier")} htmlFor={ids.tier}>
          <Input
            id={ids.tier}
            value={l.tier ?? ""}
            onChange={(e) => setL({ ...l, tier: nil(e.target.value) })}
          />
        </Field>
        <Field
          label={t("loyalty.provider")}
          hint={t("loyalty.providerHint")}
          htmlFor={ids.provider}
          className="col-span-2"
        >
          <Input
            id={ids.provider}
            value={l.provider ?? ""}
            onChange={(e) => setL({ ...l, provider: nil(e.target.value) })}
          />
        </Field>
        <Field label={t("travelDocument.notes")} htmlFor={ids.notes} className="col-span-2">
          <Textarea
            id={ids.notes}
            rows={2}
            value={l.notes ?? ""}
            onChange={(e) => setL({ ...l, notes: nil(e.target.value) })}
          />
        </Field>
      </div>
    </Dialog>
  );
}
