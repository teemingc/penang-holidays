// What has to be right from the first frame, before the page's own scripts have loaded, which
// can be a long while on a slow connection: the sky for the time of day in Penang, and the
// holidays gone by hidden. The page is prerendered, so only the browser knows what time it
// is. vite.config.ts bundles this into a script of its own, and src/hooks.server.ts puts it
// in the head of src/app.html, where it runs before anything is painted

import { paintSky, tint } from './backdrop.js';
import { now, penangDate, sunAt } from './sky.js';

const date = now();

// The holidays gone by this year are hidden from the first paint, until they're asked for:
// every day before today, as whole months and then days of this one. See the almanac in
// src/routes/+page.svelte
{
	const [year, month, day] = penangDate(date).split('-');
	const gone = [];
	const two = (n: number) => String(n).padStart(2, '0');
	for (let m = 1; m < Number(month); m++) gone.push(`[data-date^="${year}-${two(m)}"]`);
	for (let d = 1; d < Number(day); d++) gone.push(`[data-date="${year}-${month}-${two(d)}"]`);
	if (gone.length) {
		const past = `:is(${gone.join()})`;
		// The fold tallies them, in whichever of its counts ends at the last one gone by
		const nextPast = past.replaceAll('data-date', 'data-next');
		const style = document.createElement('style');
		style.textContent = `
			.months:not(.all) li${past},
			.months:not(.all) .month:not(:has(li:not(${past}))) { display: none }
			.almanac:has(.months:not(.all)):not(:has(li:not(${past}))) .over { display: block }
			.fold:has(.tally${past}), .tally${past}:not(${nextPast}) { display: block }
		`;
		document.head.append(style);
	}
}

const sun = sunAt(date);
const { top, palette } = tint(sun);

// The sky down the page is measured against the page, so it's painted once that's been parsed
// and laid out: the script at the end of src/app.html's body starts this watching, before
// the first frame, and it paints again whenever the page changes size, as its fonts arrive,
// until src/routes/+page.svelte takes over
window.skyWatch = new ResizeObserver(() => paintSky(top, palette, sun.elevation));
