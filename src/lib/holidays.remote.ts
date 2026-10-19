import { prerender } from '$app/server';
import { getYear, inYear, json, years } from '#lib/holidays.js';
import { currentYear } from '#lib/sky.js';

// Worked out at build time, which happens whenever the data changes
export const getPage = prerender(() => {
	const available = years.map((y) => y.year);
	// This year when the page was built; the page moves it on to the year it's opened in
	const year = currentYear(new Date(), available);
	// The headers that request comes with, shown with the docs until it's sent
	const previewHeaders = [...json(inYear(getYear(String(year))!)).headers];
	return { year, years: available, previewHeaders };
});
