# Deployment Procedure

The app is a flat npm project: an Expo web bundle (`web-build/`) plus a
zero-dependency Node server (`server/serve-web.js`) that serves the bundle and
the `/api/assets` and `/api/auth` endpoints.

It deploys two ways:

| Target | What runs | `/api/*` available |
|---|---|---|
| Docker / Render | `node server/serve-web.js` (port 10000) | Yes |
| Windows VPS / IIS (`https://tracker.encalmhospitality.com`) | IIS serves `web-build/` as static files | **No** — see note below |

> **IIS note.** `server/web.config` only serves static files and rewrites
> unknown paths to `index.html`. Requests to `/api/*` therefore never reach the
> Node server, and the app falls back to calling Microsoft Graph directly from
> the browser with the user's own token. The server-side checks on
> `/api/assets` (sign-in required, verified role gate) only apply to the
> Docker / Render deployment.

---

## 1. Build (both targets)

Requires Node 20 (npm 10).

```bash
npm ci --legacy-peer-deps
npm run build          # expo export -p web --output-dir web-build --clear
```

`--clear` is required. Without it Metro serves a cached bundle and config
changes silently do not make it into the output.

Verify the build picked up the real tenant config:

```bash
grep -c "cee20abc" web-build/_expo/static/js/web/*.js     # must be > 0
```

PowerShell equivalent:

```powershell
Select-String -Path "web-build\_expo\static\js\web\*.js" -Pattern "cee20abc" -SimpleMatch
```

If that returns nothing, the build is stale — delete `node_modules/.cache` and
rebuild.

`package-lock.json` is committed; always use `npm ci`, not `npm install`, so
every build resolves the same dependency versions.

---

## 2. Docker / Render

The `Dockerfile` does everything: `npm ci`, the web build, copying favicons and
`fonts/` into `web-build/`, and the font-path patch (section 4). The patch step
fails the build if an icon-font URL is left unpatched, so a silently broken
icon font cannot ship.

Environment variables read by the server:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `10000` | Listen port |
| `STATIC_DIR` | `web-build` | Bundle directory, relative to the repo root |
| `AZURE_TENANT_ID` | Encalm tenant | Token issuer / JWKS |
| `AZURE_CLIENT_ID` | Encalm app | Expected `aud` of the verified id_token |
| `AZURE_CLIENT_SECRET` | *(unset)* | Optional. When set, the server uses an app-only Graph token for SharePoint calls. Only set it with the id_token role gate in place. |
| `SHAREPOINT_SITE_URL` | `https://encalmit.sharepoint.com` | SharePoint site |
| `SHAREPOINT_LIST_NAME` | `IT Asset Register` | SharePoint list |
| `ADMIN_EMAILS` | the three built-in admins | Comma-separated. Must match `MS_CONFIG.ADMIN_EMAILS` in `lib/msConfig.ts`. |

Health check: `GET /health` returns `200 {"status":"healthy"}` only when
`web-build/index.html` exists, and `503` otherwise, so a deploy without a
bundle fails the container `HEALTHCHECK` instead of being promoted.

---

## 3. Windows VPS / IIS

Webroot: `C:\inetpub\vhosts\tracker.encalmhospitality.com\httpdocs`

1. Build locally (section 1).
2. Zip the **contents** of `web-build\`:
   ```powershell
   Compress-Archive -Path "web-build\*" -DestinationPath "$env:USERPROFILE\Downloads\web-build.zip" -Force
   ```
3. Plesk → Files → `httpdocs`: delete the existing `_expo` folder, upload the
   zip, right-click → **Extract** into `httpdocs` (not a subfolder).
4. **`web.config`** — copy `server/web.config` to `httpdocs\web.config`. It
   provides:
   - the SPA fallback rewrite, so `/login`, `/scan` etc. resolve on refresh
   - `.ttf` / `.json` / `.webmanifest` MIME maps
   - `allowDoubleEscaping` and a `hiddenSegments` exception (left over from the
     old pnpm layout; harmless)
5. **Fonts / font patch** — only needed if the bundle references
   vector-icon fonts again (section 4).

---

## 4. Font patch

The app draws its icons with **Lucide** (`lucide-react-native`, SVG), so the
current bundle references no icon fonts and the patch is a no-op. It stays as
a safety net in case `@expo/vector-icons` is used again: those icon fonts are
emitted under `assets/node_modules/@expo/vector-icons/.../Fonts/`, which IIS
does not serve reliably, so the patch rewrites them to `/fonts/` (upload the 4
files in `fonts/` to `httpdocs\fonts\` in that case). Skip it then and every
icon renders as an empty box.

- Docker: runs automatically in the `Dockerfile`. It prints
  `No vector-icon font paths in bundle; nothing to patch.` for the Lucide build,
  and fails the build if any icon-font URL survives unpatched.
- IIS: upload `server/patch.ps1` to `httpdocs\`, then run:
  ```powershell
  cd C:\inetpub\vhosts\tracker.encalmhospitality.com\httpdocs
  powershell -ExecutionPolicy Bypass -File patch.ps1
  ```
  It should print `Patched font paths in: <file>`. On an already-patched
  bundle it prints `No unpatched font references found.`

Check that nothing is left unpatched (must return nothing):

```bash
grep -o 'assets/[^"]*Feather[^"]*\.ttf' web-build/_expo/static/js/web/*.js
```

---

## 5. Azure AD

Portal → Entra ID → App registrations → **IT Asset Tracker**

- Application (client) ID: `96823f1a-bdb9-49c5-8461-d181438c74e3`
- Directory (tenant) ID:   `cee20abc-e97b-434e-a89b-e8c8ca3d3d75`

**Authentication → Redirect URIs.** On web the app uses the site origin with a
trailing slash (`getRedirectUri()` in `lib/msalAuth.ts`), so every origin you
serve from must be registered:

```
https://tracker.encalmhospitality.com/
https://tracker.encalmhospitality.com/auth/callback
https://<your-render-service>.onrender.com/        (if using Render)
```

Native (Android) builds use `asset-tracker://auth/callback`
(Mobile and desktop applications platform).

**API permissions (Microsoft Graph delegated, admin consent granted):**
- `User.Read`
- `User.ReadBasic.All` — the "Assigned to" picker searches Azure AD for the
  user's name and email. Without it the app falls back to manual entry.
- `Sites.ReadWrite.All` (or `Sites.Selected` for least privilege)
- `Mail.Send` — the app emails maintenance notices (to the device's user and
  `IT_MANAGER_EMAILS` in `lib/msConfig.ts`) and reassignment approval requests
  and decisions from the signed-in user's mailbox. Grant admin consent after
  adding it; until then the app opens a pre-filled draft instead.
- `openid`, `profile`, `email`, `offline_access`

**App roles.** Users without an `Admin` or `Technician` app role (and not in
`ADMIN_EMAILS`) are read-only viewers. Assign roles under Enterprise
applications → IT Asset Tracker → Users and groups. Roles must appear in the
id_token, which is what both the client and the server read.

---

## 6. Verify

Open in a **private window** (cached bundles are the #1 false alarm):

- [ ] Nav icons visible (Assets / Dashboard / Settings)
- [ ] Sign in with Microsoft → real Microsoft login page
- [ ] After sign-in, assets load from the `IT Asset Register` list
- [ ] "+" opens New Asset; creating and editing saves to SharePoint
- [ ] Scan tab → browser asks for camera → QR decodes

Docker / Render only:

```bash
curl -s https://<host>/health                                   # {"status":"healthy",...}
curl -s -o /dev/null -w "%{http_code}\n" https://<host>/api/assets   # 401
curl -s -o /dev/null -w "%{http_code}\n" https://<host>/nope.js      # 404
```

---

## SharePoint

Site: `https://encalmit.sharepoint.com`
List: `IT Asset Register`

The app maps SharePoint columns to its `Asset` type:

| App field | SharePoint column(s) tried |
|---|---|
| name | `Title`, `ComputerName`, `AssetID` |
| category | `AssetType`, `Category` |
| serialNumber | `SerialNumber` |
| status | `Status`, `AssetStatus` (fuzzy-matched to in_use / available / maintenance / retired) |
| assignee | `AssignedTo.Title`, `Assign` |
| location | `Location` — stored as `<SITE>` or `<SITE> — <terminal/desk>`, where SITE is DEL, HYD, GOA, BUG (Bhogapuram) or NAG |
| vertical | `Vertical` |

### Required column: `Vertical`

The app writes the company (vertical) of each device to a `Vertical` column.
Add it to the **IT Asset Register** list **before deploying** this version,
otherwise saving a device from the form (which now requires a Vertical)
fails with "SharePoint list is missing the
'Vertical' column":

1. Open the list → **+ Add column** → **Choice**.
2. Name: `Vertical` (exactly this; it is the internal name the app uses).
3. Choices, one per line:
   ```
   ENCALM HOSPITALITY PVT LTD
   ENCALM EATS PVT LTD
   ENCALM SKYPLATES
   ENCALM HOTEL
   ```
4. Leave "Require that this column contains information" **off** (existing
   items have no value yet; the app requires it on the form instead) → Save.

A **Single line of text** column named `Vertical` also works.

If your column names differ, edit `fromSpItem()` in `lib/sharepoint.ts` and
`spItemToAsset()` in `server/sharepoint-api.js` (the two must match).
