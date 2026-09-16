# PaperStack

A mobile document and receipt scanner that produces clean, shareable PDFs — with
multi-receipt **page packing**: receipts are tall and narrow, so PaperStack stacks
them in columns, several to a page, instead of wasting one Letter page per receipt.

**Capture → correct → compose → share.** Fully on-device: no account, no upload,
nothing leaves your phone unless you share it.

## Status

Phases 0–4 and 7 of the plan are built — scanning, photo import, library
(reorder/tags/search), document detail, single-document PDF export, the N-up
compose screen with its live legibility guard, plus filename templates and
saved recipients. OCR and annotation are next; see `plan/PLAN.md` §11 for the
build order and current phase status.

## Running it

The scanner, SQLite, and PDF stack are all native — **Expo Go cannot run this
app**. Development uses an Expo development build:

```bash
npm install
npx expo start --dev-client   # run.bat on Windows does exactly this, pinned to port 8082
```

Build the dev client once per native dependency change:

```bash
npx expo install expo-dev-client
eas build --profile development --platform android   # and --platform ios
```

## Validation

```bash
npm run lint      # expo lint
npm test          # vitest run — N-up layout engine unit tests
npx tsc --noEmit  # manual typecheck; expected to pass clean
```

## Repo layout

- `src/app/` — Expo Router file routes (Home / Scan / Library tabs, plus Compose,
  Settings, and document detail)
- `src/components/` — shared UI (floating tab bar, cards, buttons, thumbnails,
  themed text/view primitives)
- `src/lib/layout/` — the pure N-up column-packing engine and its unit tests
- `src/lib/pdf/` — pdf-lib export paths (single document, stacked composition)
- `src/lib/db/` — SQLite schema, migrations, queries, scan persistence
- `plan/` — `PLAN.md` (technical plan) and `UI.md` (UI spec); read before
  implementing, update when a decision changes (see `CLAUDE.md`)

## Notes

- iOS + Android only; web is out — the scanner and OCR are native-only.
- Scans live in the app's documents directory (iCloud-backed on iOS), never in
  caches.
- Documents are private until you share them; there is no telemetry. (Pre-release
  store checklist lives in `plan/PLAN.md` §9 / Phase 8.)
