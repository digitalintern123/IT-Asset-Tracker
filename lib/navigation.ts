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
