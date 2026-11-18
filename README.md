[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/aldy007x/neon-shores-2/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/aldy007x/neon-shores-2/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Neon Shores

An original open-world crime game that runs in the browser. You are **Jax
Marlowe**, newly arrived in **Port Azura** — a neon coastal city of avenues,
parks, car parks, a beach and a pier — and fixer **Dario Venn** has work for
you. Steal cars, run his jobs, mind the wanted stars, and by the end of the
sixth job the city is yours.

Everything is original: the city, the names, the art and the sounds are made
for this game. It is plain static files — no build step, no network, no
libraries. Open it and play.

## Play it

```sh
node serve.ts        # then open http://localhost:8080
```

Any static file server pointed at `game/` works just as well.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk, drive, steer |
| E | Talk to Dario · enter / exit a car |
| F | Punch |
| Shift | Sprint on foot |
| E (again) | Step out of the car |
| Space | Handbrake (drift) |
| P / Esc | Pause (R there starts a new game) |
| M | Mute |

## How it plays

- **The city.** A seeded 3600×3600 grid city: nine avenues each way with
  lane markings and right-hand traffic, 100+ buildings with windows that
  light up at night, three parks, three car parks, eleven named landmarks
  with signs (the lighthouse at the pier's end among them), a beach, the sea,
  and a walkable pier.
- **Cars.** Three classes — compact, sedan, sports — with their own speed,
  grip and drift. Any car can be taken: parked ones quietly, traffic ones by
  throwing the driver out. Collisions spark, dent and smoke.
- **People.** Around two dozen pedestrians stroll the sidewalks, flee from
  trouble, and can be knocked down — which the law notices.
- **The law.** Crimes carry heat (theft 40, assault 30, hit-and-run 85,
  ramming a police car 110). Heat makes stars, stars bring police — up to
  seven units at five stars — with pursuit driving and a bust meter when
  they corner you. Break line of sight and the heat drains. Busted means a
  fine and a walk from Police HQ; wasted means a hospital bill.
- **Day and night.** A full day–night cycle: dusk brings out the neon,
  street lamps, lit windows and headlights.
- **Rampage.** Drive into the marked south-west car park and flatten twelve
  cones against the clock for bonus cash. Repeatable.
- **Saving.** Cash, jobs and earnings persist in `localStorage` as you play.

## Dario's jobs

1. **Hot Package** — a timed delivery to the Neon Tower.
2. **Fare Play** — pick up a fare at Port Azura Mall, drop her at the Azura
   Grand Hotel, collect her tip.
3. **Cool Down** — you start at three stars; lose every last point of heat.
4. **Grand Tour** — Casino, Mall, Neon Tower: three checkpoints, one clock.
5. **Harbour Run** — collect three crates from the pier and beach and
   deliver them to the Harbour Docks Warehouse while the harbour patrol
   keeps you at two stars or more.
6. **Neon Finale** — the long way home: Lighthouse, Casino, Mall, Neon
   Tower, Hospital, and back to Dario's Corner, with the police escalating
   on every leg.

Finish all six for the **CITY CLEARED** panel and the city's total earnings.

## Handing it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` audits `game/` and `screenshots/` against the competition caps,
copies them to the output directory and writes `dossier.json` with the
kit's `buildDossier` (vendored, unchanged, in `vendor/`).

## Layout

- `game/index.html` — the page; loads `game/src/main.js`
- `game/src/config.js` — every tunable number (heat table, vehicle classes, payouts)
- `game/src/city.js` — the seeded generation of Port Azura
- `game/src/world.js` — the simulation: player, traffic, police, wanted system
- `game/src/missions.js` — the six jobs and the Rampage
- `game/src/render.js` — canvas rendering, day–night light, HUD and minimap
- `game/src/audio.js` — WebAudio-synthesised engine, siren and effects
- `game/src/shots.js` — the deterministic screenshot scenes (`?shot=cover|play|chase|end`)
- `sim.mjs` — a headless harness that plays the world without a browser
