import type { ReturnPlan, WalkTime } from './types';

/** "1 minute walk", "3 minutes walk", "2 to 5 minutes walk". */
export function formatWalk(walk: WalkTime): string {
  if (walk.maxMinutes && walk.maxMinutes !== walk.minutes) {
    return `${walk.minutes} to ${walk.maxMinutes} minutes walk`;
  }
  return walk.minutes === 1 ? '1 minute walk' : `${walk.minutes} minutes walk`;
}

/** "no changes", "1 change", "2 changes". */
export function formatChanges(changes: number): string {
  if (changes === 0) return 'no changes';
  return changes === 1 ? '1 change' : `${changes} changes`;
}

/** Text lines of the green "be back" box. */
export function returnPlanLines(
  plan: ReturnPlan,
  variant: 'default' | 'platform' = 'default',
): { train: string; backBy: string } {
  const { line, departure, platform } = plan.train;
  if (plan.day === 'tomorrow') {
    return {
      train: `First train tomorrow: ${line.name} at ${departure}, platform ${platform}`,
      backBy: `Please be at the station by ${plan.backBy}`,
    };
  }
  if (variant === 'platform') {
    return {
      train: `Your train: ${line.name} at ${departure}`,
      backBy: `Please be back at platform ${platform} by ${plan.backBy}`,
    };
  }
  return {
    train: `Your train: ${line.name} at ${departure}, platform ${platform}`,
    backBy: `Please be back by ${plan.backBy}`,
  };
}
