import { useEffect, useState } from "react";
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api, apiErrorMessage, BACKEND_URL } from "@/lib/api";

/**
 * Social login (Apple / Google / Facebook). UI: components/auth/SocialLogin.tsx
 * on Login + Register; deep-link landing: app/auth-callback.tsx.
 *
 * - Apple: native sheet (expo-apple-authentication, works in Expo Go on iOS)
 *   -> identity token -> POST /auth/apple.
 * - Google/Facebook: the backend runs the OAuth web flow
 *   (`{BACKEND}/auth/<p>/redirect?app_redirect=<deep link>`), then redirects
 *   to `<deep link>?code=...` (or `?error=...`); the one-time code is swapped
 *   for a session at POST /auth/exchange.
 *
 * Every helper resolves to the `{ user, token, created }` session, or `null`
 * when the user cancelled (cancel is silent -- no error shown). Real
 * failures throw an Error with a Romanian message.
 */

export type SocialProvider = "apple" | "google" | "facebook";
export type SocialSession = { user: any; token: string; created: boolean };

export const PROVIDER_LABEL: Record<SocialProvider, string> = {
  apple: "Apple",
  google: "Google",
  facebook: "Facebook",
};

export type ProvidersState = { apple: boolean; google: boolean; facebook: boolean };

// One fetch per app session is plenty -- the server's config only changes
// on a backend restart. A failed fetch isn't cached (retried next mount).
let providersCache: { apple: boolean; google: boolean; facebook: boolean } | null = null;

/** Which provider buttons to show. Apple = iOS + isAvailableAsync() (and
 * not explicitly disabled by the server); Google/Facebook = only when
 * GET /auth/providers says they're configured. Everything false until known. */
export function useSocialProviders(): ProvidersState {
  const [state, setState] = useState<ProvidersState>({ apple: false, google: false, facebook: false });
  useEffect(() => {
    let alive = true;
    (async () => {
      let server = providersCache;
      if (!server) {
        try {
          const r = await api.authProviders();
          server = { apple: r?.apple !== false, google: !!r?.google, facebook: !!r?.facebook };
          providersCache = server;
        } catch {
          // Server unreachable / older backend: Apple still works if the
          // device offers it (the POST will tell); the web flows need config.
          server = { apple: true, google: false, facebook: false };
        }
      }
      let apple = false;
      if (Platform.OS === "ios" && server.apple) {
        try { apple = await AppleAuthentication.isAvailableAsync(); } catch { apple = false; }
      }
      // Expo Go (SDK 57) on iPhone does NOT ship the native Apple module:
      // isAvailableAsync() is false and AppleAuthenticationButton renders
      // "Unimplemented component" (confirmed on device 2026-10-09). Apple
      // sign-in therefore needs an own (development) build; until then the
      // button stays hidden here.
      if (alive) setState({ apple, google: server.google, facebook: server.facebook });
    })();
    return () => { alive = false; };
  }, []);
  return state;
}

/** Sign in with Apple. Name/email are only sent by Apple on the FIRST
 * authorization, so full_name goes along whenever Apple gives it. */
export async function signInWithApple(): Promise<SocialSession | null> {
  // Replay protection: a one-time nonce from the server goes into the Apple
  // request; Apple embeds it in the identity token and the server checks it
  // (and burns it). No nonce -> don't open the Apple sheet at all.
  let nonce: string;
  try {
    const r = await api.authAppleNonce();
    if (!r?.nonce) throw new Error("no nonce");
    nonce = r.nonce;
  } catch (e: any) {
    // 429 keeps its own Romanian "Prea multe încercări"; anything else is
    // shown as a connection problem (never a raw server/English message).
    throw new Error(e?.status === 429 ? apiErrorMessage(e, "Prea multe încercări. Așteaptă un minut și încearcă din nou.") : "Nu ne-am putut conecta la server. Verifică internetul și încearcă din nou.");
  }
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce, // raw, as the server issued it
    });
  } catch (e: any) {
    if (e?.code === "ERR_REQUEST_CANCELED" || e?.code === "ERR_CANCELED") return null;
    throw new Error("Apple nu a putut finaliza autentificarea. Încearcă din nou.");
  }
  if (!credential.identityToken) {
    throw new Error("Apple nu a trimis datele de autentificare. Încearcă din nou.");
  }
  const given = credential.fullName?.givenName ?? null;
  const family = credential.fullName?.familyName ?? null;
  try {
    return await api.authApple(credential.identityToken, nonce, given || family ? { given, family } : null);
  } catch (e) {
    throw new Error(apiErrorMessage(e, "Nu te-am putut conecta cu Apple. Încearcă din nou."));
  }
}

// Login-CSRF guard (QA #5): a `?code=` deep link is only trusted silently
// when THIS app session started a Google/Facebook flow recently. Otherwise
// app/auth-callback.tsx asks before swapping the signed-in account for the
// one the link carries (someone else's code could log you into THEIR account).
const PENDING_WEB_FLOW_MS = 10 * 60 * 1000;
let pendingWebFlowAt: number | null = null;

/** True (once) if a web-provider flow started here in the last 10 minutes. */
export function consumePendingWebFlow(): boolean {
  const ok = pendingWebFlowAt !== null && Date.now() - pendingWebFlowAt < PENDING_WEB_FLOW_MS;
  pendingWebFlowAt = null;
  return ok;
}

/** The deep link the backend sends the browser back to:
 * exp://<host>/--/auth-callback in Expo Go, orgos://auth-callback in an own build. */
export function socialReturnUrl(): string {
  return Linking.createURL("auth-callback");
}

/** Romanian line for an `?error=` code from the backend's web callback.
 * Codes = backend SocialAuthException::MESSAGES (keep in sync); JSON
 * errors (POST /auth/apple, /auth/exchange) carry the server's own
 * Romanian `message` instead and go through apiErrorMessage. */
export function socialErrorMessage(code?: string | null, provider?: SocialProvider | null): string {
  const who = provider ? PROVIDER_LABEL[provider] : "acest furnizor";
  switch (code) {
    case "cancelled":
      return "Autentificarea a fost anulată.";
    case "email_missing":
      return `Nu am primit adresa de email de la ${who}. Permite accesul la email și încearcă din nou.`;
    case "email_unverified_exists":
      return `Există deja un cont orgOS cu acest email, iar ${who} nu l-a confirmat. Intră cu emailul și parola.`;
    case "provider_disabled":
      return `Autentificarea cu ${who} nu este disponibilă momentan.`;
    case "invalid_state":
    case "invalid_code":
      return "Sesiunea de autentificare a expirat. Încearcă din nou.";
    case "provider_unavailable":
      return "Serviciul de autentificare nu răspunde acum. Încearcă din nou mai târziu.";
    default: // provider_error, invalid_token, anything new
      return `Autentificarea cu ${who} a eșuat. Încearcă din nou.`;
  }
}

/** The backend sends only "cancelled"; the others are defensive. */
export function isCancelCode(code?: string | null): boolean {
  return code === "cancelled" || code === "canceled" || code === "access_denied";
}

function first(v: unknown): string | null {
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : null;
  return typeof v === "string" && v ? v : null;
}

// A code is single use. The same code can reach the app twice -- the
// auth session's result here AND the OS opening the deep link itself
// (app/auth-callback.tsx) -- so both share one in-flight exchange.
const exchanges = new Map<string, Promise<SocialSession>>();

/** This code is already being exchanged by this app session (the auth
 * session got it first) -- auth-callback can join it without asking. */
export function isKnownSocialCode(code: string): boolean {
  return exchanges.has(code);
}

export function exchangeSocialCode(code: string): Promise<SocialSession> {
  let p = exchanges.get(code);
  if (!p) {
    p = api.authExchange(code).catch((e) => {
      throw new Error(apiErrorMessage(e, "Linkul de autentificare a expirat. Încearcă din nou."));
    });
    exchanges.set(code, p);
  }
  return p;
}

/** Google / Facebook through the backend's web OAuth flow. */
export async function signInWithWebProvider(provider: "google" | "facebook"): Promise<SocialSession | null> {
  const returnUrl = socialReturnUrl();
  const startUrl = `${BACKEND_URL}/auth/${provider}/redirect?app_redirect=${encodeURIComponent(returnUrl)}`;
  pendingWebFlowAt = Date.now();
  const result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl);
  if (result.type !== "success") return null; // closed / dismissed = cancel, silent
  const { queryParams } = Linking.parse(result.url);
  const code = first(queryParams?.code);
  const error = first(queryParams?.error);
  if (error) {
    if (isCancelCode(error)) return null;
    throw new Error(socialErrorMessage(error, provider));
  }
  if (!code) throw new Error(socialErrorMessage(null, provider));
  // If the OS also opened the deep link, auth-callback.tsx sees this code
  // as known (isKnownSocialCode) and joins this exchange.
  const session = exchangeSocialCode(code);
  consumePendingWebFlow();
  return session;
}
