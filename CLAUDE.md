# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run start   # expo start — dev server, choose platform interactively
npm run android # expo start --android
npm run ios     # expo start --ios
npm run web     # expo start --web
npm run lint    # expo lint
```

There is no test suite configured yet. `npm run reset-project` (runs `scripts/reset-project.js`) wipes the starter template — moves `src/app` to `app-example` and creates a blank `app` — do not run it without being asked.

## Architecture

- **Routing**: Expo Router with file-based routing rooted at `src/app` (see `main: "expo-router/entry"` in `package.json`). `src/app/_layout.tsx` sets up the root `ThemeProvider` and renders `AnimatedSplashOverlay` + `AppTabs`. Screens are `src/app/index.tsx` (Home) and `src/app/explore.tsx`.
- **Tab navigation**: `src/components/app-tabs.tsx` uses `expo-router/unstable-native-tabs` (`NativeTabs`) — this is the native-tab API, distinct from the classic `Tabs` component, and is styled from `Colors` in `src/constants/theme.ts`. There's a `.web.tsx` counterpart for web-specific tab rendering.
- **Platform-specific files**: several modules ship both a default and a `.web.tsx`/`.web.ts` variant, resolved automatically by Metro/webpack based on platform (e.g. `animated-icon.tsx` / `animated-icon.web.tsx` / `animated-icon.module.css`, `app-tabs.tsx` / `app-tabs.web.tsx`, `use-color-scheme.ts` / `use-color-scheme.web.ts`). When editing one of these, check whether the sibling variant needs the same change.
- **Theming**: `src/constants/theme.ts` defines `Colors` (light/dark), `Fonts` (per-platform via `Platform.select`), and spacing/layout constants (`Spacing`, `BottomTabInset`, `MaxContentWidth`). `src/hooks/use-theme.ts` resolves the active theme object from `useColorScheme()` (note: RN's color scheme can be `'unspecified'`, which is treated as `'light'`). `ThemedText` and `ThemedView` (in `src/components`) are the base styled primitives built on top of this rather than raw RN `Text`/`View`.
- **Path aliases**: `@/*` → `src/*`, `@/assets/*` → `assets/*` (defined in `tsconfig.json`, extends `expo/tsconfig.base`, `strict: true`).
- **Web CSS**: `src/global.css` is imported directly into `src/constants/theme.ts` for CSS custom properties (e.g. `--font-display`) used by the web `Fonts` variant.
- **Typed routes**: `experiments.typedRoutes` and `experiments.reactCompiler` are enabled in `app.json` — route names and the React Compiler affect how screens can be authored/linked.

## Editor conventions

`.vscode/settings.json` enables format-on-save fixes: `source.fixAll`, `source.organizeImports`, and `source.sortMembers` all run on save.

## Conventions

- Make **one atomic edit pass per file** — avoid reopening the same file for repeated small edits.
- Prefer direct edits over CLI text-replacement for small/moderate changes; CLI replacement is fine for large multi-file jobs where manual editing is unwieldy. Don't leave unsaved editor changes and then run a CLI replacement over the same files.
- Don't run formatter write passes unless explicitly requested or needed to satisfy a check.
- Delete unused/dead code instead of commenting it out; don't leave commented-out blocks or leftover debug lines.
- After editing, verify with `git diff`/`git status` and let the user review the diff on their own timing.
- Validation parity: `npm run lint` (`expo lint`) is the only CI-equivalent script defined in this repo — run that rather than an ad hoc lint invocation. There's no separate typecheck or test script yet; don't assume one exists.
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
