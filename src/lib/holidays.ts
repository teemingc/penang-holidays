export const HOLIDAY_TYPES = ['federal', 'state', 'school'] as const;
export type HolidayType = (typeof HOLIDAY_TYPES)[number];

export interface Holiday {
	/** ISO date, e.g. `2026-02-17`; the first day of one that runs longer */
	date: string;
	/** The last day of a holiday that runs longer than a day, as school holidays mostly do */
	endDate?: string;
	/** Name as published, in Malay */
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
