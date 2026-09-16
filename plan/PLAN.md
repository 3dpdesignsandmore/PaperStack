# PaperStack — Technical Plan

**Version:** 0.4
**Date:** 2026-09-16
**Repo:** `D:\Git\PaperStack`
**Stack:** Expo SDK 57 · React Native 0.86.3 · React 19.2.3 · TypeScript 6.0.3
**Target:** iOS + Android, public store release

---

## 1. What PaperStack is

A mobile document and receipt scanner that produces clean, shareable PDFs.

Core loop: **capture → correct → annotate → compose → share.**

Three things separate it from the crowded field of scanner apps:

1. **Multi-receipt page packing.** Receipts are tall and narrow; one per Letter page wastes paper and turns a 30-receipt expense report into a 30-page PDF. PaperStack packs N receipts onto a page intelligently, while guarding legibility.
2. **Fully on-device.** No account, no upload, no server. Scans never leave the phone unless the user shares them. That is a real privacy story, a real cost story, and it simplifies store review.
3. **Annotations that survive export.** Notes are stored as structured data against the page, not burned into a JPEG, so they can be edited later and re-rendered at full resolution into the PDF — including when a page is scaled down into a multi-up tile.

### Locked-in decisions

| Decision | Choice | Consequence |
|---|---|---|
| OCR | Yes — searchable text layer **and** field extraction | Needs on-device ML; forces a development build |
| Storage | On-device only | No backend, no auth, no hosting cost, simpler review |
| Audience | Public app from day one | Privacy policy, store assets, onboarding, support in scope |
| Sending | OS share sheet + saved recipients | No mail service, no API keys, no deliverability problems |

---

## 2. Where the repo is today

Updated 2026-09-16 (originally written 2026-09-14 against the bare starter).

**Present:**

- Phases 0–4 shipped (§11): EAS dev builds; SQLite schema + migrations (`src/lib/db/`); scanner capture → save/append flow (`useCapture` → `useSaveFlow` → `SaveScanDialog`); photo-library import (`expo-image-picker`); Library grid; document detail; single-document PDF export; multi-document N-up compose (`/compose?id=` or `?ids=`)
- Custom UI layer per `plan/UI.md`: `FloatingTabBar` (Home / Scan centre pill / Library), `ScreenTitle`, `PaperThumb`, `LegibilityMeter`, `AppCard`/`AppButton` — plus a four-palette theme system with a light/dark/system appearance override, which went beyond the original UI spec
- Pure layout engine + Vitest suite (`src/lib/layout/pack-columns.*`, `npm test`); `expo lint` clean
- Path alias `@/*` → `src/*`
- `experiments.typedRoutes: true`, `experiments.reactCompiler: true`

**Absent — still to come:** OCR (Phase 5), annotation canvas (Phase 6), and store prep (Phase 8). `recipients.last_used_at` exists in schema v3 awaiting a share-flow integration the OS share sheet cannot provide on its own — a real one will likely need a share extension or explicit in-app send flow, not `Sharing.shareAsync`.

### Three observations about the existing setup

**`reactCompiler: true` is on.** Do not hand-write `useMemo` / `useCallback` / `React.memo`; the compiler handles memoization and manual attempts tend to fight it. The exception is Reanimated worklets and Skia values, which live outside React's render model — those still need explicit `useSharedValue` / `useDerivedValue`. (The `useFocusEffect(useCallback(...))` pairings in screens are the react-navigation idiom for effect dependencies, not memoization.)

**Web is out — decided and done.** Removed in Phase 0 (commit `a707401`): the `web` script, `react-dom`/`react-native-web`, every `.web.tsx`/`.web.ts` variant, and `src/global.css` with its import from `theme.ts`. `app.json` platforms are `ios` + `android` only. Do not reintroduce any of it.

**Starter template — stripped** in the same Phase 0 pass (`explore.tsx`, `hint-row`, the `animated-icon` set, etc. are gone). `ThemedText`, `ThemedView`, `src/constants/theme.ts`, and `src/hooks/use-theme.ts` were kept, as planned.

**`npm run reset-project` will wipe `src/app` into `app-example`.** Never run it.

---

## 3. The decision that shapes everything else

**PaperStack cannot run in Expo Go.** The document scanner and the OCR engine are third-party native modules — Expo SDK 57 ships no first-party equivalent for either — and Expo Go only contains the modules Expo bundles.

This is not a problem, but it must be understood on day one because it changes the daily workflow:

```bash
npx expo install expo-dev-client
eas build --profile development --platform android   # and --platform ios
```

Install that build on your phone once. From then on `npx expo start --dev-client` gives exactly the Expo Go experience — QR code, hot reload, fast refresh — except your native modules are present. You rebuild only when you add or upgrade a native dependency, roughly every few weeks.

The alternative — ejecting to bare React Native — is unnecessary. Expo config plugins handle the native wiring for everything below, and you keep EAS Build, which is what lets you ship to the App Store without owning a Mac.

**Stay on Expo. Use a development build. Do not eject.**

> Per `AGENTS.md`: check the versioned docs at <https://docs.expo.dev/versions/v57.0.0/> before writing code against any Expo package. Several APIs changed materially in SDK 54–57 — see the FileSystem note below.

---

## 4. Dependencies to add

### Expo packages (`npx expo install <pkg>` — never `npm install`, so versions stay SDK-aligned)

| Package | Purpose |
|---|---|
| `expo-dev-client` | Development build (§3) |
| `expo-sqlite` | Document/page/annotation metadata |
| `expo-file-system` | Scans and generated PDFs on disk |
| `expo-image-manipulator` | Downscale before PDF embed (critical — see §5) |
| `expo-sharing` | Hand PDFs to the OS share sheet |
| `expo-print` | Fallback PDF path only; see §4 note |

**`expo-file-system` changed in SDK 54.** There is a new synchronous `File` / `Directory` class API, and the old function-based API now lives at `expo-file-system/legacy`. Write new code against the new API — most tutorials and LLM training data predate it and will produce `legacy` code that still works but will rot.

### Third-party native modules

| Package | Purpose | Notes |
|---|---|---|
| `react-native-document-scanner-plugin` | Scanning | Wraps Apple VisionKit (iOS) and ML Kit Document Scanner (Android): edge detection, perspective correction, multi-page capture, polished native UI. Building this yourself is weeks of work for a worse result. |
| `react-native-nitro-ocr` **or** `@react-native-ml-kit/text-recognition` | OCR | Both use Apple Vision on iOS and ML Kit on Android — on-device, offline, free, no quota. Nitro is newer/faster; ML Kit is more battle-tested. **Spike both before committing** (§6). |
| `@shopify/react-native-skia` | Annotation canvas | 60fps drawing, precise text placement. Pairs with the Reanimated 4 / worklets already installed. |

### Pure JS

| Package | Purpose |
|---|---|
| `pdf-lib` | PDF generation with full page-geometry control |
| `zustand` | State. Small, no provider pyramid. Redux is overkill here. **Not installed as of 2026-09-16** — screen-local state + SQLite has covered everything so far; revisit when a screen genuinely needs a shared store. |

**`react-native-get-random-values` is NOT needed** (verified 2026-09-14, pdf-lib 1.17.1): pdf-lib uses its own seeded `SimpleRNG` and never touches `crypto.getRandomValues`. The search text itself is drawn with raw content-stream operators (`BT … 3 Tr … Tf … Td <hex> Tj ET`) through `page.pushOperators`, with the font registered via `page.node.newFontDictionaryKey` — see `src/lib/spikes/invisible-text.ts`.

**On `pdf-lib` vs `expo-print`:** `expo-print` renders HTML to PDF and is far easier, but it cannot reliably place an invisible OCR text layer — which kills searchability — and gives no direct control over page geometry, which the N-up engine needs. Use `pdf-lib`. Budget half a day for its React Native polyfills (random values, and reading image bytes as base64 through `expo-file-system`).

---

## 5. The N-up layout engine

This is the differentiating feature and deserves a real spec. It is also pure, testable math — see §10.

### The problem

A receipt is roughly 3" wide and anywhere from 4" to 24" tall. A naive grid (2×2, 3×3) assumes roughly square content, so a tall receipt gets scaled to fit the cell *height* and ends up a thin strip in the middle of a cell with enormous wasted space either side.

### The approach: column packing, not a grid

Treat the page as **C vertical columns**. Scale every receipt to the column width, stack receipts down a column until the next would overflow, then move to the next column. When columns are exhausted, start a new page.

This is shelf/masonry packing. It wastes far less paper than a grid because column height is consumed continuously rather than quantized into cells.

```
Page:      US Letter 612 × 792 pt   (A4: 595 × 842 pt)
Margin:    36 pt (0.5")
Printable: 540 × 720 pt

columnWidth = (printableWidth - (C - 1) * gutter) / C
```

C=3 with an 18pt gutter → `(540 − 36) / 3` = **168 pt** ≈ 2.33".

Per receipt:

```
scale     = columnWidth / receiptNaturalWidthPt
renderedH = receiptNaturalHeightPt * scale
```

Place at the column cursor, advance by `renderedH + verticalGutter`. If `cursorY + renderedH > printableHeight`, move to the next column. If no columns remain, emit the page and start a new one.

### The legibility guard

This is the part most implementations get wrong, and the reason a printed multi-up receipt page is often useless.

The instinct is to guard on DPI, but DPI is the wrong metric — shrinking the render area *raises* effective DPI while making the text physically smaller. Guard on **physical scale**:

```
physicalScale = columnWidth / receiptNaturalWidthPt
```

| Range | Behavior |
|---|---|
| `>= 0.60` | Fine |
| `0.45 – 0.60` | Warn: "text may be hard to read when printed" |
| `< 0.45` | Block, or require an explicit override |

A 3" receipt at `physicalScale` 0.45 renders 1.35" wide, turning 8pt thermal print into ~3.6pt. Unreadable.

Surface this **live** as the user changes the column count. A slider that says "4 per page — text will be small" is far better than a PDF the user discovers is illegible after emailing it to their accountant.

### Modes

| Mode | Behavior |
|---|---|
| **Auto-fit** | Largest C where every selected receipt stays above 0.60. The default. |
| **N per page** | User picks 2 / 3 / 4 / 6, with the live warning. |
| **One per page** | Classic fit-to-page with margins. |

### Options

- **Captions** — `merchant · date · total` under each tile from `ReceiptData`. This is where OCR extraction pays off: a packed page becomes self-indexing. (Implemented 2026-09-16 as `title · pN` captions; the receipt-field form waits on Phase 5 OCR.)
- **Separators** — hairline rule between tiles, on by default. Receipts on white paper blur together without one.
- **Sort order** — date / merchant / total / manual. Date ascending is what an accountant wants.
- **Running total** — optional per-page footer and a grand total on the last page. Small feature, disproportionately useful.

### Rendering and performance

Render via `pdf-lib`: `embedJpg` each corrected scan, `drawImage` at the computed rect, `drawText` for captions and the invisible OCR layer (§6). Annotations render from normalized coordinates scaled into the tile rect.

**A 40-receipt job embeds 40 full-resolution JPEGs.** Downscale each to roughly twice its rendered size with `expo-image-manipulator` before embedding, or the PDF will be enormous and take a minute to build. Budget this into the phase, not as an afterthought.

---

## 6. OCR and searchable PDFs

### Two separate jobs

**Job 1 — searchable text layer.** After OCR, `drawText` every recognized block at its normalized position using PDF text render mode 3 (invisible). The glyphs are not painted, but readers can select and search them. This is how every "searchable PDF" works.

In `pdf-lib` this means reaching for the content stream operators rather than a friendly helper. **Verified working 2026-09-14** — the Phase 0 spike (`src/lib/spikes/invisible-text.ts`) proved `3 Tr` invisible text both serializes into the page content stream and is extracted by an independent pdf.js-based parser, and re-verified live on the Android dev build. The mechanics that matter: raw operators via `page.pushOperators` (not `drawText`), and the font must be registered on the page's Resources under a key from `page.node.newFontDictionaryKey('F')` before `Tf` can reference it.

**Job 2 — field extraction.** On-device ML Kit and Vision return raw text and bounding boxes, not structured fields. The parsing is a heuristic layer you write:

- **Total** — largest currency-formatted number on lines containing `total`, `amount due`, `balance`. Prefer the *last* match; receipts show subtotal, then tax, then total.
- **Date** — regex a set of common formats; prefer matches in the top third.
- **Merchant** — usually the first 1–3 non-empty lines, often the largest text block. Use OCR block height to find it.

Expect roughly 70–85% accuracy on clean receipts and considerably worse on crumpled thermal paper. **That is fine, provided every extracted field is presented as an editable value rather than a fact.** Design the receipt detail screen around correction, not display.

Do not promise "automatic expense tracking" on the store listing. Promise "auto-fills what it can read."

---

## 7. Data model

SQLite for metadata, disk for bytes. The DB stores paths, never blobs.

Following the repo's TypeScript conventions — named interfaces, flat (one level deep), `const`-object pattern for fixed string sets:

```ts
export const DocumentKind = {
  Document: 'document',
  Receipt: 'receipt',
} as const;
export type DocumentKind = (typeof DocumentKind)[keyof typeof DocumentKind];

export const AnnotationType = {
  Text: 'text',
  Highlight: 'highlight',
  Redaction: 'redaction',
  Freehand: 'freehand',
} as const;
export type AnnotationType = (typeof AnnotationType)[keyof typeof AnnotationType];

export interface ScanDocument {
  id: string;
  title: string;
  kind: DocumentKind;
  createdAt: number;
  updatedAt: number;
}

export interface ScanPage {
  id: string;
  documentId: string;
  index: number;
  imagePath: string;    // corrected, full-resolution scan
  thumbPath: string;
  widthPx: number;      // required for the §5 scale math
  heightPx: number;
}

export interface Annotation {
  id: string;
  pageId: string;
  type: AnnotationType;
  x: number;            // all normalized 0..1
  y: number;
  width: number;
  height: number;
  payload: string;      // JSON; shape depends on type
}

export interface OcrBlock {
  text: string;
  x: number;            // normalized 0..1
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface OcrResult {
  id: string;
  pageId: string;
  fullText: string;
  blocks: OcrBlock[];
}

export interface ReceiptData {
  pageId: string;
  merchant: string | null;
  date: number | null;
  total: number | null;
  tax: number | null;
  currency: string;
  confidence: number;
  userEdited: boolean;
}

export interface Recipient {
  id: string;
  label: string;
  email: string | null;
  phone: string | null;
  lastUsedAt: number;
}
```

Two things worth calling out:

- **Normalized coordinates (0..1) everywhere.** The same annotation then renders correctly in the editor preview, in a full-page PDF, and scaled into a 6-up tile. Storing pixel coordinates will cause real pain in §5.
- **`ReceiptData.userEdited`.** OCR gets things wrong, the user corrects it, and a later re-run of OCR must never clobber those corrections.

> **Redaction must destroy pixels.** `AnnotationType.Redaction` is a security feature, not a drawing tool. Drawing a black rectangle over an embedded image in a PDF hides nothing — the original pixels are still in the file and are trivially recoverable by deleting the overlay. This is a well-known class of real-world document leak.
>
> The export path for a redacted page must rasterize the redaction into the image bitmap (paint the region opaque with `expo-image-manipulator` or Skia, producing a new flattened image) and embed *that*, never the original with a rectangle on top. Same for the OCR text layer: strip any `OcrBlock` intersecting a redaction rect before writing the invisible text, or the redacted words remain selectable and searchable in the PDF.
>
> Keep the original image on disk so the user can undo a redaction in the app, but the exported PDF must never contain it. If this is not implemented correctly, do not ship the feature — an ineffective redaction tool is worse than none, because users trust it.

---

## 8. Screens

Routes live under `src/app` (not the default `app/`), using `expo-router` with `typedRoutes` enabled. The root layout is a `Stack` wrapping the `(tabs)` group — non-tab routes (detail screens, spikes) push onto the root Stack; without that Stack wrapper, `router.push` to any non-tab route silently does nothing (learned the hard way, 2026-09-14).

Current routes (updated 2026-09-16):

```
src/app/(tabs)/index.tsx          Home dashboard: Scan / Combine tiles, Recent row, status line
src/app/(tabs)/library.tsx        Grid of documents; long-press or Combine to multi-select
src/app/(tabs)/scan.tsx           Deep-link target only — runs capture on focus, backs out on cancel
src/app/settings.tsx              Pushed: appearance, palette, capture settings, filename template, recipients
src/app/compose.tsx               N-up compose: `?id=<docId>` or `?ids=<id,id,...>`
src/app/document/[id].tsx         Detail: page list, Export (one per page / Combine), rename, add pages, delete
src/app/ocr-spike.tsx             Dev-only Phase 0 spike screen (graduates or leaves with Phase 5)
```

Still-planned routes, unchanged: `document/[id]/edit.tsx` (annotation canvas, Phase 6) and `receipt/[id].tsx` (extracted-fields editor, Phase 5), pushing onto the same root Stack.

`src/components/app-tabs.tsx` now uses the classic `Tabs` from `expo-router/js-tabs` rendered through the custom `FloatingTabBar` (`src/components/floating-tab-bar.tsx`) — the `NativeTabs` arrangement described in earlier drafts was replaced when the floating pill landed (plan/UI.md §3).

**The compose screen is the heart of the app.** Give it a live page preview that re-renders as the column count changes — a thumbnail of the actual packed page, not an abstract diagram. That immediate feedback is what makes the feature feel considered rather than fiddly.

---

## 9. Consequences of "on-device only"

Choosing no backend is the right call, but it moves three problems onto you rather than removing them.

### Backup — you get one for free if you don't break it

On-device-only means a lost phone is lost receipts, and receipts kept for tax purposes are exactly the files people are angriest to lose. You do not need a backend to fix this:

- **iOS** backs up an app's `Documents` directory to iCloud automatically. Store scans and PDFs there — **not** in `Caches` or `tmp`, which are excluded from backup and which the OS may purge under storage pressure — and do not set the "exclude from backup" flag. With `expo-file-system`'s new API that means the documents directory, deliberately.
- **Android** covers this through Auto Backup, controlled by `android.allowBackup` in `app.json`. It has a size cap (currently 25MB per app), so app data backs up but a large scan library will not. Treat Android backup as partial.
- **Add an "Export All" action** that writes every document as PDFs into a folder or zip via the share sheet. One tap, no backend, and it is the honest answer for users who want their own copy. Worth surfacing in onboarding.

This is a decision you make in Phase 0 by choosing a directory, and an expensive migration if you choose wrong and fix it later.

### Storage budget

A 12MP corrected scan is roughly 3–5MB as JPEG. Five hundred receipts is 2GB of the user's phone, and "this app is eating my storage" is a one-star review.

- Store the corrected scan only. Discard the raw camera frame once perspective correction is done — you will never use it again.
- Make JPEG quality a setting with a sensible default (around 0.8, and 2000px on the long edge is plenty for OCR and for print at the scales in §5).
- Show current storage usage in Settings, with a breakdown and a way to delete old documents. Users forgive storage cost they can see and control.

### Analytics — don't

"Nothing leaves your device" is the marketing claim, the App Store privacy label, and a real differentiator. Bolting on an analytics SDK quietly makes it false, and the privacy nutrition label then has to say so.

If you need crash reporting, use a crash-only configuration with no PII, no user identifiers, and no breadcrumb content — and say plainly in the privacy policy what it sends. Otherwise ship without it. The information is not worth the claim.

---

## 10. Testing

There is no test runner configured, and `npm run lint` (`expo lint`) is the only CI-equivalent script.

That is acceptable for UI work, but the N-up layout engine is the exception and deserves one. It is pure, deterministic geometry with fiddly edge cases — a receipt taller than the printable height, a single receipt, an empty selection, mixed aspect ratios, the page-break boundary, the scale thresholds. Those are precisely the bugs that are invisible until a user prints a page.

Recommendation: add `jest-expo` (or Vitest for the pure module alone), keep the engine as a dependency-free function in `src/lib/layout/pack-columns.ts` taking `{ pageSize, margin, gutter, columns, items }` and returning placed rects, and test it in isolation. No React, no native modules, no mocking. Add a `test` script so it becomes CI-equivalent alongside `lint`.

Write the engine as a pure function regardless of whether you test it — it keeps the geometry out of component render logic, which is where it would otherwise end up.

---

## 11. Build order

Each phase should end with something runnable on your phone.

| Phase | Deliverable | Est. |
|---|---|---|
| **0. Foundation** | `expo-dev-client` + EAS dev build on device; **`pdf-lib` invisible-text spike**; strip web + starter template (§2); bundle IDs + permission strings + `eas.json`; storage directory decision (§9); SQLite schema + migrations; zustand store | 4–5 days |
| **1. Capture** | Scanner plugin integrated; scans saved to disk + DB; thumbnails | 2–3 days |
| **2. Library** | Grid, document detail, rename/delete/reorder/tag, search by title | ✅ shipped 2026-09-16 — the remaining scope (page reorder with commit/cancel, tags with cascade delete of orphan tags, debounced title search) joins the earlier grid/detail/rename/delete/add-pages/Combine. | 3–4 days |
| **3. PDF export (single)** | `pdf-lib` polyfills solved; one-page-per-scan export; share sheet | 3–5 days |
| **4. N-up engine** | Column packing, legibility guard, modes, captions, separators, live preview, downscaling, unit tests | ✅ shipped 2026-09-15, polished 2026-09-16: Auto/2/3/4/6 column chips with `fitColumns` auto-fit; Library multi-select Combine (`/compose?ids=`) alongside Export → Combine; captions are `title · pN`. Per-tile downscale-before-embed still pending — stored 2000px JPEGs are currently embedded as-is. | 5–7 days |
| **5. OCR** | Library spike, text layer, extraction heuristics, correction UI | 5–7 days |
| **6. Annotation** | Skia canvas; text, highlight, redaction; normalized persist/restore; render into PDF | 5–7 days |
| **7. Sharing polish** | Saved recipients, filename templates | ✅ shipped 2026-09-16, extended same day — recipients are one record per person with two email slots (schema v4: `email_2`, the home + work case; the primary `email` stays the default send target, `emailSlot` in SendOptions picks between them — the send sheet asks when both are set), phone, and merge support; a post-export send sheet (`send-sheet.tsx`) offers one-tap sends per channel plus quick-save of new recipients, with the one-record merge (`recipient-merge.ts`, unit-tested) filling the empty channel field on an existing record instead of duplicating it — an email that doesn't match either slot on a same-label record fills the second slot (home + work) rather than creating a new person. Settings manages the full recipient lifecycle: list (most recently used first, "email · phone" via a shared `channelSummary`), edit (`RecipientFormDialog` doubles as add/edit), pairwise merge of accidental duplicates (`mergeTwoRecords`: kept id survives, unset fields fill from the dropped record, digit-equivalent phones don't conflict, field collisions are confirmed-before-commit), and delete with confirm. Email sends via `expo-mail-composer` (attachment works); text sends via `sms:` link (number filled; iOS attaches nothing via that route — the user sends the file from the OS sheet). Also: full backup (zip of DB + scans + exports via `PRAGMA wal_checkpoint`, `backup.ts`) and a bounded on-device diagnostic log exportable from Settings (`debug-log.ts` — opt-in, no identifiers, no auto-upload). Note `expo-mail-composer` is a native module — first EAS build after this needs to include it; until that build reaches the device it is imported lazily on the email path only (same pattern as `scanner.ts`), so binaries that predate it keep text sends, the share sheet, and every route alive, with email attempts surfacing a "needs a newer build" notice. | 2 days |
| **8. Store prep** | Icon, splash, onboarding, privacy policy, screenshots, EAS submit | 4–6 days |

**Two deliberate ordering choices, changed from the first draft:**

Single-page PDF export moved *before* the N-up engine. The polyfill and image-embedding problems are identical and you want to solve them once, on the simple case.

**Annotation moved after OCR and N-up.** It is the largest single chunk of work and it is not what makes PaperStack distinctive — a scanner that packs receipts intelligently and reads them is already worth using. Phases 0→4 give you a genuinely useful app; annotation makes it complete. If the timeline slips, this is the phase to cut from v1.

---

## 12. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `pdf-lib` invisible text layer doesn't work as expected in RN | ~~**High** — kills searchable PDFs~~ **Retired** — verified working (§13.1) | N/A |
| `pdf-lib` too slow / memory-heavy for 40+ image jobs | Medium | Downscale before embed; show progress; cap batch size |
| OCR accuracy on thermal receipts | Medium | Every field editable; never auto-submit extracted data anywhere |
| **Redaction that doesn't redact** | **High** — user-trust failure, potential data leak | Flatten into the bitmap and strip intersecting OCR blocks before embed (§7). Don't ship the feature until it's verified on an exported file. |
| User loses phone, loses tax records | Medium | iOS `Documents` for automatic iCloud backup; Export All action; set this up in Phase 0 (§9) |
| Dev-build friction slows iteration | Low | Rebuild only on native dep changes; keep a stable dev build installed |
| App Store review — scanner category is crowded and Apple scrutinizes utilities | Medium | The on-device/no-account story helps. Privacy policy is required even with zero data collection; the privacy nutrition label can honestly say "no data collected", which is also a selling point. |
| Name collision — "PaperStack" | Unknown | Check App Store, Play Store, and USPTO TESS before investing in branding. Nothing obvious surfaced in a web search, but that is not a clearance search. |

### Open questions

- ~~Web target~~ — decided: out (§2).
- Page size default — Letter or A4 by locale? (Letter, US-based; make it a setting.)
- Do receipts belong to a "batch"/expense-report entity, or is compose purely ad-hoc selection? ~~Ad-hoc is simpler for v1; batches are the obvious v2.~~ **Resolved 2026-09-15 by use:** combining lives inside Export on a document ("One per page" / "Combine") and packs *that document's pages* — no multi-select, no batch entity. Revisit only if users ask to mix documents in one pack.
- **OTA updates vs. the privacy story** — `expo-updates` is wired in `app.json` (`updates.url`, `runtimeVersion.policy: appVersion`), so release builds phone Expo's servers to check for updates. No user data is sent, but it is still network traffic: either disable updates for v1 or cover them in the privacy policy and nutrition label. Decide before Phase 8.
- Monetization — free, one-time paid, or free with a paid export tier? Decide before the store listing, not after.
- Password-protected PDFs? `pdf-lib` supports encryption; a plausible paid-tier feature.

---

## 13. Immediate next steps

1. ~~**Spike `pdf-lib`'s invisible text layer**~~ — **done, PASSED** (2026-09-14). `src/lib/spikes/invisible-text.ts` + `scripts/verify-invisible-text.mts` (Node) + `src/app/ocr-spike.tsx` (device, reachable from Home while Phase 0 lasts). Structural verification (decoded content stream contains `3 Tr` and the OCR word bytes) and behavioral verification (independent pdf-parse extraction) both pass; on-device the Node-only check reports "skipped" without failing the run. Searchable PDFs are de-risked.
2. **Check the name and reserve it.** Search the App Store, Play Store, and USPTO TESS for "PaperStack". If it is clear, reserve it in App Store Connect immediately — app names are first-come, you can reserve one without a build, and discovering the name is taken after you have built branding around it is a bad week. You have been through trademark work with ICS360, so this will be familiar territory.
3. ~~**Set identity before the first EAS build.**~~ **Done.** Both IDs are `com.tdpdesignsandmore.paperstack` — the `3dp` spelling is invalid on Android (package segments must start with a letter). `NSCameraUsageDescription` is set. `NSPhotoLibraryAddUsageDescription` was deliberately **not** added: nothing writes to the photo library directly (reads go through the system picker, saves through the share sheet), so the string would be dead weight. Revisit only if a feature ever writes to the library.
4. ~~Strip web and the starter template (§2)~~ — done in Phase 0 (commit `a707401`).
5. ~~Set up `expo-dev-client` and get an EAS development build onto your phone.~~ — done (dev builds in daily use; see `run.bat`).
6. ~~Spike `react-native-document-scanner-plugin`~~ — **done, PASSED** (2026-09-14). Built under SDK 57 in the EAS dev build (commit `a4d35a7`), camera permission granted, ML Kit scanner UI launched, multi-page capture returned `scannedImages` file paths to JS. The plan's third-party-native risk is retired.
7. ~~Extend `CLAUDE.md` with the §1 decisions and the §4 dependency list~~ — done; `CLAUDE.md` now carries the architecture map, locked decisions, and constraints, and is kept current.
