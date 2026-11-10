// Where the holidays are published: the Penang state government portal
export const SOURCE_URL = 'https://www.penang.gov.my/index.php/component/sppagebuilder/page/50';

// Where the school holidays are published: the Ministry of Education's calendars
export const SCHOOL_SOURCE_URL = 'https://www.moe.gov.my/takwim';

const MOE = 'https://www.moe.gov.my/storage/files/shares/Takwim/Takwim%20Persekolahan';
const WAYBACK = 'https://web.archive.org/web';

// Until 2026 a school year was a session that ran from one year into the next, so a year's
// school holidays are in two calendars. The ministry has taken the older ones down, and those
// come from the Wayback Machine. The 2023/2024 one is a scan, so it isn't here: its breaks are
// copied by hand in scripts/school.ts
const SESSIONS = {
	'2022/2023': `${WAYBACK}/20220120233128id_/https://www.moe.gov.my/en/muat-turun/takwim/takwim-persekolahan/4771-kalendar-akademik-tahun-2022-2023/file`,
	'2024/2025': `${WAYBACK}/20231207062429id_/https://www.moe.gov.my/en/muat-turun/takwim/takwim-persekolahan/5994-kalendar-akademik-tahun-2024-2025/file`,
	'2025/2026': `${MOE}/Kalendar%20Akademik%202025_2026%20(Pindaan).pdf`
};

const SESSION_YEARS: Record<number, string[]> = {
	2023: [SESSIONS['2022/2023']],
	2024: [SESSIONS['2024/2025']],
	2025: [SESSIONS['2024/2025'], SESSIONS['2025/2026']]
};

/**
 * Where the school holidays of a year are published: the Ministry of Education's academic
 * calendars that cover it, each a PDF. From 2026 that's one calendar for the year
 */
export const schoolSourceUrls = (year: number) =>
	SESSION_YEARS[year] ?? [`${MOE}/Kalendar%20Akademik%20${year}.pdf`];
