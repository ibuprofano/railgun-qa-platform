import type { Environment } from '../lib/environments-api';

/** Created first; two credentials (project-settings-environments tests). */
export const staging: Environment = {
  id: 'env-staging',
  name: 'Staging',
  baseUrl: 'https://staging.shop.test',
  defaultBrowser: 'Firefox',
  credentials: [
    { id: 'cred-admin', alias: 'admin', email: 'admin@shop.test' },
    { id: 'cred-buyer', alias: 'buyer', email: 'buyer@shop.test' },
  ],
};

/** Created second; one credential. */
export const production: Environment = {
  id: 'env-prod',
  name: 'Production',
  baseUrl: 'https://shop.test',
  defaultBrowser: 'Chromium',
  credentials: [{ id: 'cred-ops', alias: 'ops', email: 'ops@shop.test' }],
};
