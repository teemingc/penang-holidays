import { getYear } from '#lib/holidays.js';
import { chooseLanguage } from '#lib/server/language.js';
import { inYear, languageNotFound, named, yearNotFound } from '#lib/server/response.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url, request }) => {
	const year = getYear(params.year);
	if (!year) return yearNotFound(params.year);

	const chosen = chooseLanguage(url, request.headers);
	if (!chosen) return languageNotFound();

	return named(inYear(year, chosen.language), chosen);
};
