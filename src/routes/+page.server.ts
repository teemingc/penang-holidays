import { inMonth, json, years } from '#lib/holidays.js';
import type { PageServerLoad } from './$types';

// Rebuilt whenever the data changes
export const prerender = true;

export const load: PageServerLoad = () => {
	// July of the latest year, for George Town World Heritage City Day on the 7th
	const year = years.at(-1)!;
	// What that request returns, headers and all, shown faintly until it's sent
	const preview = inMonth(year, 7);
	return { year: year.year, month: 7, preview, previewHeaders: [...json(preview).headers] };
};
