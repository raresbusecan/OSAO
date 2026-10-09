import React, { useState } from "react";
import { DateField } from "@/components/ui/DateField";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/lib/theme";
import { SPACE_IDENTITY_COLORS, SPACE_BUTTON_FILL } from "@/lib/spaces/spaceProfile";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Field, Pill } from "@/components/ui/primitives";

const CAR = SPACE_IDENTITY_COLORS.car!;
import { GuiltFreeToggle } from "@/components/dashboard/GuiltFree";
import { confirmAction } from "@/lib/confirm";

import type { CarDocumentEntry } from "@/lib/spaces/car/car.types";

type CarDocumentFormProps = {
  onCancel: () => void;
  onSave: (entry: CarDocumentEntry) => void;
  /** Pass an existing entry to edit it instead of creating a new one. */
  entry?: CarDocumentEntry;
  /** Only meaningful while editing -- deletes this entry entirely. */
  onDelete?: () => void;
  /** True once `entry` is archived or has fallen out of the dashboard's
   * 7-day window (see lib/spaces/car/utils/documentLock.ts) -- renders
   * every field disabled, hides Save/Delete, and swaps Cancel for a
   * plain Close. The caller (CarDashboard.tsx) decides this; the form
   * itself never checks archived/date. */
  readOnly?: boolean;
  /** Opened from a "Expires soon" NEXT alert -- pre-fills Document Type/
   * Title/Issuer from the expiring entry, but this still creates a
   * brand-new record (a renewal), never overwrites the old one. `sourceId`
   * is carried onto the saved entry as `renewedFromId` so the caller can
   * archive the old one -- see CarDashboard.tsx's handleDocumentSave.
   * Ignored when `entry` is set (editing always wins). */
  renewFrom?: Pick<CarDocumentEntry, "documentType" | "title" | "issuer"> & {
    sourceId: string;
    /** The proposed next validity + price, pre-filled (still editable):
     * computed from the old document's validity dates. */
    issueDate?: string;
    expiryDate?: string;
    price?: number;
  };
};

const DOCUMENT_TYPES = [
  "RCA",
  "CASCO",
  "ITP",
  "Rovinieta",
  "Tax",
];

export default function CarDocumentForm({
  onCancel,
  onSave,
  entry,
  onDelete,
  renewFrom,
  readOnly = false,
}: CarDocumentFormProps) {
  const isEditing = entry !== undefined;
  const isRenewing = !isEditing && renewFrom !== undefined;

  const { colors, spacing, radius } = useTheme();

  const [documentType, setDocumentType] = useState(entry?.documentType ?? renewFrom?.documentType ?? "");
  const [title, setTitle] = useState(entry?.title ?? renewFrom?.title ?? "");
  const [issuer, setIssuer] = useState(entry?.issuer ?? renewFrom?.issuer ?? "");
  const [issueDate, setIssueDate] = useState(entry?.issueDate ?? renewFrom?.issueDate ?? "");
  const [expiryDate, setExpiryDate] = useState(entry?.expiryDate ?? renewFrom?.expiryDate ?? "");
  const [price, setPrice] = useState(entry?.price !== undefined ? String(entry.price) : renewFrom?.price !== undefined ? String(renewFrom.price) : "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [guiltFree, setGuiltFree] = useState(!!entry?.guiltFree);


  const [error, setError] = useState("");

  const handleTypeSelect = (type: string) => {
    if (!title || title === documentType) {
      setTitle(type);
    }
    setDocumentType(type);
  };

  const handleSave = () => {
    setError("");

    const priceValue = price
      ? Number(price.replace(",", "."))
      : undefined;

    if (!documentType.trim()) {
      setError("Alege tipul documentului.");
      return;
    }

    if (
      price &&
      (priceValue === undefined ||
        Number.isNaN(priceValue) ||
        priceValue < 0)
    ) {
      setError("Introdu un preț valid.");
      return;
    }

    // Both validity dates are required: they're what the whole urgency
    // system runs on, and what a renewal's next period is computed from.
    if (!issueDate.trim()) {
      setError("Alege data emiterii.");
      return;
    }

    if (!isValidDate(issueDate)) {
      setError(
        "Alege data emiterii.",
      );
      return;
    }

    // Expiry date is required -- the whole urgency system (DUE SOON,
    // status dots, overdue) is built on it, see
    // getDocumentUrgencyTier/getDocumentStatus in
    // dashboard.calculations.ts. A document truly without one (rare --
    // most have SOME validity window) just isn't trackable that way.
    if (!expiryDate.trim()) {
      setError("Introdu data expirării.");
      return;
    }

    if (!isValidDate(expiryDate)) {
      setError(
        "Alege data expirării.",
      );
      return;
    }

    if (
      issueDate &&
      expiryDate &&
      parseDate(expiryDate) < parseDate(issueDate)
    ) {
      setError(
        "Data expirării nu poate fi înaintea celei de emitere.",
      );
      return;
    }

    const entryToSave: CarDocumentEntry = {
      id: entry?.id ?? `document-${Date.now()}`,
      date: entry?.date ?? new Date().toISOString(),
      documentType: documentType.trim(),
      title: title.trim(),
      issuer: issuer.trim() || undefined,
      issueDate: issueDate.trim() || undefined,
      expiryDate: expiryDate.trim() || undefined,
      price: priceValue,
      notes: notes.trim() || undefined,
      renewedFromId: isRenewing ? renewFrom?.sourceId : entry?.renewedFromId,
      guiltFree,
    };

    onSave(entryToSave);
  };

  const handleDelete = async () => {
    const confirmed = await confirmAction("Ștergi documentul?", "Se șterge definitiv.", { confirmLabel: "Șterge", destructive: true });
    if (confirmed) onDelete?.();
  };

  // TEMP (testing only, kept from before): archived documents are
  // otherwise fully locked, but deletion is allowed so wrongly-archived
  // test entries can be cleaned up.
  const canDelete = isEditing && onDelete && (!readOnly || entry?.archived);

  return (
    <Sheet
      visible
      onClose={onCancel}
      info="car.documentForm"
      title={readOnly ? title || "Document" : isEditing ? "Editează documentul" : isRenewing ? "Reînnoiește documentul" : "Document nou"}
      subtitle={readOnly ? "Doar citire" : undefined}
      icon="document-text-outline"
      tone={CAR}
      footer={
        <>
          {!readOnly ? (
            <Button testID="car-document-save" label={isEditing ? "Salvează" : "Salvează documentul"} tone={SPACE_BUTTON_FILL.car} onPress={handleSave} />
          ) : (
            <Button variant="secondary" label="Închide" onPress={onCancel} />
          )}
          {canDelete ? <Button variant="ghost" icon="trash-outline" label="Șterge documentul" onPress={handleDelete} /> : null}
        </>
      }
    >
      {isRenewing ? (
        <Notice icon="information-circle-outline">
          Creezi o înregistrare nouă pentru reînnoire. {renewFrom?.documentType || "Documentul"} vechi rămâne în istoric, nu e suprascris.
        </Notice>
      ) : null}
      {readOnly ? (
        <Notice icon="lock-closed-outline">
          Documentul a fost înlocuit de o reînnoire, așa că e blocat: o înregistrare arhivată rămâne exact cum a fost salvată.
        </Notice>
      ) : null}

      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 13, color: colors.onSurfaceTertiary }}>Tip document</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {DOCUMENT_TYPES.map((type) => (
            <Pill key={type} label={type} active={documentType === type} tone={CAR} onPress={readOnly ? undefined : () => handleTypeSelect(type)} />
          ))}
        </View>
      </View>

      <Field label="Titlu" value={title} onChangeText={setTitle} placeholder="ex. RCA 2026" tone={CAR} editable={!readOnly} />
      <Field label="Emitent (opțional)" value={issuer} onChangeText={setIssuer} placeholder="ex. Allianz" tone={CAR} editable={!readOnly} />
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <DateField testID="car-doc-issue-date" label="Emis pe" value={issueDate} onChange={setIssueDate} disabled={readOnly} placeholder="Alege" />
        </View>
        <View style={{ flex: 1 }}>
          <DateField testID="car-doc-expiry-date" label="Expiră pe" value={expiryDate} onChange={setExpiryDate} disabled={readOnly} placeholder="Alege" />
        </View>
      </View>
      <Field label="Preț (opțional)" value={price} onChangeText={setPrice} placeholder="ex. 650" keyboardType="decimal-pad" suffix="lei" tone={CAR} editable={!readOnly} />
      <Field label="Notițe (opțional)" value={notes} onChangeText={setNotes} placeholder="Orice detaliu util" multiline tone={CAR} editable={!readOnly} />
      {!readOnly ? <GuiltFreeToggle value={guiltFree} onChange={setGuiltFree} tone={CAR} testID="car-document-guilt-free" /> : null}

      {error ? (
        <View style={{ padding: spacing.md, borderRadius: radius.control, backgroundColor: `${colors.error}14` }}>
          <Text style={{ fontSize: 14, color: colors.error }}>{error}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

/** Small info line on the raised layer (renewal / locked notices). */
function Notice({ icon, children }: { icon: React.ComponentProps<typeof Ionicons>["name"]; children: React.ReactNode }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderRadius: radius.control, backgroundColor: colors.surfaceTertiary }}>
      <Ionicons name={icon} size={18} color={colors.onSurfaceTertiary} />
      <Text style={{ flex: 1, fontSize: 13, color: colors.onSurfaceTertiary, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

function isValidDate(value: string) {
  const match = value.match(
    /^(\d{2})\.(\d{2})\.(\d{4})$/,
  );

  if (!match) {
    return false;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function parseDate(value: string) {
  const [day, month, year] = value
    .split(".")
    .map(Number);

  return new Date(
    year,
    month - 1,
    day,
  ).getTime();
}