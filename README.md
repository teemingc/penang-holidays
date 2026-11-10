# penang-holidays

Penang public holidays, scraped from the [Penang state government portal](https://www.penang.gov.my/index.php/component/sppagebuilder/page/50) ("Info Cuti Umum") and published as JSON, with the school holidays in Penang from the [Ministry of Education](https://www.moe.gov.my/)'s academic calendar.

The public holidays are exactly what the portal lists. They do not include replacement days the portal leaves out, or one-off holidays declared after the list was gazetted. The school holidays are what the ministry's calendar lists: a change the ministry announces later, in a press release, is only here once it's added by hand.

## Data

One file per year in [`data/`](data), e.g. [`data/2026.json`](data/2026.json):

```json
{
	"year": 2026,
	"holidays": [
		{
			"date": "2026-03-21",
			"name": "Hari Raya Puasa",
			"type": "federal",
			"tentative": true
		}
	]
}
```

| Field       | Description                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `date`      | ISO date; the first day of a holiday that runs longer than a day                                                                    |
| `endDate`   | The last day of a holiday that runs longer than a day. Left out of a holiday of one day                                             |
| `name`      | Name as published, in Malay                                                                                                         |
| `type`      | `federal` (Hari Kelepasan Am Persekutuan), `state` (Hari Kelepasan Am Negeri) or `school` (see [School holidays](#school-holidays)) |
| `tentative` | Marked `( * ) Tertakluk kepada perubahan` (subject to change) on the portal                                                         |

Two holidays can share a date, e.g. 7 July 2024.

### School holidays

School holidays come from the ministry's academic calendars, each a PDF, for the group of states Penang is in (Kumpulan B). There are two kinds:

- The breaks between terms, e.g. `Cuti Penggal 1` or `Cuti Akhir Persekolahan`, read from the calendar.
- The days off school the ministry adds around a festival, e.g. `Cuti Perayaan Hari Deepavali`. The calendar's table of these doesn't come out of the PDF in a readable order, so they are copied by hand into [`scripts/school.ts`](scripts/school.ts). Days the ministry adds later in a press release are in [`scripts/press-releases.json`](scripts/press-releases.json).

Until 2026 a school year was a session that ran from one year into the next, so 2023 to 2025 each take their holidays from two calendars. The ministry has taken the older ones down; they come from the [Wayback Machine](https://web.archive.org/), as first published. The 2023/2024 calendar is a scan, so its breaks are copied by hand too. For these years, days the ministry added later in a press release haven't been looked for thoroughly: 19 April 2023 is the only one here.

A holiday that runs into the next year is in the file of the year it starts, e.g. the break from 20 December 2025 to 11 January 2026 is in [`data/2025.json`](data/2025.json). The API returns it for both years.

```json
{
	"date": "2026-03-21",
	"endDate": "2026-03-29",
	"name": "Cuti Penggal 1",
	"type": "school",
	"tentative": false
}
```

## API

A SvelteKit app on Cloudflare Workers serves the same data, bundled from `data/` at build time. Its home page explains the API.

| Request       | Response                                  |
| ------------- | ----------------------------------------- |
| `GET /years`  | `{ "years": [2023, 2024, 2025, 2026] }`   |
| `GET /2026`   | All holidays in 2026, school holidays too |
| `GET /2026/3` | Holidays in March 2026                    |

A year or month comes back as `{ "holidays": [...] }`, each holiday with the fields above, named in English unless you ask for Malay or Chinese (see [Languages](#languages)). The year and month aren't repeated, since they're in the path.

### Types

A request returns every type of holiday unless `?type=` asks for some: one or more of `federal`, `state` and `school`, separated by commas. Any other value is a 400.

| Request                        | Response                     |
| ------------------------------ | ---------------------------- |
| `GET /2026?type=federal,state` | Public holidays in 2026      |
| `GET /2026?type=school`        | School holidays in 2026      |
| `GET /2026/3?type=state`       | State holidays in March 2026 |

A month includes a school holiday that has any day in it, so `GET /2026/6` returns the mid-year break that starts in May. A year or month includes one that started the year before too: `GET /2026/1` returns the break that starts on 20 December 2025, with that as its `date`.

### Languages

Holidays are named in English, in Malay as the portal publishes them, or in Chinese (simplified, as written in Malaysia). The API picks the language from:

1. `?lang=ms`, `?lang=en` or `?lang=zh`, e.g. `GET /2026?lang=zh`. Any other value is a 400.
2. Otherwise, the `Accept-Language` header: the first language in it that's one of these three.
3. Otherwise, English.

The response's `Content-Language` header says which it is (`ms`, `en` or `zh-Hans-MY`). A holiday named in English or Chinese keeps the portal's Malay name in `originalName`:

```json
{
	"date": "2026-02-17",
	"name": "农历新年",
	"originalName": "Tahun Baru Cina",
	"type": "federal",
	"tentative": false
}
```

The translations aren't official; see [Credits](#credits). A name without one yet stays in Malay, without `originalName`.

The home page is in English at [`/`](https://penang-holidays.teemingc.workers.dev/) and Malay at [`/ms`](https://penang-holidays.teemingc.workers.dev/ms). Its words are in [`messages/`](messages), compiled by [Paraglide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs).

Successful responses are cached for an hour, by browsers and by [Workers Cache](https://developers.cloudflare.com/workers/cache/), which answers repeat requests without running the Worker. Errors aren't cached. A response whose language came from `Accept-Language` is cached once for each value of the header (`Vary: Accept-Language`); `?lang=` is cached once for everyone.

## Updating

The [Scrape workflow](.github/workflows/scrape.yml) runs every 1 December, and on demand from the Actions tab. It commits any new or changed JSON files, which redeploys the Worker.

To run it locally (Node 24+):

```sh
pnpm install
pnpm scrape          # every year currently on the portal
pnpm scrape 2027     # only 2027; fails if it isn't published yet
```

The portal only shows the last few years. Files for years that drop off are kept.

School holidays are scraped with it, from the calendars in [`src/lib/source.ts`](src/lib/source.ts), for this year and any after it. A year gone by keeps the school holidays it has unless it's asked for, as in `pnpm scrape 2024`. If a calendar isn't at the address the scraper expects, or can't be fetched (the Wayback Machine turns requests away when it's busy), the year keeps the school holidays it already has. For a new year, add its days off around festivals to [`scripts/school.ts`](scripts/school.ts) from the calendar's Lampiran C.

The ministry also adds days off school after a calendar is out, most years one before Hari Raya Aidilfitri, in a press release. The [School holiday press releases workflow](.github/workflows/press-releases.yml) runs every day: it reads the ministry's [press releases](https://www.moe.gov.my/kenyataan-media) of the last three days, and if one adds days for schools in Penang, it adds them to [`scripts/press-releases.json`](scripts/press-releases.json) and the year's file, and opens a pull request. It only reads the wording the ministry has used before; a release it can't be sure of fails the run, and its days are then added to that file by hand. So is a day the ministry only announces to reporters, as in 2023. The workflow needs the repository setting that lets GitHub Actions create pull requests.

## Developing

```sh
pnpm dev       # local dev server
pnpm test
pnpm build
pnpm preview   # run the production build in the Workers runtime
pnpm og        # draw the image shown when the site is shared, with Chrome
```

The shared image, [`src/lib/assets/og.png`](src/lib/assets/og.png), is a picture of [`scripts/og.html`](scripts/og.html). Run `pnpm og` after changing that page; it needs Chrome, and `CHROME` set to its path if it isn't found.

## Deploying

The app deploys through Cloudflare's Git integration (Workers Builds) on every push to `main`:

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Import a repository** and pick this repository.
2. Keep the project name as `penang-holidays` to match [`wrangler.jsonc`](wrangler.jsonc).
3. Set the build command to `pnpm build` and the deploy command to `npx wrangler deploy`.

To deploy manually instead, run `pnpm run deploy`.

## Why this exists

General-purpose holiday libraries work out dates from rules and secondary sources, and can lag behind or differ from what a state actually gazettes. For Penang, the most reliable source is the state government itself, so this project takes its list straight from penang.gov.my and changes nothing.

If you need more than Penang, the [holidays](https://github.com/vacanza/holidays) Python library covers a far bigger scope: countries and their subdivisions around the world, Malaysia's states among them. It's a great project, and worth a look if you need holidays beyond Penang.

## Credits

The portal and the ministry only name holidays in Malay. The English and Chinese names in [`src/lib/names.ts`](src/lib/names.ts) are translations, not official names. The names of school holidays are this project's own; the rest:

- English names come from the [holidays](https://github.com/vacanza/holidays) Python library's [English translations for Malaysia](https://github.com/vacanza/holidays/blob/v0.107/holidays/locale/en_US/LC_MESSAGES/MY.po), © Vacanza Team and individual contributors, licensed [MIT](https://github.com/vacanza/holidays/blob/v0.107/LICENSE).
- Chinese names come from the holiday table in Chinese Wikipedia's [馬來西亞公共假期](https://zh.wikipedia.org/zh-my/馬來西亞公共假期) (Malaysian variant), by its contributors, licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

The Penang flag in [`src/lib/assets`](src/lib/assets) comes from [Wikimedia Commons](<https://commons.wikimedia.org/wiki/File:Flag_of_Penang_(Malaysia).svg>) and is licensed [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The favicon is a squared-up version of it.
