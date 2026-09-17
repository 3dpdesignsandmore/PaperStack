# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run start   # expo start — dev server, choose platform interactively
npm run android # expo start --android
npm run ios     # expo start --ios
npm run lint    # expo lint
npm test        # vitest run — unit tests (N-up layout engine)
run.bat         # expo start --dev-client --port 8082 (daily driver on Windows)
```

`npm test` runs Vitest — `src/lib/layout/pack-columns.test.ts` unit-tests the pure N-up layout engine. `npm run reset-project` (runs `scripts/reset-project.js`) wipes the starter template — moves `src/app` to `app-example` and creates a blank `app` — do not run it without being asked.

## Architecture

- **Routing**: Expo Router with file-based routing rooted at `src/app` (see `main: "expo-router/entry"` in `package.json`). The root `src/app/_layout.tsx` gates on font loading, wraps a `SQLiteProvider` (runs `migrate`) and the palette `ThemeProvider`, and renders a `Stack` — non-tab routes (Settings, Compose, document detail, the dev-only OCR spike) push onto that Stack. Tab screens live in `src/app/(tabs)/`: `index.tsx` (Home dashboard), `library.tsx` (Library grid with search), `scan.tsx` (deep-link target that launches the scanner on focus and backs out on cancel).
- **Tab navigation**: `src/components/app-tabs.tsx` uses the classic `Tabs` from `expo-router/js-tabs` rendered through a custom `FloatingTabBar` (`src/components/floating-tab-bar.tsx`) — a hand-built floating pill, because `NativeTabs` wraps the platform tab bar and accepts no custom renderer. The centre Scan pill runs `useCapture()` directly instead of navigating; on success it pushes the new document. What the OS tab bar did implicitly is now the bar's own job (safe area, keyboard, a11y, hit targets); it exports `TAB_BAR_HEIGHT`/`TAB_BAR_GAP` for content padding.
- **Capture & import flows**: `useCapture()` (scanner) and `useImportPhotos()` (photo library, `photo-picker.ts`) both hand page URIs to `useSaveFlow()`, which drives `SaveScanDialog` (name as a new document or append to an existing one). Each caller renders the dialog over its own screen.
- **Theming**: `src/constants/theme.ts` defines four palettes keyed by `PaletteId`, each with light and dark `ThemeColors` sides, plus `Fonts` (Schibsted Grotesk static weights + IBM Plex Mono) and layout tokens (`Spacing`, `Radius`, `BottomTabInset`, `MaxContentWidth`, `CardShadow`). The palette + appearance preference lives in SQLite; `ThemeProvider` (`src/hooks/theme-provider.tsx`) reads it synchronously at mount so there is no first-frame flash, and `useTheme()` resolves the active `ThemeColors`. `ThemedText` and `ThemedView` (in `src/components`) are the base styled primitives built on top of this rather than raw RN `Text`/`View`.
- **State**: screen-local React state plus SQLite — zustand was listed in the original plan but never needed.
- **Path aliases**: `@/*` → `src/*` (defined in `tsconfig.json`, extends `expo/tsconfig.base`, `strict: true`).
- **Typed routes**: `experiments.typedRoutes` and `experiments.reactCompiler` are enabled in `app.json` — route names and the React Compiler affect how screens can be authored/linked.

## Editor conventions

`.vscode/settings.json` enables format-on-save fixes: `source.fixAll`, `source.organizeImports`, and `source.sortMembers` all run on save.

## Conventions

- Make **one atomic edit pass per file** — avoid reopening the same file for repeated small edits.
- **Never start Metro (`run.bat` / `expo start`) yourself — the user owns Metro.** Only they start and restart it; restarting it wrong (or at the wrong moment) kills their connected dev session. Diagnose from outside: `Get-NetTCPConnection -LocalPort 8082 -State Listen` and `Get-Process node`. If a Metro restart is needed, say so and let them run it.
- Prefer direct edits over CLI text-replacement for small/moderate changes; CLI replacement is fine for large multi-file jobs where manual editing is unwieldy. Don't leave unsaved editor changes and then run a CLI replacement over the same files.
- Don't run formatter write passes unless explicitly requested or needed to satisfy a check.
- Delete unused/dead code instead of commenting it out; don't leave commented-out blocks or leftover debug lines.
- After editing, verify with `git diff`/`git status` and let the user review the diff on their own timing.
- Validation parity: `npm run lint` (`expo lint`) and `npm test` (Vitest) are the CI-equivalent scripts — run those rather than ad hoc invocations. There is still no dedicated typecheck script (`npx tsc --noEmit` is the manual check, and is expected to pass clean).
- Not yet applicable, adopt if/when added: the centralized-logging rule (no logging utility exists here — this app doesn't call `console.error` today) and the API contract-discipline rules (no backend/API integration exists yet).

## TypeScript conventions

- No `any`, `unknown`, or `Record<string, any>` for component-local data or data shapes — define explicit interfaces/types. `unknown` is fine at exception boundaries and before runtime narrowing.
- Give state explicit generics instead of relying on inference for nullable values: `useState<T | null>(null)`, not `useState(null)` (which infers `null` or `never[]`).
- No `as` type assertions on runtime values (parsed input, network data) — acceptable only for narrowing inside a controlled type guard. Validate with `typeof`/`instanceof` checks and map explicitly instead.
- Explicit null checks: use `== null` / `!= null`, not bare truthy/falsy checks (`if (value)` conflates `0`, `''`, `false`, `NaN` with actually-absent).
- Never mask shape drift with fallback chains (`a ?? b ?? c`, `x || y || z`) — define one canonical shape and let mismatches fail loudly.
- Type catch blocks as `catch (e: unknown)` and narrow explicitly; never `catch (err: any)`.
- Don't wrap an already-async value in a redundant `async (x) => await x.foo()` — return it directly.
- Sequence (don't `Promise.all`) writes that read-modify-write the same resource, so concurrent responses can't overwrite each other.
- Define named interfaces for each distinct data shape (entities, form models, result objects, option/display types) — don't inline object types.
- For a fixed set of string values that also need a runtime object, use the `const`-object + `(typeof X)[keyof typeof X]` pattern rather than a bare string-union type alias.
- Flat interfaces: one level deep — a nested object gets its own named interface, referenced by property, not inlined.
- Import functions directly by their original name — no aliasing/re-wrapping.
- Don't coerce an already-typed field with `String(...)` or `?? ''`; if callers need that just to satisfy a signature, widen the parameter type (e.g. `string | undefined`) and handle the nullish case inside the function.
- Prefer a user-defined type guard (`function isX(v): v is X`) over an inline `as` assertion when filtering/narrowing a list.
- Never duplicate a function body across files — extract shared logic (type guards, formatters, converters, validators) into `src/` and import it everywhere.

Skipped from the source skill as not applicable here: the Vue-specific rules (props/emits typing, template refs, `reactive`/`computed`, `v-html` sanitization, `Object.assign` guidance — this is React/Expo, not Vue) and the whole `apiGet`/`apiPost`/API-layering section (that skill's axios-based client, logger, and OpenAPI-generation conventions belong to a different codebase; this app has no backend integration yet). If PaperStack grows an API layer, its analogues are worth adopting then: one canonical response interface per endpoint, HTTP status as the success signal (no `result: 'OK'`/`success` flags), one client boundary instead of calling `fetch` ad hoc, and `fetch`-prefixed names for data-loading functions.

---

## Product context

PaperStack scans documents and receipts, annotates them, and exports/shares them as PDFs. The signature feature is packing multiple receipts onto a single page instead of one receipt per page. Full design lives in `plan/PLAN.md` — read it before implementing a feature, and keep it updated when a decision changes.

### Locked decisions

- **Platforms: iOS + Android only. Web is out.** Do not reintroduce `react-native-web`, `react-dom`, a `web` block in `app.json`, or `.web.tsx` variants. The scanner and OCR are native-only, so a web build cannot run the product.
- **Storage is on-device only.** No backend, no accounts, no network calls for user data. "Nothing leaves your device" is the App Store privacy claim — do not add analytics, telemetry, or any SDK that phones home. Crash reporting, if ever added, must be crash-only with no identifiers and no breadcrumb content.
- **OCR is on-device** (Apple Vision / ML Kit) and produces both an invisible searchable text layer in exported PDFs and extracted receipt fields.
- **Sharing is the OS share sheet plus saved recipients.** No mail service, no API keys.
- **Public store release is the target**, so store requirements (permission strings, privacy policy, privacy nutrition label) are in scope, not deferred.

### Constraints that bite

- **Expo Go cannot run this app.** The scanner, OCR, and Skia are native modules. Development uses `expo-dev-client` with an EAS development build; `npx expo start --dev-client`. Do not eject to bare React Native — Expo config plugins cover the native wiring and EAS Build is what allows iOS releases without a Mac.
- **`experiments.reactCompiler` is enabled.** Do not hand-write `useMemo`, `useCallback`, or `React.memo`; the compiler handles memoization. Reanimated worklets and Skia shared values are the exception — those still need explicit `useSharedValue` / `useDerivedValue`.
- **`expo-file-system` uses the new `File` / `Directory` class API** (SDK 54+). The old function-based API is `expo-file-system/legacy` — do not write new code against it. Most training data and tutorials predate this split.
- **Scans and PDFs go in the documents directory**, never `Caches` or `tmp`. iOS backs the documents directory up to iCloud automatically, which is the app's entire backup story; `Caches` is excluded from backup and may be purged by the OS.
- **Install Expo packages with `npx expo install`, never `npm install`**, so versions stay aligned with SDK 57.
- **`expo-updates` is wired up in `app.json`** (`updates.url`, `runtimeVersion.policy: appVersion`) — the app phones Expo's servers to check for OTA JS updates. No user data is sent, but it is network traffic: the privacy policy and the "nothing leaves your device" store copy must account for it (or updates get disabled before release). Decide before Phase 8.
- Check <https://docs.expo.dev/versions/v57.0.0/> before writing code against an Expo package — several APIs changed materially in SDK 54–57.

### Redaction is a security feature

If implementing `AnnotationType.Redaction`: drawing an opaque rectangle over an embedded image in a PDF hides nothing, because the original pixels remain in the file and are recoverable by deleting the overlay. The export path must flatten the redaction into the image bitmap and embed the flattened result, and must strip any OCR block intersecting a redaction rect before writing the invisible text layer. Keep the unredacted original on disk so the user can undo in-app, but it must never reach an exported PDF. Do not ship this feature until verified against an actual exported file.

### Geometry belongs in a pure module

The multi-receipt page-packing math lives in `src/lib/layout/` as dependency-free functions (no React, no native modules) so it can be unit tested in isolation. Do not inline page geometry into component render logic. See `plan/PLAN.md` §5 for the algorithm and the legibility thresholds.
