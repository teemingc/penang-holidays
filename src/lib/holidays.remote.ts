import { prerender } from '$app/server';
import { getYear, years } from '#lib/holidays.js';
import { isLanguage, type Language } from '#lib/languages.js';
import { locales } from '#lib/paraglide/runtime.js';
import { inYear, named } from '#lib/server/response.js';
import { currentYear } from '#lib/sky.js';

// runs at build time, which happens whenever the data changes, once per page language
export const getPage = prerender(
	'unchecked',
	(language: Language) => {
		if (!isLanguage(language)) throw new Error(`No page in ${language}`);

		const available = years.map((y) => y.year);
		// the year at build time, the page moves it on to the year it is opened in
		const year = currentYear(new Date(), available);
		// headers the request comes with, shown with the docs until it is sent
		const body = inYear(getYear(String(year))!, language);
		// english is the default so it is requested without ?lang= and varies with Accept-Language
		const negotiated = language === 'en';
		const previewHeaders = [...named(body, { language, negotiated }).headers];
		// the holidays of this year and any after it, named in the page's language, for the
		// almanac: years gone by are still in the API, but nobody's planning around them
		const ahead = years.filter((y) => y.year >= year);
		const holidays = Object.fromEntries(ahead.map((y) => [y.year, inYear(y, language).holidays]));
		return { year, years: ahead.map((y) => y.year), previewHeaders, holidays };
	},
	{ inputs: () => [...locales] }
);
