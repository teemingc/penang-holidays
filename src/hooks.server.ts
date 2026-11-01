import type { Handle } from '@sveltejs/kit/hooks';
import { TAGS } from '#lib/languages.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';

// fills the html lang with the locale from the url
export const handle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) =>
		resolve(
			{ ...event, request },
			{ transformPageChunk: ({ html }) => html.replace('%lang%', TAGS[locale]) }
		)
	);
