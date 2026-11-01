import { getYear } from '#lib/holidays.js';
import { chooseLanguage } from '#lib/server/language.js';
import { inMonth, json, languageNotFound, named, yearNotFound } from '#lib/server/response.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url, request }) => {
	const year = getYear(params.year);
	if (!year) return yearNotFound(params.year);

	const month = Number(params.month);
	if (!/^\d{1,2}$/.test(params.month) || month < 1 || month > 12) {
		return json({ error: 'Month must be between 1 and 12' }, 400);
	}

	const chosen = chooseLanguage(url, request.headers);
	if (!chosen) return languageNotFound();

	return named(inMonth(year, month, chosen.language), chosen);
};
