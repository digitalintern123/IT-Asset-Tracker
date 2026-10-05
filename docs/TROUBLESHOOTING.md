# Troubleshooting

Every problem hit during this deployment, with the fix that actually worked.

---

### Icons render as empty boxes

The bundle requests fonts from
`/assets/__node_modules/.pnpm/@expo+vector-icons@.../Fonts/Feather.<hash>.ttf`.

Two separate causes, both must be fixed:

1. **IIS blocks dot-folders.** Fix with `web.config` —
   `allowDoubleEscaping="true"` and `<remove segment=".pnpm" />`.
2. **The path is still fragile.** Fix by running `server/patch.ps1` after every
   build, which rewrites those URLs to `/fonts/`.

---

### `OTS parsing error: invalid sfntVersion: ...`

The .ttf on disk isn't a real font — usually a 9–14 byte GitHub redirect page
from `curl.exe` against a `github.com/.../releases/download/...` URL.

Get real fonts from the npm tarball instead:

```powershell
npm pack @expo/vector-icons@15.1.1
tar -xzf expo-vector-icons-15.1.1.tgz
# fonts are in package\build\vendor\react-native-vector-icons\Fonts\
```

Feather.ttf must be **55,596 bytes**. Rename to the hashed filename.
The 4 correct fonts are already in `fonts/` in this kit.

---

### Build succeeds but changes don't appear

Metro cached the old bundle. Always build with `--clear`, then confirm:

```powershell
Select-String -Path "web-build-final\_expo\static\js\web\*.js" -Pattern "cee20abc" -SimpleMatch
```

No match = stale build.

---

### `spawnSync pnpm.cmd EINVAL` / `'sh' is not recognized`

The monorepo root `package.json` has a POSIX `preinstall` script. Skip the
workspace scripts entirely and call expo directly:

```powershell
npx expo export -p web --output-dir web-build-final --no-minify --clear
```

---

### `Cannot find module 'lightningcss.win32-x64-msvc.node'`

See DEPLOY.md step 2. Destination is `.../lightningcss/`, **not**
`.../lightningcss/node/`.

---

### `Compress-Archive` fails with "Could not find a part of the path"

Windows path-length limit vs the `.pnpm` tree. Use 7-Zip.

---

### HTTP 500.19 — "Cannot add duplicate collection entry ... '.webmanifest'"

The MIME type is already registered at server level. Add `<remove .../>`
before each `<mimeMap>` — the `web.config` in this kit already does.

---

### HTTP 403 ModSecurity on `/auth/callback`

ModSecurity rule 942430 reads the OAuth code as SQL injection.

Plesk → Websites & Domains → the domain → **Web Application Firewall** → **Off**
→ OK. Do not hand-edit the rule files; a malformed edit takes IIS down with
`SecRule takes two or three arguments`.

---

### Let's Encrypt fails: "authorization token is not available"

The ACME challenge needs plain IIS on port 80. Stop any manually-run
`python app.py` / dev server, make sure `web.config` isn't throwing 500,
then retry. Also confirm DNS first:

```powershell
nslookup tracker.encalmhospitality.com 8.8.8.8   # must return 97.74.93.38
```

---

### `AADSTS50011: redirect URI does not match`

Azure only accepts `https://` or `http://localhost`. A bare IP over HTTP is
rejected — that's why SSL had to come first. Both URIs listed in DEPLOY.md
step 9 must be registered.

---

### Site unreachable / ERR_CONNECTION_REFUSED

```powershell
Get-Service W3SVC        # if Stopped:
Start-Service W3SVC
New-NetFirewallRule -DisplayName "HTTP 80"  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow
New-NetFirewallRule -DisplayName "HTTPS 443" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

---

### Plesk web terminal drops the connection on long commands

It also loses `$variables` between lines. Put the commands in a `.ps1` via
Plesk's Code Editor and run `powershell -File script.ps1`. For anything
substantial, use RDP instead — `mstsc` → `97.74.93.38`.

---

### QR scanner shows nothing / jsQR fails to load

`scan.tsx` loads jsQR from `cdn.jsdelivr.net`. Edge's Strict tracking
prevention blocks it. Set tracking prevention to **Balanced**, or use Chrome.
Camera also requires HTTPS and an explicit permission grant.
