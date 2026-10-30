# Ludo Darbar

*Every Ludo ever played.* Ludo in the browser, made for phones, with Pachisi, Chowka Bara, Challas Aath and other variations to follow:

- **Play online** – pick a 2, 3 or 4-player game and get matched only with people who picked the same size.
- **Play with computer** – you against 1 to 3 computer players.
- **Play on this device** – pass-and-play, every player picks a different colour.
- **Play with friends** – private room with a code or invite link (`/r/<code>`), plus table chat.

Fair dice (browser cryptographic randomness, every face equally likely) shown as a real 3D dice that tumbles when rolled. Themes (including a Ludo King style), step-by-step or glide token movement, sound effects you can mute one by one, and confetti + a winner popup at the end.

Built with **Next.js (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui**.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run typecheck
```

Deployed on Vercel: every push to `main` deploys.

## How the code is organised

```
src/
  app/                        Routes
    page.tsx                  Main menu
    play/[mode]/page.tsx      Setup for online | computer | local | friends
    game/page.tsx             Online, vs-computer and pass-and-play games
    r/[code]/page.tsx         A private friends room (invite links)
  components/
    ui/                       shadcn/ui components (button, card, dialog, input, label, switch)
    game/                     Board, 3D dice, name tags, side panel, chat, winner popup, confetti
    menu/                     Menu and setup screens
    settings/                 Settings sheet (themes, movement, sounds)
    layout/, providers/       Header, theme application
  hooks/use-game.ts           React bindings: useGame(), useProfile(), useSettings()
  lib/
    game/                     Framework-free game code
      rules.ts                Pure Ludo rules (no browser APIs: can run on a server)
      controller.ts           Runs a table: dice timing, bots, sync, chat, animations
      constants.ts, geometry.ts, dice.ts, types.ts
    net/
      transport.ts            RoomTransport interface: how devices at a table talk
      peer-transport.ts       Today's implementation: peer-to-peer via PeerJS
    services/                 Where user data lives (see below)
    theme/, settings/, audio/ Themes, settings model, Web Audio sound effects
```

## Adding a backend later (login, saved profiles, history)

All user data goes through the interfaces in `src/lib/services/types.ts`:

| Service | Today | Later |
| --- | --- | --- |
| `AuthService` | guest id in localStorage | real sign-in (NextAuth / Clerk / Supabase …) |
| `ProfileRepository` | name, colour, preferred table sizes in localStorage | user profile in your database |
| `SettingsRepository` | theme / sounds / movement in localStorage | synced per account |
| `GameSaveRepository` | unfinished offline game, room cache | saved games / match history |

To switch, implement those interfaces (e.g. `ApiProfileRepository`) and return them from
`createServices()` in `src/lib/services/index.ts`. Repositories are cache-first: `load()`
fetches once, `get()` is synchronous, `save()` writes through, so the UI and game code don't change.

Online play is peer-to-peer today. A real game server can replace it by implementing
`RoomTransport` (`src/lib/net/transport.ts`) over WebSockets, with the server acting as the room host,
and passing it to `new GameController(services, createServerTransport)`.
