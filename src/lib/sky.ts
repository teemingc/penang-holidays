// Where the sun is over Penang at a given moment, and the colours of the sky that go with it.
// The page and the 3D scene both take their colours from here, so they agree on the time of day

// George Town, in degrees
const LATITUDE = 5.41;
const LONGITUDE = 100.33;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** The date in Penang at a given moment, e.g. `2026-02-17` */
export const penangDate = (date: Date) =>
	date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });

/**
 * Now, or for previewing another time of day, the Penang time in a `?time=21:30` query
 */
export function now(): Date {
	const time =
		typeof location === 'undefined' ? null : new URL(location.href).searchParams.get('time');
	const match = time?.match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return new Date();
	// Today's date in Penang, at that time, in Penang's offset of UTC+8
	return new Date(`${penangDate(new Date())}T${match[1]!.padStart(2, '0')}:${match[2]}:00+08:00`);
}

/** The year it is in Penang at a given moment, or the latest available when it isn't one yet */
export function currentYear(date: Date, available: number[]): number {
	const year = Number(penangDate(date).slice(0, 4));
	return available.includes(year) ? year : available.at(-1)!;
}

export interface Sun {
	/** Above the horizon, in radians; negative at night */
	elevation: number;
	/** Clockwise from north, in radians */
	azimuth: number;
}

/** The sun's position over George Town, accurate to a degree or so, which is plenty here */
export function sunAt(date: Date): Sun {
	const day = (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000;
	const declination = radians(-23.44) * Math.cos(((Math.PI * 2) / 365) * (day + 10));
	// The sun keeps its own time, up to a quarter of an hour ahead of the clock's or behind it
	// through the year: the equation of time, in minutes
	const b = ((Math.PI * 2) / 365) * (day - 81);
	const equation = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
	const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + LONGITUDE / 15 + equation / 60;
	const hourAngle = radians((hours - 12) * 15);
	const latitude = radians(LATITUDE);
	const elevation = Math.asin(
		Math.sin(latitude) * Math.sin(declination) +
			Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle)
	);
	const azimuth = Math.atan2(
		-Math.cos(declination) * Math.sin(hourAngle),
		Math.sin(declination) * Math.cos(latitude) -
			Math.cos(declination) * Math.cos(hourAngle) * Math.sin(latitude)
	);
	return { elevation, azimuth: (azimuth + Math.PI * 2) % (Math.PI * 2) };
}

export type Phase = 'night' | 'dawn' | 'day' | 'dusk';

/**
 * Twilight runs from the sun 6° below the horizon to 10° above it, when the sky starts to
 * darken enough for the type to turn light
 */
export function phaseOf(sun: Sun): Phase {
	if (sun.elevation < radians(-6)) return 'night';
	if (sun.elevation < radians(10)) return sun.azimuth < Math.PI ? 'dawn' : 'dusk';
	return 'day';
}

type Rgb = [number, number, number];

export interface Palette {
	/** The sky overhead, and at the horizon */
	top: Rgb;
	horizon: Rgb;
	/** The sea's own colour, before it reflects anything */
	sea: Rgb;
	/** The light from the sun or moon, and how strong it is */
	light: Rgb;
	strength: number;
	/** The soft light from the whole sky */
	ambient: Rgb;
	/** How much the bridge's own lights glow, from off to full */
	lamps: number;
}

export const PALETTES: Record<Phase, Palette> = {
	night: {
		top: [5, 8, 20],
		horizon: [22, 32, 66],
		sea: [3, 8, 20],
		light: [150, 170, 220],
		strength: 0.25,
		ambient: [40, 50, 90],
		lamps: 1
	},
	dawn: {
		top: [52, 66, 128],
		horizon: [246, 172, 150],
		sea: [20, 40, 70],
		light: [255, 190, 150],
		strength: 1.2,
		ambient: [140, 120, 150],
		lamps: 0.6
	},
	day: {
		top: [92, 160, 226],
		horizon: [206, 230, 246],
		sea: [14, 96, 150],
		light: [255, 250, 238],
		strength: 2.6,
		ambient: [170, 200, 230],
		lamps: 0
	},
	dusk: {
		top: [38, 40, 98],
		horizon: [244, 140, 82],
		sea: [24, 30, 60],
		light: [255, 150, 90],
		strength: 1.1,
		ambient: [130, 100, 130],
		lamps: 0.8
	}
};

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t,
	a[2] + (b[2] - a[2]) * t
];

/** The palette for a moment, blended smoothly across twilight rather than switching */
export function paletteAt(sun: Sun): Palette {
	const e = sun.elevation;
	const twilight = sun.azimuth < Math.PI ? PALETTES.dawn : PALETTES.dusk;
	const [from, to, t] =
		e < radians(-8)
			? [PALETTES.night, PALETTES.night, 0]
			: e < 0
				? [PALETTES.night, twilight, (e - radians(-8)) / radians(8)]
				: e < radians(14)
					? [twilight, PALETTES.day, e / radians(14)]
					: [PALETTES.day, PALETTES.day, 0];
	return {
		top: mix(from.top, to.top, t),
		horizon: mix(from.horizon, to.horizon, t),
		sea: mix(from.sea, to.sea, t),
		light: mix(from.light, to.light, t),
		strength: from.strength + (to.strength - from.strength) * t,
		ambient: mix(from.ambient, to.ambient, t),
		lamps: from.lamps + (to.lamps - from.lamps) * t
	};
}

// at dawn and dusk the low sky is too light for light type and too dark for dark
// so the page sky is shaded, the scene keeps its own colours
const EVENING: Rgb = [26, 20, 56];

const smoothstep = (from: number, to: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
	return t * t * (3 - 2 * t);
};

/**
 * The page sky for where the sun is, shaded around twilight: more and more as the sun nears
 * it, and gone by the time the type turns dark for the day, at 10°, so the sky never jumps
 */
export function shade(colour: Rgb, sun: Sun): Rgb {
	const e = sun.elevation;
	const twilight =
		smoothstep(radians(-10), radians(-6), e) * (1 - smoothstep(radians(6), radians(10), e));
	return mix(colour, EVENING, 0.68 * twilight);
}

// How bright a colour looks, and how far apart two are, as WCAG measures them
const luminance = (colour: Rgb) => {
	const [r, g, b] = colour.map((c) => {
		const v = c / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: Rgb, b: Rgb) => {
	const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
	return (x! + 0.05) / (y! + 0.05);
};

/** How far apart the type and the sky behind it have to be, at the least: WCAG's AA */
const LEGIBLE = 4.5;

export interface Inks {
	/** Whether the type is dark, on a light sky */
	dark: boolean;
	ink: Rgb;
	/** Quieter type: dates, notes, the request's body */
	soft: Rgb;
	/** Quieter still: the comments in the request's body */
	faint: Rgb;
	accent: Rgb;
}

/**
 * The type for a sky whose top is `top`: light or dark, whichever stands out more against it,
 * and its quieter shades as quiet as they're meant to be, but never too faint to read. Through
 * twilight, when the sky is neither light nor dark, they're all as strong as the ink itself
 */
export function inksFor(top: Rgb): Inks {
	const light: Rgb = [244, 248, 251];
	const darkInk: Rgb = [6, 20, 42];
	const dark = contrast(darkInk, top) > contrast(light, top);
	// When the sky is halfway between, only pure black or white stands out enough
	let ink = dark ? darkInk : light;
	const purest: Rgb = dark ? [0, 0, 0] : [255, 255, 255];
	for (let i = 0; i < 10 && contrast(ink, top) < LEGIBLE; i++) ink = mix(ink, purest, 0.25);
	// `colour` blended into the sky by `strength`, strengthened until it can be read
	const legible = (colour: Rgb, strength: number) => {
		for (let s = strength; s < 1; s += 0.02) {
			const blended = mix(top, colour, s);
			if (contrast(blended, top) >= LEGIBLE) return blended;
		}
		return colour;
	};
	// The accent, deepened towards the ink until it can be read
	let accent: Rgb = dark ? [6, 63, 115] : [246, 207, 79];
	for (let i = 0; i < 30 && contrast(accent, top) < LEGIBLE; i++) accent = mix(accent, ink, 0.1);
	if (contrast(accent, top) < LEGIBLE) accent = ink;
	return { dark, ink, soft: legible(ink, 0.74), faint: legible(ink, 0.54), accent };
}

export interface Moon extends Sun {
	/** How much of it is lit, from 0 at new moon to 1 at full */
	lit: number;
	/** Growing towards full, rather than shrinking from it */
	waxing: boolean;
}

/**
 * The moon's position over George Town and its phase, after the low-precision formulas in
 * Jean Meeus's Astronomical Algorithms, good to a degree or so
 */
export function moonAt(date: Date): Moon {
	const rad = Math.PI / 180;
	// Days since noon on 1 January 2000
	const d = date.getTime() / 86_400_000 - 10957.5;
	const tilt = 23.4397 * rad;
	const toEquator = (l: number, b: number) => ({
		ra: Math.atan2(Math.sin(l) * Math.cos(tilt) - Math.tan(b) * Math.sin(tilt), Math.cos(l)),
		dec: Math.asin(Math.sin(b) * Math.cos(tilt) + Math.cos(b) * Math.sin(tilt) * Math.sin(l))
	});

	const meanAnomaly = rad * (134.963 + 13.064993 * d);
	const moon = toEquator(
		rad * (218.316 + 13.176396 * d) + rad * 6.289 * Math.sin(meanAnomaly),
		rad * 5.128 * Math.sin(rad * (93.272 + 13.22935 * d))
	);
	const moonDistance = 385_001 - 20_905 * Math.cos(meanAnomaly);

	const sunAnomaly = rad * (357.5291 + 0.98560028 * d);
	const centre =
		rad *
		(1.9148 * Math.sin(sunAnomaly) +
			0.02 * Math.sin(2 * sunAnomaly) +
			0.0003 * Math.sin(3 * sunAnomaly));
	const sun = toEquator(sunAnomaly + centre + rad * 102.9372 + Math.PI, 0);

	const latitude = radians(LATITUDE);
	const hourAngle = rad * (280.16 + 360.9856235 * d) + radians(LONGITUDE) - moon.ra;
	const elevation = Math.asin(
		Math.sin(latitude) * Math.sin(moon.dec) +
			Math.cos(latitude) * Math.cos(moon.dec) * Math.cos(hourAngle)
	);
	// Measured from the south, westwards, then turned to clockwise from the north
	const fromSouth = Math.atan2(
		Math.sin(hourAngle),
		Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(moon.dec) * Math.cos(latitude)
	);

	// The angle between the sun and the moon, as seen from the earth, gives the phase
	const apart = Math.acos(
		Math.sin(sun.dec) * Math.sin(moon.dec) +
			Math.cos(sun.dec) * Math.cos(moon.dec) * Math.cos(sun.ra - moon.ra)
	);
	const sunDistance = 149_598_000;
	const phaseAngle = Math.atan2(
		sunDistance * Math.sin(apart),
		moonDistance - sunDistance * Math.cos(apart)
	);
	const side = Math.atan2(
		Math.cos(sun.dec) * Math.sin(sun.ra - moon.ra),
		Math.sin(sun.dec) * Math.cos(moon.dec) -
			Math.cos(sun.dec) * Math.sin(moon.dec) * Math.cos(sun.ra - moon.ra)
	);

	return {
		elevation,
		azimuth: (fromSouth + Math.PI * 3) % (Math.PI * 2),
		lit: (1 + Math.cos(phaseAngle)) / 2,
		waxing: side < 0
	};
}
