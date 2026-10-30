# Installing AI Hat

[← Back to the README](../README.md)

Every change is built automatically and published on the **[Releases page](https://github.com/aman-mohammed-max/aihat/releases)**. "Latest beta build" is replaced by a fresh build on every change; numbered releases (like `v0.1.0-beta.1`) stay as they are.

If a link says "not found", the newest build hasn't finished yet. Builds take 15 to 40 minutes.

## Which file do I need?

| Device | File |
|---|---|
| **Android phone, tablet or Chromebook** | [AI-Hat-beta-latest.apk](https://github.com/aman-mohammed-max/aihat/releases/download/beta-latest/AI-Hat-beta-latest.apk) supports 64-bit ARM and x86_64 devices. Smaller versions target [arm64](https://github.com/aman-mohammed-max/aihat/releases/download/beta-latest/AI-Hat-beta-latest-Android-arm64.apk) phones/tablets or [x86_64](https://github.com/aman-mohammed-max/aihat/releases/download/beta-latest/AI-Hat-beta-latest-Android-x86_64.apk) Chromebooks/emulators. 32-bit Android processors are not supported by the local model engine. |
| **iPhone or iPad** | [AI-Hat-beta-latest-unsigned.ipa](https://github.com/aman-mohammed-max/aihat/releases/download/beta-latest/AI-Hat-beta-latest-unsigned.ipa) |
| **Mac** | [Apple Silicon (M1 and newer)](https://github.com/aman-mohammed-max/aihat/releases/download/beta-latest/AI-Hat-beta-latest-macOS-arm64.dmg) · [Intel](https://github.com/aman-mohammed-max/aihat/releases/download/beta-latest/AI-Hat-beta-latest-macOS-x64.dmg) |
| **Windows** | [Intel / AMD](https://github.com/aman-mohammed-max/aihat/releases/download/beta-latest/AI-Hat-beta-latest-Windows-x64-Setup.exe) · [ARM](https://github.com/aman-mohammed-max/aihat/releases/download/beta-latest/AI-Hat-beta-latest-Windows-arm64-Setup.exe) |
| **Linux (Debian, Ubuntu)** | [x64](https://github.com/aman-mohammed-max/aihat/releases/download/beta-latest/AI-Hat-beta-latest-Linux-x64.deb) · [ARM](https://github.com/aman-mohammed-max/aihat/releases/download/beta-latest/AI-Hat-beta-latest-Linux-arm64.deb) |
| **Linux (any, Flatpak)** | [x64](https://github.com/aman-mohammed-max/aihat/releases/download/beta-latest/AI-Hat-beta-latest-Linux-x64.flatpak) · [ARM](https://github.com/aman-mohammed-max/aihat/releases/download/beta-latest/AI-Hat-beta-latest-Linux-arm64.flatpak) |

There are no 32-bit computer versions (the desktop app's engine only exists for 64-bit systems). Every release lists SHA-256 checksums for its files.

## Android

1. Download the APK on your phone and open it.
2. If asked, allow "Install unknown apps" for your browser or Files app.
3. Tap **Install**. Android may say the app isn't from the Play Store; that's expected for a beta shared here.

### Automatic updates with Obtainium

[Obtainium](https://obtainium.imranr.dev) installs apps from GitHub and keeps them updated. On your phone, tap:

[<img src="https://raw.githubusercontent.com/ImranR98/Obtainium/main/assets/graphics/badge_obtainium.png" alt="Get it on Obtainium" height="54">](https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22com.amanm.aihat%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2Faman-mohammed-max%2Faihat%22%2C%22author%22%3A%22aman-mohammed-max%22%2C%22name%22%3A%22AI%20Hat%22%2C%22additionalSettings%22%3A%22%7B%5C%22includePrereleases%5C%22%3A%20true%2C%20%5C%22apkFilterRegEx%5C%22%3A%20%5C%22AI-Hat-beta-latest%5C%5C%5C%5C.apk%24%5C%22%2C%20%5C%22releaseDateAsVersion%5C%22%3A%20true%7D%22%7D)

Or add `https://github.com/aman-mohammed-max/aihat` yourself in Obtainium, then:
- turn on **Include prereleases** (the beta is a pre-release),
- set **Filter APKs by regular expression** to `AI-Hat-beta-latest\.apk$`,
- turn on **Use release date as version string** (the beta always has the same name, so the date tells Obtainium there's an update).

**Obtainium shows "401"?** That means the GitHub token saved in Obtainium is wrong or expired. Remove it (Obtainium Settings › GitHub › Personal access token) and try again. You don't need a token for AI Hat.

## iPhone and iPad

The IPA isn't signed by Apple yet, so tapping it won't install it. Open it with [AltStore](https://altstore.io), [SideStore](https://sidestore.io) or [Sideloadly](https://sideloadly.io), which sign it with your own Apple ID. With a free Apple ID the app has to be re-signed every 7 days.

## Mac

Open the `.dmg` and drag AI Hat to Applications. The first time, right-click the app and choose **Open** (or System Settings › Privacy & Security › **Open Anyway**). If macOS says the app is damaged, run this once in Terminal: `xattr -cr "/Applications/AI Hat.app"`

## Windows

Run the Setup file. If Windows says it protected your PC, choose **More info › Run anyway** (the app isn't signed yet). AI Hat then appears in the Start menu.

## Linux

- **Debian, Ubuntu and similar** (Debian 12, Ubuntu 22.04 or newer): open the `.deb` with your software installer, or run `sudo apt install ./AI-Hat-…-Linux-x64.deb`.
- **Any distribution, with Flatpak:** with [Flathub set up](https://flathub.org/setup), run `flatpak install --user ./AI-Hat-…-Linux-x64.flatpak`.

AI Hat then appears in your app menu.
