# EveryHint

Live transcripts, meeting notes and quick answers in a small desktop window.

## Download

| Your computer | Download |
| --- | --- |
| Windows, 64-bit | [Installer](https://github.com/Vavoss123/EveryHint/releases/download/v0.7.0/EveryHint-Setup-0.7.0.exe) |
| Mac with an Apple M-series chip | [DMG](https://github.com/Vavoss123/EveryHint/releases/download/v0.7.0/EveryHint-0.7.0-mac-arm64.dmg) · [ZIP](https://github.com/Vavoss123/EveryHint/releases/download/v0.7.0/EveryHint-0.7.0-mac-arm64.zip) |
| Mac with an Intel processor | [DMG](https://github.com/Vavoss123/EveryHint/releases/download/v0.7.0/EveryHint-0.7.0-mac-x64.dmg) · [ZIP](https://github.com/Vavoss123/EveryHint/releases/download/v0.7.0/EveryHint-0.7.0-mac-x64.zip) |
| Linux, 64-bit Intel/AMD | [Debian/Ubuntu package](https://github.com/Vavoss123/EveryHint/releases/download/v0.7.0/EveryHint-0.7.0-linux-amd64.deb) · [AppImage](https://github.com/Vavoss123/EveryHint/releases/download/v0.7.0/EveryHint-0.7.0-linux-x86_64.AppImage) |

## Windows

Open the installer, follow the setup, then launch **EveryHint** from the Start menu.

## Mac

Open the DMG and drag **EveryHint** into **Applications**. Then open it from Applications. Requires macOS 14.2 or newer.

If macOS blocks the first launch, open **System Settings → Privacy & Security → Open Anyway**.

## Linux

For Ubuntu/Debian, download the `.deb` file, then run:

```sh
cd ~/Downloads
sudo apt install ./EveryHint-0.7.0-linux-amd64.deb
```

For other Linux desktops with FUSE, download the AppImage and run:

```sh
cd ~/Downloads
chmod +x EveryHint-0.7.0-linux-x86_64.AppImage
./EveryHint-0.7.0-linux-x86_64.AppImage
```

Open **EveryHint** from your applications menu after installing the Debian package. Use an X11/Xorg desktop session for screen capture.

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
