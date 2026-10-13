# Production readiness — IT Asset Tracker

_Assessed October 2026, after a full code review (server, sign-in, data,
workflow, screens) and the fixes that followed._

## Verdict

**7 / 10 for the code. Ready for a pilot with the IT team as soon as the
Microsoft 365 / SharePoint setup below is done; not yet ready for
company-wide rollout.** The remaining blockers are almost all setup, not code.

## Scorecard

| Area | Score | Notes |
|---|---|---|
| Features & workflows | 8/10 | Full device lifecycle, reassignment approval, custody history, receipt confirmation, Excel import, report logs and CSV. |
| Security — code | 8/10 | Roles only from the signed Microsoft token; PKCE sign-in fails closed; tokens never stored beyond the browser session; server verifies tokens and roles; strict Content-Security-Policy, HSTS, no framing. |
| Security — setup | 3/10 | App roles, groups and SharePoint list permissions are not set yet. On IIS these are what actually protect the data. |
| Data integrity | 7/10 | Edit conflicts, offline changes, duplicate IDs and dates handled. History is JSON inside the Notes column (latest 200 events kept). Backups rely on SharePoint versioning. |
| Testing & CI | 7/10 | 365 automated checks in `tests/` (`npm test`); every push to `main` is type-checked and tested before the IIS build is published. Browser tests are run manually. |
| Monitoring & operations | 3/10 | No error reporting or uptime alerts yet. |
| Deployment | 8/10 | Render deploys `main`; GitHub builds `iis-deploy` for Plesk; only built files reach the web server. |
| Dependencies | 6/10 | npm reports 24 "high" advisories, all in Expo / Metro / Jest **build tools**, none in the code shipped to browsers. Plan an Expo SDK update. |
| Setup completeness | 2/10 | See the go-live checklist — until it is done, saving devices and sending emails fail. |

## Go-live checklist

### Blockers (Microsoft 365 / SharePoint — IT admin)
- [ ] IT Asset Register: add the columns `Vertical`, `Make`, `Model`, `Department`, `Custodianship`, `Criticality`, `OperationalStatus`, `AssetClass`, `Accessories` (DEPLOY.md → SharePoint).
- [ ] Create the `Asset Confirmations` list with its permissions (DEPLOY.md).
- [ ] Entra ID: app roles `Asset.Admin` / `Asset.Technician` / `Asset.Viewer`, assigned to groups; *Assignment required* = No (DEPLOY.md §5).
- [ ] SharePoint list permissions per group — Technicians "Contribute without Delete", others no access to the register.
- [ ] API permissions with admin consent: `Mail.Send`, `Mail.Send.Shared`, `User.ReadBasic.All`, `Sites.ReadWrite.All`.
- [ ] Exchange: IT staff get **Send As** on corpit.helpdesk@encalm.com.
- [ ] Fill in the IT CC addresses (`IT_CC_EMAILS`, `IT_MANAGER_EMAILS` in `lib/msConfig.ts`).
- [ ] Plesk Git: branch `iis-deploy`, automatic deployment, GitHub webhook.
- [ ] Settings → **Test SharePoint Connection** shows all checks passed.

### Before rollout
- [ ] Pilot: IT team only for 1–2 weeks (create, assign, confirm, maintenance, approval, report).
- [ ] One-time import of the inventory sheet (Settings → Import from Excel), then spot-check 10 devices.
- [ ] SharePoint list: versioning on (List settings → Versioning settings, keep e.g. 50 versions).
- [ ] Monthly CSV export from Report logs kept as an offline backup.
- [ ] Free uptime monitor (e.g. UptimeRobot) on `https://tracker.encalmhospitality.com/` and Render `/health`.

### Later
- [ ] Error reporting (e.g. Sentry) — needs an account.
- [ ] Expo SDK update to clear the build-tool advisories.
- [ ] Browser tests in CI.

## How to check a release

```bash
npm ci --legacy-peer-deps
npx tsc --noEmit
npm test
npm run build:iis
```

GitHub → Actions → "Publish IIS build" must be green before Plesk picks up
the new `iis-deploy` commit.
