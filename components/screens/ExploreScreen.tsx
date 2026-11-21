'use client';

import { formatWalk, minutesBetween } from '@/lib/format';
import { getMessages } from '@/lib/i18n/messages';
import type { NearbyPlace, PlaceSuggestion, Scenario, WaitScenario } from '@/lib/types';
import { AiIdeas } from '../ai/AiIdeas';
import { IdeaCard } from '../IdeaCard';
import { LittleTimeNotice } from '../LittleTimeNotice';
import { GoogleAttribution, PlaceCard } from '../PlaceCard';
import { PhotoBox } from '../PhotoBox';
import { WaitIdeasLayout } from '../WaitIdeasLayout';

/** Screen 5b · Have a look around. */
/**
 * With AI on, the screen shows 2 hand-written ideas plus 1 AI idea; the 3rd hand-written idea
 * comes back if the AI has nothing that fits.
 */
export function ExploreScreen({
  wait,
  scenario,
  aiEnabled = false,
  googlePlaces = null,
}: {
  wait: WaitScenario;
  scenario: Scenario;
  aiEnabled?: boolean;
  /** Real places from Google that fit the wait; null/empty = the hand-written ideas (+ AI idea). */
  googlePlaces?: NearbyPlace[] | null;
}) {
  const t = getMessages(scenario.lang);
  const card = ({ place, backBy }: PlaceSuggestion) => (
    <IdeaCard
      key={place.id}
      media={<PhotoBox photo={place.photo} />}
      title={place.name}
      lines={[place.history]}
      walk={formatWalk(place.walk, t)}
      note={t.common.backBy(backBy)}
      notePlacement="below"
    />
  );
  const places = wait.explore.places;
  const shown = aiEnabled ? places.slice(0, 2) : places;
  return (
    <WaitIdeasLayout
      scenario={scenario}
      time={wait.now ?? '11:05'}
      title={t.wait.explore.title}
      intro={googlePlaces?.length ? t.places.exploreIntro : wait.explore.intro}
      returnPlan={wait.returnPlan}
    >
      {googlePlaces && googlePlaces.length > 0 ? (
        <>
          {googlePlaces.map((p) => (
            <PlaceCard key={p.id} place={p} backBy={wait.returnPlan.backBy} t={t} lang={scenario.lang} />
          ))}
          <GoogleAttribution t={t} />
        </>
      ) : (
        <>
          {shown.map(card)}
          {places.length === 0 && <LittleTimeNotice text={t.wait.littleTime(wait.returnPlan.train.platform)} />}
          {aiEnabled && (
            <AiIdeas
              interest="explore"
              lang={scenario.lang}
              minutes={wait.now ? minutesBetween(wait.now, wait.returnPlan.backBy) : wait.waitMinutes}
              backBy={wait.returnPlan.backBy}
              slots={3 - shown.length}
              fallback={places.slice(shown.length).map(card)}
            />
          )}
        </>
      )}
    </WaitIdeasLayout>
  );
}
