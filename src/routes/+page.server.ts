import { inMonth, years } from '#lib/holidays.js';
import type { PageServerLoad } from './$types';

// Rebuilt whenever the data changes
export const prerender = true;

export const load: PageServerLoad = () => {
	// July of the latest year, for George Town World Heritage City Day on the 7th
	const year = years.at(-1)!;
	// What that request returns, shown faintly until it's sent
	return { year: year.year, month: 7, preview: inMonth(year, 7) };
};
