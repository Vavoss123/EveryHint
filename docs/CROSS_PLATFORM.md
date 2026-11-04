# macOS and Linux — 0.7.0

EveryHint 0.7.0 provides Windows, Apple silicon/Intel Mac and Linux downloads on [GitHub Releases](https://github.com/Vavoss123/EveryHint/releases/tag/v0.7.0). Native GitHub jobs pass the source gate, build the packages and run each packaged app with its persistent OS credential store. [Exact checks, build sources, hashes and remaining device-testing limits](evidence/native-release-0.7.0.json).

| Target | Downloads | Requirements and current limits |
| --- | --- | --- |
| Windows x64 | `EveryHint-Setup-0.7.0.exe` | Existing per-user installer and Windows loopback path retained. |
| Mac, Apple silicon | `EveryHint-0.7.0-mac-arm64.dmg` and `.zip` | macOS 14.2+, microphone/screen/system-audio permissions as selected. |
| Mac, Intel | `EveryHint-0.7.0-mac-x64.dmg` and `.zip` | macOS 14.2+; separate native x64 helper/modules. |
| Linux x64 | `EveryHint-0.7.0-linux-x86_64.AppImage` and `EveryHint-0.7.0-linux-amd64.deb` | Ubuntu 22.04/Debian 12 or compatible newer desktop; PulseAudio/PipeWire-Pulse and persistent Secret Service. Screen context currently requires X11/Xorg. |

The Mac application is ad-hoc signed for local execution, **not Developer ID signed or notarized**. Gatekeeper may require approval through macOS Privacy & Security. It is not an App Store/iPhone/iPad build. Linux AppImage users need working FUSE and the Chromium sandbox on their distribution; prefer the Debian package where AppImage prerequisites are restricted. No sandbox-disabling flag is added.

## Install a native download

On a Mac, choose the download for your processor, open the DMG and drag **EveryHint** to **Applications**. The ZIP contains the same app bundle. Open the app from Applications and allow only the microphone/screen/system-audio sources you select for a session. An ad-hoc testing build may require **Open Anyway** in Privacy & Security.

On Ubuntu/Debian, install the downloaded package with `sudo apt install ./EveryHint-0.7.0-linux-amd64.deb`; apt installs the declared dependencies. Open EveryHint from the applications menu. For an AppImage, make it executable with `chmod +x EveryHint-0.7.0-linux-x86_64.AppImage`, then run it on a desktop with FUSE, an unlocked Secret Service and `pulseaudio-utils`. Choose an X11/Xorg login session when you need screen context.

## What changed

- Native helper builds now run through `npm run speech:build` on all three OSes. Windows keeps its static MSVC build. POSIX builds install the executable without `.exe`; architecture/OS headers are checked before packaging. Apple silicon and Intel are built separately, with CPU-only Whisper and no model bundled. Helper memory diagnostics use native POSIX resource accounting.
- macOS gets microphone and system-audio usage descriptions, an explicit microphone-permission request after capture consent, a real app/edit/window menu and Dock recovery actions. Stop during a pending permission prompt cannot start capture after the prompt returns. Screen permission can be requested on first use; denied/restricted access explains how to recover. Electron 45 uses the CoreAudio Tap path on macOS 14.2+, with no obsolete ScreenCaptureKit fallback flag. [Electron capture requirements](https://www.electronjs.org/docs/latest/api/desktop-capturer).
- Linux system audio uses `/usr/bin/parec` with the **default playback monitor**, never a microphone substituted for playback. It delivers bounded 16 kHz mono float PCM into the existing local transcription pipeline, separately labelled from microphone input. It starts only inside authorised capture, reports startup/server failures and is released on Pause/Stop. Missing `pulseaudio-utils` disables the system-audio choice with an explanation. Changing outputs may require restarting the session. [PulseAudio's monitor-device support](https://github.com/pulseaudio/pulseaudio/blob/master/src/utils/pacat.c).
- On Wayland, microphone and playback-monitor audio remain available. The existing thumbnail-based screen adapter is explicitly disabled rather than repeatedly opening a portal or implying reliable screen context. Use an X11/Xorg login session for screen context. Click-through is disabled under Wayland; compositor-dependent window positioning is not certified. The Linux dashboard minimises on successful Start and start-hidden launch, preserving a recovery entry even on desktops without tray indicators.
- Persistent credentials use Windows Credential Manager, macOS Keychain or Linux Secret Service. Linux explicitly rejects the keyring library's volatile kernel-keyring fallback, which would lose encryption keys on reboot. GNOME Keyring or a compatible unlocked Secret Service (including appropriately configured KWallet) must be available on the desktop session bus. No plaintext fallback was added. Existing service names, Windows data paths, encrypted schemas and sharing grants remain intact.
- Windows-only content protection is disabled and accurately labelled on macOS/Linux. Local hiding remains separate from capture exclusion; no platform/receiving-app invisibility claim is made. Automatic updates remain disabled.

Mac helper signing happens **before** its hash is recorded. Bundle signing excludes the already signed helper, and the native package audit checks the final resource hash plus the app/helper signatures. Windows resources and the VC runtime DLL do not leak into POSIX packages.

## Generate the downloads on GitHub

Push the source changes, then run **Actions → macOS and Linux installers → Run workflow**. The matrix uses `macos-15` (arm64), `macos-15-intel` and `ubuntu-22.04`. Each job compiles its own speech helper/native modules, runs the source checks, creates both package formats, checks resource integrity and runs the actual packaged application with an isolated profile. The smoke also opens a synthetic encrypted library through the native persistent credential store. [Official runner labels](https://github.com/actions/runner-images#available-images).

The Linux smoke uses a private D-Bus session, synthetic keyring and virtual X11 display. Its sandbox setup is confined to the disposable CI runner; the application sandbox stays enabled. It does not record the runner's microphone or request AI inference. Mac/Linux audio hardware, macOS TCC prompts, physical displays, Wayland behavior and sharing receivers still need real-device acceptance.

Successful manual jobs provide downloadable workflow artifacts. Publishing a release tagged **`v0.7.0`** triggers both the existing Windows workflow and the native Mac/Linux matrix. Each app download gets its own SHA-256 file. Existing download/checksum pairs are preserved; partial pairs stop the upload to prevent attaching a checksum for different build bytes. No signing/notarization credentials or update feed are required for these testing builds.

## Build locally on the target OS

Install Node 24, CMake 3.24+ and the native C++ toolchain (Xcode Command Line Tools on macOS; a compiler on Linux), then:

```sh
npm ci
npm run check
npm run speech:build -- --speech-home "$PWD/artifacts/release-speech"
npm run dist:mac       # on macOS
# or: npm run dist:linux
npm run package:audit-posix
npm run smoke:posix
npm run package:checksums-posix
```

Run the native smoke on a desktop session with an unlocked persistent credential store. Linux CI can use `bash scripts/linux-desktop-smoke.sh` after installing its documented desktop/keyring dependencies. Source development uses the normal `npm run dev`; macOS may attribute recording permission to the terminal/IDE, so packaged-app permission testing is still necessary.

App users need no Node/compiler. Speech models download only after approval. Development model helpers now use platform-appropriate directories: macOS `~/Library/Application Support/EveryHint/speech`, Linux `$XDG_CONFIG_HOME/EveryHint/speech` (default `~/.config/EveryHint/speech`), and the existing Windows local-app-data directory. `EVERYHINT_SPEECH_HOME` remains an explicit override.

## Verification scope

New tests cover OS/version capability gates, unsupported Wayland screen capture, native binary architecture checks, persistent Linux keyring selection, bounded/source-labelled Linux PCM, cancellation/late data, absent audio servers, malformed samples, macOS permission denial/cancellation and runtime OS/architecture binding. All prior unit cases are retained. Existing Windows loopback unit fixtures explicitly model Windows on every test host, preventing unit tests from accidentally recording real Linux audio.

Native Windows, macOS arm64/x64 and Linux x64 GitHub jobs have now executed successfully. Each host passes 719 source tests. Windows passes its real installer lifecycle; Mac/Linux pass package integrity and renderer/credential-store smoke checks. Native package audits verify the speech helper hash and OS/CPU binding; the Mac audit also verifies app/helper signatures. Real audio hardware, macOS TCC prompts and screen-sharing receivers remain separate device checks. No physical audio capture or genuine provider inference was used by these jobs. See the [native release receipt](evidence/native-release-0.7.0.json).
