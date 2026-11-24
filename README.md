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
- Authenticated account sign-in followed by encrypted vault unlock
- Automatic encrypted cloud sync with AAL2 TOTP authentication

## Run locally

```powershell
npm ci
Copy-Item .env.example .env.local
# Fill in the two public Supabase client values
npm run dev
```

## Validate

```powershell
npm run lint
npm test
npm run build
```

## Privacy model

The passphrase derives an AES-256-GCM key with PBKDF2. The workspace is encrypted before it is
stored in IndexedDB. The passphrase and key are not persisted. Cloud upload is explicit and sends
only a separately encrypted envelope.

The passphrase cannot be recovered. Clearing browser storage deletes the local vault unless a future backup/export flow is used.

When cloud sync is configured, Klip requires account sign-in and TOTP verification before it asks
for the vault passphrase. It then opens the latest cloud copy, keeps an encrypted local cache, and
automatically saves and checks for cloud revisions. The vault passphrase remains separate from the
account password.

Cloud synchronization stores only an encrypted envelope. Apply
[`supabase/migrations/20261122000000_klip_workspace.sql`](./supabase/migrations/20261122000000_klip_workspace.sql)
in the Supabase SQL Editor. Klip uses an isolated `klip_workspace_state` table and does not read or
overwrite Escriva's workspace.

## Deployment

The included GitHub Actions workflow publishes `dist` to GitHub Pages. Enable **GitHub Actions** as the Pages source in repository settings and run the workflow. The Vite base path is calculated for project and user/organization pages.

## Supabase configuration

Reuse the same Supabase project and single administrator account as Escriva, or create a separate
project. In Supabase Authentication settings, disable public signups and add
`https://daniloamg-lang.github.io/Klip/` to the allowed redirect URLs. Configure the repository's
GitHub Actions variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

These values are public client configuration, not service-role secrets. AAL2 TOTP is required by the
database policies before Klip can read or write synchronized ciphertext.
