// The Penang Bridge across the strait, in metres. x runs east along the bridge, y is up from the
// sea, and z is south, towards the viewer

// The deck rises from the approaches to the main span, where ships pass under it
export const deckY = (x: number) => 9 + 24 * Math.exp(-((x / 650) ** 2));
/** How steeply the deck climbs at x, in radians */
export const deckSlope = (x: number) => Math.atan2(deckY(x + 1) - deckY(x - 1), 2);
export const DECK_HALF = 12;
export const DECK_DEPTH = 3;
export const REACH = 2400;
/** Whether a point is over the deck, seen from above */
export const overDeck = (p: { x: number; z: number }) =>
	Math.abs(p.z) < DECK_HALF && Math.abs(p.x) < REACH;
// Where a lamp with nothing to light goes: past the far end of the camera's view, so it's
// never drawn. Just below the water isn't far enough: the sea is painted behind the scene,
// so a lamp under it would shine through
export const UNSEEN = -1e6;
export const PIER_GAP = 45;
// Lamp posts along both edges of the deck
export const LAMP_GAP = 36;
export const LAMP_FIRST = -REACH + 18;
// The two pylons, each a pair of tapering legs either side of the deck, topped with a spire
export const PYLONS = [-112, 112];
export const LEG_Z = 14;
export const PYLON_HEIGHT = 100;
export const SPIRE = 16;
// Three lanes each way. In Malaysia traffic keeps left, so eastbound runs on the north side
export const LANES = [
	{ z: -2.2, way: 1 },
	{ z: -5.6, way: 1 },
	{ z: -9, way: 1 },
	{ z: 2.2, way: -1 },
	{ z: 5.6, way: -1 },
	{ z: 9, way: -1 }
];
// Bumper to bumper, as it always is
export const CAR_GAP = 7;
export const TRAFFIC_REACH = 1500;
/** Once along the traffic's stretch of the bridge, after which it comes round again */
export const SPAN = TRAFFIC_REACH * 2;
export const PER_LANE = Math.floor(SPAN / CAR_GAP);
export const CARS = PER_LANE * LANES.length;
// Motorcycles, as many as there are in Penang
export const BIKES = 90;

/** v brought into [0, span), however far below or above it is */
export const wrap = (v: number, span: number) => ((v % span) + span) % span;

/** A repeatable sequence of numbers in [0, 1), the same for the same seed */
export function seeded(seed: number) {
	return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/** A number in [0, 1) that looks random, the same for the same n and k */
export function hash(n: number, k: number) {
	const v = Math.sin(n * 127.1 + k * 311.7) * 43758.5453;
	return v - Math.floor(v);
}
