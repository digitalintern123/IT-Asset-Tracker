# Production readiness — IT Asset Tracker

_Re-assessed October 2026, after the full code review, its fixes, and the
production-hardening round (one-click setup, monitoring, backups, browser
tests in CI)._

## Verdict

**Code and operations: 8.6 / 10 — production ready.** Two rows still depend
on a one-time Microsoft 365 setup that only a tenant admin can do; it is now
one script plus one click (see below). Once that is done and Settings →
*Test SharePoint Connection* shows all ✓, the overall average is **≈ 8.6 / 10**.

## Scorecard

| Area | Score | Notes |
|---|---|---|
| Features & workflows | 8.5/10 | Device lifecycle, reassignment approval, custody history, receipt confirmation, Excel import, report logs, CSV/JSON backups. |
| Security — code | 8.5/10 | Roles only from the signed Microsoft token; PKCE fails closed; tokens never stored beyond the session; strict CSP, HSTS, no framing; server verifies tokens and roles; extra permission (`Sites.Manage.All`) requested only for the one admin action that needs it. |
| Security — setup | 8/10 _after_ `setup-entra.ps1` | Script creates app roles, groups, assignments, permissions + consent, Send As. SharePoint list permissions remain a short manual step. **3/10 until run.** |
| Data integrity | 8.5/10 | Conflicts, offline replay, unique IDs, dates, Notes size limit handled; monthly re-importable backups; SharePoint versioning recommended. |
| Testing & CI | 9/10 | 450+ unit checks and 120+ browser checks run on every pull request and before every IIS release. |
| Monitoring & operations | 8/10 | Uptime check every 15 min with alert issue; crash screen with Report to IT; on-device error log for admins; build/commit shown in Settings and `/health`. No hosted error service (needs an account). |
| Deployment | 9/10 | Render deploys `main`; tested builds only reach IIS via the `iis-deploy` branch. |
| Dependencies | 7/10 | On the latest Expo SDK 54 patch, PostCSS pinned to a fixed release. Remaining npm advisories are in Expo/Metro build tools (`braces`, `node-forge`, `image-size`) with no fixed release yet; none are in the code shipped to browsers. Re-check at the Expo SDK 55 upgrade. |
| Setup completeness | 8.5/10 _after_ setup | "Fix automatically" creates every column and the Confirmations list. **2/10 until done.** |
| **Average** | **≈ 8.4 / 10** (after setup) | Code-only areas average 8.4 today. |

## Go-live checklist

### One-time setup (tenant / site admin, ~30 minutes)
- [ ] Run `scripts/setup-entra.ps1` (try `-WhatIf` first) — DEPLOY.md *Quick setup*.
- [ ] Settings → Test SharePoint Connection → **Fix automatically**.
- [ ] Set the SharePoint list permissions (DEPLOY.md §5 and *Assignment confirmations*).
- [ ] Turn on list versioning (IT Asset Register → Versioning settings).
- [ ] Approver group: app role `Asset.Approver`, group **IT-Asset Approver** (Head of IT) assigned to it; SharePoint **AllSites.Manage** consented (the script does all three).
- [ ] IT Asset Register permissions: IT-Asset Approver → **Full Control**; no permission for all staff on the list.
- [ ] Sign in as an approver → Settings → **Sync device access** (staff then see only their own devices).
- [ ] Send the IT CC addresses (`IT_CC_EMAILS` / `IT_MANAGER_EMAILS` in `lib/msConfig.ts`).
- [ ] Plesk Git: branch `iis-deploy`, automatic deployment, GitHub webhook.
- [ ] Optional: repository variable `RENDER_URL` for the uptime check.
- [ ] Test SharePoint Connection shows all ✓.

### Rollout
- [ ] Pilot with the IT team for 1–2 weeks (create, assign, confirm, maintenance, approval, report).
- [ ] One-time import of the inventory sheet; spot-check 10 devices.
- [ ] Monthly: Report logs → Register (Excel) + Full backup (JSON).

### Later
- [ ] Hosted error reporting (e.g. Sentry) — needs an account.
- [ ] Expo SDK 55 upgrade (clears the remaining build-tool advisories).

## How to check a release

```bash
npm ci --legacy-peer-deps
npx tsc --noEmit
npm test
npm run build:iis
npx playwright install chromium   # once
npm run test:e2e
```

GitHub → Actions → "Publish IIS build" must be green before Plesk picks up
the new `iis-deploy` commit.
