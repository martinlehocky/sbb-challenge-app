'use client';

import { useRouter } from 'next/navigation';
import { getMessages, LANG_LABELS, LANG_NAMES } from '@/lib/i18n/messages';
import { LANGS, withScenario } from '@/lib/scenario';
import type { Lang, Scenario, WelcomeInfo } from '@/lib/types';
import { KioskFooter, KioskFrame, KioskMain } from '../KioskFrame';
import { KioskHeader } from '../KioskHeader';
import { NavButton } from '../NavButton';
import { ScreenIntro } from '../ScreenIntro';
import {
  SbbAlert,
  SbbAlertGroup,
  SbbIcon,
  SbbLogo,
  SbbTag,
  SbbTagGroup,
  SbbTitle,
} from '../sbb';
import styles from './WelcomeScreen.module.css';

/** Screen 1 · Welcome / idle. */
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
                {LANG_LABELS[lang]}
              </SbbTag>
            ))}
          </SbbTagGroup>
        }
      />
      <KioskMain className={styles.main}>
        <SbbAlertGroup accessibilityTitle={t.welcome.disruptions} accessibilityTitleLevel="2" className={styles.alerts}>
          {info.disruptions.map((d) => (
            <SbbAlert key={d.id} size="m" readOnly iconName="disruption" animation="none">
              <SbbTitle level="2">
                {d.title}
              </SbbTitle>
              {d.summary} <span className={styles.updated}>{t.welcome.updated(d.updatedAt)}</span>
            </SbbAlert>
          ))}
        </SbbAlertGroup>

        <div className={styles.hero}>
          <ScreenIntro
            align="center"
            title={t.welcome.title}
            lead={t.welcome.lead}
          />

          <figure className={styles.illustration}>
            <SbbIcon name="arrow-up-large" className={styles.arrow} />
            <div className={styles.ticket} aria-hidden="true">
              <SbbIcon name="qrcode-large" className={styles.qr} />
              <span className={styles.ticketLines}>
                <span />
                <span />
                <span />
              </span>
            </div>
            <figcaption className={styles.caption}>{t.welcome.caption}</figcaption>
          </figure>
        </div>
      </KioskMain>
      <KioskFooter>
        <NavButton
          href={withScenario('/kiosk/scan', { ...scenario, to: undefined })}
          iconName="qrcode-small"
          className={styles.fullWidth}
        >
          {t.welcome.scan}
        </NavButton>
        <NavButton
          href={withScenario('/kiosk/ask', { ...scenario, to: undefined })}
          variant="secondary"
          iconName="microphone-small"
          className={styles.fullWidth}
        >
          {t.welcome.noTicket}
        </NavButton>
        <p className={styles.staff}>
          <SbbIcon name="circle-information-small" />
          {t.welcome.staff}
        </p>
      </KioskFooter>
    </KioskFrame>
  );
}
