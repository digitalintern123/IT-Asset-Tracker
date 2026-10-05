# Deployment Procedure

Paths used throughout:
- Local project: `C:\Users\DigitalIntern\Downloads\Asset-Tracker-Manager-1\Asset-Tracker-Manager-1\artifacts\asset-tracker`
- VPS webroot:   `C:\inetpub\vhosts\tracker.encalmhospitality.com\httpdocs`

---

## 1. Apply the source patches (local PC)

Copy these over the originals:

| From this kit | To your project |
|---|---|
| `src/contexts/AuthContext.tsx`  | `contexts/AuthContext.tsx` |
| `src/contexts/AssetContext.tsx` | `contexts/AssetContext.tsx` |
| `src/app/login.tsx`             | `app/login.tsx` |
| `src/app/scan.tsx`              | `app/scan.tsx` |
| `src/lib/msConfig.ts`           | `lib/msConfig.ts` |

---

## 2. One-time: fix lightningcss on Windows

The pnpm store ships Linux binaries only; the Windows build fails without this.

```powershell
cd C:\Users\DigitalIntern\Downloads
curl.exe -L "https://registry.npmjs.org/lightningcss-win32-x64-msvc/-/lightningcss-win32-x64-msvc-1.31.0.tgz" -o lightningcss-win.tgz
tar -xzf lightningcss-win.tgz
copy "package\lightningcss.win32-x64-msvc.node" "...\Asset-Tracker-Manager-1\node_modules\.pnpm\lightningcss@1.31.1\node_modules\lightningcss\lightningcss.win32-x64-msvc.node"
```

Note the destination is the **lightningcss/** folder, not **lightningcss/node/**.
The file must be ~9 MB. A 9-byte file means GitHub blocked the download.

---

## 3. Build

```powershell
cd "C:\Users\DigitalIntern\Downloads\Asset-Tracker-Manager-1\Asset-Tracker-Manager-1\artifacts\asset-tracker"
npx expo export -p web --output-dir web-build-final --no-minify --clear
```

`--clear` is required. Without it Metro serves a cached bundle and your
`msConfig.ts` / context changes silently do not make it into the output.

Verify the build actually picked up the changes:

```powershell
Select-String -Path "web-build-final\_expo\static\js\web\*.js" -Pattern "cee20abc" -SimpleMatch
```

If that returns nothing, the build is stale — delete `node_modules/.cache`
and rebuild.

---

## 4. Zip

Windows' built-in `Compress-Archive` fails on the long `.pnpm` paths. Use 7-Zip:

```powershell
& "C:\Program Files\7-Zip\7z.exe" a "C:\Users\DigitalIntern\Downloads\final-html.zip" "web-build-final\*.html" "web-build-final\*.ico"
& "C:\Program Files\7-Zip\7z.exe" a "C:\Users\DigitalIntern\Downloads\final-expo.zip" "web-build-final\_expo"
```

---

## 5. Upload (Plesk File Manager)

1. Plesk → Files → `httpdocs`
2. Delete the existing `_expo` folder
3. Upload both zips → right-click each → **Extract**
4. The zips extract into a `web-build-final\` subfolder. Move the contents up:

```powershell
cd C:\inetpub\vhosts\tracker.encalmhospitality.com\httpdocs
Move-Item -Path "web-build-final\*.html" -Destination "." -Force
Move-Item -Path "web-build-final\*.ico"  -Destination "." -Force
Move-Item -Path "web-build-final\_expo"  -Destination "." -Force
Remove-Item "web-build-final" -Recurse -Force
```

---

## 6. web.config

Copy `server/web.config` into `httpdocs\web.config` (overwrite).

This does three things, all required:
- `allowDoubleEscaping` + removing `.pnpm` from `hiddenSegments` — IIS blocks
  dot-prefixed folders by default, which 404s every asset path
- SPA fallback rewrite — so `/login`, `/scan` etc. resolve on refresh
- `.ttf` / `.webmanifest` MIME maps

---

## 7. Fonts (first time only)

Upload the 4 files in `fonts/` to `httpdocs\fonts\`, keeping the exact
hashed filenames.

---

## 8. Run the font patch (after EVERY build)

Upload `server/patch.ps1` to `httpdocs\`, then:

```powershell
cd C:\inetpub\vhosts\tracker.encalmhospitality.com\httpdocs
powershell -ExecutionPolicy Bypass -File patch.ps1
```

The bundle hardcodes font URLs under
`assets/__node_modules/.pnpm/@expo+vector-icons@.../Fonts/`. IIS will not serve
that path reliably. The patch rewrites those URLs to `/fonts/`. **Skip this and
all icons render as empty boxes.**

---

## 9. Azure AD

Portal → Entra ID → App registrations → **IT Asset Tracker**

- Application (client) ID: `96823f1a-bdb9-49c5-8461-d181438c74e3`
- Directory (tenant) ID:   `cee20abc-e97b-434e-a89b-e8c8ca3d3d75`

**Authentication → Redirect URIs (Web)** — both must be present:
```
https://tracker.encalmhospitality.com/
https://tracker.encalmhospitality.com/auth/callback
```

**API permissions (Microsoft Graph delegated, admin consent granted):**
- `User.Read`
- `Sites.ReadWrite.All` (or `Sites.Read.All` if read-only)
- `openid`, `profile`, `email`

---

## 10. Verify

Open in a **private window** (cached bundles are the #1 false alarm):
```
https://tracker.encalmhospitality.com
```

- [ ] Nav icons visible (Assets / Dashboard / Settings)
- [ ] "Demo mode" note is gone from the login card
- [ ] Sign in with Microsoft → real Microsoft login page
- [ ] After sign-in, assets load from the `IT Asset Register` list
- [ ] Scan tab → browser asks for camera → QR decodes

---

## SharePoint

Site: `https://encalmit.sharepoint.com`
List: `IT Asset Register`

`AssetContext.tsx` maps SharePoint columns to the app's `Asset` type:

| App field | SharePoint column(s) tried |
|---|---|
| name | `Title`, `ComputerName`, `AssetID` |
| category | `AssetType`, `Category` |
| serialNumber | `SerialNumber` |
| status | `Status`, `AssetStatus` (fuzzy-matched to in_use / available / maintenance / retired) |
| assignee | `AssignedTo.Title`, `Assign` |
| location | `Location` |

If your column names differ, edit `mapSpItemToAsset()` in `AssetContext.tsx`.
