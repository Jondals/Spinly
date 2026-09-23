# Spinly

A customizable spinning wheel for giveaways and quick decisions. Edit the options, colors and per-sector images, save your setups as themes and presets, and share them with the community.

Live demo: [spinly-psi.vercel.app](https://spinly-psi.vercel.app)

## Features

- **Wheel editor**: up to 25 options with an editable limit and a custom color picker (HSV, hex and RGB). Reorder options by dragging with a mouse or a finger, or with the arrow keys.
- **Per-sector images**: uploading a photo opens an editor that previews the sector exactly as it looks when it wins. Drag, pinch, scroll or use the keyboard to move, zoom and rotate it.
- **Wheel colors**: tap the pointer to change its color, or tap the wheel to change the color of the animated lights. Both are saved with themes and presets.
- **Fairground lights**: animated lights run around the rim and the hub, and speed up while the wheel spins.
- **Sound**: a tick each time a sector passes the pointer, a short chime for the winner and soft feedback on every button. Sounds are synthesized with the Web Audio API, so there are no audio files, and a single toggle mutes them all.- **Themes and presets**: a theme stores the look; a preset stores the options together with their theme. Both are saved locally and can be edited, deleted and searched.
- **Community** (optional, requires Supabase): share themes and presets, download other people's, and edit or delete your own. Profiles are anonymous: a username and an optional photo, no email or password.
- **English and Spanish**, light and dark mode, and a responsive layout for desktop and mobile.
- **Fast and accessible**: scores 100 in every Lighthouse category on mobile and desktop.

Without Supabase the app runs fully offline on `localStorage`.

## Tech stack

- React 19 + TypeScript (Create React App)
- Supabase (anonymous auth, Postgres with row level security, Storage), loaded on demand so it never delays the first paint
- Plain CSS with custom properties, no UI library
- Jest + Testing Library
- Deployed on Vercel as a static site

## Getting started

Requires Node 18+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm start
```

The app opens at `http://localhost:3000`.

### Community (optional)

Create a `.env.local` file in the project root:

```bash
REACT_APP_SUPABASE_URL=https://<your-project>.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<anon key>
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm start` | Development server |
| `pnpm build` | Production build in `build/`, with the main stylesheet inlined into `index.html` |
| `pnpm test` | Tests in watch mode |
| `pnpm test:ci` | Run the tests once (CI) |
| `pnpm typecheck` | Type-check the project |
| `pnpm test:supabase` | Runs the full flow against your real Supabase project and checks that RLS blocks what it should. Creates an anonymous test user |

## Project structure

```
src/
  App.tsx              Global state: options, active theme, presets and persistence
  Components/
    common/            Reusable pieces: Icon, Modal, PanelHeader, ItemList, CollapsePanel...
    layout/            Header, profile menu and WheelManager (navigation / mobile drawer)
    wheel/             The wheel and the winner dialog
    editor/            Option editor, color picker and per-sector image editor
    presets/           Presets panel
    themes/            Themes panel
    i18n/              LanguageProvider (active language) and language switch
  hooks/               Reusable UI logic: sorting, click-outside, community data, sounds...
  scripts/             Framework-free logic: wheel geometry, colors, sounds, strings, Supabase services
  types/               Theme and preset models and their sanitization
  css/                 Per-component styles plus a shared base (shared.css)
  spinly.test.tsx      Test suite
  setupTests.ts        Test environment
```

Dependencies point one way: `Components` and `hooks` use `scripts` and `types`, and `scripts` and `types` never import components.

## Deployment

`vercel.json` publishes `build/` as a static site. Files in `/static` are cached for a year because their names change on every build. Set the same `REACT_APP_*` variables in your Vercel project.

## Security

- Everything read from `localStorage` or Supabase is sanitized: colors must be hex and images must be raster `data:` URLs.
- Only the author can edit or delete what they share. This is enforced by row level security in the database, not by the client.
- Cloud writes are rate-limited to avoid duplicates.
