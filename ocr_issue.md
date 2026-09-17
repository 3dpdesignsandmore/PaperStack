# OCR issue — investigation & decision log (2026-09-17)

Starting point: the exported diagnostic log from the device, pasted below.
Everything in this file is the discussion that followed it.

## The log

```text
PaperStack diagnostic log
appVersion: 1.0.0
platform: android 36
generated: 2026-09-17T13:41:05.335Z
entries: 6 (bound 500)
2026-09-17T13:38:40.025Z [info] [app] started (v1.0.0)
2026-09-17T13:40:39.539Z [info] [persist] document mu5kuryz-yqywtbb2 "Scan-Test-04": 1 page(s), 1 row(s) in DB
2026-09-17T13:40:39.540Z [info] [ocr-pipeline] start: document mu5kuryz-yqywtbb2
2026-09-17T13:40:39.674Z [info] [ocr-pipeline] recognizing 1 page(s)
2026-09-17T13:40:39.675Z [info] [ocr-recognize] page mu5kus4c-7mmq7ekk: start
2026-09-17T13:40:44.521Z [info] [app] started (v1.0.0)
```

## Reading the log

```
13:40:39.539  persist: document "Scan-Test-04": 1 page, 1 row in DB   ← save worked
13:40:39.540  ocr-pipeline: start: document …                        ← pipeline fired
13:40:39.674  ocr-pipeline: recognizing 1 page(s)
13:40:39.675  ocr-recognize: page …: start
        …4.85 seconds of nothing…
13:40:44.521  app: started (v1.0.0)                                    ← process restarted
```

**What this proves**

1. **The engine IS in the installed build.** The availability gate passed and the module loaded — a binary without NitroOcr would have logged the "needs a newer app build" error instead.
2. **The pipeline, save flow, and disk log all work.** Scan persisted, OCR scheduled, instrumentation fired exactly as designed — everything built on 2026-09-16/17 did its job.
3. **The failure is a native crash inside the engine.** In JS this silence is impossible by construction: `runOcrForPage` try/catches every step of `recognizePage` — engine-missing, load-failure, and engine-error all leave a log line. Nothing did. Then the app came back ~4.85 s later.

User confirmed (`d:\Git\PaperStack` session, 2026-09-17): the app **visibly crashed and restarted** — after scanning, the screen blanks for a couple of seconds. That matches the log fingerprint: Android's crash-restart, `app started` at +4.85 s.

**Likely fault line.** The engine is `react-native-nitro-ocr` **0.1.0-beta.0** — built against RN 0.83 / Expo 52 / nitro-modules 0.35 — running on RN 0.86.3 / Expo 57 / Android 16 (API 36). Prime suspects: the deeply-nested result (blocks → lines → elements → symbols) crossing Nitro's C++ bridge, or an engine error aborting instead of rejecting inside `Promise.async`. The upstream repo (jonathanpalma/react-native-nitro-ocr) has zero filed issues — this is likely first contact.

## Diagnostic options laid out

1. **USB + adb crash tombstone** — plug the phone in, read the crash buffer, pin the exact native fault. Zero build cycles, definitive answer. (adb located at `C:\Users\jeffr\AppData\Local\Microsoft\WinGet\Packages\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\platform-tools\adb.exe`; no device attached at the time.)
2. **No-USB diagnostic** — switch to the package's `recognizeText` (text-only result, skips the nested-array marshalling). If that survives where `recognize` crashes, the bridge-mapping theory is confirmed; usable stopgap. Costs a dev-build cycle to test.
3. **Swap the engine** to `@react-native-ml-kit/text-recognition` — same ML Kit underneath, mature widely-deployed binding, no exotic C++ bridge. Native-dep change + new dev build either way.

Recommendation given: option 1 if USB is handy; otherwise option 3 — betting on a beta engine vs. the production-grade binding on the identical native stack is not a close call.

## Q: does the production-grade engine cross platform?

`@react-native-ml-kit/text-recognition` (a7medev) lists Text Recognition as ✅ Android / ✅ iOS. Two catches:

1. **The polished half is Android.** Widely deployed and battle-tested — a thin conventional TurboModule binding over Google's ML Kit, no Nitro-style C++ bridge.
2. **The iOS side is the awkward half.** It uses **Google's ML Kit for iOS**, not Apple Vision (which `plan/PLAN.md` §4 specifies for iOS). ML Kit iOS isn't pulled in by the package's podspec — installing it requires a custom Expo config plugin to inject `pod 'GoogleMLKit/TextRecognition'` into the prebuild Podfile, and ships Google's (large) iOS static framework instead of using Vision, which is free and already on-device.

**Sequencing conclusion (option c):** fix the platform that's crashing (Android, via the swap), keep `recognize.ts`'s platform gate open, defer the iOS engine choice until an iOS build exists to test it.

## Q: what does OCR offer, value-wise, to the user?

Honest ledger against what's built vs. promised:

**Shipped (working once the crash is fixed)**
1. **Searchable exported PDFs** — invisible text layer already wired into both export paths. Without OCR an exported scan is a photo: no viewer can search it, nothing copies from it. With it, "show me every Home Depot receipt" works via Ctrl+F in any PDF reader, outside the app, forever. For a receipt-archiving app this is the difference between "digital pile of paper" and "archive."
2. **Copy-paste out of scans** — amounts and dates become selectable text in the PDF. `$47.83` into a spreadsheet is select-copy, not squint-and-retype.
3. **Auto-extracted fields (merchant/date/total)** — first page gets its identity captured without typing, editable in-app, corrections never clobbered by re-runs. The seed of expense tracking without building an expense app.

**Enabled but not yet built (data exists, UI doesn't)**
4. **In-app full-text search** — recognized text is stored per page; Library search currently covers titles + tags only. All upside, no new pipeline work.
5. **Sort/filter by date/merchant, spend summaries, tax-year slices** — `page_receipts` already holds exactly these fields.

**Honest costs**
- The only feature that has ever crashed the app — and a crash on save is worse than no feature.
- Extraction heuristics are heuristics; wrong totals on odd receipts. Editable fields exist precisely for that.
- First-page-only fields; receipt-vs-document kind split unresolved.

**Verdict:** the shipped half is real, differentiated value (most scanner apps don't OCR or charge for it). But it currently delivers **zero** on Android because the engine kills the process mid-save. The engine swap adds no feature — it reclaims two that are already built and wired. Shelving OCR entirely is also legitimate (toggle off, never press Read-text): scan → N-up PDF → send still works, just a plainer product.

## Q: what's the downside of changing the Android engine and leaving the existing engine for iOS?

Split-engine approach (ML Kit RN binding on Android, keep nitro-ocr/Vision on iOS):

1. **The crash theory stays unverified on iOS — and the risky part is shared.** What we know: "native crash on Android, somewhere in the Nitro path." What we suspect: "Android-specific." Both platforms share `react-native-nitro-modules` (the C++ bridge runtime) against RN 0.86. If the fault is in the shared layer, **iOS crashes the same way** and we find out on the first iOS build. The risk doesn't go away; it moves platform and waits.
2. **Two result shapes, forever.** nitro returns boxes normalized 0–1; the ML Kit RN binding returns **pixel** coordinates (Android APIs 28+) and a different block/line/element hierarchy. Two mappers in `recognize.ts`, two confidence scales, two fixture sets for the extraction heuristics. Small but permanent.
3. **The same receipt can read differently on iPhone vs. Android.** Vision vs. ML Kit differ in accuracy, block granularity, language coverage, confidence semantics. Heuristics were tuned on one engine; every future OCR fix gets verified twice. Testing and support effectively double.
4. **Both native deps ride along in both binaries.** Keeping nitro-ocr for iOS keeps its config plugin, which wires ML Kit into the Android gradle build too — right next to `@react-native-ml-kit`'s own wiring. Dueling ML Kit versions resolved by Gradle (usually highest wins), two plugins managing the same native dependency, plus nitro's Android code compiled in as dead weight. Excluding it cleanly is extra config with its own failure modes.
5. **If the bet fails, the split work gets thrown away.** First iOS test crashes → fallback is ML Kit everywhere (GoogleMLKit pod + Podfile plugin) or a third engine. The Android fix survives either way, so the loss is bounded, but real.

**Upside the split buys:** honors the plan's locked Vision-for-iOS decision, avoids the ML Kit iOS pod + custom Podfile plugin, fixes Android on the battle-tested path.

**Sequencing recommendation:** swap Android now, keep the iOS branch behind the existing gate, treat iOS as unproven until a device says otherwise — plan around evidence, not the assumption that iOS is fine.

## Status at time of writing

- No code changed during this discussion (per the no-changes-without-approval rule).
- Open decision: which of options 1–3 to take; leaning swap (option 3) with deferred iOS verification if USB tombstone isn't convenient.
