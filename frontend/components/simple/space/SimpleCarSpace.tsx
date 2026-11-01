import React, { useMemo, useState } from "react";
import { DeviceEventEmitter, Text } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/lib/theme";
import { api } from "@/lib/api";
import { daysFromToday, lei, roCount, roDate, roNumber } from "@/lib/format";
import { resolveFromSummary, type ActionItem } from "@/lib/dashboard/itemActions";
import { parseDocDate } from "@/lib/dashboard/documentRenewal";
import { maintenanceLabel } from "@/lib/spaces/car/maintenanceLabels";
import { documentEntryToItemBody, maintenanceEntryToItemBody } from "@/lib/spaces/car/carItems";
import type { CarDocumentEntry } from "@/lib/spaces/car/car.types";
import type { CarProfile } from "@/lib/spaces/spaceProfile";
import { CarProfileForm } from "@/components/spaces/car/CarProfileForm";
import {
  getCurrentOdometer,
  getLoggedOdometer,
  getDocumentStatus,
  getDocumentUrgencyTier,
  getMaintenanceUrgency,
  getUpcomingItems,
  isDocumentSuperseded,
  isMaintenanceSuperseded,
  compareMaintenanceRecency,
} from "@/lib/spaces/car/calculations/dashboard.calculations";
import { urgencyTierColor } from "@/lib/statusColors";
import { TeaserCard } from "@/components/simple/Teaser";
import { openEditRecord } from "@/lib/simpleSheets";
import { REFRESH_EVENT } from "@/lib/refresh";
import type { SimpleSpaceProps } from "./SimpleSpaceScreen";
import {
  CalmLine,
  DotLine,
  SimpleCard,
  SimpleHero,
  ShowAllLine,
  SimplePage,
  expiryText,
  SpendLine,
  deleteRecordWithConfirm,
  HistoryMonthBadge,
  useHistoryMonth,
  useShowAll,
  useSimpleSpaceColors,
  useSpaceAccent,
  weekdayDate,
} from "./SimpleSpaceParts";

import { DOC_TYPE_LABEL } from "../quickAdd/kinds";

function docName(doc: CarDocumentEntry): string {
  return DOC_TYPE_LABEL[doc.documentType] ?? doc.title;
}

/**
 * Mașină in orgOS Simplu (mockup Masina.dc.html): header (name + km), the
 * one most urgent thing (the full dashboard's "Urmează" rule,
 * getUpcomingItems) with "Am rezolvat", the current documents, this
 * month's spend, and one Complet teaser.
 */
export function SimpleCarSpace({ space, profile, carData, onChanged, onBack }: SimpleSpaceProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const c = useSimpleSpaceColors(space, "car");
  useSpaceAccent(space, c);
  const [busy, setBusy] = useState(false);
  // The header pencil: one "Editează mașina" sheet (Marcă/Model = the
  // name, An, rezervor, Kilometraj).
  const [editOpen, setEditOpen] = useState(false);

  const odometer = getCurrentOdometer(carData);

  // Next oil change, right after the km under the name (user decision
  // 2026-10-15): the latest Oil Change entry, read with the app's own
  // "km or date, whichever comes first" rule (getMaintenanceUrgency).
  // km: grey until 2.000 left, then yellow / orange at 1.000 / red at 500
  // and "depășit" past it. Date (the 12-month half): only takes over once
  // it's the more urgent one (inside 45 days: "în 20 de zile", "azi");
  // otherwise, with no km target, a calm "în 11 luni".
  const oil = useMemo(() => {
    const latest = carData.maintenanceEntries
      .filter((m) => m.service === "Oil Change" && !isMaintenanceSuperseded(m, carData.maintenanceEntries))
      .sort((a, b) => compareMaintenanceRecency(b, a))[0];
    if (!latest) return null;
    const u = getMaintenanceUrgency(latest, odometer);
    const tone = u.tier ? urgencyTierColor(u.tier, colors) : colors.onSurfaceTertiary;
    const target = parseDocDate(latest.nextServiceDate);
    const days = target ? daysFromToday(target) : null;
    if (u.decidedBy === "date" && days !== null) {
      const text =
        days < 0 ? `ulei depășit de ${roCount(-days, "zi", "zile")}` : days === 0 ? "ulei azi" : days === 1 ? "ulei mâine" : `ulei în ${roCount(days, "zi", "zile")}`;
      return { text, color: tone };
    }
    if (latest.nextServiceOdometer !== undefined && odometer > 0) {
      const left = Math.round(latest.nextServiceOdometer - odometer);
      const text = left < 0 ? `ulei depășit cu ${roNumber(-left)} km` : `ulei în ${roNumber(left)} km`;
      return { text, color: u.decidedBy === "km" ? tone : colors.onSurfaceTertiary };
    }
    if (days !== null) {
      const months = Math.max(1, Math.round(days / 30.4));
      return { text: days > 45 ? `ulei în ${roCount(months, "lună", "luni")}` : `ulei în ${roCount(days, "zi", "zile")}`, color: colors.onSurfaceTertiary };
    }
    return null;
  }, [carData.maintenanceEntries, odometer, colors]);

  // No plate/registration field exists on the car profile yet: km + oil.
  const subtitle =
    odometer > 0 || oil ? (
      <>
        {odometer > 0 ? `${roNumber(odometer)} km` : null}
        {odometer > 0 && oil ? " · " : null}
        {oil ? (
          <Text testID="simple-car-oil" style={{ color: oil.color, fontWeight: oil.color === colors.onSurfaceTertiary ? "400" : "600" }}>
            {oil.text}
          </Text>
        ) : null}
      </>
    ) : null;

  const next = useMemo(() => getUpcomingItems(carData, odometer, 1)[0] ?? null, [carData, odometer]);

  const hero = useMemo(() => {
    if (!next) return null;
    if (next.sourceType === "document") {
      const doc = carData.documentEntries.find((d) => d.id === next.sourceId);
      if (!doc) return null;
      const { status } = getDocumentStatus(doc);
      const expiry = parseDocDate(doc.expiryDate);
      const name = docName(doc);
      // Calendar days (daysFromToday, the app's one day rule): "expiră azi"
      // on the day itself, "mâine" the day before.
      const days = expiry ? daysFromToday(expiry) : null;
      const title =
        status === "expired" || (days !== null && days < 0)
          ? `${name} a expirat`
          : days === 0
            ? `${name} expiră azi`
            : days === 1
              ? `${name} expiră mâine`
              : days !== null
                ? `${name} expiră în ${roCount(days, "zi", "zile")}`
                : `${name} ${next.right}`;
      const detail = expiry ? (status === "expired" ? `A expirat pe ${roDate(expiry)}` : weekdayDate(expiry)) : null;
      return { title, detail, doc, service: null, overdueKm: null as number | null, itemId: doc.id };
    }
    const service = carData.maintenanceEntries.find((m) => m.id === next.sourceId);
    if (!service) return null;
    const urgency = getMaintenanceUrgency(service, odometer);
    const label = maintenanceLabel(service.service);
    const title = urgency.overdue ? `${label} · ${next.right}` : next.right === "Azi" ? `${label} azi` : `${label} ${next.right}`;
    let detail: string | null = null;
    if (urgency.decidedBy === "date") {
      const target = parseDocDate(service.nextServiceDate);
      if (target) detail = urgency.overdue ? `Trebuia pe ${roDate(target)}` : weekdayDate(target);
    } else if (service.nextServiceOdometer !== undefined) {
      detail = `La ${roNumber(service.nextServiceOdometer)} km`;
    }
    return { title, detail, doc: null, service, itemId: service.id, overdueKm: urgency.decidedBy === "km" && urgency.overdue && urgency.remainingKm !== null ? Math.round(-urgency.remainingKm) : null };
  }, [next, carData, odometer]);

  /** "Am rezolvat" -> the full app's resolve path (resolveFromSummary):
   * a document renews, a service is re-logged today. The ActionItem is
   * built from the saved item itself (falling back to the entry's own
   * mapping if the fetch fails). */
  const resolve = async () => {
    if (!hero || busy) return;
    setBusy(true);
    try {
      let item: ActionItem;
      if (hero.doc) {
        const doc = hero.doc;
        const raw: any = await api.getItem(doc.id).catch(() => null);
        const body = documentEntryToItemBody(space.id, doc);
        const meta = raw?.metadata ?? body.metadata;
        const expiry = parseDocDate(meta?.expiryDate ?? doc.expiryDate);
        item = {
          id: doc.id,
          type: "car_document",
          title: raw?.title ?? doc.title,
          due_at: (expiry ?? new Date()).toISOString(),
          amount: raw ? raw.amount : body.amount,
          recurrence: null,
          metadata: meta,
          space: { id: space.id },
        };
      } else {
        const service = hero.service!;
        const raw: any = await api.getItem(service.id).catch(() => null);
        const body = maintenanceEntryToItemBody(space.id, service);
        item = {
          id: service.id,
          type: "car_maintenance",
          title: raw?.title ?? service.service,
          // The service's own date: itemActions derives the day interval
          // to the next service from it.
          due_at: raw?.due_at ?? service.date,
          amount: raw ? raw.amount : body.amount,
          recurrence: null,
          metadata: raw?.metadata ?? body.metadata,
          space: { id: space.id },
          current_odometer: odometer > 0 ? odometer : null,
          overdue_km: hero.overdueKm ?? null,
        };
      }
      const changed = await resolveFromSummary(item, (href) => router.push(href as any));
      // [id].tsx reloads on REFRESH_EVENT (= onChanged), and so do Acasă/Calendar.
      if (changed) DeviceEventEmitter.emit(REFRESH_EVENT);
    } finally {
      setBusy(false);
    }
  };

  // One row per current document type: not archived, not replaced by a
  // newer one of the same type. Soonest expiry first.
  const documents = useMemo(() => {
    const seen = new Set<string>();
    return carData.documentEntries
      .filter((d) => !d.archived && !isDocumentSuperseded(d, carData.documentEntries))
      .map((d) => ({ doc: d, ...getDocumentStatus(d), expiry: parseDocDate(d.expiryDate) }))
      .sort((a, b) => (a.expiry?.getTime() ?? Infinity) - (b.expiry?.getTime() ?? Infinity))
      .filter(({ doc }) => {
        const key = DOC_TYPE_LABEL[doc.documentType] ? doc.documentType : `title:${doc.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [carData.documentEntries]);

  // Spend by month (user decision 2026-10-15): this month and the 2 before
  // it, stepped with ‹ › on the card -- older history and filters stay in
  // Complet. Same sources as the full dashboard's top card
  // (getThisMonthExpenses: fuel, services, priced documents, expenses), so
  // the current month's total is unchanged.
  const history = useHistoryMonth();
  const recentSpend = useMemo(() => {
    const rows: { id: string; itemId: string; what: string; date: string; amount: number }[] = [];
    carData.fuelEntries.forEach((e) => rows.push({ id: `f-${e.id}`, itemId: e.id, what: "Alimentare", date: e.date, amount: e.total_paid ?? 0 }));
    carData.maintenanceEntries.forEach((e) => rows.push({ id: `m-${e.id}`, itemId: e.id, what: maintenanceLabel(e.service), date: e.date, amount: e.price }));
    carData.documentEntries.forEach((e) => rows.push({ id: `d-${e.id}`, itemId: e.id, what: docName(e), date: e.date, amount: e.price ?? 0 }));
    carData.expenseEntries.forEach((e) => rows.push({ id: `e-${e.id}`, itemId: e.id, what: e.title, date: e.date, amount: e.amount }));
    return rows
      .filter((r) => r.amount > 0 && history.inMonth(r.date))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    // history.inMonth changes with the month shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carData, history.month]);
  const monthTotal = recentSpend.reduce((sum, r) => sum + r.amount, 0);
  const spendRows = useShowAll(recentSpend, 3, history.offset);

  return (
    <SimplePage
      title={space.name}
      subtitle={subtitle}
      onBack={onBack}
      onRefresh={onChanged}
      onEdit={() => setEditOpen(true)}
      editLabel="Editează mașina: nume și kilometraj"
      testID="simple-car-space"
    >
      {hero ? (
        <SimpleHero
          c={c}
          kicker="Următorul lucru important"
          title={hero.title}
          detail={hero.detail}
          urgency={next?.urgencyTier ? { label: next.right ?? "", color: urgencyTierColor(next.urgencyTier, colors), overdue: !!next.overdue } : null}
          onAction={resolve} onPress={() => openEditRecord(hero.itemId)} busy={busy} testID="simple-car-hero" />
      ) : (
        <SimpleHero c={c} kicker="Următorul lucru important" title="Totul e la zi" detail="Niciun document sau service nu e aproape." testID="simple-car-hero" />
      )}

      <SimpleCard title="Documente" testID="simple-car-docs">
        {documents.length === 0 ? (
          <CalmLine text="Niciun document încă. Adaugă cu + de jos." />
        ) : (
          documents.map(({ doc, status, expiry }) => {
            // Complet's bands (CarDashboard): 45-31 days yellow, 30-16
            // orange, 15 or less / expired red; green further out.
            const tier = getDocumentUrgencyTier(doc);
            const tone = tier ? urgencyTierColor(tier, colors) : status === "valid" ? colors.success : colors.onSurfaceTertiary;
            const right = !expiry
              ? "fără expirare"
              : status === "expired" || status === "expiring_soon"
                ? expiryText(expiry) // "expiră azi" / "expiră mâine" / "expiră pe 21 oct."
                : `până pe ${roDate(expiry, { short: true })}`;
            return (
              <DotLine
                key={doc.id}
                dot={tone}
                name={docName(doc)}
                right={right}
                rightColor={tier ? tone : colors.onSurfaceTertiary}
                onPress={() => openEditRecord(doc.id)}
              />
            );
          })
        )}
      </SimpleCard>

      <SimpleCard
        title={history.title}
        badge={<HistoryMonthBadge history={history} total={monthTotal > 0 ? lei(monthTotal) : null} testIDPrefix="simple-car-month" />}
        testID="simple-car-month"
      >
        {recentSpend.length === 0 ? (
          <CalmLine text={history.emptyText} />
        ) : (
          spendRows.visible.map((r) => (
            <SpendLine
              key={r.id}
              what={r.what}
              when={roDate(r.date, { short: true })}
              amount={lei(r.amount)}
              onPress={() => openEditRecord(r.itemId)}
              onDelete={() => deleteRecordWithConfirm(r.itemId, r.what, onChanged)}
            />
          ))
        )}
        <ShowAllLine more={spendRows.more} testID="simple-car-month-all" />
      </SimpleCard>

      <CarProfileForm
        visible={editOpen}
        mode="edit"
        space={space}
        initialProfile={(profile as CarProfile | null) ?? null}
        odometer={{ current: odometer, minLogged: getLoggedOdometer(carData) }}
        onClose={() => setEditOpen(false)}
        // [id].tsx reloads the space, profile and km (name in the header,
        // km in the subtitle) -- and Acasă / the "+" cache follow.
        onSaved={() => {
          onChanged();
          DeviceEventEmitter.emit(REFRESH_EVENT);
        }}
      />

      <TeaserCard testID="simple-car-teaser" title="Consum și cost pe km" subtitle="Le calculăm din plinurile tale, în Complet." />
    </SimplePage>
  );
}
