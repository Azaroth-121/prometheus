import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Prometheus renders per request (auth, usage limits), so no incremental cache is configured.
// If ISR/SSG pages are added later, add an R2 incremental cache here.
export default defineCloudflareConfig({});
