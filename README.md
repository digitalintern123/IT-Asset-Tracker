# ENCALM Asset Tracker

Production asset management system for ENCALM Hospitality, built with **Expo SDK 54 + expo-router 6 + React Native Web**, integrated directly with **Microsoft 365 (Azure AD)** and **SharePoint Online**.

---

## 🏛️ Architecture: Single Source of Truth (SSOT)

### 1. Data Layer
- **Authoritative Master**: **SharePoint Online** list (`IT Asset Register` on `encalmit.sharepoint.com`) via **Microsoft Graph API**.
- **Client Cache**: `AsyncStorage` (`@asset-tracker/assets/v2`) operates strictly as an offline-first local read-replica.
- **Offline Mutation Queue**: When offline or in-transit, all additions, edits, and deletions are saved to `@asset-tracker/mutation-queue/v1`. The queue automatically flushes to SharePoint when connectivity is active.
- **Demo Mode**: Sample assets are restricted strictly to unauthenticated demo sessions and are automatically purged upon Microsoft 365 sign-in.

### 2. Codebase Layer
- **Canonical Structure**: Standard Expo root structure (`app/`, `contexts/`, `components/`, `constants/`, `hooks/`, `lib/`, `types/`).
- **Primary Git Repository**: `https://github.com/digitalintern123/IT-Asset-Tracker` (`main` branch).

---

## 🚀 Deployment Options

### Option A: Render (Cloud Web Service with Docker)
This repository includes a multi-stage `Dockerfile` ready for Render:
1. In Render Dashboard, create a **Web Service** from `digitalintern123/IT-Asset-Tracker`.
2. Select **Docker** environment.
3. Set environment variable: `PORT = 10000`, `NODE_ENV = production`.
4. Render builds the container, exports the Expo Web bundle, patches the fonts, and launches the service.

### Option B: Windows VPS / IIS (Plesk)
- Live: `https://tracker.encalmhospitality.com`
- Host: GoDaddy Windows VPS (97.74.93.38) · Plesk Web Pro · IIS
- See `docs/DEPLOY.md` for step-by-step rebuild and IIS instructions.

---

## 📁 Repository Layout

```
├── Dockerfile                  # Multi-stage Docker build for Render
├── .dockerignore               # Docker ignore rules
├── app/                        # Expo Router routes (login, scan, asset, tabs)
├── components/                 # UI components
├── constants/                  # Color tokens and category definitions
├── contexts/
│   ├── AssetContext.tsx        # SharePoint Graph sync & offline mutation queue
│   └── AuthContext.tsx         # Microsoft Azure AD SSO authentication
├── lib/
│   └── msConfig.ts             # Azure AD tenant, client ID, and scopes
├── server/
│   ├── serve-web.js            # Lightweight Node server with SPA fallback
│   ├── patch.ps1               # Font path rewrite script for IIS
│   └── web.config              # IIS configuration (SPA rewrite, MIME types)
├── fonts/                      # Pre-hashed vector icon font binaries
└── docs/
    ├── DEPLOY.md               # Full deployment procedure
    └── TROUBLESHOOTING.md      # Troubleshooting history & fixes
```
