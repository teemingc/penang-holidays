// The sky behind the page, in the document's own colours and background, for where the sun is
// over Penang. src/lib/boot.ts paints it before the first frame, and src/routes/+page.svelte
// keeps it up to date after, both from here, so they can't disagree

import { inksFor, paletteAt, phaseOf, shade, waterOf, type Palette, type Sun } from './sky.js';

const rgb = (colour: number[]) => `rgb(${colour.map(Math.round).join(' ')})`;

/**
 * Colours the page for where the sun is: the top of the sky, which is the one colour at every
 * edge of the screen and of the browser's bars, the horizon, and the type, light or dark,
 * legible against it. Gives back the top of the sky and the palette it came from
 */
export function tint(sun: Sun) {
	const root = document.documentElement;
	const phase = phaseOf(sun);
	// only when it changes: the smoke over the header draws it again each time it's set
	if (root.dataset.sky !== phase) root.dataset.sky = phase;
	const palette = paletteAt(sun);
	const top = shade(palette.top, sun);
	root.style.setProperty('--top', rgb(top));
	root.style.setProperty('--horizon', rgb(shade(palette.horizon, sun)));
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', rgb(top));
	const inks = inksFor(top);
	root.dataset.ink = inks.dark ? 'dark' : 'light';
	root.style.setProperty('--ink', rgb(inks.ink));
	root.style.setProperty('--ink-soft', rgb(inks.soft));
	root.style.setProperty('--ink-faint', rgb(inks.faint));
	root.style.setProperty('--accent', rgb(inks.accent));
	return { top, palette };
}

/**
 * The sky as the scene draws it, src/lib/scene/mist.ts's SKY, in the page's own background
 * instead, from the same colours: there while the scene loads, under its stills of the bridge,
 * so the page doesn't change all over once it's drawn, and in its place if it can't be. From
 * the top of the sky through the band above the horizon to the horizon itself, brightest
 * there, then the water, on down to the foot of the page, where it thins into the page's own
 * colour. The horizon is where the scene's camera puts it, a sixth of the way down the
 * bridge's frame, or with the camera stepped back for a tall one, a little under a third
 */
export function paintSky(top: number[], palette: Palette, elevation: number) {
	const pane = document.querySelector('.sky');
	const frame = document.querySelector('.plate')?.getBoundingClientRect();
	if (!pane || !frame) return;
	const mix = (a: number[], b: number[], t: number) => a.map((c, i) => c + (b[i]! - c) * t);
	const start = pane.getBoundingClientRect().top + scrollY;
	const end = document.body.getBoundingClientRect().bottom + scrollY;
	const scene = frame.height;
	const line = frame.top + scrollY + scene * (frame.width / scene < 1 ? 0.291 : 0.169);
	const deep = waterOf(palette, elevation);
	// Fainter after dark, and never white
	const dark = Math.min(1, Math.max(0, -elevation / ((8 * Math.PI) / 180)));
	const glowing = 1 - 0.8 * dark;
	const glow = mix(palette.horizon, [255, 255, 255], 0.4 * glowing ** 2);
	const at = (colour: number[], y: number, alpha = 1) =>
		`rgb(${colour.map(Math.round).join(' ')} / ${alpha}) ${Math.round(y)}px`;
	const above = scene * 0.3;
	const below = scene * 0.4;
	document.documentElement.style.backgroundImage = [
		`linear-gradient(${[
			at(glow, line - above * 1.6, 0),
			at(glow, line - above * 0.7, 0.85 * glowing * 0.6),
			at(glow, line, 0.85 * glowing),
			at(glow, line + below * 0.7, 0.85 * glowing * 0.6),
			at(glow, line + below * 1.6, 0)
		].join(', ')})`,
		`linear-gradient(${[
			at(top, start),
			at(mix(top, palette.mid, 0.5), start + (line - start) * 0.3),
			at(palette.mid, start + (line - start) * 0.55),
			at(mix(palette.mid, palette.horizon, 0.5), start + (line - start) * 0.78),
			at(palette.horizon, line),
			at(deep, line + scene * 0.9),
			at(deep, end - 208),
			at(top, end - 48)
		].join(', ')})`
	].join(', ');
}
