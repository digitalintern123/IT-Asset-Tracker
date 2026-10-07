import type { Href, Router } from "expo-router";

/**
 * Go back if there is in-app history, otherwise go to `fallback`.
 * On web, router.back() does nothing after a refresh or when a screen was
 * opened from a link, so Cancel/Back buttons need somewhere to land.
 * replace() keeps the browser's Back button from returning to the closed screen.
 */
export function goBack(router: Router, fallback: Href = "/"): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}

const RETURN_TO_KEY = "@encalm/return_to";
let consumed: { path: string; at: number } | null = null;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/**
 * Remember the page a signed-out user tried to open (e.g. the "confirm" link
 * in an email) so sign-in can bring them back to it. Web only.
 */
export function rememberReturnTo(): void {
  if (typeof window === "undefined" || !window.location) return;
  const { pathname, search } = window.location;
  if (pathname === "/" || pathname.startsWith("/login")) return;
  consumed = null;
  try {
    storage()?.setItem(RETURN_TO_KEY, pathname + search);
  } catch {}
}

/**
 * Where to go after sign-in. The saved path is read once; repeated calls in
 * the same moment (login screen and auth guard) get the same answer.
 */
export function takeReturnTo(): string {
  if (consumed && Date.now() - consumed.at < 10_000) return consumed.path;
  let path = "/";
  try {
    const saved = storage()?.getItem(RETURN_TO_KEY);
    storage()?.removeItem(RETURN_TO_KEY);
    // Same-origin paths only.
    if (saved && saved.startsWith("/") && !saved.startsWith("//")) path = saved;
  } catch {}
  consumed = { path, at: Date.now() };
  return path;
}
