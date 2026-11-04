# EveryHint

Live transcripts, meeting notes and quick answers in a small desktop window.

## Windows

**[Download EveryHint for Windows](https://github.com/Vavoss123/EveryHint/releases/download/v0.6.0/EveryHint-Setup-0.6.0.exe)**

Open the downloaded file, follow the setup, then launch **EveryHint** from the Start menu.

## Mac — install from source

You'll need macOS 14.2+, Node.js 24, Git, CMake 3.24+ and Xcode Command Line Tools.

Open Terminal and run:

```sh
git clone --depth 1 --branch main https://github.com/Vavoss123/EveryHint.git
cd EveryHint
npm ci
npm run speech:build -- --speech-home "$PWD/artifacts/release-speech"
npm run dist:mac
open release/EveryHint-*-mac-*.dmg
```

Drag **EveryHint** into **Applications**, then open it from there.

## Linux — install from source

For Ubuntu/Debian on a 64-bit Intel or AMD computer. You'll need Node.js 24 and CMake 3.24+ installed first.

Open a terminal and run:

```sh
sudo apt update
sudo apt install -y git build-essential gnome-keyring pulseaudio-utils
git clone --depth 1 --branch main https://github.com/Vavoss123/EveryHint.git
cd EveryHint
npm ci
npm run speech:build -- --speech-home "$PWD/artifacts/release-speech"
npm run dist:linux
sudo apt install ./release/EveryHint-*-linux-x64.deb
```

Open **EveryHint** from your applications menu. Use an X11/Xorg desktop session for screen capture.

## Start using EveryHint

1. Open the app and finish setup.
2. Connect your account or add a key in **Settings** for answers and generated notes.
3. Download the speech model when prompted.
4. Click **Start EveryHint**, choose your screen and audio sources, and confirm you have permission to use them.
5. Ask a question in the floating window or press **Ctrl+Enter**.

Saved sessions are in **Meetings**. Untick **Save this session with notes** before starting if you don't want to keep one.

Use **Pause** to take a break and **Stop** when you're finished. Hiding the window doesn't stop the session.

Audio is transcribed on your computer. Answers and generated notes use your connected service and the content you approve.

[Need help? Open an issue.](https://github.com/Vavoss123/EveryHint/issues)
