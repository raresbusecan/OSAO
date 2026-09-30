import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const TOKEN_KEY = "lifeos_token";

// Web fallback because expo-secure-store isn't supported on web preview
async function setToken(token: string) {
  console.log("[AUTH] setToken called:", token ? `${token.slice(0, 3)}...` : "EMPTY");

  if (Platform.OS === "web") {
    try {
      localStorage.setItem(TOKEN_KEY, token);

      console.log(
        "[AUTH] token saved:",
        localStorage.getItem(TOKEN_KEY) ? "YES" : "NO",
      );
    } catch (error) {
      console.error("[AUTH] failed to save token:", error);
      throw error;
    }

    return;
  }

  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken() {
  if (Platform.OS === "web") {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
    return;
  }

  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

async function request<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    // localtunnel (loca.lt) injects an HTML "click to continue" interstitial
    // in front of every request unless this header is present -- without it,
    // API calls over the tunnel get HTML back instead of JSON. Harmless when
    // hitting the backend directly (ignored).
    "Bypass-Tunnel-Reminder": "true",
    // Read fresh on every request (not cached at module load) so it
    // self-corrects immediately if the device's own timezone changes
    // mid-session (travel), instead of only on next app restart. The
    // backend's SyncUserTimezone middleware persists this onto the
    // user's own record -- see CalendarController for where it's read
    // back, so Calendar buckets a day the same way the user's own
    // device would, not UTC.
    "X-Timezone": getDeviceTimezone(),
    ...(init.headers as Record<string, string> | undefined),
  };

  if (token) {
  headers.Authorization = `Bearer ${token}`;

  console.log("[API REQUEST]", {
    method: init.method ?? "GET",
    path,
    hasToken: true,
    authorization: `Bearer ${token.slice(0, 3)}...`,
  });
} else {
  console.log("[API REQUEST]", {
    method: init.method ?? "GET",
    path,
    hasToken: false,
  });
}

  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers,
  });

  const text = await res.text();

  let body: any = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const msg =
      // Laravel's raw throttle message ("Too Many Attempts.") reads as
      // a system error, not guidance -- most jarring on a flow someone
      // is already frustrated in (e.g. recovering a forgotten
      // password after a couple of failed logins). English to match
      // every other string in the auth screens that surface it (the
      // app's mixed-language copy elsewhere is a known, separate
      // issue -- not one to add to here).
      (res.status === 429 && "Too many attempts. Please wait a minute and try again.") ||
      body?.message ||
      body?.error ||
      body?.errors ||
      `Request failed (${res.status})`;

    const err = new Error(
      typeof msg === "string" ? msg : JSON.stringify(msg),
    ) as Error & { status?: number };
    // Carried so callers (see providers/auth.tsx) can tell "the server said
    // this token is invalid" (401) apart from "the request didn't make it"
    // (a flaky tunnel/network hiccup, no status at all) -- those need very
    // different handling, and before this only the message string survived.
    err.status = res.status;
    throw err;
  }

  return body as T;
}

export const api = {
  // -------------------------
  // AUTH
  // -------------------------

  register: async (
    email: string,
    password: string,
    name: string,
  ) => {
    const r = await request<{
      message: string;
      user: any;
      token: string;
    }>("/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        password_confirmation: password,
        name,
      }),
    });

    await setToken(r.token);

    return r;
  },

  login: async (email: string, password: string) => {
    const r = await request<{
      message: string;
      user: any;
      token: string;
    }>("/login", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
      }),
    });

    await setToken(r.token);

    return r;
  },

  // Always resolves with the same generic message the backend returns
  // (whether or not the email matches a real account) -- never throws
  // just because the email doesn't exist, so the UI can't be used to
  // probe which emails have accounts.
  forgotPassword: async (email: string) => {
    return request<{ message: string }>("/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  resetPassword: async (
    email: string,
    token: string,
    password: string,
  ) => {
    return request<{ message: string }>("/reset-password", {
      method: "POST",
      body: JSON.stringify({
        email,
        token,
        password,
        password_confirmation: password,
      }),
    });
  },

  updateName: async (name: string) => {
    return request<{ message: string; user: { id: number; name: string; email: string } }>("/profile/name", {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
  },

  updatePassword: async (currentPassword: string, password: string) => {
    return request<{ message: string }>("/profile/password", {
      method: "PUT",
      body: JSON.stringify({
        current_password: currentPassword,
        password,
        password_confirmation: password,
      }),
    });
  },

  requestEmailChange: async (email: string, currentPassword: string) => {
    return request<{ message: string }>("/profile/email", {
      method: "PUT",
      body: JSON.stringify({ email, current_password: currentPassword }),
    });
  },

  confirmEmailChange: async (email: string, token: string) => {
    return request<{ message: string; email: string }>("/confirm-email", {
      method: "POST",
      body: JSON.stringify({ email, token }),
    });
  },

  // AuthController::user() wraps its response as { user: {...} } (same
  // shape login/register's own 'user' field has) -- unwrap it here so
  // every caller gets the actual user object back, not the envelope.
  // Before this, providers/auth.tsx's `setUser(await api.me())` on an
  // app boot with an existing token (any session that isn't a fresh
  // login/register, which already unwraps via `r.user`) stored the
  // WHOLE { user: {...} } envelope as `user` -- so `user.id` silently
  // read as `undefined` for the rest of the app, everywhere (Grocery's
  // "is this me" checks included), until the next fresh login.
  me: async () => {
    const r = await request<{ user: { id: number; name: string; email: string; created_at: string } }>("/user");
    return r.user;
  },

  dashboard: () =>
    request<{
      today: any[];
      upcoming: any[];
      overdue: any[];
      // Real "this month" spend across Car + Home (see
      // Item::SPENDING_TYPES on the backend) -- replaces what used to be
      // a frontend-only mock sum. A space with nothing this month is
      // simply absent from `sources`, not listed at 0.
      monthlyExpenses: {
        total: number;
        sources: { spaceName: string; icon: string; amount: number }[];
      };
    }>("/dashboard"),

  // Grouped by day ('YYYY-MM-DD') for the given month ('YYYY-MM') --
  // everything with a due_at the caller can see (own items + items in any
  // space they're accessible in). See CalendarController::index.
  calendar: (month: string) =>
    request<{ days: Record<string, any[]>; recurring: any[] }>(`/calendar?month=${month}`),

  logout: async () => {
    try {
      await request("/logout", {
        method: "POST",
      });
    } finally {
      await clearToken();
    }
  },

  // -------------------------
  // SPACES
  // -------------------------

 listSpaces: async () => {
  const result = await request<{ spaces: any[] }>("/spaces");
  return result;
},

/** Persists a drag-to-reorder on the Spaces tab -- `order` is the full
 * list of visible space ids in their new display order. */
reorderSpaces: (order: (string | number)[]) =>
  request("/spaces/reorder", {
    method: "PATCH",
    body: JSON.stringify({ order }),
  }),

createSpace: (body: {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  /** Fixed permanently at creation -- see spaceProfile.ts's
   * detectSpaceType, which reads this first (before name/icon) so
   * renaming a space later can never change what kind it is. */
  type?: string;
}) =>
  request("/spaces", {
    method: "POST",
    body: JSON.stringify(body),
  }),

getSpace: async (id: string | number) => {
  const result = await request<{ space: any }>(`/spaces/${id}`);
  return result.space;
},

updateSpace: (
  id: string | number,
  body: {
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
  },
) =>
  request(`/spaces/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  }),

deleteSpace: (id: string | number) =>
  request(`/spaces/${id}`, {
    method: "DELETE",
  }),

saveCarProfile: (
  spaceId: string | number,
  body: {
    make: string;
    model: string;
    color?: string | null;
    year: number;
    purchase_price: number;
    tank_capacity: number;
  },
) =>
  request(`/spaces/${spaceId}/car-profile`, {
    method: "PUT",
    body: JSON.stringify(body),
  }),

saveHomeProfile: (
  spaceId: string | number,
  body: {
    county: string;
    city: string;
    ownership: "bought" | "inherited";
    purchase_price?: number | null;
  },
) =>
  request(`/spaces/${spaceId}/home-profile`, {
    method: "PUT",
    body: JSON.stringify(body),
  }),

  // -------------------------
  // SPACE MEMBERS -- sharing a space with other accounts. Either the
  // owner or a member can list who's in it; only the owner can add or
  // remove someone (enforced server-side, see SpaceController).
  //
  // Deliberately unused by any screen right now -- confirmed with the
  // product owner (2026-09) that multi-user sharing stays Grocery-only
  // for the foreseeable future (see LIST MEMBERS below, which IS wired
  // up). Kept here rather than deleted because the backend route/logic
  // is real and tested, not a stub -- Car/Home/Expenses sharing is a
  // deliberately deferred feature, not dead code to clean up.
  // -------------------------

  getSpaceMembers: (spaceId: string | number) =>
    request<{
      owner: { id: number; name: string; email: string };
      members: { id: number; name: string; email: string }[];
    }>(`/spaces/${spaceId}/members`),

  addSpaceMember: (spaceId: string | number, email: string) =>
    request<{ message: string; member: { id: number; name: string; email: string } }>(
      `/spaces/${spaceId}/members`,
      {
        method: "POST",
        body: JSON.stringify({ email }),
      },
    ),

  removeSpaceMember: (spaceId: string | number, userId: string | number) =>
    request(`/spaces/${spaceId}/members/${userId}`, {
      method: "DELETE",
    }),

  // -------------------------
  // LIST MEMBERS -- sharing ONE grocery list (an item with
  // type='grocery_list') rather than the whole space it lives in. The
  // space owner always sees every list in their own space; adding
  // someone here is what lets a non-owner see this one list at all
  // (see ItemController::canAccessList on the backend).
  // -------------------------

  getListMembers: (listItemId: string | number) =>
    request<{
      owner: { id: number; name: string; email: string };
      members: { id: number; name: string; email: string }[];
    }>(`/items/${listItemId}/members`),

  addListMember: (listItemId: string | number, email: string) =>
    request<{ message: string; member: { id: number; name: string; email: string } }>(
      `/items/${listItemId}/members`,
      {
        method: "POST",
        body: JSON.stringify({ email }),
      },
    ),

  /** removeItems decides what happens to the products this person added
   * on this list -- true deletes them along with the person, false (the
   * default) leaves them on the list with their tag cleared instead of
   * pointing at someone who can no longer see it (see
   * ItemController::removeMember). The response's affected_item_ids is
   * exactly what changed, so the caller can update local state without
   * a full reload. */
  removeListMember: (listItemId: string | number, userId: string | number, removeItems: boolean = false) =>
    request<{ message: string; affected_item_ids: number[]; items_deleted: boolean }>(
      `/items/${listItemId}/members/${userId}`,
      {
        method: "DELETE",
        body: JSON.stringify({ remove_items: removeItems }),
      },
    ),

  // Everything Grocery's Home shows for the given Grocery space -- that
  // space's own lists, plus any list shared with the user from anywhere
  // (see ItemController::myGrocery). Sharing is a state on the list,
  // never a different space to visit. spaceId is required now -- without
  // it, a user with more than one Grocery space saw every space's lists
  // merged together the moment they opened any one of them.
  getMyGroceryData: (spaceId: string | number) =>
    request<{ lists: any[]; items: any[] }>(`/grocery/mine?space_id=${spaceId}`),

  // -------------------------
  // ITEMS
  // -------------------------

  listItems: (params?: {
    type?: string;
    space_id?: string | number;
  }) => {
    const q = new URLSearchParams();

    if (params?.type) {
      q.set("type", params.type);
    }

    if (params?.space_id !== undefined) {
      q.set("space_id", String(params.space_id));
    }

    const qs = q.toString();

    return request<any[]>(
      `/items${qs ? `?${qs}` : ""}`,
    );
  },

  getItem: (id: string | number) =>
    request(`/items/${id}`),

  createItem: (body: any) =>
    request("/items", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateItem: (id: string | number, body: any) =>
    request(`/items/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  deleteItem: (id: string | number) =>
    request(`/items/${id}`, {
      method: "DELETE",
    }),

  /** Persists a drag-to-reorder for one list's items (a category list
   * within a space, or one grocery list's products) -- `order` is the
   * full set of ids in that one list, in their new display order. */
  reorderItems: (order: (string | number)[]) =>
    request("/items/reorder", {
      method: "PATCH",
      body: JSON.stringify({ order }),
    }),

  // -------------------------
  // BUDGET -- category spending limits, recurring bills, savings goal.
  // See BudgetController.
  // -------------------------

  getBudget: () =>
    request<{
      limits: { category: string; monthly_limit: number; spent: number }[];
      spending: Record<string, { this_month: number; last_month: number; avg_last_3_months: number }>;
      biggest: Record<string, { title: string; amount: number; from_last_month: boolean } | null>;
      recurring: Record<string, number>;
      recurringBills: any[];
      savingsGoal: { target_amount: number; current_amount: number; target_date: string | null } | null;
    }>("/budget"),

  saveBudgetLimit: (body: { category: string; monthly_limit: number }) =>
    request("/budget/limits", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  deleteBudgetLimit: (category: string) =>
    request(`/budget/limits/${encodeURIComponent(category)}`, {
      method: "DELETE",
    }),

  getBudgetSpaceDetail: (category: string) =>
    request<{
      category: string;
      months: { year: number; month: number; label: string; total: number }[];
      items: { id: number | string; type: string; title: string; amount: number | null; currency: string | null; due_at: string | null }[];
      recurring_monthly: number;
    }>(`/budget/spaces/${encodeURIComponent(category)}`),

  saveSavingsGoal: (body: { target_amount: number; current_amount: number; target_date?: string | null }) =>
    request("/budget/savings-goal", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  getBudgetArchive: () =>
    request<{
      months: {
        month: string;
        label: string;
        total_spent: number;
        total_budget: number;
        total_diff: number | null;
        categories: { category: string; budget_limit: number | null; spent: number; diff: number | null }[];
      }[];
    }>("/budget/archive"),

  // -------------------------
  // QUICK ADD
  // -------------------------

  quickAdd: (text: string) => request("/quick-add", {
    method: "POST",
    body: JSON.stringify({ text }),
  }),

  // -------------------------
  // GROCERY -- INGREDIENT REFERENCES
  // -------------------------

  getIngredientReferences: () =>
    request<
      { id: number; name: string; category: string; aliases: string[] | null }[]
    >("/ingredient-references"),

  // -------------------------
  // GROCERY -- RECIPES
  // -------------------------

  listRecipes: () =>
    request<
      {
        id: number;
        user_id: number | null;
        title: string;
        image_key: string | null;
        time_minutes: number | null;
        difficulty: string | null;
        steps: string[] | null;
        tags: string[] | null;
        ingredients: { id: number; name: string; quantity: string | null; sort_order: number }[];
      }[]
    >("/recipes"),
};