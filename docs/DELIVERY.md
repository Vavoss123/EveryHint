# P3 delivery — local live speech transcription

P3 connects the existing independent microphone/system PCM streams to one CPU whisper.cpp helper, with validated transport, mono/16 kHz conversion, energy-based speech segmentation, bounded fair scheduling, provisional/final transcript replacement, overlap deduplication, ordered source-labelled text and a rolling memory-only transcript store. Models/settings/diagnostics are available in the overlay, including compact mode. Capture controls, all seven source combinations and P1/P2 privacy indicators remain.

## Verification

| Check                                                     | Result                                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Strict TypeScript / lint                                  | Passed                                                                                          |
| Unit tests                                                | **157 passed, 0 failed, 17 files**                                                              |
| Production build                                          | Passed                                                                                          |
| Native helper build/install                               | Passed, official pinned whisper.cpp v1.9.5; upstream compiler/CMake warnings visible            |
| Core Electron smoke                                       | **47 assertions passed**; synthetic media; all hotkeys registered                               |
| Speech Electron smoke                                     | **11 assertions passed**; actual tiny.en inference through both synthetic P2 sources            |
| Actual helper inference                                   | Verified upstream JFK speech twice through one loaded model; expected recognised phrase checked |
| Real microphone/Windows loopback/calls                    | **Pending**                                                                                     |
| Base.en actual inference / 15-minute conversation / ARM64 | **Pending**                                                                                     |

The user explicitly authorised the official tiny.en model and known speech fixture downloads for verification. Both checksums match. Tiny.en and the CPU runtime are installed under local application data; no model or runtime binary is committed. Base.en install/selection and its pinned checksum are implemented, but it was not downloaded or claimed as inference-tested.

One recorded four-thread CPU fixture run: model load **86.3 ms**, consecutive ~11-second jobs **648.0/528.2 ms**, working set about **165 MiB**, helper CPU about **373–395 one-core percent** during inference. A recorded dual-source Electron run averaged **487.4 ms** over ten chunk jobs, with queue **0**, dropped jobs **0**, gaps **0**, and ~**166 MiB** working set. These short warm-cache observations do not establish long-run/hardware performance. Latest per-run fixture measurements are in ignored `artifacts/inference.json` and `artifacts/speech-smoke.json`.

## Architecture and limits

- One native helper/model per enabled run; sequential C API inference, source-fair scheduling and no shell/HTTP server/native Node binding. Models release on transcription/capture pause, Stop, Clear, settings/model changes, failure and shutdown.
- Native audio-clock spacing, strict PCM validation, channel averaging and bounded FIR resampling preserve source/time provenance. Gaps reset conversion and separate speech segments.
- P2's original two-second/768,000-byte caches are unchanged. P3 adds 10–15-second speech segments, up to two queued jobs per source, and one in-flight inference. Overload replaces superseded partials and drops older queued work visibly.
- Partials are actual chunk inference and can change. Stable utterance IDs replace provisional text; finals commit it. Limited overlapping multiword text is deduplicated without merging sources or claiming speaker identities.
- Transcript retention defaults to 15 minutes/200 events, with a 50,000-character cap and scheduled expiry. Text stays in memory, survives pause for review, clears on request/new session, and is never saved automatically.
- Transcription starts OFF and cannot activate audio. Enable requires authorised ACTIVE audio capture. Random run/session/job guards reject old PCM/results. Clear cancels pending work and leaves transcription paused. Capture Resume also requires an explicit transcription Resume.
- Tiny.en/base.en downloads are explicit, bounded and checksum-verified; default model tiny.en. No external transcription/AI calls, telemetry, conversation export, question detection or AI memory was added.

Remaining limits: energy gating is sensitive to noise/quiet speech; max-boundary overlap deduplication is approximate; overload can lose text; Windows loopback routing/protection/mute limitations remain. The tested x64 native backend uses AVX2/FMA/F16C/BMI2. ARM64 and older CPU rebuilds, real devices/calls, base.en quality and a 15-minute Windows stability run require manual acceptance. P1/P2 acceptance remains open; no synthetic result is presented as hardware acceptance.

See [Architecture](ARCHITECTURE.md), the [decision record](DECISIONS/P3-transcription.md), [Testing](TESTING.md) and [Backlog](BACKLOG.md).

## Files changed

Modified:

```text
.gitignore
README.md
docs/ARCHITECTURE.md
docs/BACKLOG.md
docs/TESTING.md
docs/DELIVERY.md
package.json
package-lock.json
scripts/smoke.mjs
scripts/synthetic-audio.mjs
src/main/audio-host.ts
src/main/index.ts
src/main/session.ts
src/preload/audio.ts
src/preload/index.ts
src/renderer/audio/engine.ts
src/renderer/audio/main.ts
src/renderer/audio/worklet.ts
src/renderer/src/main.tsx
src/renderer/src/styles.css
src/shared/audio-ipc.ts
src/shared/contracts.ts
tests/audio-engine.test.ts
tests/audio-host.test.ts
```

Created:

```text
docs/DECISIONS/P3-transcription.md
native/transcriber/CMakeLists.txt
native/transcriber/main.cpp
resources/speech-models.json
scripts/build-transcriber.ps1
scripts/install-model.mjs
scripts/smoke-transcription.mjs
scripts/speech-fixture.mjs
scripts/test-inference.mjs
src/main/transcription/controller.ts
src/main/transcription/model-files.ts
src/main/transcription/models.ts
src/main/transcription/pcm.ts
src/main/transcription/segmenter.ts
src/main/transcription/transcripts.ts
src/main/transcription/worker.ts
src/renderer/src/TranscriptionPanel.tsx
src/shared/transcription.ts
tests/speech-models.test.ts
tests/transcription-controller.test.ts
tests/transcription-pcm.test.ts
tests/transcription-segments.test.ts
tests/transcripts.test.ts
tests/whisper-worker.test.ts
```

No npm dependency was added. Application version is 0.3.0. Native/source/model/fixture caches live outside source control, and test reports/screenshots remain ignored. No unrelated files were modified.

## Run and reproduce

With Node 24, Git, Visual Studio C++ Build Tools/Windows SDK and CMake 3.24+:

```powershell
cd C:\Users\Victor\Projects\EveryHint
npm ci
npm run speech:build
npm run speech:model -- tiny.en
npm run dev
```

The helper and tiny.en are already installed locally from this verification; repeating their setup is optional. For an additional model, explicitly run `npm run speech:model -- base.en` or use settings.

```powershell
npm run check
npm run smoke
npm run speech:test -- --install-fixture
npm run smoke:speech
```

Only the first fixture test needs `--install-fixture`; subsequent speech tests are offline. The Node helper test uses Node 24's experimental type-transform flag to import the production TypeScript worker; the packaged application uses compiled JavaScript and does not need that flag. Native source is pinned to `d1be6fde11ac6e0407606b4e42fe72d34add8037` and its published root license (the ggml authors' MIT license) is installed beside the helper.

The verified P3 commit uses `feat: add EveryHint local live speech transcription`. Inspect `git log -1 --oneline` and `git status --short`. P4/P5 have not started.
