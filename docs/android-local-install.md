# Install on your Android phone for local testing

Three ways, ranked by speed-to-first-test (fastest first). Pick the path that matches your goal.

| Method | Build time | Cost | Push notifications work? | Best for |
|---|---|---|---|---|
| **A. Expo Go** | < 1 min | free | ❌ **no** (SDK 53+ removed it) | Everything BUT push — UI, navigation, chat, sockets, login, ordering. Daily dev iteration. |
| **B. EAS Build (preview APK)** | ~10 min | free* | ✅ yes | **Required if you're testing push notifications.** Real install with launcher icon. |
| **C. Local dev build** | ~5–15 min | free | ✅ yes | When you need a custom native module not in Expo Go (we don't currently). |

\* Expo's free tier covers ~30 builds/month — plenty for an MVP.

> 🚨 **Expo Go can't deliver push notifications** since SDK 53. Our `lib/notifications.ts`
> detects Expo Go (`Constants.executionEnvironment === 'storeClient'`) and short-circuits
> push registration — no error, just a console log. **Everything else in the apps works
> identically in Expo Go.** Reach for Path B only when you need to verify push delivery.

---

## Path A — Expo Go (fastest)

This is exactly what we've been doing during development. Install **Expo Go** on your Android phone, scan the QR code, app loads.

### One-time on your phone

1. Open Play Store → search **"Expo Go"** → install
2. Make sure the phone is on the **same Wi-Fi** as your laptop

### Per-app

```bash
# In separate terminals on your laptop
cd apps/customer    && npx expo start --lan
cd apps/store-portal && npx expo start --port 8082 --lan
cd apps/driver       && npx expo start --port 8083 --lan
```

In each terminal a QR code prints. Open Expo Go on the phone → "Scan QR code" → tap the QR → app loads in 5-10 seconds.

### When to use this

✅ You want to test a new feature you just wrote and reload as you change code
✅ You want the fastest possible feedback loop
✅ You're not testing real push notifications (Expo Go's push token registration sometimes silently fails — for production-quality push behavior use Path B)

### Limitations

- The phone must be on the **same Wi-Fi** as your laptop (LAN-only)
- Expo Go bundles a generic native runtime, so any package not pre-bundled in Expo Go (we don't have any) won't work
- Closing Expo Go = app stops; it's not a "real" install

---

## Path B — EAS Build (preview APK) — recommended for personal Android install

Generates a real `.apk` file you install directly on the phone. App icon shows up in the launcher just like any Play Store app. Push notifications work end-to-end.

### One-time setup

```bash
# Install the EAS CLI globally
npm install -g eas-cli

# Log in (creates a free Expo account if you don't have one)
eas login

# Bind each app to an EAS project — writes a projectId to app.json
cd apps/customer    && eas init
cd apps/store-portal && eas init
cd apps/driver       && eas init
```

The `projectId` it writes to `app.json` is what unlocks **real Expo Push tokens**. Without it, push registration logs a warning and skips (apps still work, just no push).

### Add an `eas.json` build profile (one-time per app)

Inside each app folder, create `eas.json` if it's missing:

```jsonc
// apps/customer/eas.json (and the same in apps/driver/, apps/store-portal/)
{
  "cli": { "version": ">= 16.0.0" },
  "build": {
    "preview": {
      "android": {
        "buildType": "apk",         // .apk (not .aab), so you can sideload
        "distribution": "internal"  // no Google Play submission
      },
      "channel": "preview"
    },
    "production": {
      "android": { "buildType": "app-bundle", "autoIncrement": true },
      "ios":     { "autoIncrement": true }
    }
  }
}
```

### Build the APK

```bash
cd apps/customer
eas build --platform android --profile preview
# Same for apps/driver, apps/store-portal — runs ~10 min each in Expo's cloud
```

When the build finishes, the terminal prints a URL like:

```
🤖 Android app:
https://expo.dev/artifacts/eas/AbCdEf123.apk
```

### Install the APK on your phone

**Option 1 — direct download (easiest):**
1. Open the URL above on your phone's browser
2. Tap "Download" → "Open" → Android asks "Allow installs from this source?" → enable for Chrome (one-time) → tap Install

**Option 2 — adb sideload (if your phone is plugged into your laptop):**

```bash
# Enable Developer Options on the phone:
#   Settings → About → tap "Build number" 7 times
# Then enable USB debugging:
#   Settings → System → Developer options → USB debugging
# Plug phone into laptop with USB cable, accept the "Allow USB debugging" prompt

# Install via adb (Android Debug Bridge — comes with Android Studio or via brew)
brew install android-platform-tools  # if you don't have adb
adb devices                          # confirms phone is connected
adb install ~/Downloads/customer-preview.apk
```

After install, the app icon appears in your launcher. **No Play Store needed.** This is the same APK you'd ship to a beta tester.

### Point the app at your dev backend

The preview APK is built with whatever `EXPO_PUBLIC_API_URL` is in your local `.env` at build time. To point it at your laptop's backend:

1. Find your laptop's LAN IP: `ipconfig getifaddr en0`
2. Before running `eas build`, set the env var:
   ```bash
   export EXPO_PUBLIC_API_URL=http://192.168.1.42:3001
   eas build --platform android --profile preview
   ```
3. The phone must stay on the same Wi-Fi network when using the app

For production-pointed builds, set `EXPO_PUBLIC_API_URL=https://api.yourdomain.com` instead.

### When to use this

✅ You want a "real install" that survives reboots and shows up in the launcher
✅ You're testing real push notifications (this is the only path where they reliably work in v1)
✅ You're handing the app to someone else to try (just send them the APK link)
✅ You want to sanity-check what the launch APK will feel like

### Limitations

- 10-min build per app per code change (no hot reload)
- Free tier: ~30 builds/month across the whole Expo account
- Currently Android-only flow; iOS sideload requires AltStore / Apple Developer account

---

## Path C — Local dev build (advanced)

For when you need to install custom native modules. We don't currently use any (everything is Expo-managed), so this is rarely needed. Skip unless Path A and B both don't fit.

### Prereqs

- macOS, Linux, or WSL
- **Android Studio** installed (for the SDK + emulator + adb)
- Phone connected via USB with USB debugging on, OR an Android Emulator running

### Run

```bash
cd apps/customer
npx expo run:android
# First run downloads native deps + builds → ~10–15 min
# Subsequent runs are ~30 seconds
```

The CLI installs the dev APK on the connected device/emulator and connects it to the Metro bundler — so you get hot reload PLUS real native code.

### When to use this

✅ Adding a native module not bundled in Expo Go (we don't have any)
✅ Debugging native crashes that don't reproduce in Expo Go

### Limitations

- Requires Android Studio installed (~5 GB)
- The dev APK is "unsigned" — fine for your own phone, can't be shared

---

## Per-app notes

All three apps follow the same path; just the folder changes.

| App | Folder | Default Metro port | Bundle ID for production builds |
|---|---|---|---|
| Customer | `apps/customer` | 8081 | `com.apnikiranastore.customer` |
| Store Portal | `apps/store-portal` | 8082 | `com.apnikiranastore.store` |
| Driver | `apps/driver` | 8083 | `com.apnikiranastore.driver` |

When using `eas build`, it'll prompt you for the `android.package` — accept the default in `app.json` (matches the Bundle ID column).

---

## Test users to log in with

Once the app is installed, log in with one of the seeded test users (assumes you ran `prisma db seed` on your dev backend):

| App | Phone | OTP |
|---|---|---|
| Customer (Zaheer Khan) | `8888888881` | any 6 digits in dev |
| Store Portal (Baqala Owner) | `8888888882` | same |
| Driver (Chotu Singh) | `8888888883` | same |

**OTP retrieval depends on your `SMS_PROVIDER`:**

```bash
# When SMS_PROVIDER=CONSOLE (dev default)
docker compose logs backend --tail 5 | grep OTP

# When SMS_PROVIDER=TWOFACTOR / MSG91 (real SMS goes to phone)
# OR you don't want to spend SMS credits on test logins:
docker compose exec redis redis-cli GET "otp:8888888881"
```

---

## Recommended workflow

For the typical "I want to test on my Android phone" loop:

1. **First install:** **Path B (EAS Build → APK).** ~10 min one-time, but you get a real installable app with working push notifications.
2. **Daily iteration:** Switch to **Path A (Expo Go)**. Hot reload, sub-second feedback.
3. **Before sharing with someone else:** Run Path B again to generate a fresh APK link.

If push notifications are critical to what you're testing right now, you must use Path B. Expo Go's push token registration is unreliable on Android (silently returns null sometimes).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| QR code doesn't load — "Couldn't connect" | Phone and laptop must be on **same Wi-Fi**. If on a corporate Wi-Fi that blocks peer-to-peer, switch to a phone hotspot or use `npx expo start --tunnel` (slower but works across networks). |
| `eas build` fails with "Workflow not found" | Run `eas init` inside that app folder first. |
| Push registration logs `[Notifications] No EAS projectId` | You skipped `eas init`. Push won't work until you bind a projectId. |
| APK installed but "Cannot connect to backend" | The APK was built without `EXPO_PUBLIC_API_URL` set. Rebuild with the env var pointing to your LAN IP or your prod URL. |
| Login OTP never arrives | Check `SMS_PROVIDER` in `backend/.env`; if `CONSOLE`, look in backend logs. If anything else, check the provider's dashboard for delivery status — fall back to reading from Redis (above). |
| App crashes on launch | `adb logcat | grep -i com.apnikiranastore` shows the native error. Most common: missing `EXPO_PUBLIC_API_URL` (the auth flow can't even start). |

---

## Distributing to other testers

The APK link from `eas build` is shareable for 30 days. Send it via WhatsApp, email, or a private Google Drive folder. The recipient:

1. Opens the link on their Android phone
2. Allows "Install unknown apps" for their browser (one-time)
3. Taps Install

For a polished beta program with crash analytics + screenshots, set up an **internal testing track** on Google Play Console ($25 once) — you upload the same APK once and beta testers install via Play Store as if it were live. Worth it once you have ~5+ testers; not before.
