'use client';

// Must stay first: registers the local icon namespaces before any element loads.
import '@/lib/lyne-config';

/**
 * Single entry point for all Lyne React wrappers used in the app.
 * Import Lyne components from here, never from the packages directly.
 */
export { SbbAlert, SbbAlertGroup } from '@sbb-esta/lyne-react/alert.js';
export {
  SbbAccentButton,
  SbbAccentButtonLink,
  SbbButton,
  SbbButtonLink,
  SbbSecondaryButton,
  SbbSecondaryButtonLink,
} from '@sbb-esta/lyne-react/button.js';
export { SbbCard, SbbCardLink } from '@sbb-esta/lyne-react/card.js';
export { SbbClock } from '@sbb-esta/lyne-react/clock.js';
export { SbbIcon } from '@sbb-esta/lyne-react/icon.js';
export { SbbImage } from '@sbb-esta/lyne-react/image.js';
export { SbbLink } from '@sbb-esta/lyne-react/link.js';
export { SbbLoadingIndicatorCircle } from '@sbb-esta/lyne-react/loading-indicator-circle.js';
export { SbbLogo } from '@sbb-esta/lyne-react/logo.js';
export { SbbNotification } from '@sbb-esta/lyne-react/notification.js';
export { SbbStatus } from '@sbb-esta/lyne-react/status.js';
export { SbbTag, SbbTagGroup } from '@sbb-esta/lyne-react/tag.js';
export { SbbTimetableOccupancy } from '@sbb-esta/lyne-react/timetable-occupancy.js';
export { SbbTitle } from '@sbb-esta/lyne-react/title.js';
