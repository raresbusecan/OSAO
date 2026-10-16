import React from "react";
import type { SpaceKind, SpaceProfile } from "@/lib/spaces/spaceProfile";
import type { CarData } from "@/components/spaces/car/car.data.types";
import type { HomeData } from "@/components/spaces/home/home.data.types";
import type { ExpensesData } from "@/components/spaces/expenses/expenses.data.types";
import type { ExpenseEntry } from "@/lib/spaces/expenses/expenses.types";
import { SimpleCarSpace } from "./SimpleCarSpace";
import { SimpleHomeSpace } from "./SimpleHomeSpace";
import { SimpleGrocerySpace } from "./SimpleGrocerySpace";
import { SimpleExpensesSpace } from "./SimpleExpensesSpace";
import { CalmLine, SimpleCard, SimplePage, useSimpleSpaceColors, useSpaceAccent } from "./SimpleSpaceParts";

/** Everything [id].tsx already loaded for this space, handed to the Simplu screen. */
export type SimpleSpaceProps = {
  space: any;
  kind: SpaceKind;
  profile: SpaceProfile | null;
  carData: CarData;
  homeData: HomeData;
  expensesData: ExpensesData;
  calendarPurchases: ExpenseEntry[];
  /** Re-runs [id].tsx's load() (after a resolve / save). */
  onChanged: () => void;
  onBack: () => void;
};

/**
 * orgOS Simplu: one small screen per space kind (components/simple/space/
 * Simple<Kind>Space.tsx; shared parts in SimpleSpaceParts.tsx). Rendered
 * by app/(tabs)/[id].tsx when the app is in simple mode and no ?itemId
 * deep link asks for the full dashboard.
 */
export function SimpleSpaceScreen(props: SimpleSpaceProps) {
  switch (props.kind) {
    case "car":
      return <SimpleCarSpace {...props} />;
    case "home":
      return <SimpleHomeSpace {...props} />;
    case "grocery":
      return <SimpleGrocerySpace {...props} />;
    case "expenses":
      return <SimpleExpensesSpace {...props} />;
    default:
      return <SimpleOtherSpace {...props} />;
  }
}

/** A space of no known kind (legacy rows): just its name. */
function SimpleOtherSpace({ space, kind, onChanged, onBack }: SimpleSpaceProps) {
  const c = useSimpleSpaceColors(space, kind);
  useSpaceAccent(space, c);
  return (
    <SimplePage title={space?.name ?? ""} onBack={onBack} onRefresh={onChanged}>
      <SimpleCard title="Nimic de arătat aici">
        <CalmLine text="Spațiul acesta se vede complet în orgOS Complet." />
      </SimpleCard>
    </SimplePage>
  );
}
