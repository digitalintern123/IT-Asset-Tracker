/**
 * Browser security headers for every page, shared by the Render server
 * (serve-web.js) and IIS (scripts/build-iis.js writes them into web.config).
 *
 * The one inline script Expo puts in each page
 * (`globalThis.__EXPO_ROUTER_HYDRATE__=true;`) is allowed by its hash;
 * build-iis.js fails the build if a page gains an inline script not listed.
 */
const INLINE_SCRIPT_HASHES = ["'sha256-67fhrP0+BkBqmgGGXTtgiVO/9EQs3QruYNU/7fnRkI8='"];

const CSP = [
  "default-src 'self'",
  `script-src 'self' ${INLINE_SCRIPT_HASHES.join(" ")}`,
  // React Native Web writes styles inline.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' https://graph.microsoft.com https://login.microsoftonline.com https://*.sharepoint.com https://cdn.jsdelivr.net",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://login.microsoftonline.com",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP,
  "Strict-Transport-Security": "max-age=31536000",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
};

module.exports = { SECURITY_HEADERS, INLINE_SCRIPT_HASHES };
