import { getYear } from '#lib/holidays.js';
import { chooseLanguage } from '#lib/server/language.js';
import {
	chooseTypes,
	inYear,
	languageNotFound,
	named,
	typeNotFound,
	yearNotFound
} from '#lib/server/response.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url, request }) => {
	const year = getYear(params.year);
	if (!year) return yearNotFound(params.year);

	const chosen = chooseLanguage(url, request.headers);
	if (!chosen) return languageNotFound();

	const types = chooseTypes(url);
	if (!types) return typeNotFound();

	return named(inYear(year, chosen.language, types), chosen);
};
