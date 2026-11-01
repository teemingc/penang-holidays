import type { Reroute } from '@sveltejs/kit/hooks';
import { deLocalizeUrl } from '#lib/paraglide/runtime.js';

// /ms and /zh serve the same page in malay and chinese
export const reroute: Reroute = (request) => deLocalizeUrl(request.url).pathname;
