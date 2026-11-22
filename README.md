# SBB Disruption Kiosk (LauzHack 2026, SBB challenge)

Clickable front-end of our station "disruption kiosk": a traveller whose train was cancelled scans their ticket at a portrait touch screen in the station, sees the next train they can take, and gets ideas for what to do while they wait (eat, look around, rest, or a hotel if no train runs tonight). A phone page keeps them updated.

The front-end runs in two modes:

- **Live** (`BACKEND_URL` set): trip, disruption and train data come from the Python backend in [`backend/`](backend/README.md), built from the real SBB data, for the simulated moment `DEMO_AT` (default 10 Sep 2026 11:05, Zürich HB → Sargans). On that day an overhead line fault between Wädenswil and Pfäffikon SZ cancels the 11:07 train; the kiosk proposes the IR 35. For the pitch, `DEMO_TRAIN_DELAYS` in `backend/.env` makes that IR 35 run 30 min late (11:42 instead of 11:12), so the traveller has 37 min and the kiosk suggests places to go; without it the next train leaves at 11:12 and the kiosk says "go to your platform".
- **Mock** (no `BACKEND_URL`): the hand-written demo scenario from `docs/SCREENS.md` (IC 3 at 11:07 cancelled, IR 35 at 11:37).

The UI follows `docs/SCREENS.md` (screen spec: wording, layout, demo data) and is built with SBB's official design system **Lyne** (`@sbb-esta/lyne-*` 5.13.3): SBB theme, design tokens, fonts, real SBB icons, logo and station clock.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build (type-checks too)
```

Needs Node 20+. The SBB fonts load from SBB's CDN, so the demo needs internet (without it the font falls back to Helvetica/Arial).

### With the backend (live data)

1. Set up and build the backend database once: see [`backend/README.md`](backend/README.md) (Python 3.12, about 15 min the first time).
2. Start the backend (from the repo root):
   ```bash
   .venv/Scripts/python -m uvicorn sbb_backend.api:app --app-dir backend --port 8000
   ```
3. Copy `.env.example` to `.env.local` (it already points to `http://127.0.0.1:8000`), then `npm run dev`.

If the backend cannot be reached, the pages log the error on the server and show the mock data, so a demo never breaks. Set `BACKEND_STRICT=1` in `.env.local` to get an error page instead (use it to check that you really see live data).

What is live and what stays hand-written:

| Screen | Live from the backend | Stays as written |
|---|---|---|
| 1 Welcome | Disruptions active near the kiosk station (official ticker text, all 4 languages) | |
| 2 Scan | Route on the ticket | Ticket scan itself is simulated |
| 3 Result | Cancelled train, reason and expected end, best next train with platform and arrival, other options | |
| 4, 5, 5b Wait | The train to be back for, waiting time, "be back by" times | Zürich HB ideas (cafés, places). The idea set follows the real waiting time; ideas that no longer fit are dropped |
| 5c Rest | `time=day`: same as above | `time=evening` / `night`: imagined later moments, demo data in both modes |
| 6 Phone | Train, newest official update, ticker history | |

Deliberately not shown with live data, because the data cannot back it up: "Your ticket is valid on this train" and crowding (no ticket or occupancy data).

## Routes

| Route | Screen |
|---|---|
| `/` | Demo landing page: links to every screen and scenario |
| `/kiosk` | 1 · “Need help?”: scan your ticket or ask a question |
| `/kiosk/scan` | 2 · Scanning ticket: live webcam; **any** QR code shown to it opens the demo ticket (screen 3). Without a camera it animates and goes on by itself |
| `/kiosk/result` | 3 · Your next train |
| `/kiosk/wait` | 4 · What would you like to do? |
| `/kiosk/wait/eat` | 5 · Eat or drink something |
| `/kiosk/wait/explore` | 5b · Have a look around |
| `/kiosk/wait/rest` | 5c · Sit down and rest |
| `/kiosk/ask` | Ask a question by voice or text (AI); `?about=trip` = about the traveller's journey |
| `/phone` | 6 · Live updates on phone |

Kiosk pages are drawn on a fixed **1080 × 1920** portrait canvas that is scaled down to fit the browser window (full size on a real portrait screen). The phone page is 390 px wide, shown in a phone frame on desktop.

## Scenario switches (query parameters)

| Parameter | Values | Default | Used by |
|---|---|---|---|
| `wait` | `short` (S5 11:14, 9 min) · `medium` (IR 35 11:37, 32 min) · `long` (IR 35 12:37, 92 min). Mock mode only: with the backend the real waiting time decides | `medium` | screens 4, 5, 5b |
| `time` | `day` (11:05) · `evening` (19:40) · `night` (23:40, "No more trains tonight") | `day` | screen 5c |

| `lang` | `en` · `fr` · `de` · `it` | `en` | all kiosk screens and the phone |
| `to` | station number, e.g. `8507000` (Bern) | ticket destination | trip chosen on `/kiosk/ask` (screens 3–6, backend only) |

Example: `/kiosk/wait/rest?time=night`, `/kiosk/wait/explore?wait=long&lang=de`. The parameters are kept while you click through the kiosk. The language can also be switched with the EN · FR · DE · IT buttons on the welcome screen.

## Code map

- `app/`: one `page.tsx` per route. Pages are server components: they read the scenario from the URL, load data from `lib/data.ts` and render a screen component.
- `components/screens/`: one client component per screen.
- `components/`: shared kiosk parts (`KioskFrame`, `KioskHeader`, `BeBackBox`, `IdeaCard`, `NavButton`, …). Styling uses CSS modules and SBB design tokens (`--sbb-*`) only.
- `components/sbb.ts`: the only place Lyne React components are imported from. Its first import, `lib/lyne-config.ts`, points `<sbb-icon>` to the local icons in `public/sbb-icons/`.
- `lib/types.ts`: data types (`Trip`, `Disruption`, `Connection`, `WaitScenario`, `Idea`, `Place`, `RestOption`, `PhoneTrip`, …), shaped like the future API responses.
- `lib/i18n/messages.tsx`: all UI text in EN · FR · DE · IT (English = `docs/SCREENS.md`; Swiss German without "ß", SBB = CFF/FFS in French/Italian, formal address). Add a text there in all four languages.
- `lib/mock-data.ts`: **all demo data**, texts in all four languages via `tx(en, de, fr, it)`; `lib/data.ts` returns them in the requested language. Keep `[Hotel name]` / `[price]` as placeholders: we have no hotel data and must not invent any.
- `lib/data.ts`: async data functions used by the pages. Each one uses the backend when `BACKEND_URL` is set, else the mock data.
- `lib/backend.ts`: server-only client for the Python API and the mapping of its answers to the types in `lib/types.ts`.
- `backend/`: the Python backend (data import, disruption replay, journey planner, Together AI voice and location). See its README.
- `public/sbb-icons/`: only the SBB icons we use (copied from the SBB icon set). Add a new icon by copying its SVG from the SBB icons folder; check the exact name first.
- `public/photos/`: real photos for screen 5b go here (see the README in that folder).

## AI features (Together AI, through the backend)

| Where | What the AI does | Without AI |
|---|---|---|
| `/kiosk/ask` | Answers questions by voice or text (Whisper + Qwen) from facts only: the traveller's journey and alternatives, live disruptions and their messages, and the hand-written station tips. Answers with a time not in the facts are rejected (then: “ask staff”). The answer comes in the language the question was asked in (EN/DE/FR/IT), whatever the screen language. A trip question (“Ich muss nach Genf”) also offers “Show my next train” | Notice: questions not available |
| Screen 3 | The status box (“Your train at 11:07 is cancelled” / “runs as planned”) shows the advice rewritten for stressed or older travellers, marked “AI-generated”; until it loads, or if AI fails, the box keeps its own text. “What can I do in X min?” only with 10+ minutes before the back-by time, else “go to your platform”. “Ask about my trip” always | Box shows its own text |
| Screens 5 and 5b (Google) | With `GOOGLE_MAPS_API_KEY` in `backend/.env`: up to 3 real places from Google Places that fit the time until the back-by time and are open then, each with its photo on the left, the photographer's name and the Google Maps credit. Tapping a place (here and in the chat) shows a QR code that opens it in Google Maps on the traveller's phone (drawn in the browser with `qrcode`) | The hand-written ideas below |
| Screens 5–5c | One AI idea next to two hand-written ones, when it fits the time left; otherwise the third hand-written idea | Three hand-written ideas |

- All AI output is marked “AI-generated” (SBB AI pattern “author”) and shows a working indicator while it loads; AI ideas add “Please check on site”.
- Safeguards: the backend rejects a rewrite that changes or leaves out a time or station; ideas must fit the walk there and back; place names are limited to kinds of places plus landmarks the model is sure about; a silent recording is never sent (the browser measures the level).
- Unclear questions are asked back, not guessed: two destinations (“Bern or Basel?”) or a name that fits several stations (“Interlaken”: West or Ost) show one button per station. Station names are matched exactly or to the busiest station of that name (“Biel” → Biel/Bienne, “Wil” → Wil SG, never “Wila”); French/Italian/English city names (Genf, Thoune, Coira, Lucerne…) map to the official ones. A trip from another station (“from Lausanne to Geneva”) is answered from that station, without “Show my next train”. Unknown places, the kiosk's own station, other days and prices get an honest “cannot” answer.
- Debug panel on `/kiosk/ask` (off by default, show it with `?debug=1`): live microphone level, recording size and loudness, what Whisper heard and which language it detected (and whether it re-transcribed), what the AI extracted, which stations it matched, and the timings.
- Code: `lib/ai.ts` (server-side calls), `app/api/ai/*` (routes the browser calls), `components/ai/*`, `components/screens/AskScreen.tsx`. The browser never sees the backend URL or the key.
- Setup: `TOGETHER_API_KEY` in `backend/.env`. The kiosk does not speak (no text to speech); the backend's `/voice/speak` is still there for other clients.

## Not wired yet

- "Stop updates" is visual only.
- Demo scanning: any QR code counts as the ticket (its content is not read); the trip is always the demo ticket (`TRIP_DESTINATION`). QR codes are decoded in the browser (built-in `BarcodeDetector` where available, else `jsqr`); no picture leaves the kiosk.

## Backend

The Python service in `backend/` does GTFS routing (Connection Scan Algorithm on the real 2026 timetable), replays each disruption as it was known at any moment, and offers Together AI speech-to-text, text-to-speech and location analysis. The Together AI key belongs to the backend only: put it in `backend/.env` as `TOGETHER_API_KEY` (see `backend/.env.example`), never in the front-end.

Brand note: SBB logo, icons and clock are used for this SBB hackathon demo only. Don't publish the demo as if it were a real SBB product.
