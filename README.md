# SBB Disruption Kiosk (LauzHack 2026, SBB challenge)

Clickable front-end of our station "disruption kiosk": a traveller whose train was cancelled scans their ticket at a portrait touch screen in the station, sees the next train they can take, and gets ideas for what to do while they wait (eat, look around, rest, or a hotel if no train runs tonight). A phone page keeps them updated.

**There is no backend yet.** All data is mock data for one demo scenario: 10 Sep 2026, Zürich HB, traveller going to Chur, IC 3 at 11:07 cancelled because of overhead line damage between Wädenswil and Pfäffikon SZ.

The UI follows `docs/SCREENS.md` (screen spec: wording, layout, demo data) and is built with SBB's official design system **Lyne** (`@sbb-esta/lyne-*` 5.13.3): SBB theme, design tokens, fonts, real SBB icons, logo and station clock.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build (type-checks too)
```

Needs Node 20+. The SBB fonts load from SBB's CDN, so the demo needs internet (without it the font falls back to Helvetica/Arial).

## Routes

| Route | Screen |
|---|---|
| `/` | Demo landing page: links to every screen and scenario |
| `/kiosk` | 1 · Welcome / idle |
| `/kiosk/scan` | 2 · Scanning ticket (animates, then goes to 3; live webcam if allowed) |
| `/kiosk/result` | 3 · Your next train |
| `/kiosk/wait` | 4 · What would you like to do? |
| `/kiosk/wait/eat` | 5 · Eat or drink something |
| `/kiosk/wait/explore` | 5b · Have a look around |
| `/kiosk/wait/rest` | 5c · Sit down and rest |
| `/phone` | 6 · Live updates on phone |

Kiosk pages are drawn on a fixed **1080 × 1920** portrait canvas that is scaled down to fit the browser window (full size on a real portrait screen). The phone page is 390 px wide, shown in a phone frame on desktop.

## Scenario switches (query parameters)

| Parameter | Values | Default | Used by |
|---|---|---|---|
| `wait` | `short` (S5 11:14, 9 min) · `medium` (IR 35 11:37, 32 min) · `long` (IR 35 12:37, 92 min) | `medium` | screens 4, 5, 5b |
| `time` | `day` (11:05) · `evening` (19:40) · `night` (23:40, "No more trains tonight") | `day` | screen 5c |

Example: `/kiosk/wait/rest?time=night`, `/kiosk/wait/explore?wait=long`. The parameters are kept while you click through the kiosk.

## Code map

- `app/`: one `page.tsx` per route. Pages are server components: they read the scenario from the URL, load data from `lib/data.ts` and render a screen component.
- `components/screens/`: one client component per screen.
- `components/`: shared kiosk parts (`KioskFrame`, `KioskHeader`, `BeBackBox`, `IdeaCard`, `NavButton`, …). Styling uses CSS modules and SBB design tokens (`--sbb-*`) only.
- `components/sbb.ts`: the only place Lyne React components are imported from. Its first import, `lib/lyne-config.ts`, points `<sbb-icon>` to the local icons in `public/sbb-icons/`.
- `lib/types.ts`: data types (`Trip`, `Disruption`, `Connection`, `WaitScenario`, `Idea`, `Place`, `RestOption`, `PhoneTrip`, …), shaped like the future API responses.
- `lib/mock-data.ts`: **all demo data**. Keep `[Hotel name]` / `[price]` as placeholders: we have no hotel data and must not invent any.
- `lib/data.ts`: async data functions used by the pages. To connect the backend, replace their bodies with API calls; the pages stay as they are.
- `public/sbb-icons/`: only the SBB icons we use (copied from the SBB icon set). Add a new icon by copying its SVG from the SBB icons folder; check the exact name first.
- `public/photos/`: real photos for screen 5b go here (see the README in that folder).

## Not wired yet

- "No ticket? Type your destination" and "Stop updates" are visual only.
- No QR decoding: the scan screen only shows the webcam and animates.
- Language switch (EN · FR · DE · IT) is visual only.

## Next: backend

The plan (see the project plan) is a Python service for GTFS routing (Connection Scan Algorithm on the 10 Sep 2026 timetable, replaying the disruption) plus Together AI for reading ticker messages and writing the wait ideas. Put the key in `.env.local` as `TOGETHER_API_KEY` (see `.env.example`); it must only be used server-side.

Brand note: SBB logo, icons and clock are used for this SBB hackathon demo only. Don't publish the demo as if it were a real SBB product.
