// keyed by the portal spelling, which differs from the malay names in both sources in places
//
// english from the malaysia translations in the holidays python library, MIT licence
// https://github.com/vacanza/holidays/blob/v0.107/holidays/locale/en_US/LC_MESSAGES/MY.po
//
// chinese from the holiday table in the chinese wikipedia article on malaysian public holidays,
// malaysian variant, CC BY-SA 4.0, revision of 26 august 2026
// https://zh.wikipedia.org/zh-my/馬來西亞公共假期

/** languages with names besides the malay the portal publishes */
export type Language = 'en' | 'zh';

type Names = Record<Language, string>;

const names = new Map<string, Names>([
	['Tahun Baru Cina', { en: 'Chinese New Year', zh: '农历新年' }],
	['Hari Thaipusam', { en: 'Thaipusam', zh: '大宝森节' }],
	['Hari Nuzul Al-Quran', { en: 'Nuzul Al-Quran Day', zh: '可兰经降世日' }],
	['Hari Raya Puasa', { en: 'Eid al-Fitr', zh: '开斋节' }],
	['Hari Raya Puasa (Hari Kedua)', { en: 'Eid al-Fitr (Second Day)', zh: '开斋节第二天' }],
	['Hari Pekerja', { en: 'Labor Day', zh: '劳动节' }],
	['Hari Raya Qurban', { en: 'Eid al-Adha', zh: '哈芝节' }],
	['Hari Wesak', { en: 'Vesak Day', zh: '卫塞节' }],
	[
		'Hari Keputeraan Seri Paduka Baginda Yang di-Pertuan Agong',
		{ en: 'Birthday of HM Yang di-Pertuan Agong', zh: '最高元首诞辰' }
	],
	['Awal Muharram (Maal Hijrah)', { en: 'Islamic New Year', zh: '回历新年' }],
	[
		'Hari Ulang Tahun Perisytiharan Tapak Warisan Dunia',
		{ en: 'George Town Heritage Day', zh: '乔治市世界遗产日' }
	],
	[
		'Hari Jadi Tuan Yang Terutama Yang di-Pertua Negeri Pulau Pinang',
		{ en: 'Birthday of the Governor of Penang', zh: '槟城州元首诞辰' }
	],
	['Hari Kebangsaan', { en: 'National Day', zh: '独立日' }],
	[
		'Hari Keputeraan Nabi Muhamad S.A.W (Maulidur Rasul)',
		{ en: "Prophet Muhammad's Birthday", zh: '先知穆罕默德诞辰' }
	],
	['Hari Malaysia', { en: 'Malaysia Day', zh: '马来西亚日' }],
	['Hari Deepavali', { en: 'Diwali', zh: '屠妖节' }],
	['Hari Krismas', { en: 'Christmas Day', zh: '圣诞节' }]
]);

const replacement: Record<Language, (holidays: string[]) => string> = {
	en: (holidays) => `${holidays.join(' and ')} (observed)`,
	zh: (holidays) => `${holidays.join('及')}补假`
};

/** name in language for a portal name, or undefined if there is none yet */
export function translate(name: string, language: Language): string | undefined {
	// the portal puts the year in it, like Tahun Baru 2026
	if (/^Tahun Baru \d{4}$/.test(name)) return { en: "New Year's Day", zh: '元旦' }[language];

	// a replacement day for one or more holidays, like Cuti Ganti Hari Wesak dan Hari Malaysia
	const replaced = name.match(/^Cuti Ganti (.+)$/)?.[1];
	if (replaced) {
		const holidays = replaced.split(' dan ').map((holiday) => translate(holiday, language));
		return holidays.every(Boolean) ? replacement[language](holidays as string[]) : undefined;
	}

	return names.get(name)?.[language];
}
