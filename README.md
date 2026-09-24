<p align="center">
  <img src="public/Images/spinly-logo-128.webp" width="96" height="96" alt="Spinly logo" />
</p>

<h1 align="center">🎡 Spinly</h1>

<p align="center">
  A customizable prize wheel for giveaways, raffles and everyday decisions.<br />
  <a href="https://spinly-psi.vercel.app"><strong>🚀 Live demo →</strong></a>
</p>

<p align="center">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-4.9-3178C6?logo=typescript&logoColor=white" />
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Auth%20%7C%20Postgres%20%7C%20Storage-3ECF8E?logo=supabase&logoColor=white" />
  <img alt="Vercel" src="https://img.shields.io/badge/Deployed%20on-Vercel-000000?logo=vercel&logoColor=white" />
  <img alt="Lighthouse 100" src="https://img.shields.io/badge/Lighthouse-100%20%2F%20100%20%2F%20100%20%2F%20100-0CCE6B?logo=lighthouse&logoColor=white" />
</p>

---

## ✨ What it does

Spinly lets you build a spinning wheel in seconds and use it anywhere:

1. ✏️ **Add your options.** Up to 25, with a limit you can edit.
2. 🎨 **Style every sector.** Pick a color, or drop in an image and fit it exactly.
3. 🎯 **Spin.** A ticking wheel slows down, and a dialog announces the winner.
4. 💾 **Save it.** Keep the look as a **theme**, or the whole wheel as a **preset**.
5. 🌍 **Share it** with the community and use what other people made.
6. 🔐 **Take it with you.** Sign in on any device and your wheels are there.

It works fully offline with no backend. Accounts and the community are an optional layer on top.

## 🧩 Features

### 🎡 The wheel
- 🖐️ Reorder options by dragging with a mouse or a finger, or with the arrow keys.
- 🖼️ An image editor for each sector that shows exactly how the sector looks when it wins. Move, zoom and rotate by dragging, pinching, scrolling or with the keyboard.
- 💡 Animated fairground lights on the rim and the hub. Tap the wheel to recolor them, or tap the pointer to recolor it.
- 📊 An odds tooltip shows each option's chance of winning.
- 💾 The wheel remembers its options between visits.

### 🎨 The color picker
- HSV, hex and RGB, in a panel you can drag around the screen with the mouse.
- 💧 An **eyedropper that works in every browser**:
  - 🟢 **Chrome, Edge, Opera:** the native `EyeDropper` API picks from anywhere on screen, even other apps.
  - 🦊 **Firefox, Safari:** capture a frame of a screen, window or tab, then pick on it with a pixel magnifier.
  - 📱 **Mobile:** pick from a photo or screenshot by dragging your finger.

### 🔊 Sound, with zero audio files
- 🎼 Every sound is **synthesized with the Web Audio API**: oscillators shaped by gain envelopes.
- ⏱️ The tick reads the disc's real rotation from its CSS transform on every frame, so the rhythm follows the wheel as it slows down.
- 🏆 A chime for the winner, soft feedback on buttons, and one toggle to mute everything.

### 👥 Accounts and community
- 🔑 Sign in with a **username and password**. No email needed.
- ☁️ Your wheel, themes and presets **sync privately** to your account and appear on any device.
- 🧹 Signing out resets the browser to a fresh state.
- 🌍 Share themes and presets. Guests can browse and use them, and sharing needs an account.
- ♻️ Anything already downloaded is used from your local copy, never fetched again.

### 🌐 Everywhere
- 🇬🇧 🇪🇸 English and Spanish · 🌗 light and dark mode.
- 📱 A responsive layout with a mobile drawer.
- ⌨️ Full keyboard support, and `prefers-reduced-motion` is respected.

## 🛠️ Tech stack

| | Technology | Why |
| --- | --- | --- |
| ⚛️ | **React 19 + TypeScript** | Strict typing across UI, services and data models |
| 🎨 | **Plain CSS** with custom properties | No UI library: light and dark themes from design tokens, BEM-style `spinly-*` classes |
| 🗄️ | **Supabase** | Auth, Postgres with row level security, and Storage for avatars and account sync |
| 🔊 | **Web Audio API** | All sound effects synthesized in the browser |
| 🖌️ | **Canvas, EyeDropper and Screen Capture APIs** | A color eyedropper in every browser |
| 🧪 | **Jest + Testing Library** | 37 tests covering the UI, the data models and the account flows |
| ▲ | **Vercel** | A static deploy with a strict Content Security Policy |
| 📦 | **pnpm** | Dependencies, plus patches for the unmaintained Create React App |

## 🏆 Engineering highlights

### ⚡ Performance: Lighthouse 100 on mobile and desktop
- 📦 Only what the first paint needs is shipped:
  - Panels, the color picker, the eyedropper and the winner dialog are **loaded on demand**, and panels are preloaded once the browser is idle.
  - The Supabase SDK is **never downloaded** for visitors who have no session.
  - The main stylesheet is **inlined** into `index.html` at build time.
- 🚀 React 19 holds suspended content back for about 300 ms. Once a panel's module has loaded, it renders directly instead of going through `React.lazy`, so switching panels is instant.

### 🔐 Accounts without email
- 🪪 Supabase Auth requires an email, so each account gets an internal address derived from its immutable user id, on the reserved `.invalid` domain, which can never receive mail.
- 🔎 Signing in resolves the username to that id. The app then verifies that the session really belongs to that id, which blocks one account from impersonating another.

### ☁️ Cross-device sync
- 📄 Each account's data is one private JSON document in Supabase Storage.
- ⏳ Changes upload about 1.5 s after the last edit, and immediately when the tab is hidden.
- 🔄 On startup the app compares its local sync marker with the cloud copy, so changes made on another device show up.
- 🛑 Signing out is refused if the pending changes cannot be saved.

### 🛡️ Security
- 🧱 **Row level security:** users can only edit or delete what they own, and column grants keep ownership fields immutable.
- 🧼 **Everything is sanitized** when read from `localStorage`, Supabase or the sync file: colors must be hex, images must be raster `data:` URLs, and sizes are bounded.
- 🔑 **Strong passwords are enforced:** at least 10 characters with lowercase, uppercase, a number and a symbol, and not containing the username. A checklist updates as you type. Supabase stores only a salted bcrypt hash.
- 🧰 **Hardened headers:** a strict CSP (no inline scripts, no third-party origins), clickjacking protection and HSTS.
- ⏲️ **Brute-force friction:** a growing pause after repeated failed sign-ins, and sign-out ends only the current device's session.

### 🧭 Architecture
Dependencies flow one way: `Components` and `hooks` use `scripts` and `types`, and `scripts` and `types` never import React.

```
src/
├── Components/   🧩 React UI by feature: wheel, editor, presets, themes, layout, common, i18n
├── hooks/        🪝 UI logic: sorting, sounds, account sync, community data, drafts
├── scripts/      ⚙️ Framework-free: wheel geometry, color math, sound synthesis,
│                    screen capture, strings, Supabase services
├── types/        📐 Theme and preset models and their sanitizers
└── css/          🎨 Per-component styles on a shared token base
```

### 🩹 Keeping an unmaintained toolchain healthy
Create React App no longer gets updates, so two small **`pnpm` patches** in `patches/` replace APIs deprecated on Node 24. They're reapplied on every install instead of silencing the warnings.

## 🚀 Run it locally

Requires **Node 18+** and **[pnpm](https://pnpm.io)**.

```bash
pnpm install
pnpm start        # 👉 http://localhost:3000
```

With no configuration the app runs **fully offline** on `localStorage`. To enable accounts and the community, add a `.env.local` file with a Supabase project:

```bash
REACT_APP_SUPABASE_URL=https://<your-project>.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<anon key>
```

<details>
<summary>⚙️ Supabase project requirements</summary>

- **Tables:** `profiles`, `shared_themes` and `shared_presets`, with row level security.
- **Storage:**
  - a public `avatars` bucket, limited to PNG, JPEG and WEBP up to 2 MB;
  - a private `user-data` bucket for account sync, where each user can only access their own folder and anonymous sessions can't write.
- **Authentication:**
  - the Email provider enabled, with **Confirm email** off;
  - **anonymous sign-ins** enabled;
  - passwords of at least **10** characters with lowercase, uppercase, digits and symbols.

</details>

| Command | Description |
| --- | --- |
| `pnpm start` | 🔥 Development server with hot reload |
| `pnpm build` | 📦 Production build in `build/` |
| `pnpm test:ci` | 🧪 Run the test suite once |
| `pnpm typecheck` | ✅ Type-check the project |

## 👤 Author

Built by **Jonathan Dorado Quintero** · [GitHub @Jondals](https://github.com/Jondals)
