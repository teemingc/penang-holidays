import * as THREE from 'three';
import { LEG_Z, PYLON_HEIGHT, PYLONS, SPIRE, deckY, overDeck } from './layout.js';

const RAMP = ' .,-~~=';
const CELL_W = 9;
const CELL_H = 15;
const LEVELS = 4;
const RIPPLE_LIFE = 2.8;

const waves = (x: number, z: number, t: number) =>
	Math.sin(x * 0.045 + t * 1.1 + Math.sin(z * 0.03) * 2) * 0.5 +
	Math.sin(z * 0.08 - t * 0.8 + x * 0.012) * 0.35 +
	Math.sin((x + z) * 0.11 + t * 1.7) * 0.15;

/**
 * The sea, set in type: a grid of characters, each picked by the height of the waves at the
 * spot in the strait it covers, so it lies in the same perspective as the bridge and fades into
 * the page's sky towards the horizon. By night the lamps are mirrored in it as warm streaks
 */
export function createSea(ocean: HTMLCanvasElement, camera: THREE.Camera, lampHeads: number[]) {
	const sea = ocean.getContext('2d')!;
	const ray = new THREE.Raycaster();
	const surface = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
	const hit = new THREE.Vector3();
	const ndc = new THREE.Vector2();
	const projected = new THREE.Vector3();
	let width = 0;
	let height = 0;
	let ink = '#fff';
	// The bridge's shadow on the sea, cast from the sun, and whether the sea's ink is dark
	// (so shade is denser type) or light (so shade is sparser)
	const sunward = new THREE.Vector3(0, 1, 0);
	let shade = 0;
	let darkInk = false;
	function shadowed(x: number, z: number) {
		if (!shade) return false;
		// Up towards the sun from this bit of sea, to the height of the deck there
		let t = deckY(x) / sunward.y;
		for (let i = 0; i < 2; i++) t = deckY(x + sunward.x * t) / sunward.y;
		if (overDeck({ x: x + sunward.x * t, z: z + sunward.z * t })) return true;
		// And the pylons' legs, which throw long shadows when the sun is low
		for (const px of PYLONS) {
			for (const lz of [-LEG_Z, LEG_Z]) {
				const h = Math.hypot(sunward.x, sunward.z) || 1;
				const along = ((px - x) * sunward.x + (lz - z) * sunward.z) / (h * h);
				if (along < 0 || along * sunward.y > PYLON_HEIGHT + SPIRE) continue;
				const off = Math.hypot(x + sunward.x * along - px, z + sunward.z * along - lz);
				if (off < 2.2) return true;
			}
		}
		return false;
	}
	const splashes: { x: number; z: number; at: number }[] = [];
	// The twinkle a car leaves as it vanishes into the far sky
	const twinkles: { x: number; y: number; at: number }[] = [];
	// Plain, not reactive: only the render loop reads it
	const glints = new Set<number>();

	// Which cells the lamps' reflections fall in: a short streak below each lamp's mirror
	// image, on the near side of the deck
	function reflect() {
		glints.clear();
		const cols = Math.ceil(width / CELL_W);
		for (let i = 0; i < lampHeads.length; i += 3) {
			const [x, y, z] = [lampHeads[i]!, lampHeads[i + 1]!, lampHeads[i + 2]!];
			if (z < 0) continue;
			projected.set(x, -y, z).project(camera);
			if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) continue;
			const col = Math.floor((((projected.x + 1) / 2) * width) / CELL_W);
			const end = Math.floor((((1 - projected.y) / 2) * height) / CELL_H);
			projected.set(x, 0, z).project(camera);
			const start = Math.floor((((1 - projected.y) / 2) * height) / CELL_H);
			for (let row = start; row <= end + 1; row++) glints.add(row * cols + col);
		}
	}

	// Where each character cell of the sea meets the water, how faint it is there and whether
	// it's in the bridge's shadow. The camera never moves, so this is worked out once for
	// the size of the scene, and the shadows again when the sun moves
	const cells = {
		cols: 0,
		rows: 0,
		x: new Float32Array(0),
		z: new Float32Array(0),
		level: new Int8Array(0),
		shade: new Uint8Array(0)
	};
	function measure() {
		cells.cols = Math.ceil(width / CELL_W);
		cells.rows = Math.ceil(height / CELL_H);
		const count = cells.cols * cells.rows;
		cells.x = new Float32Array(count);
		cells.z = new Float32Array(count);
		cells.level = new Int8Array(count).fill(-1);
		cells.shade = new Uint8Array(count);
		for (let row = 0; row < cells.rows; row++) {
			ndc.y = 1 - (((row + 0.5) * CELL_H) / height) * 2;
			for (let col = 0; col < cells.cols; col++) {
				ndc.x = ((col + 0.5) * CELL_W * 2) / width - 1;
				ray.setFromCamera(ndc, camera);
				if (!ray.ray.intersectPlane(surface, hit)) continue;
				const c = row * cells.cols + col;
				cells.x[c] = hit.x;
				cells.z[c] = hit.z;
				// Fainter with distance, and gone well before the horizon, so the far sea
				// doesn't crowd the pylons
				const fade = Math.max(0, 1 - hit.distanceTo(camera.position) / 2600);
				cells.level[c] = Math.ceil(fade ** 3 * LEVELS);
			}
		}
		shadeCells();
	}
	function shadeCells() {
		for (let c = 0; c < cells.level.length; c++) {
			cells.shade[c] = cells.level[c]! > 0 && shadowed(cells.x[c]!, cells.z[c]!) ? 1 : 0;
		}
	}

	return {
		/** Sized to the scene, w by h CSS pixels, once the camera has been */
		resize(w: number, h: number, ratio: number) {
			width = w;
			height = h;
			ocean.width = w * ratio;
			ocean.height = h * ratio;
			ocean.style.width = `${w}px`;
			ocean.style.height = `${h}px`;
			sea.setTransform(ratio, 0, 0, ratio, 0, 0);
			// Plex Mono is 0.6em wide, so each character fills one cell
			sea.font = `${CELL_W / 0.6}px 'IBM Plex Mono', ui-monospace, monospace`;
			sea.textBaseline = 'middle';
			measure();
			reflect();
		},

		/**
		 * In the colour of the type, shaded from the sun shining from `towards`, as strongly as
		 * `strength`, 0 for none
		 */
		light(towards: THREE.Vector3, strength: number, colour: string) {
			ink = colour || ink;
			darkInk = new THREE.Color(ink).getHSL({ h: 0, s: 0, l: 0 }).l < 0.5;
			sunward.copy(towards);
			shade = strength;
			shadeCells();
		},

		/** Rings spreading out from (x, z) on the water */
		splash(x: number, z: number, at: number) {
			splashes.push({ x, z, at });
		},

		/** A glint at (x, y) on screen, where something vanished into the sky */
		twinkle(x: number, y: number, at: number) {
			twinkles.push({ x, y, at });
		},

		/** The sea at t, its lamps' reflections as bright as `lamps` */
		draw(t: number, lamps: number) {
			const seconds = performance.now() / 1000;
			while (splashes[0] && seconds - splashes[0].at > RIPPLE_LIFE + 1) splashes.shift();
			sea.clearRect(0, 0, width, height);
			const { cols, rows } = cells;
			const lit = lamps > 0.3;
			for (let row = 0; row < rows; row++) {
				const y = (row + 0.5) * CELL_H;
				const lines = Array.from({ length: LEVELS + 1 }, () => new Array<string>(cols).fill(' '));
				for (let col = 0; col < cols; col++) {
					const c = row * cols + col;
					const level = cells.level[c]!;
					if (level < 0) continue;
					const v = (waves(cells.x[c]!, cells.z[c]!, t) + 1) / 2;
					const char = RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))]!;
					if (lit && glints.has(row * cols + col)) {
						lines[LEVELS]![col] = char === ' ' ? '-' : char;
						continue;
					}
					if (!level) continue;
					if (cells.shade[c]) {
						// In the bridge's shadow the sea reads darker: solid type on a light sea,
						// none at all on a dark one
						if (darkInk) lines[LEVELS - 1]![col] = '=';
						continue;
					}
					lines[level - 1]![col] = char;
				}
				lines.forEach((line, level) => {
					sea.globalAlpha = level === LEVELS ? lamps : ((level + 1) / LEVELS) * 0.85;
					sea.fillStyle = level === LEVELS ? '#ffd08a' : ink;
					sea.fillText(line.join(''), 0, y);
				});
			}

			// A small four-pointed star that glints and is gone: a far-off thing, never brighter
			// than the stars around it would allow
			for (const twinkle of [...twinkles]) {
				const age = seconds - twinkle.at;
				if (age > 0.8) {
					twinkles.splice(twinkles.indexOf(twinkle), 1);
					continue;
				}
				const glint = Math.sin((age / 0.8) * Math.PI);
				const size = 10 * glint;
				sea.save();
				sea.translate(twinkle.x, twinkle.y);
				sea.rotate(age * 2);
				sea.globalAlpha = 0.8 * glint;
				sea.shadowColor = '#fff6c8';
				sea.shadowBlur = size * 0.6;
				sea.fillStyle = '#ffffff';
				sea.beginPath();
				for (let i = 0; i < 8; i++) {
					const r = i % 2 ? size * 0.16 : i % 4 ? size * 0.7 : size;
					const a = (i / 8) * Math.PI * 2;
					sea.lineTo(Math.cos(a) * r, Math.sin(a) * r);
				}
				sea.fill();
				sea.restore();
			}

			// Rings spreading out across the water from anything that's gone in, a few to each
			sea.strokeStyle = ink;
			for (const splash of splashes) {
				for (let k = 0; k < 3; k++) {
					const age = seconds - splash.at - k * 0.35;
					if (age <= 0 || age > RIPPLE_LIFE) continue;
					const left = 1 - age / RIPPLE_LIFE;
					const r = 2.5 + age * 9;
					sea.globalAlpha = left * left * 0.75;
					sea.lineWidth = 0.6 + left;
					sea.beginPath();
					for (let a = 0; a <= 48; a++) {
						const angle = (a / 48) * Math.PI * 2;
						projected
							.set(splash.x + Math.cos(angle) * r, 0, splash.z + Math.sin(angle) * r)
							.project(camera);
						const px = ((projected.x + 1) / 2) * width;
						const py = ((1 - projected.y) / 2) * height;
						if (a) sea.lineTo(px, py);
						else sea.moveTo(px, py);
					}
					sea.stroke();
				}
			}
		}
	};
}

export type Sea = ReturnType<typeof createSea>;
