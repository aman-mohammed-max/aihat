# Known limitations

[← Back to the README](../README.md)

AI Hat is in beta. These are the things that don't work yet, or work only in part.

- **iOS builds are unsigned**, so they need AltStore, SideStore or Sideloadly.
- **Developed and tested mainly on iPhone.** The Android build is newer and has had less testing.
- **Models on the phone (Marketplace › Local models) and Phonon-2 dictation are new and haven't been tried on a real phone or tablet yet.** They need the app from the Releases page: Expo Go and the desktop apps don't include them. A model needs enough memory (the Marketplace checks), and models are text only (no pictures, no tools). Phonon-2 is English only, needs a 64-bit Android phone or tablet, or iOS 18 or later on iPhone and iPad, and its download is 164 MB on Android and 345 MB on iPhone and iPad.
- **Live-text dictation** uses the phone's speech service (Apple on iPhone, Google on Android), which is a native module that **Expo Go doesn't include**: in Expo Go the mic uses your transcription endpoint instead.
- **Skill scripts on a phone have limits.** Once you turn on Skills › Run skill scripts, Python and simple Node scripts run in a sandbox (Word, Excel, PowerPoint, PDF files). Programs that only exist on computers (LibreOffice, ffmpeg, a web browser) can't run on a phone, and scripts have no internet there. This hasn't been tried on a real phone yet. See [SKILL_EXEC_RESULTS.md](../SKILL_EXEC_RESULTS.md). Skills and MCP servers are written by other people: read before you add.
- **skills.sh has no public API for apps.** Its documented API needs a Vercel server token, so the app uses the search endpoint its own command line tool uses, which may change. The other sources (company websites, GitHub, claude-plugins.dev) keep working if it does.
- **Browser sign-in for MCP servers** works with servers that let apps register themselves (Notion, Linear, Sentry, Vercel, Stripe, Supabase, Figma, Canva, PayPal and others). For services that don't (GitHub's, Asana's, Google's), create your own app at the service and paste its client ID, or use an access token. Adding a server asks it whether it needs a sign-in and opens the browser by itself when it does. This has been tested against a stand-in sign-in service and the real servers' sign-in descriptions, not yet with a real login on a phone.
- **MCP servers that only run as a program on a computer** (“stdio” servers, started with `npx`, `uvx` or `docker`) can't be used: a phone can't start them. Hosted servers work.
- **MCP connectors use access tokens**, not browser sign-in (OAuth isn't built). Backups are a JSON file you save or share yourself; backing up straight to Google Drive and iCloud is coming soon.
- **The desktop apps are new and haven't been tried on a real Mac, Windows PC or Linux desktop yet.** The web build and its Bun backend were tested in Chromium on Linux; the windows themselves are built by GitHub Actions. They are unsigned (see the [install guide](INSTALL.md)), don't update themselves yet (download a new build from Releases), and on Linux the menu bar isn't shown (use the keyboard shortcuts). Dictation in the desktop app depends on the system web view's microphone support.
- Not available as a website: the web build needs the desktop app's backend.
