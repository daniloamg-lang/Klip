# Klip

Klip is a private, local-first connected notebook. It is an installable PWA with encrypted device storage, Markdown notes, folders, wiki links, backlinks, search, and a navigable relationship graph.

## Features

- One encrypted IndexedDB vault protected by a passphrase
- `[[wiki links]]` and aliases such as `[[Note title|visible text]]`
- Automatic link target updates when a note is renamed
- Global and current-note connection graphs
- Outgoing links and backlinks for every note
- Nested folders, tags, filtering, and command-palette search
- Light/dark themes that update installed-app browser chrome
- Android standalone edge-to-edge and safe-area handling
- Offline-capable PWA for desktop and phone installation

## Run locally

```powershell
npm ci
npm run dev
```

## Validate

```powershell
npm run lint
npm test
npm run build
```

## Privacy model

The passphrase derives an AES-256-GCM key with PBKDF2. The workspace is encrypted before it is stored in IndexedDB. The passphrase and key are not persisted, and this version does not upload content.

The passphrase cannot be recovered. Clearing browser storage deletes the local vault unless a future backup/export flow is used.

## Deployment

The included GitHub Actions workflow publishes `dist` to GitHub Pages. Enable **GitHub Actions** as the Pages source in repository settings and run the workflow. The Vite base path is calculated for project and user/organization pages.

## Planned next step

Encrypted Supabase synchronization can reuse Escriva's authentication, AAL2, revision, conflict, and encryption infrastructure. It is separate from this local-first MVP so the note and folder model can stabilize first.
