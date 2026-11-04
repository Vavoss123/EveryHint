# EveryHint

A desktop app for live transcripts, meeting notes and quick answers. It has a main window for your sessions and a small floating window you can keep nearby while working.

## Download

**[Download EveryHint 0.6.0 for Windows](https://github.com/Vavoss123/EveryHint/releases/download/v0.6.0/EveryHint-Setup-0.6.0.exe)**

Run the installer and follow the steps. You don't need Node.js or any coding tools to use the app.

- This release is for 64-bit Windows. Local transcription needs a processor with AVX2 support.
- The installer isn't signed, so Windows may show an unknown-publisher warning.
- Mac and Linux support is being worked on in the [main branch](https://github.com/Vavoss123/EveryHint/tree/main).

The [release page](https://github.com/Vavoss123/EveryHint/releases/tag/v0.6.0) also has a checksum file and installation notes.

## Getting started

1. Open EveryHint and go through the setup.
2. Connect an account or add a key in Settings if you want answers and generated notes. These use the service you connect, so its account limits and charges may apply.
3. Download the speech model when prompted. Once installed, transcription runs on your computer.
4. Click **Start EveryHint**, choose your screen and audio sources, then confirm you're allowed to record and share them.
5. Use the floating window to ask a question, check the transcript or get a quick recap.

**Save this session with notes** is selected by default. Untick it before starting if you don't want to keep the session. Saved sessions are in **Meetings**.

## What you can do

- Read a live transcript from your microphone, computer audio, or both.
- Ask about a conversation or the screen you've chosen to share.
- Keep meeting transcripts, notes and follow-up tasks together.
- Add documents to your local library and use them as context.
- Move or hide the floating window while you work.

## Shortcuts

| Shortcut | What it does |
| --- | --- |
| `Ctrl+Enter` | Get an answer, or send what you've typed in the floating window |
| `Ctrl+\` | Show or hide the floating window |
| `Ctrl+Alt+Space` | Let clicks pass through the floating window |
| `Ctrl+Alt+P` | Pause or resume the session |
| `Ctrl+Alt+Shift+X` | Stop the session |

You can change these in Settings if they clash with another app. Hiding the window doesn't stop recording; use **Stop** when you're finished.

## Your data

Speech is transcribed locally. Answers and generated notes use your connected service, with the text and screen content you approve. Raw audio stays on your computer.

Saved history is encrypted locally. Only record or share content you have permission to use. Window hiding and screen-recording protection aren't a guarantee that another app won't capture the window.

## Run it from source

You'll need Node.js 24 and npm.

```sh
git clone https://github.com/Vavoss123/EveryHint.git
cd EveryHint
npm ci
npm run dev
```

To build and start the app:

```sh
npm run build
npm start
```

The local speech helper also needs Git, CMake 3.24+ and a C++ compiler. See the [Windows build guide](docs/RELEASE_0.6.0.md) for the tools and installer commands.

```sh
npm run speech:build
npm run speech:model -- tiny.en
```

Built with Electron, React, TypeScript and whisper.cpp. More technical details are in [Architecture](docs/ARCHITECTURE.md), and you can run the checks with `npm run check`.

## Found a problem?

It's still a work in progress. [Open an issue](https://github.com/Vavoss123/EveryHint/issues) with your operating system, what you tried and what happened. Leave out private recordings, account details and keys.
