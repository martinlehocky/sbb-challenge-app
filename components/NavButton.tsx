'use client';

import type { ReactNode } from 'react';
import {
  SbbAccentButtonLink,
  SbbButtonLink,
  SbbSecondaryButtonLink,
} from './sbb';
import { useClientNav } from './useClientNav';

type Variant = 'primary' | 'secondary' | 'accent';

/** An SBB button that navigates to another screen (client-side). */
export function NavButton({
  href,
  variant = 'primary',
  size = 'l',
  iconName,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: 's' | 'm' | 'l';
  iconName?: string;
  className?: string;
  children: ReactNode;
}) {
  const onClick = useClientNav(href);
  const props = { href, size, iconName, className, onClick };
  if (variant === 'secondary') return <SbbSecondaryButtonLink {...props}>{children}</SbbSecondaryButtonLink>;
  if (variant === 'accent') return <SbbAccentButtonLink {...props}>{children}</SbbAccentButtonLink>;
  return <SbbButtonLink {...props}>{children}</SbbButtonLink>;
}
