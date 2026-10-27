# P1 delivery

P1 implements the Electron main-process window/tray/hotkey manager, validated sandboxed IPC, a React overlay, an authoritative consent/session controller, serial low-frequency native screen snapshots, diagnostic previews, settings persistence and future service contracts. No P2–P6 functionality or provider billing prerequisites were added.

Verification: strict TypeScript, lint, **62 unit tests**, production build and **21 real Electron smoke assertions** pass. Real-source Windows capture and physical global-shortcut/tray checks remain pending in [Testing](TESTING.md). The app-only smoke screenshot is generated locally at `artifacts/everyhint-overlay.png` and excluded from Git. See [Architecture](ARCHITECTURE.md) for capture API limitations and [Backlog](BACKLOG.md) for milestone acceptance state.

## Files created

The working directory was empty and was not a Git repository. All tracked project files are new:

```text
.gitattributes
.gitignore
README.md
docs/ARCHITECTURE.md
docs/BACKLOG.md
docs/DELIVERY.md
docs/TESTING.md
electron.vite.config.ts
eslint.config.js
package-lock.json
package.json
scripts/smoke.mjs
src/main/capture.ts
src/main/electron-capture.ts
src/main/hotkeys.ts
src/main/index.ts
src/main/security.ts
src/main/session.ts
src/main/settings.ts
src/preload/index.ts
src/renderer/index.html
src/renderer/src/env.d.ts
src/renderer/src/main.tsx
src/renderer/src/styles.css
src/shared/contracts.ts
src/shared/validation.ts
tests/capture.test.ts
tests/electron-capture.test.ts
tests/helpers.ts
tests/hotkeys.test.ts
tests/security.test.ts
tests/session.test.ts
tests/settings.test.ts
tsconfig.json
vitest.config.ts
```

Generated dependency files (`node_modules/`), compiled output (`out/`) and diagnostic test artifacts (`artifacts/`) are untracked and ignored. No unrelated files were modified.

## Exact commands

```powershell
cd C:\Users\Victor\Projects\EveryHint
npm ci
npm run dev
```

Production launch and verification:

```powershell
npm run check
npm run smoke
npm start
```

The P1 implementation is committed as `feat: initialise EveryHint desktop foundation`. Run `git log -1 --oneline` and `git status --short` for the recorded commit and working-tree state. P2 awaits manual acceptance and approval.
