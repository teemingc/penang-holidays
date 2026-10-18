import { years } from '#lib/holidays.js';
import type { PageServerLoad } from './$types';

// A static page with no JavaScript; it's rebuilt whenever the data changes
export const prerender = true;
export const csr = false;

export const load: PageServerLoad = () => {
	const latest = years.at(-1)!;

	return {
		years: years.map((y) => y.year),
		example: { ...latest, holidays: latest.holidays.slice(0, 2) }
	};
};
