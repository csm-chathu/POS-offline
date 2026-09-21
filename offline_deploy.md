# Offline Build & Deploy Guide

## Overview

| | Online build | Offline build |
|---|---|---|
| **Repo** | `csm-chathuranga/POS` | `csm-chathu/POS-offline` |
| **Update channel** | `latest.yml` | `offline.yml` |
| **Database** | MySQL (cloud) | SQLite (local file) |
| **API** | External server | Bundled inside EXE |
| **Internet required** | Yes | No (updates when available) |
| **Default login** | — | `admin@pos.local` / `admin123` |

---

## First-time setup (already done)

- SQLite support added to `pos-api` (set `DIALECT=sqlite` to activate)
- Electron spawns bundled API on startup in offline mode
- Separate electron-builder config: `Electron/electron-builder.offline.config.js`
- Git remote `offline` → `https://github.com/csm-chathu/POS-offline.git`

---

## Release checklist

### Step 1 — Bump version
Edit `Electron/package.json` and increment `version`:
```json
"version": "1.0.1"
```

### Step 2 — Build React frontend
```bash
cd pos-client
VITE_API_URL=http://localhost:8000 npm run build
cp -r dist/ ../pos-api/public/
```

### Step 3 — Build offline EXE
```bash
cd ../Electron
npm run dist:offline
# Output: Electron/dist-offline/POS-APP-Offline-Setup-<version>.exe
#         Electron/dist-offline/offline.yml
```

### Step 4 — Commit, tag, and push
```bash
# From repo root
git add .
git commit -m "release: offline v<version>"
git tag v<tag>
git push offline main
git push offline v<tag>
```

> Use the next available tag (check existing: `git tag -l`)

### Step 5 — Create GitHub release and upload assets

Go to: `https://github.com/csm-chathu/POS-offline/releases/new`

Or use curl (requires stored GitHub token):
```bash
TOKEN=$(git credential fill <<< $'protocol=https\nhost=github.com\n' | grep password | cut -d= -f2)

# Create release
RELEASE=$(curl -s -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"tag_name\":\"v<tag>\",\"name\":\"POS-APP-Offline v<version>\",\"body\":\"Offline installer. Bundled API + SQLite.\",\"draft\":false,\"prerelease\":false}" \
  https://api.github.com/repos/csm-chathu/POS-offline/releases)

RELEASE_ID=$(echo "$RELEASE" | grep '"id":' | head -1 | grep -o '[0-9]*')

# Upload EXE
curl -s -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @"Electron/dist-offline/POS-APP-Offline-Setup-<version>.exe" \
  "https://uploads.github.com/repos/csm-chathu/POS-offline/releases/${RELEASE_ID}/assets?name=POS-APP-Offline-Setup-<version>.exe"

# Upload offline.yml (required for auto-updater)
curl -s -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @"Electron/dist-offline/offline.yml" \
  "https://uploads.github.com/repos/csm-chathu/POS-offline/releases/${RELEASE_ID}/assets?name=offline.yml"
```

---

## How auto-update works for offline customers

- App checks `offline.yml` on GitHub 10 seconds after launch
- If internet is available and a newer version exists → downloads silently in background
- Installs on next app quit
- If no internet → silently skipped, app continues normally
- Offline builds only ever update to other offline builds (separate channel)

---

## File locations after install (customer machine)

| Item | Path |
|---|---|
| App | `%LOCALAPPDATA%\Programs\POS-APP-Offline\` |
| SQLite DB | `%APPDATA%\POS-APP-Offline\pos.db` |
| Printer config | `%APPDATA%\POS-APP-Offline\printer-config.json` |
