# EveryHint 0.6.0 — Windows installer

Download **EveryHint-Setup-0.6.0.exe** from this release's Assets and run it. Installs for your Windows account, creates a Start menu shortcut, offers a desktop shortcut (selected by default) and can open EveryHint when setup finishes. No Node.js, npm, Visual Studio or separate VC++ runtime installation is needed on the recipient's PC.

Windows x64 with an AVX2-capable CPU is required for the bundled local speech helper. ARM64 and older non-AVX2 CPUs are not supported by this installer.

The installer is **unsigned**, so Windows may show an unknown-publisher or SmartScreen warning. A SHA-256 checksum is attached alongside the download. Automatic updates are disabled; install a newer GitHub release manually when available.

On first use, complete setup, connect your own supported AI account/API key and explicitly install the local speech model when prompted. The model download needs internet access; its checksum is verified. Models, credentials and personal data are not bundled in the installer. No capture or AI request starts merely by installing/opening the app.

Uninstall using Windows Settings → Apps → EveryHint. Existing local history, preferences and downloaded speech models are retained.

## Maintainer: upload this build

For this already-built version, create a GitHub release tagged `v0.6.0` targeting the installer commit, paste the user-facing paragraphs above into its notes, and attach:

- `release/EveryHint-Setup-0.6.0.exe`
- `release/EveryHint-Setup-0.6.0.exe.sha256`

The **Windows installer** Actions workflow can also build the installer on demand: Actions → Windows installer → Run workflow. A published release whose `vX.Y.Z` tag matches `package.json` triggers a fresh Windows build and attaches its own installer/checksum automatically. A manual workflow run provides the same files as a downloadable workflow artifact. If attaching an existing local build, use a draft until both files are uploaded; the published-release workflow keeps existing assets.

The source repository keeps build outputs ignored. Downloaders use the setup executable attached to the release. [GitHub's release instructions](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).

## Maintainer: reproduce locally

Use Windows x64, Node 24 LTS, Visual Studio C++ Build Tools/CMake and its release x64 VC runtime component:

```powershell
npm ci
npm run check
npm run speech:build -- -SpeechHome "$PWD\artifacts\release-speech"
npm run dist:win
npm run package:audit
npm run package:verify
npm run smoke:packaged
npm run test:installer
npm run package:checksum
```

`test:installer` performs real current-user install/reinstall/launch/uninstall and refuses a host with an existing EveryHint installation/process/shortcut. Use a clean development/test host. The packaged smoke uses an isolated profile and never requests AI inference or captures physical media.

The speech helper uses the static MSVC runtime. The native credential module still imports `vcruntime140.dll`; preparation copies the signed x64 release DLL from the installed Visual Studio redist directory beside EveryHint.exe and records its hash/version. An alternate redist source can be selected with `EVERYHINT_VC_REDIST_DIR`. The package audit verifies its hash and Microsoft signature. [Microsoft's app-local deployment documentation](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files), [CMake runtime selection](https://cmake.org/cmake/help/latest/variable/CMAKE_MSVC_RUNTIME_LIBRARY.html). App-local runtime updates require a rebuilt installer.

This build has been exercised on the current Windows 11 host. A separate clean VM/physical Windows 10/11 machine, genuine recipient sign-in and audio hardware remain useful follow-up testing. This is an unsigned GitHub testing build; older RC acceptance documents describe earlier builds and do not mean a GitHub installer has been uploaded.
