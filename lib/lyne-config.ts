'use client';

import { mergeConfig } from '@sbb-esta/lyne-elements/core.js';

/**
 * Serve SBB icons and pictograms from /public instead of the SBB icon CDN.
 * This module must be evaluated before any Lyne element module, so it is the
 * first import of `components/sbb.ts` (the only place Lyne is imported from).
 */
mergeConfig({
  icon: {
    namespaces: new Map([
      ['default', '/sbb-icons/'],
      ['picto', '/sbb-pictograms/'],
    ]),
  },
});
