# P3 local transcription decision

Use one CPU-only helper process linked to the official whisper.cpp C API (v1.9.5, commit `d1be6fde11ac6e0407606b4e42fe72d34add8037`). It loads one verified model for an explicitly enabled transcription run. Both P2 sources feed it through validated, backpressured PCM IPC. No recorder, HTTP server, Node native binding, speech API or additional ML/VAD model is required.

The helper accepts bounded binary mono float32/16 kHz jobs on stdin and emits bounded JSON results on stdout. Main schedules sources fairly, with one in-flight job and at most two queued jobs per source. Provisional jobs are replaced by newer windows; finals supersede queued provisional jobs. Overload drops stale queued work with visible counters. Killing the helper cancels inference and releases the model on pause, stop, clear, model change, failure or shutdown. Session/run/job identifiers reject obsolete results.

P2's original two-second/768,000-byte caches remain. A separate per-source segmentation buffer is capped at 10–15 seconds (default 12), with a small pre-roll and configurable overlap. Stateful low-pass resampling, energy-based gating and chunk-based inference provide honest partial/final results. No question detection or AI memory is introduced.

Model downloads require an explicit settings action, show size and verify pinned Hugging Face LFS SHA-256 hashes. Runtime/source/model caches live outside the repository under local application data. The user separately authorised tiny.en and the upstream speech fixture download for real inference verification in this session. Hardware acceptance for P1/P2 remains pending.

Rejected alternatives: standalone whisper-stream would bypass the existing capture pipeline; per-segment CLI launches reload the model; in-process bindings complicate Electron ABI/build/security; a local HTTP server adds an unnecessary listening endpoint. Whisper's neural VAD would require another model, so this milestone uses a configurable energy gate and documents its noise limitations.
