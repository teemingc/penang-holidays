import { inMonth, years } from '#lib/holidays.js';
import type { PageServerLoad } from './$types';

// A static page with no JavaScript; it's rebuilt whenever the data changes
export const prerender = true;
export const csr = false;

export const load: PageServerLoad = () => {
	return {
		years: years.map((y) => y.year),
		// March has a handful of holidays, so the example stays short without being trimmed
		example: inMonth(years.at(-1)!, 3)
	};
};
