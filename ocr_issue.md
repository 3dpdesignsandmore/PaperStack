# OCR issue — investigation & decision log

**Status: root cause found (2026-09-17). OCR had never executed.**

The cause was a pre-flight availability gate in `recognizePage` that could
never pass. Everything in this file below "Resolution" is kept as the
record of how the wrong answer was reached, because the reasoning failed
in an instructive way: the instrument was lying, and every inference drawn
from its silence inherited the lie.

---

## Resolution

`recognize.ts` called expo's `requireOptionalNativeModule('NitroOcr')`
before importing the engine, and threw
`OCR needs a newer app build (engine module unavailable).` when it
returned null.

**It always returned null.** That call queries *Expo's* native module
registry. `react-native-nitro-ocr` is not an Expo module:

| check | result |
| --- | --- |
| `expo-module.config.json` | does not exist |
| `ModuleDefinition` / `ExpoModulesCore` in `android/`, `ios/` | zero matches |
| `nitro.json` | `"autolinking": { "NitroOcr": { "swift": "NitroOcr", "kotlin": "NitroOcr" } }` |

It registers as a **Nitro HybridObject**, in Nitro's own registry. Expo's
lookup could not match it on any binary, engine present or absent. So
execution never reached the engine import, `react-native-nitro-ocr` was
never loaded, and `recognize()` was never called — on any build, ever.

The gate was also redundant. `react-native-nitro-modules` performs the
equivalent check itself at module scope
(`TurboModuleRegistry.getEnforcing('NitroModules')`, a miss wrapped in
`ModuleNotFoundError`), so a stale binary throws a catchable JS error on
import — exactly the graceful outcome the gate was written to produce.

**Fix applied:** gate deleted; the import throws and is caught;
`isStaleBinaryError()` preserves the "needs a newer app build" message for
a genuine stale-binary miss. Do not reintroduce a gate keyed on an
Expo-registry lookup.

### The log that showed it

```text
544463  2/6 downscale returned; checking native gate
544467  2a await import('expo') — lazy chunk fetch
545017  2b import('expo') resolved
545022  [error] OCR needs a newer app build (engine module unavailable).
548509  [app] started
```

### Why it took so long to see

`debug-log.ts` mirrored to disk on a **1500 ms debounced `setTimeout`**. A
JS context teardown destroys pending timers, so entries written in the
final 1.5 s never reached disk. Every "no error line exists, therefore no
error occurred" inference in this file was drawn from a log structurally
incapable of recording one. Fixed the same day: the mirror is now
write-through.

**Lesson: before reasoning from an absence in a log, establish that the
log could have recorded the thing.**

---

## Claims in this file that the evidence disproved

1. **"The failure is a native crash inside the engine."** The engine was
   never imported and `recognize()` was never invoked. The crash was
   attributed to code that had not executed an instruction.
2. **"The engine IS in the installed build — the availability gate
   passed."** The gate failed, every time. This was inferred from a
   missing error line.
3. **"The process restarted."** It did not. PID 20559 logged continuously
   across 09:40:39–09:40:45 and was killed at **10:50:50** by
   `remove task` (a Recents swipe), an hour later. The only two kills of
   the app in a 236k-line logcat dump are `remove task` at adj 900/905;
   no lmkd entry for the app exists, though the buffer carries 252
   lmkd/kill lines for other processes. At 11:31/11:32 two
   `Running "main"` lines appear under one PID (6842) — a JS context
   reload inside a live process.
4. **Remediation: swap to `@react-native-ml-kit/text-recognition`.** It
   would have changed nothing. The comparison of engines, the split-engine
   analysis, and the iOS sequencing question in the sections below are all
   downstream of a diagnosis that was wrong. Revisit only if the engine
   fails once it has actually run.

---

## Still open: the JS context reload

Separate defect, unresolved. Not caused by OCR.

**Established:**

- It follows a scanner session (ML Kit `GmsDocumentScanningDelegateActivity`).
- It is a JS context reload, not a process death (same PID, two `Running "main"`).
- **With Wi-Fi off it does not happen.** Same device, same scan, same dev
  memory footprint, same image decode — the scan persisted, OCR ran to its
  breadcrumb, the error was caught and logged, and the app stayed alive.
- In the run that exposed the gate, the restart came **3.5 s after** OCR
  had already failed and been handled — no engine import, no ML Kit model
  load, no OCR bitmap.
- One captured symptom: `Cannot connect to Expo CLI. URL: 172.21.0.2:8082`
  (a correct LAN address), 12 s before a reload.

**Ruled out:** low-memory kill. The device does run heavy in dev
(~450 MB PSS, peaks toward 760 MB, Samsung `am_nandswap` paging on a
Z Flip 5) and that is worth reducing on its own merits — but lmkd kills
processes, it cannot restart JS inside a surviving one, and the Wi-Fi-off
control removes the reload without changing memory pressure at all.

**Mechanism: unknown.** Do not adopt one without evidence.

## Next

1. `eas build --profile preview --platform android` — no Metro, no dev
   client, no lazy chunks. The engine gets its first real execution there.
2. Verify the engine's bounding boxes are 0..1 and not pixels (ML Kit's
   Android APIs report pixels; `recognize.ts`'s header assumes normalized).
   The invisible PDF text layer is misplaced if this is wrong.
3. Remove the `ocr-step` breadcrumbs once OCR is verified end to end
   against a real exported PDF.
4. Investigate the reload as its own problem.

---

# Historical record (superseded — see "Resolution" above)

## (original 2026-09-17 draft)

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
