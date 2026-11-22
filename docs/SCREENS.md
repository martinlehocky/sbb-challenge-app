# Kiosk screens – spec from the design mockup

Source of truth for the UI: the design canvas "SBB Disruption Kiosk – Station Screen" (https://claude.ai/artifact/T1dcHvtB4VuKYNaJwrNJN8, version of 21 Nov 2026 14:30). This file copies its screens, wording and demo data so the app can be built without opening the canvas.

All data is **mock data** for the demo scenario: **10 Sep 2026, Zürich HB, traveller going to Sargans, IC 3 at 11:07 cancelled** because of overhead line damage between Wädenswil and Pfäffikon SZ.

## Global layout and style

- Kiosk screens are **portrait 1080 × 1920** (stations have a portrait touch screen with a camera above it). The phone screen is **390 × 844**.
- Header bar (~132–148 px high, thin bottom border): **left** = back / cancel / start-over button (outlined pill), **right** = current time (big, bold). Screen 1 instead has logo + "Help kiosk" on the left and language switch + time on the right.
- **Very large type**: headings 72–96 px, choice titles ~52 px, body ≥ 32 px, small notes ≥ 22 px. Big touch targets (buttons 112–140 px high on the kiosk).
- **Primary button**: red, full pill, white bold text. **Secondary**: white with dark outline. Cards: light grey background, ~32 px radius. Choice cards: white with 4 px dark outline, icon in a grey circle on the left, chevron on the right.
- **Green "be back" box** (light green background, dark green bold text) at the bottom of every screen from 4 onwards: "Your train: IR 35 at 11:37, platform 9" + "Please be back by 11:30".
- Plain, short language. One question per screen. Always a way back.
- In the real app all of this is built with SBB Lyne components and tokens (see `sbb-design-system/README.md`, component map), not with the mockup's hand-drawn styles. The mockup used placeholder icons and a "LOGO" box: use `sbb-logo` and real SBB icons instead.

## 1 · Welcome / idle (`/kiosk`)
- Header: logo, "Help kiosk"; language switch **EN · FR · DE · IT** (EN selected); time **11:05**.
- Disruption banner (red-tinted, warning icon): **"Disruption Wädenswil – Pfäffikon SZ"** / "Overhead line damage. IC 3, S2 and S25 are cancelled on this section until early evening." / "Updated 11:00".
- Hero (centred): **"Train cancelled? Let's find your next move."** / "Scan your ticket. We check your journey and show you the next train you can take."
- Illustration: a ticket with a QR code, arrow pointing up to the camera, caption "Paper ticket, SwissPass or SBB app code".
- Primary button (scan icon): **"Scan my ticket"** → 2. Secondary button: **"No ticket? Type your destination"** (not wired yet). Footer: "Prefer to talk to someone? Staff are at the info point in the main hall."

## 2 · Scanning ticket (`/kiosk/scan`)
- Header: "Cancel" (→ 1), centre "↓ Camera is below the screen", time 11:05.
- Heading **"Hold your ticket up to the camera"** / "Paper ticket, SwissPass or the QR code in the SBB app".
- Large dark camera viewfinder (~820 × 820) with white corner brackets, a red scan line, and a tilted ticket inside showing "Zürich HB → Sargans, 2nd class · 10.09." + QR code.
- Progress list: ✓ **"Ticket recognised: Zürich HB → Sargans"** · ⟳ **"Checking your train against live disruptions…"** · ○ "Finding your best alternative". (Animate through the steps, then go to 3.)
- Footer: lock icon "We only read your route. No images are stored." + small dark button "Demo: continue" → 3.

## 3 · Your next train (`/kiosk/result`)
- Header: "Start over" (→ 1), centre "Zürich HB → Sargans", time 11:05.
- Cancellation box (red): badge **IC 3**, **"Your train at ~~11:07~~ is cancelled"**, "Overhead line damage between Wädenswil and Pfäffikon SZ. Repairs expected until early evening."
- Label "YOUR BEST NEXT TRAIN". Big outlined card: badge **IR 35** "to Chur", **11:37** "departs", countdown ring **"32 min to go"**; three tiles: **Platform 9** · **Arrives Sargans 12:29** · **vs. your plan +27 min** (red); ✓ "Direct, no changes. **Your ticket is valid** on this train."; people icon "Expected to be very busy. Board at the **front (sector A)**."
- Label "OTHER OPTIONS": **11:14** "S5 via Rapperswil, change in Ziegelbrücke" / "Leaves sooner, arrives later: Sargans 12:42 · 1 change" / "Pl. 4" · **12:37** "IR 35 direct" / "Less crowded: Sargans 13:29 · no changes" / "Pl. 9".
- Two buttons at the bottom: primary **"What can I do in 32 min?"** → 4, secondary (phone icon) **"Send to my phone"** → 6.

## 4 · What would you like to do? (`/kiosk/wait`)
- Header: "Back" (→ 3), time 11:05.
- Heading **"You have 32 minutes"** / **"What would you like to do?"**
- Three big choice cards:
  1. cup icon · **"Eat or drink something"** / "Coffee, a snack or a meal" → 5
  2. compass icon · **"Have a look around"** / "A short walk near the station" → 5b
  3. seat icon · **"Sit down and rest"** / "A quiet seat, or a hotel if it gets late" → 5c
- Green box: "Your train: IR 35 at 11:37" / **"Please be back at platform 9 by 11:30"**.
- Wait scenarios (demo switch): **short** = S5 11:14 pl. 4, 9 min, back by 11:10 · **medium** (default) = IR 35 11:37 pl. 9, 32 min, back by 11:30 · **long** = IR 35 12:37 pl. 9, 92 min, back by 12:20.

## 5 · Ideas for your wait: eat or drink (`/kiosk/wait/eat`)
- Header: "Choose something else" (→ 4), time.
- Heading **"Eat or drink something"** / "All of these are close by. The time to walk back is already counted."
- 1–3 grey cards: **title**, place, walking time (left) and **"Back by HH:MM"** (green, right).
- Green box "Your train: {train} at {dep}, platform {pl}" / **"Please be back by {headBack}"**; red button **"Back to my train"** → 3.
- Data by wait:
  - short: Drink or snack to take away · Kiosk at the stairs to platform 4 · 1 minute walk · Back by 11:10
  - medium: Coffee and a snack · Cafés one floor down, in Shopville · 2 minutes walk · Back by 11:30 / Lunch for the train · Food stalls in the main hall · 3 minutes walk · Back by 11:29 / Bakery · Along the Shopville passage · 2 minutes walk · Back by 11:32
  - long: Sit-down lunch · Restaurants in and around the station · 2 to 5 minutes walk · Back by 12:25 / Coffee and cake · Cafés one floor down, in Shopville · 2 minutes walk · Back by 12:30 / Lunch for the train · Food stalls in the main hall · 3 minutes walk · Back by 12:29

## 5b · Have a look around (`/kiosk/wait/explore`)
- Header: "Choose something else" (→ 4), time.
- Heading **"Have a look around"** / intro by wait.
- Cards with a **photo on the left** (~300 × 300; placeholder with label until real photos are added) and on the right: **name**, one-line **history**, walking time, **"Back by HH:MM"** (green).
- Same green box + "Back to my train".
- Data by wait:
  - short — intro "You only have a few minutes, so stay inside the station.": The station hall · Photo: main hall of Zürich HB · "The station opened in 1871. Its great hall is one of the largest in Switzerland." · 1 minute walk · Back by 11:10
  - medium — intro "Three places close to the station. The walk back is already counted.": Swiss National Museum · Photo: museum building · "Built in 1898 to look like a castle. Inside: Swiss history from early times to today." · 3 minutes walk · Back by 11:27 / Platzspitz park · Photo: park by the river · "A park since the 1700s, at the spot where two rivers meet." · 6 minutes walk · Back by 11:25 / The station hall (as above) · Back by 11:33
  - long — intro "Enough time to see a bit of Zürich. The walk back is already counted.": Swiss National Museum · Back by 12:22 / Lindenhof hill · Photo: view over the old town · "In Roman times there was a fort on this hill. Today: a quiet square with a view." · 8 minutes walk · Back by 12:20 / Platzspitz park · Back by 12:18
- Photos: use your own photos or freely licensed images (e.g. Wikimedia Commons, keep the licence/credit). Never copy photos from other websites.

## 5c · Sit down and rest (`/kiosk/wait/rest`)
- Header: "Choose something else" (→ 4), time (changes with scenario).
- Cards: icon in a white circle (seat / café / park / hotel), **name**, detail, walking time (left), note (green, right).
- Same green box (text varies) + "Back to my train".
- Time-of-day scenarios (demo switch):
  - **day** (time 11:05) — "Sit down and rest" / "Calm places close to your platform.": seat · Seat with phone charging · Waiting area near platform 9 · 1 minute walk · Back by 11:34 / café · Quiet café · Cafés one floor down, in Shopville · 2 minutes walk · Back by 11:30 / park · Bench in the park · Platzspitz park, just behind the station · 6 minutes walk · Back by 11:25. Green box: "Your train: IR 35 at 11:37, platform 9" / "Please be back by 11:30".
  - **evening** (19:40) — "A calm place for the evening" / "Your train leaves late. Rest here, or take a room if you are tired.": seat · Warm waiting room · Main hall, next to platform 3 · 2 minutes walk · Back by 21:30 / café · Restaurant with seats · Restaurants in and around the station · 3 minutes walk · Back by 21:25 / hotel · [Hotel name] · Hotel opposite the station · rooms free tonight · [price] per night · 2 minutes walk · Info point can book it. Green box: "Your train: IC 3 at 21:37, platform 7" / "Please be back by 21:30".
  - **night** (23:40) — **"No more trains tonight"** / "Your next train leaves tomorrow. These hotels are close.": hotel · [Hotel name] · Opposite the station · [price] per night · 2 minutes walk · Rooms free / hotel · [Hotel name] · Next to the main hall · [price] per night · 3 minutes walk · Rooms free / hotel · [Hotel name] · Near the river · step-free entrance · [price] per night · 5 minutes walk · Rooms free. Plus an outlined help box: **"Stuck because of the disruption?"** / "Ask at the info point in the main hall. Staff can book a room for you and tell you if SBB pays for it." Green box: "First train tomorrow: IC 3 at 06:37, platform 7" / "Please be at the station by 06:30".
- Keep `[Hotel name]` / `[price]` as visible placeholders: we have no hotel data, never invent real hotel names, prices or availability.

## 6 · Live updates on phone (`/phone`)
- Phone-width page (390 px). Header: "Your trip today" / **"Zürich HB → Sargans"**, logo right.
- Update card (amber, bell icon): "NEW UPDATE · 11:21" / **"Your IR 35 now leaves at 11:42 (+5 min)"** / "Still platform 9. You can stay a bit longer: head back by **11:35**."
- Train card: IR 35 to Chur, **11:42** with ~~11:37~~ struck through, "Platform 9 · arrives Sargans 12:34", circle "21 min".
- "WHAT HAPPENED SO FAR" timeline (newest first): 11:21 (amber) "IR 35 delayed by 5 min. Your plan was updated." · 11:06 (green) "You picked the IR 35 at the kiosk in Zürich HB." · 11:05 (red) "Your IC 3 at 11:07 was cancelled (overhead line damage, Wädenswil – Pfäffikon SZ)."
- Grey box "WE'RE WATCHING FOR YOU" / "If the line reopens earlier or your platform changes, you'll get a message straight away."
- Buttons: red **"See things to do nearby"** (→ 4), outlined "Stop updates".
