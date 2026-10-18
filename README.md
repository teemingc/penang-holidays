# penang-holidays

Penang public holidays, scraped from the [Penang state government portal](https://www.penang.gov.my/index.php/component/sppagebuilder/page/50) ("Info Cuti Umum") and published as JSON.

The data is exactly what the portal lists. It does not add replacement days the portal leaves out, or one-off holidays declared after the list was gazetted.

## Data

- [`data/{year}.json`](data): one file per year, e.g. [`data/2026.json`](data/2026.json)
- [`data/holidays.json`](data/holidays.json): every year in one file

```json
{
	"year": 2026,
	"source": "https://www.penang.gov.my/index.php/component/sppagebuilder/page/50",
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

A Cloudflare Worker serves the same data:

| Request       | Response                                |
| ------------- | --------------------------------------- |
| `GET /`       | `{ "years": [2023, 2024, 2025, 2026] }` |
| `GET /2026`   | All holidays in 2026                    |
| `GET /2026/3` | Holidays in March 2026                  |

## Updating

The [Scrape workflow](.github/workflows/scrape.yml) runs every 1 December, and on demand from the Actions tab. It commits any new or changed JSON files, which redeploys the Worker.

To run it locally (Node 24+):

```sh
pnpm install
pnpm scrape          # every year currently on the portal
pnpm scrape 2027     # only 2027; fails if it isn't published yet
```

The portal only shows the last few years. Files for years that drop off are kept.

## Deploying the Worker

The Worker deploys through Cloudflare's Git integration (Workers Builds) on every push to `main`:

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Import a repository** and pick this repository.
2. Keep the project name as `penang-holidays` to match [`wrangler.jsonc`](wrangler.jsonc).

To deploy manually instead, run `pnpm run deploy`.
