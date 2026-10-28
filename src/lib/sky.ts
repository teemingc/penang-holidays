// Where the sun is over Penang at a given moment, and the colours of the sky that go with it.
// The page and the 3D scene both take their colours from here, so they agree on the time of day

// George Town, in degrees
const LATITUDE = 5.41;
const LONGITUDE = 100.33;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** The date in Penang at a given moment, e.g. `2026-02-17` */
const penangDate = (date: Date) =>
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
	const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + LONGITUDE / 15;
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

/** Twilight runs from the sun 6° below the horizon to 6° above it */
export function phaseOf(sun: Sun): Phase {
	const twilight = radians(6);
	if (sun.elevation < -twilight) return 'night';
	if (sun.elevation < twilight) return sun.azimuth < Math.PI ? 'dawn' : 'dusk';
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
				: e < radians(10)
					? [twilight, PALETTES.day, e / radians(10)]
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
