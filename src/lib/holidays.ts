export type HolidayType = 'federal' | 'state';

export interface Holiday {
	/** ISO date, e.g. `2026-02-17` */
	date: string;
	/** Name as published on the portal, in Malay */
	name: string;
	type: HolidayType;
	/** Marked `( * ) Tertakluk kepada perubahan` (subject to change) on the portal */
	tentative: boolean;
}

export interface YearHolidays {
	year: number;
	holidays: Holiday[];
}

// Bundled at build time; each commit to data/ triggers a new build and deploy
const files = import.meta.glob<YearHolidays>('/data/*.json', { eager: true, import: 'default' });

/** Every scraped year, oldest first */
export const years = Object.values(files).sort((a, b) => a.year - b.year);

export function getYear(param: string): YearHolidays | undefined {
	return years.find((y) => String(y.year) === param);
}
