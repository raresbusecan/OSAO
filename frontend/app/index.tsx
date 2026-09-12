import { Redirect } from "expo-router";
import { useAuth } from "@/providers/auth";

/**
 * The root route ("/") used to blindly redirect to /login, no matter what --
 * relying entirely on _layout.tsx's AuthGuard to bounce an already-logged-in
 * user back out to /home a moment later. That's a real double-redirect
 * (index -> login -> home) for every authenticated visit to "/", not just a
 * cosmetic detour: on a slow/real network (a phone over a tunnel, not
 * localhost) the two redirects and the async /api/user check that decides
 * between them can resolve in the wrong order, landing the app in a
 * half-navigated, half-hydrated state -- reproduced directly: the exact
 * same reload succeeded some runs and got stuck on a broken screen on
 * others, purely from network timing. Deciding the destination here
 * directly (same rule AuthGuard uses) removes the extra hop entirely.
 */
export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  return <Redirect href={user ? "/(tabs)/home" : "/(auth)/login"} />;
}
