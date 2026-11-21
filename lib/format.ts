import type { Messages } from './i18n/messages';
import type { ReturnPlan, WalkTime } from './types';

/** "1 minute walk", "3 minutes walk", "2 to 5 minutes walk" (in the UI language). */
export function formatWalk(walk: WalkTime, t: Messages): string {
  return t.common.walk(walk.minutes, walk.maxMinutes);
}

/** Text lines of the green "be back" box. */
export function returnPlanLines(
  plan: ReturnPlan,
  t: Messages,
  variant: 'default' | 'platform' = 'default',
): { train: string; backBy: string } {
  const { line, departure, platform } = plan.train;
  if (plan.day === 'tomorrow') {
    return {
      train: t.common.firstTrainTomorrow(line.name, departure, platform),
      backBy: t.common.beAtStation(plan.backBy),
    };
  }
  if (variant === 'platform') {
    return {
      train: t.common.yourTrainShort(line.name, departure),
      backBy: t.common.pleaseBackAtPlatform(platform, plan.backBy),
    };
  }
  return {
    train: t.common.yourTrain(line.name, departure, platform),
    backBy: t.common.pleaseBackBy(plan.backBy),
  };
}

/** Minutes from `from` to `to` ("HH:MM", same day; 0 if `to` is earlier). */
export function minutesBetween(from: string, to: string): number {
  const m = (t: string) => {
    const [h, min] = t.split(':').map(Number);
    return h * 60 + min;
  };
  return Math.max(0, m(to) - m(from));
}
