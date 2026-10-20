import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { currentLanguage } from "@/lib/i18n";
import { resetSessionCaches, sessionVersion } from "@/lib/sessionCache";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
/** The backend origin (no /api) -- social login opens `${BACKEND_URL}/auth/<provider>/redirect` in a browser. */
export const BACKEND_URL = BASE;
const TOKEN_KEY = "lifeos_token";
let tokenWrites: Promise<void> = Promise.resolve();
let tokenWriteVersion = 0;

function queueTokenMutation(mutate: () => void | Promise<void>): Promise<boolean> {
  const operation = ++tokenWriteVersion;
  resetSessionCaches();
  const pending = tokenWrites.then(mutate);
  // A failed storage operation must not prevent subsequent sign-ins.
  tokenWrites = pending.catch(() => {});
  return pending.then(() => operation === tokenWriteVersion);
}

// Web fallback because expo-secure-store isn't supported on web preview
export async function setToken(token: string) {
  console.log("[AUTH] setToken called:", token ? `${token.slice(0, 3)}...` : "EMPTY");

  const current = await queueTokenMutation(async () => {
    if (Platform.OS === "web") {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    }
  });
  if (!current) {
    throw Object.assign(new Error("Sesiunea s-a schimbat. Reîncearcă."), { code: "SESSION_CHANGED" });
  }
}

export async function getToken(): Promise<string | null> {
  await tokenWrites;
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
  return queueTokenMutation(async () => {
    if (Platform.OS === "web") {
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {}
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  });
}

function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export type ApiError = Error & { status?: number; body?: any };

/** The most specific human message in an API error: the first
 * errors.<field>[0] of a 422 when `field` is given, else the server's
 * own message, else `fallback`. Server messages are Romanian already. */
export function apiErrorMessage(e: any, fallback: string, field?: string): string {
  const fieldMsg = field ? e?.body?.errors?.[field]?.[0] : null;
  return (typeof fieldMsg === "string" && fieldMsg) || (typeof e?.message === "string" && e.message && !/^Request failed|^Cererea nu a reușit|^Network request failed|^Failed to fetch/i.test(e.message) ? e.message : null) || fallback;
}

async function request<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const version = sessionVersion();
  const token = await getToken();
  const requireCurrentSession = () => {
    if (version !== sessionVersion()) throw Object.assign(new Error("Sesiunea s-a schimbat. Reîncearcă."), { code: "SESSION_CHANGED" });
  };
  requireCurrentSession();

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    // localtunnel (loca.lt) injects an HTML "click to continue" interstitial
    // in front of every request unless this header is present -- without it,
    // API calls over the tunnel get HTML back instead of JSON. Harmless when
    // hitting the backend directly (ignored).
    "Bypass-Tunnel-Reminder": "true",
    // Same for ngrok's free domains (the dev backend's fixed URL): skips
    // the "You are about to visit" browser-warning page. Ignored elsewhere.
    "ngrok-skip-browser-warning": "1",
    // Read fresh on every request (not cached at module load) so it
    // self-corrects immediately if the device's own timezone changes
    // mid-session (travel), instead of only on next app restart. The
    // backend's SyncUserTimezone middleware persists this onto the
    // user's own record -- see CalendarController for where it's read
    // back, so Calendar buckets a day the same way the user's own
    // device would, not UTC.
    "X-Timezone": getDeviceTimezone(),
    // The app's language (lib/i18n): the backend's SetLocale middleware
    // answers validation / error messages in it.
    "Accept-Language": currentLanguage(),
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
  requireCurrentSession();

  let body: any = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    // Laravel's default throttle body ("Too Many Attempts.") reads as a
    // system error, not guidance -- replaced with Romanian. A limiter
    // that sends its own message (e.g. 'verification-notification',
    // Romanian + retry_after) is passed through as-is.
    const throttleDefault =
      res.status === 429 && (!body?.message || /^too many attempts/i.test(String(body.message)));
    const msg =
      (throttleDefault && "Prea multe încercări. Așteaptă un minut și încearcă din nou.") ||
      body?.message ||
      body?.error ||
      body?.errors ||
      `Cererea nu a reușit (${res.status}). Încearcă din nou.`;

    const err = new Error(
      typeof msg === "string" ? msg : JSON.stringify(msg),
    ) as ApiError;
    // Carried so callers (see providers/auth.tsx) can tell "the server said
    // this token is invalid" (401) apart from "the request didn't make it"
    // (a flaky tunnel/network hiccup, no status at all) -- those need very
    // different handling, and before this only the message string survived.
    err.status = res.status;
    // The parsed JSON body, for callers that need more than the message
    // (a 422's errors.<field>[0], a 429's retry_after).
    err.body = body;
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

  // Registration email verification -- the token comes from the link in
  // VerifyEmailNotification (opened as /verify-email?token&email). Public:
  // the token is the proof, not a session. 422 errors.token[0] =
  // invalid/used or expired (Romanian).
  verifyEmail: async (email: string, token: string, password: string) => {
    return request<{ message: string; email_verified_at: string }>("/email/verify", {
      method: "POST",
      body: JSON.stringify({ email, token, password, password_confirmation: password }),
    });
  },

  // "Retrimite emailul" (unverified banner). Auth'd. already_verified:true
  // = verified elsewhere meanwhile -- refresh the user. 429 carries
  // body.retry_after (seconds); 503 = mail could not be sent.
  resendVerification: async () => {
    return request<{ message: string; already_verified: boolean }>("/email/verification-notification", {
      method: "POST",
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
    const r = await request<{ user: { id: number; name: string; email: string; created_at: string; email_verified_at: string | null; providers?: string[]; has_password?: boolean; tours?: Record<string, { status: "done" | "skipped"; v: number; at?: string }> | null } }>("/user");
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
      /** Grocery items not yet in the cart, per space id. */
      toBuy?: Record<string, number>;
      /** Items to buy per shopping list, with the list's own title. */
      toBuyLists?: { list_id: string; space_id: number | string; title: string; count: number; items: { title: string; quantity: string | null }[] }[];
      /** Casă supplies probably running out, per space id. */
      lowSupplies?: Record<string, number>;
      /** One line of facts per car (Acasă's car card). */
      cars?: {
        space_id: number | string;
        name: string;
        odometer: number | null;
        next_service: { title: string; at_km: number; km_left: number } | null;
        next_document: { title: string; expiry: string } | null;
      }[];
    }>("/dashboard"),

  // The Acasă card arrangement (lib/dashboard/layout.ts) -- null = never
  // customized, show the default.
  getDashboardLayout: () => request<{ layout: unknown }>("/dashboard/layout"),
  saveDashboardLayout: (layout: unknown[] | null) =>
    request<{ layout: unknown }>("/dashboard/layout", { method: "PUT", body: JSON.stringify({ layout }) }),

  // First-use tours (lib/tours.ts): which guide this user finished or
  // skipped. Both answer the whole map; callers merge it into the auth
  // user (useAuth().updateUser({ tours })).
  markTour: (key: string, status: "done" | "skipped", version: number) =>
    request<{ tours: Record<string, { status: "done" | "skipped"; v: number; at: string }> }>(`/user/tours/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify({ status, version }),
    }),
  resetTours: () => request<{ tours: Record<string, never> }>("/user/tours", { method: "DELETE" }),

  // Grouped by day ('YYYY-MM-DD') for the given month ('YYYY-MM') --
  // everything with a due_at the caller can see (own items + items in any
  // space they're accessible in). See CalendarController::index.
  calendar: (month: string) =>
    request<{ days: Record<string, any[]>; recurring: any[] }>(`/calendar?month=${month}`),
  // Every occurrence of a Calendar event with "Implică o cumpărare", up to
  // the end of this month; `planned` = its day hasn't come yet. The
  // Cheltuieli space lists them so its totals match Buget's (EventSpend).
  calendarPurchases: () =>
    request<{ purchases: { id: number; title: string; amount: number; due_at: string; planned: boolean; recurrence: string | null }[] }>("/calendar/purchases"),

  // Social login (lib/socialAuth.ts). None of these store the token --
  // the caller hands { user, token } to useAuth().signInWithToken.
  // GET /auth/providers: which provider buttons to show (Google/Facebook
  // are hidden until their credentials are configured on the server).
  authProviders: () =>
    request<{ apple: boolean; google: boolean; facebook: boolean }>("/auth/providers"),

  // Sign in with Apple: the identity token from expo-apple-authentication;
  // full_name only on the first authorization (Apple never sends it again).
  // created = a new orgOS account was made just now.
  authApple: (identityToken: string, nonce: string, fullName?: { given?: string | null; family?: string | null } | null) =>
    request<{ user: any; token: string; created: boolean }>("/auth/apple", {
      method: "POST",
      body: JSON.stringify({ identity_token: identityToken, nonce, ...(fullName ? { full_name: fullName } : {}) }),
    }),

  // One-time nonce for the next Apple sign-in (replay protection): passed
  // raw to AppleAuthentication.signInAsync and back to POST /auth/apple.
  authAppleNonce: () =>
    request<{ nonce: string }>("/auth/apple/nonce", { method: "POST" }),

  // Social-only account (user.has_password === false): set a first
  // password, no current password needed.
  setPassword: (password: string, confirmation: string) =>
    request<{ message: string }>("/profile/password/set", {
      method: "POST",
      body: JSON.stringify({ password, password_confirmation: confirmation }),
    }),

  // Google/Facebook: the one-time code the backend's /auth/<p>/callback
  // put on the app deep link (single use, ~2 minutes).
  authExchange: (code: string) =>
    request<{ user: any; token: string; created: boolean }>("/auth/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  logout: async () => {
    const version = sessionVersion();
    try {
      await request("/logout", {
        method: "POST",
      });
    } catch {}
    // A slow logout must never clear credentials from a newer sign-in.
    if (version !== sessionVersion()) return false;
    return clearToken();
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
  /** A SPACE_PALETTE key (lib/spaces/spaceProfile.ts); null = kind default. */
  color?: string | null;
  /** Fixed permanently at creation -- see spaceProfile.ts's
   * detectSpaceType, which reads this first (before name/icon) so
   * renaming a space later can never change what kind it is. */
  type?: string;
  /** Car/home only: bought "în rate". The server creates the space, finds
   * the first Cheltuieli space (or creates one named "Default") and adds
   * this expense_credit linked to the new space -- all in one transaction
   * (422 `errors["credit.*"]` and nothing created on a bad credit). */
  credit?: { title: string; amount: number; day_of_month: number; end_date: string };
  /** Car/home: the profile, same body as saveCarProfile/saveHomeProfile
   * (carProfileToApiBody/homeProfileToApiBody), created in the SAME
   * transaction -- a bad profile 422s (`errors["profile.<field>"]`) and
   * leaves no space behind. Edits still go through save*Profile. */
  profile?: Record<string, unknown>;
}) =>
  request<{
    space: any;
    /** Only when `profile` was sent. */
    profile?: any;
    /** Only when `credit` was sent. */
    credit?: any;
    expenses_space?: any;
    expenses_space_created?: boolean;
  }>("/spaces", {
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
    /** A SPACE_PALETTE key; null = back to the kind default. */
    color?: string | null;
  },
) =>
  request<{ space: any }>(`/spaces/${id}`, {
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

/** The km typed on the Mașină top card. 422 {message, errors.odometer}
 * (Romanian) when below the highest logged reading, <= 0 or > 2.000.000.
 * Answers {profile (car_profile shape), logged_odometer}. */
updateCarOdometer: (spaceId: string | number, odometer: number) =>
  request(`/spaces/${spaceId}/car-profile/odometer`, {
    method: "PUT",
    body: JSON.stringify({ odometer }),
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
      /** Calendar purchases still ahead this month per label (inside `spent`). */
      planned?: Record<string, number>;
      recurringBills: any[];
      savingsGoal: { target_amount: number; current_amount: number; target_date: string | null } | null;
      /** Buget din venit -- null until PUT /budget/plan ran once. */
      plan: { monthly_income: number; split: { needs: number; guilt_free: number; third: number; short_term: number; long_term: number } } | null;
      necessities: { envelope: number | null; avg_last_3_months: number };
      guiltFree: { budget: number | null; spent: number; planned: number; count: number };
      credit: {
        budget: number | null;
        rates: number;
        count: number;
        items: { id: number; title: string; amount: number; day_of_month: number; end_date: string; linked_space_id: number | null; remaining_rates: number; next_due: string | null }[];
      };
      /** Suggested per-space split of the needs envelope (labels "Car"...), null without a plan. */
      suggested: Record<string, number> | null;
    }>("/budget"),

  /** Monthly net income + the 5-jar split (ints summing to 100; 422 "Procentele trebuie să adune 100%." otherwise). */
  saveBudgetPlan: (body: { monthly_income: number; split: { needs: number; guilt_free: number; third: number; short_term: number; long_term: number } }) =>
    request<{ plan: { monthly_income: number; split: Record<string, number> }; budget_plan_set_at: string; savingsGoal: any }>("/budget/plan", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  /** Bulk-set several space limits in one transaction ("Reîmparte"). */
  saveBudgetLimits: (limits: { category: string; monthly_limit: number }[]) =>
    request<{ message: string; limits: { category: string; monthly_limit: number }[] }>("/budget/limits", {
      method: "PUT",
      body: JSON.stringify({ limits }),
    }),

  /** "Bani fără vină": 4 months (oldest first, current last) + this month's flagged records. */
  getGuiltFree: () =>
    request<{
      months: { month: string; budget: number | null; spent: number; planned: number }[];
      items: { id: number | string; item_id?: number | string; type: string; title: string; amount: number | null; currency: string | null; due_at: string | null; guilt_free: boolean; space_id: number | null; label: string; recurring?: boolean; recurrence?: string | null; planned?: boolean }[];
    }>("/budget/guilt-free"),

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
      items: { id: number | string; item_id?: number | string; space_id?: number | null; type: string; title: string; amount: number | null; currency: string | null; due_at: string | null; planned?: boolean; guilt_free?: boolean }[];
      recurring_monthly: number;
      /** This month's Calendar purchases still ahead (inside this month's total). */
      planned?: number;
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
