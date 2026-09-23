# Spinly

A customizable prize wheel for giveaways, raffles and everyday decisions. Add your options, style every sector, save the result as a theme or a preset and share it with the community.

**Live demo:** [spinly-psi.vercel.app](https://spinly-psi.vercel.app)

## Features

### The wheel
- The limit starts at 14 options and can be raised to 25. The wheel remembers its options between visits; the four default options only appear the first time.
- Each sector has its own color, picked with a built-in HSV / hex / RGB color picker, and an optional image.
- The color picker can be dragged around with the mouse, and has an eyedropper that works in every browser:
  - Chrome, Edge and Opera on desktop use the native eyedropper: any point on the screen, including other tabs, windows and apps.
  - Firefox and Safari on desktop capture a frame of the screen, window or tab you choose, and you pick the color on it with a magnifier.
  - On mobile you pick the color from an image or a screenshot, by dragging your finger.
- The image editor previews the sector exactly as it will look when it wins. Move, zoom and rotate the image by dragging, pinching, scrolling or with the keyboard.
- Reorder options by dragging with a mouse or a finger, or with the arrow keys.
- Tap the pointer to recolor it. Tap the wheel to recolor the fairground lights around the rim and the hub.
- Spin with the button or the space bar. The winner is announced in a dialog. The odds tooltip shows each option's chance of winning.

### Sound
- A tick each time a sector passes the pointer, following the wheel as it slows down.
- A short chime for the winner, and soft feedback sounds on buttons.
- All sounds are synthesized with the Web Audio API, so there are no audio files to download. One toggle mutes everything.

### Themes and presets
- A **theme** stores the look: sector colors and images, pointer color and light color.
- A **preset** stores the options together with their theme.
- Both are saved in the browser and can be edited, deleted and searched. Two example themes and two example presets are included.

### Community (optional)
- Share themes and presets, use other people's, and edit or delete your own.
- Profiles are anonymous: a username and an optional photo, with no email or password.
- Requires a Supabase project. Without one, everything else works offline.

### Everything else
- English and Spanish, light and dark mode.
- Responsive layout for desktop and mobile.
- Scores 100 in every Lighthouse category on mobile and desktop.
- Respects `prefers-reduced-motion`.

## Tech stack

| Area | Choice |
| --- | --- |
| UI | React 19 + TypeScript, Create React App |
| Styles | Plain CSS with custom properties, BEM-style `spinly-*` classes, no UI library |
| Backend | Supabase: anonymous auth, Postgres with row level security, Storage. The SDK loads on demand, never on first paint |
| Tests | Jest + Testing Library |
| Hosting | Vercel, as a static site |

## Getting started

Requires Node 18+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm start
```

The app opens at `http://localhost:3000` and runs fully offline on `localStorage`.

### Enabling the community

1. Create a project at [supabase.com](https://supabase.com).
2. Add a `.env.local` file in the project root with the project URL and its public anon key:

   ```bash
   REACT_APP_SUPABASE_URL=https://<your-project>.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=<anon key>
   ```

<<<<<<< HEAD
3. In the Supabase SQL editor, run the SQL from [SUPABASE_SETUP.md](SUPABASE_SETUP.md). It creates the tables, the row level security policies and the avatar bucket.
4. Then run [supabase-update-policies.sql](supabase-update-policies.sql). It enables editing shared items and adds the `light_color` column. It is idempotent, so run it again whenever it changes.
5. Enable **anonymous sign-ins** under Authentication, then restart `pnpm start`.

`pnpm test:supabase` checks the whole setup against your real project: the sharing flow, and that row level security blocks what it should. It creates an anonymous test user that can only be removed from the dashboard.

=======
>>>>>>> 8cdd39285ba8f7de80a2c610d646d86f32d57f21
## Scripts

| Command | Description |
| --- | --- |
| `pnpm start` | Development server with hot reload |
| `pnpm build` | Production build in `build/`, with the main stylesheet inlined into `index.html` |
| `pnpm test` | Tests in watch mode |
| `pnpm test:ci` | Runs the tests once |
| `pnpm typecheck` | Type-checks the project |
| `pnpm test:supabase` | End-to-end check against your Supabase project |

## Project structure

```
src/
  App.tsx              Global state: options, active theme, presets and persistence
  Components/
    common/            Reusable pieces: Icon, Modal, ItemList, CollapsePanel, CreateRow...
    layout/            Header, profile menu and section navigation (mobile drawer)
    wheel/             The wheel and the winner dialog
    editor/            Option editor, color picker and sector image editor
    presets/           Presets panel
    themes/            Themes panel
    i18n/              Language provider and language switch
  hooks/               UI logic: sorting, sounds, wheel colors, community data, drafts...
  scripts/             Framework-free logic: wheel geometry, colors, sound synthesis,
                       strings, Supabase services
  types/               Theme and preset models and their sanitization
  css/                 Per-component styles on top of a shared base (shared.css)
  spinly.test.tsx      Test suite
```

Dependencies point one way. `Components` and `hooks` use `scripts` and `types`, and `scripts` and `types` never import React components.

## Deployment

`vercel.json` publishes `build/` as a static site. Files under `/static` are cached for a year, because their names change on every build. Set the same `REACT_APP_*` variables in the Vercel project settings.

## Security

- Everything read from `localStorage` or Supabase is sanitized. Colors must be hex, and images must be raster `data:` URLs.
- Only the author can edit or delete what they share. The database enforces this with row level security, and column grants keep ownership fields immutable.
- The anon key is public by design. Access control lives in the database policies, not in the client.
- Cloud writes are rate-limited in the client to avoid duplicates.
