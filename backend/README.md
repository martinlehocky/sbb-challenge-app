# SBB disruption assistant — backend

Python backend for the LauzHack 2026 SBB challenge, *"Turn disruption data into the traveller's best next move"*.
It combines the three SBB disruption sources with the GTFS timetable. For any trip, it answers three questions:
is this trip affected right now, why, and what should the traveller do next? Voice input and output and location
analysis use [Together AI](https://docs.together.ai).

## What it does

| Area | What you get |
|---|---|
| **Disruption replay** | The state of every disruption **as it was known at any moment**: places, lines, reason, expected end and published messages. Uses the version history of the public ticker and the VIA log. |
| **Journey planner** | Rail journeys on the real GTFS timetable, with platforms, transfers and stops (Connection Scan Algorithm). |
| **Best next move** | Plans the trip, checks it against active disruptions, and finds alternatives that avoid them. Gives a short message in EN/DE/FR/IT. |
| **Location** | Nearest stations and disruptions around a GPS position, a station or a free-text place. Optional AI suggestions for things to do while waiting. |
| **Voice** | Speech to text (`openai/whisper-large-v3`), understanding the trip ("von Bern nach Olten"), then advice, then text to speech. |

### Data sources and how they are joined

```
VIA event log (xlsx)  ── alea_fall_id = incident id ──  Public live ticker (incidents, messages, history)
   │ stoerungs_ort1/2, linie_von/bis (station numbers)
   ▼
Service points (number) ── didok ── GTFS stops ── stop_times / trips / routes (line names: IC6, S1 …)
   ▲
Internal ticker (KULT): linked to VIA events by time (± 2 h) and place (≤ 5 km)
```

- **A disruption "blocks" a train** when the train runs within 600 m of a disrupted place, or inside the
  section between the start and end places. If VIA lists affected lines, the train's line must also be on that
  list. Trains that pass the place after the expected end are not blocked.
- **Ticker-only incidents** (no VIA record) are located by finding station names in their summary
  (`location_source: "text"`).
- **Status**: `active`, `ended` (VIA end time, or the ticker says ENDED/DELETED), or `stale` (no news for
  24 h with no end time, or 6 h past the expected end).

## Setup

Requires Python 3.11+ (developed on 3.12).

```powershell
cd backend
py -3.12 -m venv ..\.venv
..\.venv\Scripts\python -m pip install -r requirements-dev.txt
```

### 1. Build the database (once, about 15–25 min)

The raw data stays where it is. By default the build reads the folder *above* the repo, which needs:
`Daten.zip`, `actual-date-swiss-service-point.csv` and one or more `gtfs_fp2026_*.zip` (the newest is used).

```powershell
..\.venv\Scripts\python -m sbb_backend.ingest
```

Options: `--data-dir D:\sbb`, `--db data\sbb.db`, `--gtfs D:\sbb\gtfs_fp2026_20261118.zip`. Zip files are streamed,
so nothing is extracted. The build writes `data\sbb.building` and renames it to `data\sbb.db` only when it is complete.
Only **rail** (GTFS route types 2 and 100–117) is imported. Bus, tram and boat are not.

### 2. Configure Together AI (optional)

Copy `.env.example` to `.env` and set `TOGETHER_API_KEY`. Without a key, everything works except
transcription, speech, the AI message rewrite and AI suggestions, which return HTTP 503 or an `*_error` field.

The default voice model (Orpheus) only speaks English; German comes out unintelligible. For all four languages use
`TOGETHER_TTS_MODEL=cartesia/sonic-2` with `TOGETHER_TTS_VOICE_EN/DE/FR/IT` (tested voices: `british lady`,
`german conversational woman`, `french conversational lady`, `italian narrator woman`).

`/voice/ask` lets Whisper detect the spoken language (travellers may not speak the screen language) and only falls
back to `lang` when it detects a language outside EN/DE/FR/IT. The speech hint is a plain list of station names: an
English sentence there made Whisper translate Italian speech into English. On silence Whisper tends to echo hint
names ("Chur, Lugano"); such transcripts are treated as "no speech". Note: `tests/test_api.py::test_transcribe_and_speak`
reads `backend/.env`, so blank the `TOGETHER_TTS_*` variables when running the tests with a custom voice setup.

### 3. Run

```powershell
..\.venv\Scripts\python -m uvicorn sbb_backend.api:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs

### 4. Test

```powershell
..\.venv\Scripts\python -m pytest -q
```

`tests/test_core.py` and `tests/test_api.py` use a small hand-made network, so every expected time can be
checked by hand. They also use a fake Together AI server. `tests/test_realdata.py` runs on the full database
and is skipped if it has not been built.

## API (prefix `/api/v1`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | DB build info, counts, AI on/off and models |
| GET | `/stations/search?q=` | Fuzzy station search (accents and word prefixes) |
| GET | `/stations/nearest?lat=&lon=` | Closest rail stations |
| GET | `/stations/{id}` | One station |
| GET | `/disruptions?at=&lat=&lon=&radius_m=&lang=` | Disruptions active at `at` (optionally near a point) |
| GET | `/disruptions/scenarios` | September 2026 incidents worth replaying, with a time and a trip to try |
| GET | `/disruptions/{id}?at=&include_internal=` | One disruption as known at `at` |
| GET | `/disruptions/{id}/timeline` | Every change to it, oldest first (for "replay") |
| GET | `/journeys?origin=&destination=&depart_after=` | Timetable only, no disruptions applied |
| POST | `/advice` | **Best next move**: plan, affected legs, alternatives, message, optional `ai_message` |
| POST | `/location/analyze` | Station and disruptions around a position, station or text; optional AI suggestions |
| POST | `/voice/transcribe` | Audio file to text |
| POST | `/voice/speak` | Text to audio (mp3 or wav) |
| POST | `/voice/ask` | Audio in, then advice out (optionally with spoken audio as base64) |
| POST | `/voice/ask-text` | Same as `/voice/ask`, with typed text |
| POST | `/question` | Kiosk help desk: answers a question from facts only (trip + alternatives, disruptions near the station, `extra_facts` from the kiosk); rejects answers with times not in the facts; returns `trip_destination` for trip questions and `debug.facts` |
| POST | `/question/voice` | Same with a recording (speech to text first) |

Times are ISO 8601 and use Swiss local time when no offset is given. **The disruption data covers
September 2026**, so pass an `at` from then to see live-looking disruptions, for example:

```json
POST /api/v1/advice
{"origin": "Zürich HB", "destination": "Chur", "at": "2026-09-10T06:30:00+02:00", "lang": "de"}
```

`GET /api/v1/disruptions/scenarios` lists good replay moments.

## Accuracy safeguards

- Every time, line and platform in `message` comes from the timetable through fixed templates (EN/DE/FR/IT).
- The optional `ai_message` is **rejected** if it contains a time that is not in the template message.
- AI place suggestions are marked `ai_generated: true` and dropped if they do not fit `wait_minutes`
  (walk there, visit, walk back).
- Personal data in the internal ticker (names, phone numbers, user names) is **not imported**. Internal
  staff notes are only returned with `include_internal=true`.

## Known limits

- The planner uses rail only, with station-level transfers (GTFS minimum transfer time per station, else 3 min).
  It does not include walking links between nearby stations or replacement buses.
- Matching a disruption to trains is geometric plus line names, so it is an estimate, not an operational source.
- The default TTS model (`canopylabs/orpheus-3b-0.1-ft`, voice `tara`) is English. For DE/FR/IT speech,
  set `TOGETHER_TTS_MODEL` / `TOGETHER_TTS_VOICE` to a multilingual model and voice.
