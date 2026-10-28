import { years } from '#lib/holidays.js';
import { json } from '#lib/server/response.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	return json({ years: years.map((y) => y.year) });
};
