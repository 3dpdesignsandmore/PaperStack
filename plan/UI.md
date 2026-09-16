# PaperStack — UI implementation spec ("Blueprint")

**Status** (updated 2026-09-15, not yet verified on a device — see §0):
§1–§5 are implemented in the working tree. `screen-title.tsx`, `paper-thumb.tsx`,
`legibility-meter.tsx` and `floating-tab-bar.tsx` all exist; Library moved to
`(tabs)/library.tsx`, Home is the new `(tabs)/index.tsx`, Settings is a pushed
route at `src/app/settings.tsx`; `app-tabs.tsx` uses the classic `Tabs` (from
`expo-router/js-tabs` — the root `expo-router` export is deprecated) with
`FloatingTabBar`. Compose has the animated US-Letter preview and `LegibilityMeter`.
§3.4's optional Liquid Glass tab bar is also in.

Known gaps, left out deliberately rather than guessed at:
- **Import from photos** (§1, Library header) has no `expo-image-picker`
  dependency yet — installing one is a new native module requiring an
  EAS dev-client rebuild, which is a bigger step than a UI pass should take
  unasked. The button is wired to a "Coming soon" alert instead of being dead.
- **Read text (OCR)** in Settings is a static "Coming soon" row, not a working
  switch — there's no OCR pipeline yet to back it (still ahead per CLAUDE.md's
  locked decisions), and a toggle with nothing behind it would be worse than
  none.
- **Multi-document Combine is still broken** (pre-existing, not introduced by
  this pass): Library's "Combine N into packed PDF" pushes `/compose?ids=...`,
  but `compose.tsx` only ever reads a single `?id=` — composing more than one
  document from Library selection mode doesn't work. `composeLayout`/
  `buildPackedPdf` are also single-document by design (see `pdf/compose.ts`'s
  header comment), so fixing this is a real feature, not a styling fix.
- **AppButton's `style` prop lands on its outer shadow wrapper**, not the
  Pressable that actually sizes itself — so per-instance `height` overrides
  (Compose's export button spec'd at 54px) silently don't apply. Left as the
  default AppButton height rather than reworking the shared component's
  style-application contract mid-pass.
- **§0's device verification (fonts, light mode) hasn't been re-run** — this
  pass was done by reading the source tree, not on a simulator/device.

**Source of truth for the look:** the design canvas (PaperStack UI artifact).
**Read with:** `PLAN.md` for product decisions, `CLAUDE.md` for code conventions.

What already exists in the repo: the Blueprint palette in `src/constants/theme.ts`,
the type scale and `Fonts` wiring in `src/components/themed-text.tsx`, the font load
gate in `src/app/_layout.tsx`, and a borderless `AppCard`.

What this document specifies: the **layouts**, plus one deliberate navigation change
(§1 — a Home hub, Settings off the tab bar, and Scan launching the scanner
directly). Nothing here changes the database, the packing algorithm, or what gets
written to disk. Where a screen's behavior does change, it is called out explicitly;
anywhere else, behavior is to be preserved exactly.

---

## 0. Verify before building

Two things are unconfirmed and both invalidate work done on top of them.

**Fonts actually load.** Open the Library tab. The word "Library" is
`ThemedText type="title"`, the only place `Fonts.serif` is used. If it renders as
a serif, fonts are working. If it renders as the system sans, `useFonts` is
failing silently — `_layout.tsx` renders anyway when `fontError` is non-null — and
that must be fixed first, because half this spec is typographic. Check by
temporarily logging `fontError`.

**Light mode.** Set the device to light. The Blueprint palette is dramatic in
light and subtle in dark; judging any of this work in dark mode will be
misleading. Verify both before calling a screen done, but design in light.

---

## 1. Navigation changes

Three problems with the current structure, all found by using the app:

**The packing feature is invisible.** The only route to it is: tap `Select` on
Library → tick receipts → a bar appears offering "Compose N into packed PDF".
`Select` names a *mode*, not an outcome, so nothing on screen suggests the app can
combine receipts at all. This is the product's one distinctive feature and it is
hidden behind a button nobody would press on purpose.

**Scanning takes two taps.** The Scan tab opens a screen whose main content is a
button that opens the scanner. The screen exists only to hold capture settings and
"Import from photos".

**There is no place that tells you what the app does.** Every screen is a
destination; none is an overview.

### New structure

| Route | Was | Now |
|---|---|---|
| `src/app/(tabs)/index.tsx` | Library | **Home** (new) |
| `src/app/(tabs)/library.tsx` | — | Library (moved from `index.tsx`) |
| `src/app/(tabs)/scan.tsx` | Scan screen | Deep-link target only; launches the scanner |
| `src/app/settings.tsx` | `(tabs)/settings.tsx` | Pushed route, reached from Home's header |

Tabs become **Home / Scan / Library**, Scan still the centre pill.

Moving Library off `index` changes its URL. Grep for `'/'`, `"/(tabs)"` and
`router.replace` before and after; the launch URL must still resolve, which it does
because Home takes `index.tsx`.

### Scan launches the scanner

Extract the capture flow out of `scan.tsx` into `src/hooks/use-capture.ts` — launch,
persist, the rename dialog, and the resulting document id. No UI.

In `FloatingTabBar`, the scan route does not navigate:

```tsx
if (route.name === 'scan') {
  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
  if (!event.defaultPrevented) { capture(); }
  return;
}
```

On success push `/document/[id]`. On cancel do nothing — the user stays where they
were, which is the correct outcome for a cancelled capture and is impossible with
the current two-screen flow.

`(tabs)/scan.tsx` stays as a thin deep-link target that calls the same hook on focus
and `router.back()`s on cancel. Its card UI is deleted.

Capture settings (multi-page, OCR, quality) move to Settings. "Import from photos"
becomes a secondary action in the Library header, next to Combine.

### Library: Select becomes Combine

- Rename the button to `Combine`.
- **Long-press a thumbnail also enters selection mode** and selects that item. This
  is the pattern people already expect and it makes the feature discoverable without
  reading anything.
- The action bar keeps its current behavior and copy: `Combine N into packed PDF`.
- `Done` still exits selection.

Behavior is otherwise unchanged — same state, same params, same route.

---

## 2. Shared primitives to build first

Three new presentational components. No data, no navigation, no side effects —
props in, pixels out. Build and use these before touching screens; every screen
below assumes them.

### `src/components/screen-title.tsx`

The header block on Library, Scan, and Settings. Replaces each screen's
hand-rolled header rows.

```
ScreenTitleProps {
  eyebrow: string;      // rendered uppercase by the `label` type
  title: string;
  subtitle?: string;    // e.g. "12 documents · 38.4 MB"
  right?: ReactNode;    // action cluster, right-aligned on the subtitle row
}
```

Anatomy, top to bottom, inside `paddingHorizontal: Spacing.three`:

- eyebrow — `ThemedText type="label"`, color `theme.accent`
- title — `ThemedText type="title"` (Instrument Serif 34), `marginTop: Spacing.two`
- subtitle row — `flexDirection: 'row'`, `alignItems: 'center'`,
  `justifyContent: 'space-between'`, `gap: Spacing.three`, `marginTop: Spacing.two`;
  subtitle is `ThemedText type="small"` in `theme.textSecondary`; `right` sits opposite

Render the subtitle row only when `subtitle` or `right` is present.

### `src/components/paper-thumb.tsx`

The library grid thumbnail. A sheet of paper, not a bordered box.

```
PaperThumbProps {
  uri: string;
  pageCount: number;
  selected?: boolean;
}
```

- Outer view owns the shadow (`CardShadow`) and must **not** set `overflow: 'hidden'`
  — that clips the shadow. Inner view owns `borderRadius: Radius.medium` and the
  clipping. This two-layer split already exists in the current library code; keep it.
- `pageCount > 1` renders 1–2 offset sheets *behind* the inner view: absolutely
  positioned, `backgroundColor: theme.backgroundSelected`, same radius, offset
  `+6/+7` px and rotated `2.2deg` and `-1.8deg`. Cap the decoration at two regardless
  of page count.
- Image fills the inner view, `contentFit: 'cover'`, via `expo-image`.
- `selected` draws a 2px `theme.accent` ring on the inner view plus a filled check
  badge top-right. Selection is the one place a border is correct.

### `src/components/legibility-meter.tsx`

Used on Compose. Pure presentation of a scale value.

```
LegibilityMeterProps { scale: number }   // PackResult.minScale
```

Bands — these thresholds are `PLAN.md` §5 and must match the packing code:

| scale | title | color | background |
|---|---|---|---|
| `>= 0.60` | `Crisp` | `theme.success` | `theme.success` at 12% |
| `0.45 – 0.60` | `Small print` | `theme.warning` | `theme.warning` at 12% |
| `< 0.45` | `Too small to read` | `theme.danger` | `theme.danger` at 12% |

Layout: `borderRadius: Radius.medium`, `padding: Spacing.two`, row with an 8px dot
in the band color, then a column of title (`type="smallBold"`, band color) and note
(`type="small"`, `theme.textSecondary`). Note text includes the rounded percentage,
e.g. "Prints at 78% of life size."

---

## 3. Tab bar — the floating pill

**Decision: build it.** The canvas version is what we want.

This is the highest-risk item in this document, because it replaces a platform
component with a hand-built one. Everything the OS was doing for free now has to be
done explicitly. Treat the checklist in §3.3 as part of the definition of done, not
as polish.

### 3.1 The API switch

`NativeTabs` (`expo-router/unstable-native-tabs`) wraps the platform's own tab bar
and accepts no custom renderer. A custom bar requires the classic `Tabs` component
from `expo-router`, which takes a `tabBar` prop.

`src/app/(tabs)/_layout.tsx` keeps its `ThemeProvider`. `src/components/app-tabs.tsx`
is rewritten:

```tsx
<Tabs
  screenOptions={{ headerShown: false }}
  tabBar={(props) => <FloatingTabBar {...props} />}>
  <Tabs.Screen name="index" options={{ title: 'Library' }} />
  <Tabs.Screen name="scan" options={{ title: 'Scan' }} />
  <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
</Tabs>
```

Route names stay `index` / `scan` / `settings` — renaming them changes URLs and
breaks `router.push` targets elsewhere.

### 3.2 `src/components/floating-tab-bar.tsx`

Takes `BottomTabBarProps` (`state`, `descriptors`, `navigation`) from
`@react-navigation/bottom-tabs`.

Container:

- `position: 'absolute'`, `left/right: Spacing.three`,
  `bottom: insets.bottom + Spacing.two` via `useSafeAreaInsets()`
- `height: 64`, `borderRadius: Radius.pill`, `backgroundColor: theme.backgroundElement`
- elevation: `CardShadow` with the opacity raised — this floats higher than a card
- `flexDirection: 'row'`, `alignItems: 'center'`,
  `justifyContent: 'space-between'`, `paddingHorizontal: Spacing.two`

Items — map `state.routes`, read `descriptors[route.key].options`, and derive
`focused = state.index === index`:

- **Library** and **Settings**: 72×48 column, icon over `type="label"` at 10px
  without the uppercase transform. `focused ? theme.text : theme.textSecondary`.
- **Scan** (centre): a filled pill — `height: 48`, `paddingHorizontal: Spacing.four`,
  `Radius.pill`, `theme.accent` background, `glowShadow(theme.accent)`, icon plus
  label in `theme.accentText`. It stays accent-filled whether or not it is focused;
  it is the primary action, not a peer.

Icons come from `expo-symbols`' `SymbolView` with `sf` / `android` names, matching
`screen-header.tsx`. Reuse the names already in `app-tabs.tsx`
(`folder.fill`/`folder`, `camera.viewfinder`/`document_scanner`,
`gearshape.fill`/`settings`).

Press handling must go through the navigation event, not `navigate` alone, or
tab-press listeners elsewhere stop firing:

```tsx
const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
if (!focused && !event.defaultPrevented) {
  navigation.navigate(route.name);
}
```

Also emit `tabLongPress` on long press.

### 3.3 What the OS was doing for you — now your job

Each of these is a real regression if skipped.

1. **Safe area.** `useSafeAreaInsets().bottom`. Hard-coding a gesture-bar height
   breaks on devices without one, and on rotation.
2. **Accessibility.** Every item needs `accessibilityRole="button"`,
   `accessibilityState={{ selected: focused }}`, and
   `accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title}`.
   `NativeTabs` gave this for free; a `Pressable` gives you none of it, and a
   scanner app has a real accessibility audience.
3. **Keyboard.** A floating absolute bar sits *on top of* the keyboard. Subscribe to
   `keyboardDidShow` / `keyboardDidHide` and return `null` while visible. This will
   bite on the rename dialog and the receipt-field editor.
4. **Content underlap.** The bar no longer reserves layout space, so every scrollable
   screen must pad for it. Export the metrics from the component:
   ```ts
   export const TAB_BAR_HEIGHT = 64;
   export const TAB_BAR_GAP = Spacing.two;
   ```
   and set `BottomTabInset` in `theme.ts` accordingly. Audit every `FlatList` and
   `ScrollView` — Library's grid is the one that will visibly clip its last row.
5. **Press feedback.** No native ripple or highlight. Use the existing
   `usePressScale` hook so taps feel answered.
6. **Tap-to-scroll-to-top.** iOS gives this on re-tapping the active tab.
   You can restore it by listening for `tabPress` while focused and calling
   `scrollToOffset({ offset: 0 })` on the Library list. Optional, but it is the
   thing people miss without being able to name it.
7. **Hit targets.** Minimum 44×44 for every item, including the icon-only regions.

### 3.4 Optional, iOS only

`expo-glass-effect` is already a dependency and unused. On iOS, rendering the pill
inside a `GlassView` instead of a flat `backgroundElement` fill gives it the current
system material and looks markedly better over a scrolling grid. Guard it with
`Platform.OS === 'ios'` and `isLiquidGlassAvailable()`, falling back to the flat
fill. Do this only after the bar is otherwise finished and §3.3 is complete.

---

## 4. Screens

### `src/app/(tabs)/index.tsx` — Home (new)

A dashboard, not a menu. The test for anything on this screen: does it tell the user
something they didn't know, or start work they came here to do? A tile that only
says "Library" fails that test — the tab bar already does it.

`ScrollView`, `paddingHorizontal: Spacing.three`.

1. **Header** — `ScreenTitle` with eyebrow `PaperStack`, title `Home`, and `right` =
   a 44px circular gear button pushing `/settings`.
2. **Two primary action tiles**, side by side, equal width, `gap: Spacing.three`,
   `aspectRatio: 1.15`, `AppCard`, `padding: Spacing.three`, icon top-left, label
   bottom-left:
   - **Scan** — `theme.accent` fill, `theme.accentText` label,
     `glowShadow(theme.accent)`. Calls `useCapture()` directly, same as the tab.
   - **Combine receipts** — normal card fill. Pushes Library already in selection
     mode, filtered to receipts (`/library?select=receipts`). This is the fix for
     the discoverability problem; it is the reason this screen exists.
3. **Recent** — horizontal `FlatList` of the five newest documents as `PaperThumb`
   at ~110px wide with the name beneath, `showsHorizontalScrollIndicator={false}`.
   Section header row: `type="label"` "Recent" on the left, a `See all` text button
   on the right pushing Library. Hidden entirely when the library is empty.
4. **Status line** — one `type="small"` row in `theme.textSecondary`:
   `{n} documents · {m} receipts · {size} used`. Reuse the existing library query;
   do not add a new one.

Empty state (no documents yet): the two action tiles stay, Recent is hidden, and the
status line is replaced by one `type="small"` line — "Scan your first receipt.
Everything stays on this device." Do not add an illustration or an onboarding card.

### `src/app/(tabs)/library.tsx` — Library

- Replace the header block with `ScreenTitle`:
  eyebrow `Your scans`, title `Library`, subtitle `{n} document{s}`, right = the
  `Combine` button (§1) plus a small import-from-photos icon button.
- Accept an optional `select` search param (`/library?select=receipts`) that enters
  selection mode on mount — this is how Home's Combine tile arrives.
- Grid: keep `FlatList`, `numColumns={2}`. Gap `Spacing.three`,
  `paddingHorizontal: Spacing.three`.
- Each cell: `PaperThumb` above a metadata column, `gap: Spacing.two`.
  - name — `type="defaultSemiBold"`, `numberOfLines={1}`
  - meta row — `type="small"` in `theme.textSecondary` on the left; when the entry
    is a receipt with a known total, `type="mono"` on the right. Tabular figures are
    the point — do not substitute the sans face.
- Empty state: `CenteredMessage` restyled to the new type scale — `type="subtitle"`
  headline, `type="small"` body in `theme.textSecondary`, no card, no border.
  Generous vertical space; this is a first-run impression.
- Selection mode is unchanged apart from `PaperThumb`'s `selected` prop.

### `src/app/(tabs)/scan.tsx` — Scan

Per §1 this screen no longer has a UI. Its card, mode switch and settings rows are
deleted; the capture logic moves to `src/hooks/use-capture.ts`. What remains is a
thin route that launches the scanner on focus and `router.back()`s on cancel, so
deep links to `/scan` still work.

The stacked-paper illustration with `theme.accent` corner brackets — the one piece
of character on the old screen — moves to Home's Scan tile as its icon, scaled down.

### `src/app/compose.tsx` — Compose

The signature screen. Read `PLAN.md` §5 first.

- `ScreenHeader` (existing back affordance) with title `Compose`.
- **Page preview.** A US-Letter-proportioned sheet, centered,
  `aspectRatio: 612/792`, width ≈ 70% of screen, `theme.backgroundElement`,
  `Radius.small`, `CardShadow`. Inside, each item from `packColumns()` page 1 is an
  absolutely positioned tile. Convert PDF coordinates to view coordinates:
  ```
  k    = previewWidth / pageSize.width
  left = x * k
  top  = (pageSize.height - (y + height)) * k
  ```
  PDF origin is bottom-left; the view's is top-left. Getting this wrong flips the
  page vertically, which looks plausible and is wrong.
- **Animate the reflow.** This is the one interaction worth real effort. Each tile
  is an `Animated.View`; on column-count change, animate `left/top/width/height`
  with `withSpring` (`damping: 18`, `stiffness: 140`). Items that fall onto page 2+
  animate to `opacity: 0` and slide below the sheet. Keep a stable key per item id
  so nodes are reused and the transition actually runs. Under `reactCompiler`, use
  `useSharedValue` / `useDerivedValue` explicitly — the compiler does not manage
  worklet values.
- Caption under the sheet: `type="small"`, `theme.textSecondary`,
  "Page 1 of {n} · US Letter".
- Control card (`AppCard`): row of `Auto / 2 / 3 / 4 / 6` chips, equal width,
  `height: 48`, `Radius.medium`; selected chip is `theme.text` fill with
  `theme.background` label, unselected is `theme.backgroundSelected` with
  `theme.textSecondary`. Right-aligned `type="mono"` scale readout on the row above.
- `LegibilityMeter` below the chips.
- Export button pinned bottom, `height: 54`, `Radius.pill`. When
  `minScale < 0.45` it fills `theme.textSecondary` instead of `theme.accent` — the
  action stays available, per `PLAN.md` §5 ("or export anyway"); it is discouraged,
  not blocked.

### `src/app/settings.tsx` and `src/app/document/[id].tsx`

Settings moves out of `(tabs)` and becomes a pushed route with a `ScreenHeader`
(back chevron), not a `ScreenTitle` — it is now a pushed screen, not a tab.
It gains the capture settings that came off the Scan screen: multi-page capture,
read text (OCR), quality. Row anatomy: 52px minimum height, hairline `theme.border`
separators between rows only, never above the first or below the last.

`document/[id].tsx` has no structural change. Confirm both pick up the new
`AppCard` and replace any remaining hand-set font sizes with `ThemedText` types.

---

## 5. Sweep

Every item below was found in the working tree, not assumed. Line numbers were
accurate on 2026-09-16 and will drift.

### Borders — remove

| Where | What | Why |
|---|---|---|
| `(tabs)/index.tsx` `emptyState` | `borderWidth: 1.5`, `borderStyle: 'dashed'` | §4 Library: the empty state is type and space, not a dashed box |
| `compose.tsx` `previewPage` | `borderWidth: 1` | the page sheet gets `CardShadow`, not an outline |
| `compose.tsx` `controlCard` | `borderWidth: 1` | becomes `AppCard`, which is borderless |
| `compose.tsx` `columnChip` | `borderWidth: 1` | chips are filled, not outlined (§4 Compose) |

### Borders — keep

Do not touch these; they are real dividers or controls, and removing them is a
regression:

- `screen-header.tsx` `borderBottomWidth: StyleSheet.hairlineWidth` — page rule
- `app-button.tsx` `borderWidth: 1` — the `outline` variant's whole appearance
- `(tabs)/index.tsx` selection ring (`borderWidth: 2`, accent) and `checkBadge`
  (`borderWidth: 2`) — selection state
- `scan.tsx` row separator hairline and the text `input` border — both move to
  Settings with their rows intact

### Hardcoded colors — real bugs

`compose.tsx` sets `backgroundColor: '#FFFFFF'` and `borderColor: '#808080'` on
`previewPage`. That is a literal white sheet in **both** schemes, so in dark mode
the compose screen has a glaring white rectangle in the middle of it. Use
`theme.backgroundElement`. The tile border on the same screen uses
`theme.textSecondary`, which is far too strong for a hairline — use `theme.border`.

`themed-text.tsx` `linkPrimary` hardcodes `#4E93F9` — the *old* accent. It must
become `theme.accent`, which means it cannot stay in the `StyleSheet.create` block;
move the color to the inline style array like the other themed colors.

### Already correct — do not "fix"

`compose.tsx` already converts PDF coordinates properly:
`top: (LETTER.height - item.y - item.height) * previewScale`. The Y-flip warning in
§4 is about preserving this when the preview is rebuilt, not about a bug to repair.

### Remaining

- Grep for literal `fontSize` outside `themed-text.tsx`; each one should be a
  `ThemedText` type.
- Every currency amount uses `type="mono"`.

---

## 6. Order and checkpoints

Run `npm run lint` and `npm test` after each step, and look at the screen on the
device before starting the next one.

1. §0 verification — fonts and light mode. Do not proceed until the serif renders.
2. `ScreenTitle`, then Library's header only (still at `index.tsx` at this point).
3. `PaperThumb`, then the Library grid and empty state.
4. **Route move** (§1): Library `index.tsx` → `library.tsx`, Settings out of
   `(tabs)`, placeholder Home at `index.tsx`. Ship this as its own commit and verify
   every route still resolves before adding any Home content.
5. `use-capture.ts` extraction; Scan route reduced to the thin version.
6. Floating tab bar: §3.1 API switch and §3.2 component, including the scan-tab
   press interception.
7. §3.3 checklist — safe area, accessibility, keyboard, content padding, press
   feedback, hit targets. Do not move on with any of these outstanding; a
   half-finished custom tab bar is worse than the native one it replaced.
8. Home screen content.
9. Library: Select → Combine, long-press selection, `?select=` param.
10. Settings: pushed route, plus the capture settings that came off Scan.
11. `LegibilityMeter`, then Compose static layout.
12. Compose reflow animation.
13. §5 sweep.
14. Optional: §3.4 glass material on iOS.

Steps 2–3 and 8–10 are mechanical. Steps 4–7 are the ones most likely to introduce
regressions — after each, test every tab, deep links to `/document/[id]` and
`/compose`, rotation, and a screen with the keyboard open. Step 12 is the one that
makes the app memorable; leave time for it.

---

## 7. Out of scope

Annotation UI (`PLAN.md` phase 6) and shared-element transitions between library
and document detail. Both worth doing, neither part of this pass.
