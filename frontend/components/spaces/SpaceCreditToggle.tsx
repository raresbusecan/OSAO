import React, { useCallback, useState } from "react";
import { notifyAction } from "@/lib/confirm";
import { refreshBudgetPlan } from "@/lib/budget/plan";
import { useSpaceColors } from "@/lib/spaces/spaceTheme";
import { ToggleRow } from "@/components/ui/primitives";
import {
  CreditFields,
  creditDraftError,
  creditDraftToApi,
  emptyCreditDraft,
  type CreditDraft,
} from "@/components/spaces/expenses/CreditFields";

/**
 * "În rate" on the car/home CREATE forms: the space was bought on credit.
 * When on, the credit fields (same as Cheltuieli › Credite) unfold and the
 * credit goes to POST /spaces as `credit` -- the server files it in the
 * first Cheltuieli space (or a new "Default"), linked to the new space.
 * Editing a space never shows this; credits are edited from Cheltuieli.
 */
export function useSpaceCredit(autoTitle: string) {
  const [on, setOn] = useState(false);
  const [raw, setRaw] = useState<CreditDraft>(() => emptyCreditDraft());
  // Until the user edits the name it follows the space ("Leasing BMW").
  const [titleTouched, setTitleTouched] = useState(false);

  const draft: CreditDraft = titleTouched ? raw : { ...raw, title: autoTitle };
  const error = on ? creditDraftError(draft) : null;

  const setDraft = (next: CreditDraft) => {
    if (next.title !== draft.title) setTitleTouched(true);
    setRaw(next);
  };

  const reset = useCallback(() => {
    setOn(false);
    setRaw(emptyCreditDraft());
    setTitleTouched(false);
  }, []);

  return {
    on,
    setOn,
    draft,
    setDraft,
    /** The first problem while "În rate" is on, else null. */
    error,
    reset,
    /** POST /spaces' `credit`, or undefined when off. */
    apiBody: on ? creditDraftToApi(draft) : undefined,
  };
}

export type SpaceCredit = ReturnType<typeof useSpaceCredit>;

export function SpaceCreditToggle({ kind, credit }: { kind: "car" | "home"; credit: SpaceCredit }) {
  const spaceColors = useSpaceColors(kind);
  const tone = spaceColors.color;
  return (
    <>
      <ToggleRow
        testID={`${kind}-credit-toggle`}
        icon="card-outline"
        label="În rate"
        hint="Rata lunară se trece în Cheltuieli, la Credite."
        value={credit.on}
        onChange={credit.setOn}
        tone={tone}
      />
      {credit.on ? (
        <CreditFields
          draft={credit.draft}
          onChange={credit.setDraft}
          tone={tone}
          fill={spaceColors.fill}
          onTone={spaceColors.ink}
          testIDPrefix={`${kind}-credit`}
          namePlaceholder={kind === "car" ? "ex. Leasing BMW" : "ex. Credit ipotecar"}
        />
      ) : null}
    </>
  );
}

/** After POST /spaces with a credit went through: refresh the /budget
 * cache (Buget's Credit jar, LinkedCreditsLine) and say so when a
 * "Default" Cheltuieli space had to be created for it. */
export function afterSpaceCreditSaved(created: { credit?: any; expenses_space_created?: boolean } | null | undefined) {
  if (!created?.credit) return;
  refreshBudgetPlan();
  if (created.expenses_space_created) {
    notifyAction("Rata e în Cheltuieli", "Am creat spațiul Cheltuieli „Default” pentru rata ta.");
  }
}
