# penang-holidays

Penang public holidays, scraped from the [Penang state government portal](https://www.penang.gov.my/index.php/component/sppagebuilder/page/50) ("Info Cuti Umum") and published as JSON.

The data is exactly what the portal lists. It does not add replacement days the portal leaves out, or one-off holidays declared after the list was gazetted.

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

| Field       | Description                                                                     |
| ----------- | ------------------------------------------------------------------------------- |
| `date`      | ISO date                                                                        |
| `name`      | Name as published, in Malay                                                     |
| `type`      | `federal` (Hari Kelepasan Am Persekutuan) or `state` (Hari Kelepasan Am Negeri) |
| `tentative` | Marked `( * ) Tertakluk kepada perubahan` (subject to change) on the portal     |

Two holidays can share a date, e.g. 7 July 2024.

## API

A SvelteKit app on Cloudflare Workers serves the same data, bundled from `data/` at build time. Its home page explains the API.

| Request       | Response                                |
| ------------- | --------------------------------------- |
| `GET /years`  | `{ "years": [2023, 2024, 2025, 2026] }` |
| `GET /2026`   | All holidays in 2026                    |
| `GET /2026/3` | Holidays in March 2026                  |

Successful responses are cached for an hour, by browsers and by [Workers Cache](https://developers.cloudflare.com/workers/cache/), which answers repeat requests without running the Worker. Errors aren't cached.

## Updating

The [Scrape workflow](.github/workflows/scrape.yml) runs every 1 December, and on demand from the Actions tab. It commits any new or changed JSON files, which redeploys the Worker.

To run it locally (Node 24+):

```sh
pnpm install
pnpm scrape          # every year currently on the portal
pnpm scrape 2027     # only 2027; fails if it isn't published yet
```

The portal only shows the last few years. Files for years that drop off are kept.

## Developing

```sh
pnpm dev       # local dev server
pnpm test
pnpm build
pnpm preview   # run the production build in the Workers runtime
```

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

The Penang flag in [`src/lib/assets`](src/lib/assets) comes from [Wikimedia Commons](<https://commons.wikimedia.org/wiki/File:Flag_of_Penang_(Malaysia).svg>) and is licensed [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The favicon is a squared-up version of it.
