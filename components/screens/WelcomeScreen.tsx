'use client';

import { useRouter } from 'next/navigation';
import { getMessages, LANG_LABELS, LANG_NAMES } from '@/lib/i18n/messages';
import { LANGS, withScenario } from '@/lib/scenario';
import type { Lang, Scenario, WelcomeInfo } from '@/lib/types';
import { KioskFooter, KioskFrame, KioskMain } from '../KioskFrame';
import { KioskHeader } from '../KioskHeader';
import { ScreenIntro } from '../ScreenIntro';
import {
  SbbAlert,
  SbbAlertGroup,
  SbbCard,
  SbbCardLink,
  SbbIcon,
  SbbLogo,
  SbbTag,
  SbbTagGroup,
  SbbTitle,
} from '../sbb';
import { useClientNav } from '../useClientNav';
import styles from './WelcomeScreen.module.css';

/** Screen 1 · Welcome / idle: "Need help?" with two options, scan a ticket or ask a question. */
export function WelcomeScreen({ info, scenario }: { info: WelcomeInfo; scenario: Scenario }) {
  const router = useRouter();
  const t = getMessages(scenario.lang);

  const switchTo = (lang: Lang) => {
    if (lang !== scenario.lang) {
      router.replace(withScenario('/kiosk', { ...scenario, lang }), { scroll: false });
    }
  };

  return (
    <KioskFrame lang={scenario.lang}>
      <KioskHeader
        time={info.now}
        start={
          <div className={styles.brand}>
            <SbbLogo protectiveRoom="none" className={styles.logo} />
            <span className={styles.product}>{t.welcome.product}</span>
          </div>
        }
        end={
          <SbbTagGroup size="s" accessibilityLabel={t.welcome.language} className={styles.languages}>
            {LANGS.map((lang) => (
              <SbbTag
                key={lang}
                value={lang}
                checked={lang === scenario.lang}
                lang={lang}
                aria-label={LANG_NAMES[lang]}
                onClick={() => switchTo(lang)}
              >
                <span className={styles.langCode}>{LANG_LABELS[lang]}</span>
              </SbbTag>
            ))}
          </SbbTagGroup>
        }
      />
      <KioskMain className={styles.main}>
        {info.disruptions.length > 0 && (
          <SbbAlertGroup accessibilityTitle={t.welcome.disruptions} accessibilityTitleLevel="2" className={styles.alerts}>
            {info.disruptions.slice(0, 1).map((d) => (
              <SbbAlert key={d.id} size="s" readOnly iconName="disruption" animation="none">
                <SbbTitle level="2">{d.title}</SbbTitle>
                <span className={styles.updated}>{t.welcome.updated(d.updatedAt)}</span>
              </SbbAlert>
            ))}
          </SbbAlertGroup>
        )}

        <div className={styles.hero}>
          <ScreenIntro align="center" title={t.welcome.title} lead={t.welcome.lead} />
          <ul className={styles.choices}>
            <Choice
              href={withScenario('/kiosk/scan', { ...scenario, to: undefined, dep: undefined })}
              icon="qrcode-large"
              title={t.welcome.scan}
              text={t.welcome.scanText}
            />
            <Choice
              href={withScenario('/kiosk/ask', { ...scenario, to: undefined, dep: undefined })}
              icon="microphone-medium"
              title={t.welcome.ask}
              text={t.welcome.askText}
            />
          </ul>
        </div>
      </KioskMain>
      <KioskFooter>
        <p className={styles.staff}>
          <SbbIcon name="circle-information-small" />
          {t.welcome.staff}
        </p>
      </KioskFooter>
    </KioskFrame>
  );
}

/** One of the two big options on the welcome screen (the whole card is the link). */
function Choice({ href, icon, title, text }: { href: string; icon: string; title: string; text: string }) {
  const onClick = useClientNav(href);
  return (
    <li>
      <SbbCard color="white" className={styles.choice}>
        <SbbCardLink href={href} onClick={onClick}>
          {title}
        </SbbCardLink>
        <div className={styles.choiceRow}>
          <span className={styles.iconCircle}>
            <SbbIcon name={icon} />
          </span>
          <span className={styles.choiceText}>
            <SbbTitle level="2" visualLevel="3" className={styles.choiceTitle}>
              {title}
            </SbbTitle>
            <span className={styles.choiceSub}>{text}</span>
          </span>
          <SbbIcon name="chevron-small-right-medium" className={styles.chevron} />
        </div>
      </SbbCard>
    </li>
  );
}
