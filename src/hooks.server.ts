import boot from 'virtual:boot';
import type { Handle } from '@sveltejs/kit/hooks';
import { TAGS } from '#lib/languages.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';

// fills the html lang with the locale from the url, and the head with the script that colours
// the sky before the first paint: src/lib/boot.ts, bundled by vite.config.ts
export const handle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) =>
		resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					// with a function, so a $ in the script is left as it is
					html.replace('%lang%', TAGS[locale]).replace('%boot%', () => boot)
			}
		)
	);
