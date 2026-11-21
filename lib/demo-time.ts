/**
 * Simulated "now" for the demo: time starts at the scenario time (e.g. 11:05)
 * when it is first shown and then runs at normal speed. The offset is kept
 * per start time for the whole browser session, so the time carries on while
 * you click through the kiosk; a page reload starts it again.
 */
const offsets = new Map<string, number>();

function offsetFor(start: string): number {
  let offset = offsets.get(start);
  if (offset === undefined) {
    const [hours, minutes] = start.split(':').map(Number);
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    offset = target.getTime() - Date.now();
    offsets.set(start, offset);
  }
  return offset;
}

/** Current simulated time for a scenario that starts at `start` ("HH:MM"). */
export function demoNow(start: string): Date {
  return new Date(Date.now() + offsetFor(start));
}

/** "HH:MM" of a date. */
export function formatClockTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
