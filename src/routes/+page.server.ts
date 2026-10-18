import { inMonth, json, years } from '#lib/holidays.js';
import type { PageServerLoad } from './$types';

// Rebuilt whenever the data changes
export const prerender = true;

export const load: PageServerLoad = () => {
	// July of the latest year, for George Town World Heritage City Day on the 7th
	const year = years.at(-1)!;
	// The headers that request comes with, shown with the docs until it's sent
	const previewHeaders = [...json(inMonth(year, 7)).headers];
	return { year: year.year, month: 7, previewHeaders };
};
