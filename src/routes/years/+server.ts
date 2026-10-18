import { json, years } from '#lib/holidays.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	return json({ years: years.map((y) => y.year) });
};
