import { inMonth, json, years } from '#lib/holidays.js';
import { currentMonth } from '#lib/sky.js';
import type { PageServerLoad } from './$types';

// Rebuilt whenever the data changes
export const prerender = true;

export const load: PageServerLoad = () => {
	const available = years.map((y) => y.year);
	// This month when the page was built; the page moves it on to the month it's opened in
	const { year, month } = currentMonth(new Date(), available);
	// The headers that request comes with, shown with the docs until it's sent
	const body = inMonth(
		years.find((y) => y.year === year)!,
		month
	);
	const previewHeaders = [...json(body).headers];
	return { year, month, years: available, previewHeaders };
};
