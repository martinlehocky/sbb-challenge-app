'use client';

import { TIMES_OF_DAY, WAIT_LEVELS, withScenario } from '@/lib/scenario';
import type { Scenario, TimeOfDay, WaitLevel } from '@/lib/types';
import { NavButton } from '../NavButton';
import { SbbLink, SbbLogo, SbbTitle } from '../sbb';
import { useClientNav } from '../useClientNav';
import styles from './DemoLanding.module.css';

const WAIT_LABELS: Record<WaitLevel, string> = {
  short: 'short (9 min)',
  medium: 'medium (32 min, default)',
  long: 'long (92 min)',
};

const TIME_LABELS: Record<TimeOfDay, string> = {
  day: 'day (11:05, default)',
  evening: 'evening (19:40)',
  night: 'night (23:40)',
};

const base: Scenario = { wait: 'medium', time: 'day' };

/** Demo landing page for presenters: jump to any screen and scenario. */
export function DemoLanding() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <SbbLogo protectiveRoom="none" className={styles.logo} />
        <span>LauzHack 2026 · SBB challenge</span>
      </header>
      <main className={styles.main}>
        <SbbTitle level="1">Disruption kiosk – demo</SbbTitle>
        <p className={styles.lead}>
          Scenario: 10 Sep 2026, Zürich HB, traveller going to Chur, IC 3 at 11:07 cancelled
          (overhead line damage between Wädenswil and Pfäffikon SZ). All data is mock data.
        </p>
        <div className={styles.buttons}>
          <NavButton href="/kiosk" iconName="qrcode-small" size="m">
            Open the kiosk
          </NavButton>
          <NavButton href="/phone" variant="secondary" iconName="smartphone-small" size="m">
            Open the phone view
          </NavButton>
        </div>

        <section className={styles.section}>
          <SbbTitle level="2" visualLevel="4">
            Screens
          </SbbTitle>
          <ul className={styles.list}>
            <Item href="/kiosk">1 · Welcome / idle</Item>
            <Item href="/kiosk/scan">2 · Scanning ticket</Item>
            <Item href="/kiosk/result">3 · Your next train</Item>
            <Item href="/kiosk/wait">4 · What would you like to do?</Item>
            <Item href="/kiosk/wait/eat">5 · Eat or drink something</Item>
            <Item href="/kiosk/wait/explore">5b · Have a look around</Item>
            <Item href="/kiosk/wait/rest">5c · Sit down and rest</Item>
            <Item href="/phone">6 · Live updates on phone</Item>
          </ul>
        </section>

        <section className={styles.section}>
          <SbbTitle level="2" visualLevel="4">
            Wait scenarios (screens 4, 5, 5b)
          </SbbTitle>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Wait</th>
                <th scope="col">4 · Choices</th>
                <th scope="col">5 · Eat</th>
                <th scope="col">5b · Look around</th>
              </tr>
            </thead>
            <tbody>
              {WAIT_LEVELS.map((wait) => {
                const s = { ...base, wait };
                return (
                  <tr key={wait}>
                    <th scope="row">{WAIT_LABELS[wait]}</th>
                    <td><Link href={withScenario('/kiosk/wait', s)}>Choices</Link></td>
                    <td><Link href={withScenario('/kiosk/wait/eat', s)}>Eat</Link></td>
                    <td><Link href={withScenario('/kiosk/wait/explore', s)}>Look around</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className={styles.section}>
          <SbbTitle level="2" visualLevel="4">
            Time of day (screen 5c)
          </SbbTitle>
          <ul className={styles.list}>
            {TIMES_OF_DAY.map((time) => (
              <Item key={time} href={withScenario('/kiosk/wait/rest', { ...base, time })}>
                {`5c · Sit down and rest – ${TIME_LABELS[time]}`}
              </Item>
            ))}
          </ul>
          <p className={styles.note}>
            The switches are query parameters (<code>?wait=short|medium|long</code>,{' '}
            <code>?time=day|evening|night</code>) and are kept while you click through the kiosk.
          </p>
        </section>
      </main>
    </div>
  );
}

function Link({ href, children }: { href: string; children: string }) {
  const onClick = useClientNav(href);
  return (
    <SbbLink href={href} onClick={onClick}>
      {children}
    </SbbLink>
  );
}

function Item({ href, children }: { href: string; children: string }) {
  return (
    <li>
      <Link href={href}>{children}</Link> <code className={styles.path}>{href}</code>
    </li>
  );
}
