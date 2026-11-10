// Draws the image shown when the site is shared, src/lib/assets/og.png, from scripts/og.html,
// with Chrome. Run it with `pnpm og` after changing that page, or the bridge or flag it shows.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = fileURLToPath(new URL('og.html', import.meta.url));
const IMAGE = fileURLToPath(new URL('../src/lib/assets/og.png', import.meta.url));

// The size the page's og:image:width and og:image:height give
const [WIDTH, HEIGHT] = [1200, 630];

// CHROME says where it is, if it's none of these
const BROWSERS = [
	process.env.CHROME,
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/Applications/Chromium.app/Contents/MacOS/Chromium',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser'
];

const chrome = BROWSERS.find((path) => path && existsSync(path));
if (!chrome) throw new Error('Could not find Chrome. Set CHROME to where it is');

execFileSync(
	chrome,
	[
		'--headless',
		'--hide-scrollbars',
		// one pixel of the image for each of the page, whatever the screen
		'--force-device-scale-factor=1',
		`--window-size=${WIDTH},${HEIGHT}`,
		// time for the font and the pictures to load
		'--virtual-time-budget=2000',
		`--screenshot=${IMAGE}`,
		PAGE
	],
	{ stdio: 'ignore' }
);

console.log(`Drew src/lib/assets/og.png, ${WIDTH}×${HEIGHT}`);
