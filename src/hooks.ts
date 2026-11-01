import type { Reroute } from '@sveltejs/kit/hooks';
import { deLocalizeUrl } from '#lib/paraglide/runtime.js';

// /ms serves the same page in malay
export const reroute: Reroute = (request) => deLocalizeUrl(request.url).pathname;
