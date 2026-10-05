# ENCALM Asset Tracker — Final Patch & Deployment Kit

Live: https://tracker.encalmhospitality.com
Host: GoDaddy Windows VPS (97.74.93.38) · Plesk Web Pro · IIS
Stack: Expo SDK 54 + expo-router 6 + React Native Web · pnpm monorepo

This kit is NOT a full app source tree. It contains **only the files that
changed** from the original `Asset-Tracker-Manager-1` export, plus the
server-side files and fonts needed on the VPS.

---

## What's in here

```
src/contexts/AuthContext.tsx    → real Microsoft SSO (replaces demo-only auth)
src/contexts/AssetContext.tsx   → SharePoint sync via Microsoft Graph token
src/app/login.tsx               → SSO button, "Demo mode" note removed
src/app/scan.tsx                → QR scanner works in browser (jsQR + camera API)
src/lib/msConfig.ts             → Azure AD + SharePoint config (filled in)

server/web.config               → IIS config (dot-folder fix, SPA fallback, MIME)
server/patch.ps1                → post-upload font-path patch for the JS bundle
fonts/*.ttf                     → 4 icon fonts with exact hashed filenames

docs/DEPLOY.md                  → full rebuild + upload procedure
docs/TROUBLESHOOTING.md         → every issue hit during this deployment + fix
```

---

## Quick start

1. Copy the 5 files in `src/` over the matching paths in your local
   `Asset-Tracker-Manager-1/artifacts/asset-tracker/` project.
2. Rebuild:
   ```powershell
   cd ...\artifacts\asset-tracker
   npx expo export -p web --output-dir web-build-final --no-minify --clear
   ```
3. Zip and upload — see `docs/DEPLOY.md`.

Full step-by-step is in `docs/DEPLOY.md`. Read it before uploading;
there are two non-obvious steps (font patch, web.config) that break the
site if skipped.
