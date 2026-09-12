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

  me: () => request("/user"),

  dashboard: () =>
    request<{
      today: any[];
      upcoming: any[];
      overdue: any[];
      payments: any[];
    }>("/dashboard"),

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

  console.log("[SPACES TEST]", result);

  return result;
},

createSpace: (body: {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
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

  // -------------------------
  // QUICK ADD
  // -------------------------

  quickAdd: (text: string) => request("/quick-add", {
    method: "POST",
    body: JSON.stringify({ text }),
  }),
};