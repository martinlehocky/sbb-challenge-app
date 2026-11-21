Photos used by the kiosk. Only use your own photos or freely licensed images (e.g. Wikimedia Commons) and keep the credit.

| File | Used for | Credit |
|---|---|---|
| `zurich-hb-platform-16.jpeg` | Screen 5b, "The station hall" card (FLIRT Evo at Zürich HB, platform 16) | © SBB CFF FFS |
| `disruption-repair.jpeg` | Illustration next to infrastructure faults: overhead line, track, signal box, power, barrier (crew repairing a cable, Lausanne) | © SBB CFF FFS |
| `disruption-works.jpeg` | Illustration for construction / engineering work (works at Schmitten station) | © SBB CFF FFS |
| `disruption-vehicle.jpeg` | Illustration for train faults (ICN in the workshop) | © SBB CFF FFS |
| `disruption-snow.jpeg` | Illustration for snow and ice (IR double-decker in the snow near Olten) | © SBB CFF FFS |

The disruption photos are chosen from the cause in `lib/disruption-photos.ts` and always shown with an
"Illustration" tag: they are never a picture of the actual incident. Sensitive causes (accidents involving a
person, fires, police operations, collisions…) get no photo.

For a place photo on screen 5b: add the file here, then set `photo.src` (and `photo.credit`) for that place in
lib/mock-data.ts.
