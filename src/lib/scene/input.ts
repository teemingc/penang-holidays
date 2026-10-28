import * as THREE from 'three';
import { BIKES, CARS, DECK_HALF, REACH, deckY } from './layout.js';
import type { Traffic } from './traffic.js';
import type { Loose, Vehicles } from './vehicles.js';

// Anything with a place on screen: a pointer, or a finger on a touch screen
type Spot = { clientX: number; clientY: number; pointerType: string };

// Where it's been over the last moments of the drag, to tell how fast it's being swung
const FLING_WINDOW = 100;
// How fast a carried vehicle has to be swung through the traffic, in pixels a second, to
// knock it off: slower, it's being picked up or put down, and passes the others by
const RAM = 400;

// Within reach of a fingertip, or of a mouse pointer, squared
const reachOf = (spot: Spot) => (spot.pointerType === 'touch' ? 28 : 16) ** 2;

/** Picking up, dragging and throwing vehicles, and swiping through the traffic */
export function createInput(
	host: HTMLElement,
	camera: THREE.Camera,
	traffic: Traffic,
	vehicles: Vehicles
) {
	const pointer = new THREE.Vector2();
	const onScreen = new THREE.Vector3();
	const ray = new THREE.Raycaster();

	function aim(event: Spot) {
		const r = host.getBoundingClientRect();
		pointer.set(
			((event.clientX - r.left) / r.width) * 2 - 1,
			1 - ((event.clientY - r.top) / r.height) * 2
		);
	}

	// Every vehicle still in the traffic and in front of the camera, where it is on a scene of
	// the size r, in CSS pixels
	function each(r: DOMRect, visit: (id: number, x: number, y: number) => void) {
		for (let id = 0; id < CARS + BIKES; id++) {
			if (traffic.taken.has(id)) continue;
			onScreen.fromArray(traffic.spots, id * 3);
			onScreen.y += 1;
			onScreen.project(camera);
			if (onScreen.z > 1) continue;
			visit(id, ((onScreen.x + 1) / 2) * r.width, ((1 - onScreen.y) / 2) * r.height);
		}
	}

	// The vehicle nearest the pointer on screen, within reach of a fingertip
	function nearest(event: Spot) {
		const r = host.getBoundingClientRect();
		const px = event.clientX - r.left;
		const py = event.clientY - r.top;
		let best: number | null = null;
		let reach = reachOf(event);
		each(r, (id, x, y) => {
			const d = (x - px) ** 2 + (y - py) ** 2;
			if (d < reach) {
				reach = d;
				best = id;
			}
		});
		return best;
	}

	// Whether a finger is on the bridge: between the deck's near and far edges on screen,
	// where they pass under it, or within a fingertip of them
	const edge = new THREE.Vector3();
	function onBridge(event: Spot) {
		const r = host.getBoundingClientRect();
		const x = event.clientX - r.left;
		const y = event.clientY - r.top;
		const reach = 28;
		const toScreen = (wx: number, z: number) => {
			edge.set(wx, deckY(wx), z).project(camera);
			return {
				x: ((edge.x + 1) / 2) * r.width,
				y: ((1 - edge.y) / 2) * r.height,
				behind: edge.z > 1
			};
		};
		let before: { near: ReturnType<typeof toScreen>; far: ReturnType<typeof toScreen> } | null =
			null;
		for (let wx = -REACH; wx <= REACH; wx += 25) {
			const near = toScreen(wx, DECK_HALF);
			const far = toScreen(wx, -DECK_HALF);
			if (before && !near.behind && !before.near.behind) {
				const lo = Math.min(before.near.x, near.x);
				const hi = Math.max(before.near.x, near.x);
				if (x >= lo && x <= hi) {
					const t = (x - before.near.x) / (near.x - before.near.x || 1);
					const top = before.far.y + (far.y - before.far.y) * t;
					const bottom = before.near.y + (near.y - before.near.y) * t;
					if (y >= Math.min(top, bottom) - reach && y <= Math.max(top, bottom) + reach) {
						return true;
					}
				}
			}
			before = { near, far };
		}
		return false;
	}

	const grab = new THREE.Plane();
	const skim = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
	const target = new THREE.Vector3();
	let held: Loose | null = null;
	let moved = 0;
	let swing: { at: number; p: THREE.Vector3 }[] = [];

	// Swiping through the traffic: pressed down away from any vehicle, or carrying one, and
	// dragged across, every one the pointer passes over is batted up into the air
	let sweeping = false;
	let sweep: { at: number; x: number; y: number }[] = [];

	// The vehicles within reach of the stretch of screen the pointer just crossed, and how
	// close to its line each one was, from 1 right on it to 0 at the edge of reach
	function crossed(a: Spot, b: Spot) {
		const r = host.getBoundingClientRect();
		const reach = reachOf(b);
		const ax = a.clientX - r.left;
		const ay = a.clientY - r.top;
		const bx = b.clientX - r.left - ax;
		const by = b.clientY - r.top - ay;
		const length = bx * bx + by * by || 1;
		const hits: { id: number; close: number }[] = [];
		each(r, (id, sx, sy) => {
			const x = sx - ax;
			const y = sy - ay;
			const t = THREE.MathUtils.clamp((x * bx + y * by) / length, 0, 1);
			const d = (x - t * bx) ** 2 + (y - t * by) ** 2;
			if (d < reach) hits.push({ id, close: 1 - Math.sqrt(d / reach) });
		});
		return hits;
	}

	function swipe(event: PointerEvent, least = 0) {
		const now = performance.now();
		const last = sweep[sweep.length - 1]!;
		const hits = crossed(
			{ clientX: last.x, clientY: last.y, pointerType: event.pointerType },
			event
		);
		sweep.push({ at: now, x: event.clientX, y: event.clientY });
		while (sweep.length > 2 && now - sweep[1]!.at > FLING_WINDOW) sweep.shift();
		const first = sweep[0]!;
		const span = Math.max(FLING_WINDOW / 2, now - first.at) / 1000;
		// How fast the pointer's going across the screen, in pixels a second: along the way it
		// went, so a car shaken back and forth over the traffic counts as moving
		let path = 0;
		for (let i = 1; i < sweep.length; i++) {
			path += Math.hypot(sweep[i]!.x - sweep[i - 1]!.x, sweep[i]!.y - sweep[i - 1]!.y);
		}
		const speed = path / span;
		if (speed < least) return;
		const force = Math.min(1, speed / 3000);
		for (const { id, close } of hits) {
			const vehicle = vehicles.lift(id);
			// Not the way it's swiped: something huge is tearing along under the deck, and every
			// vehicle over it bursts straight up and is thrown out over the side it was on,
			// tumbling, the faster the swipe the higher. Right over it they go highest, off to
			// the side much less, motorcycles being light the highest of all, and no two alike
			const side = Math.sign(vehicle.mesh.position.z) || 1;
			const light = id >= CARS ? 1.3 : 1;
			const up = (46 + force * 34) * (0.7 + close * 0.5) * (0.75 + Math.random() * 0.75);
			vehicle.velocity.set((Math.random() - 0.5) * 8, up * light, side * (8 + Math.random() * 14));
			vehicles.release(vehicle);
			vehicle.spin.multiplyScalar(2 + force * 2);
		}
	}

	// A finger that lands on the bridge or a vehicle on it holds the page still, to swipe
	// through the traffic or pick something up; anywhere else, it scrolls as usual
	function touchstart(event: TouchEvent) {
		const touch = event.touches[0];
		if (event.touches.length !== 1 || !touch) return;
		const spot = { clientX: touch.clientX, clientY: touch.clientY, pointerType: 'touch' };
		if (onBridge(spot) || nearest(spot) !== null) event.preventDefault();
	}
	// Not passive, to hold the page still; Svelte adds touch listeners as passive
	host.addEventListener('touchstart', touchstart, { passive: false });

	return {
		down(event: PointerEvent) {
			const id = nearest(event);
			if (id === null) {
				if (event.pointerType === 'mouse' && event.button !== 0) return;
				sweeping = true;
				sweep = [{ at: performance.now(), x: event.clientX, y: event.clientY }];
				host.setPointerCapture(event.pointerId);
				return;
			}
			event.preventDefault();
			held = vehicles.lift(id);
			// Carried along and above its own line across the bridge, so it can be dropped back
			// on the deck, or flung between a pylon's posts
			grab.set(new THREE.Vector3(0, 0, 1), -held.mesh.position.z);
			host.setPointerCapture(event.pointerId);
			host.style.cursor = 'grabbing';
			moved = performance.now();
			swing = [{ at: moved, p: held.mesh.position.clone() }];
			// Swung along the deck, it knocks the traffic it meets off the bridge
			sweep = [{ at: moved, x: event.clientX, y: event.clientY }];
		},

		move(event: PointerEvent) {
			if (sweeping) {
				swipe(event);
				return;
			}
			if (!held) {
				host.style.cursor = event.pointerType === 'mouse' && nearest(event) !== null ? 'grab' : '';
				return;
			}
			aim(event);
			ray.setFromCamera(pointer, camera);
			if (!ray.ray.intersectPlane(grab, target)) return;
			// Dragged down below the deck, it's out over the sea, skimming the surface under the
			// pointer
			const floor = Math.abs(target.x) < REACH ? deckY(target.x) + 1 : 1;
			if (target.y < floor) ray.ray.intersectPlane(skim, target);
			const now = performance.now();
			// How fast it's being swung, to throw it on release: the distance covered over the
			// last tenth of a second, so a short twitch doesn't count as a hard fling
			swing.push({ at: now, p: target.clone() });
			while (swing.length > 2 && now - swing[1]!.at > FLING_WINDOW) swing.shift();
			const first = swing[0]!;
			const span = Math.max(FLING_WINDOW / 2, now - first.at) / 1000;
			held.velocity.subVectors(target, first.p).divideScalar(span);
			held.mesh.position.copy(target);
			vehicles.waft(held);
			held.mesh.rotation.z = THREE.MathUtils.clamp(-held.velocity.x * 0.004, -0.5, 0.5);
			moved = now;
			// Swung hard along the deck, among the traffic; lifted clear of it, it passes over
			swipe(event, onBridge(event) ? RAM : Infinity);
		},

		up() {
			sweeping = false;
			if (!held) return;
			// Held still before letting go: it drops rather than flies
			if (performance.now() - moved > 120) held.velocity.set(0, 0, 0);
			vehicles.release(held);
			held = null;
			host.style.cursor = '';
		},

		// From the keyboard: a car from the middle of the view, over the railing towards you
		throwOne() {
			const choices: number[] = [];
			for (let i = 0; i < CARS; i++) {
				if (traffic.taken.has(i)) continue;
				onScreen.fromArray(traffic.spots, i * 3).project(camera);
				if (Math.abs(onScreen.x) < 0.6 && Math.abs(onScreen.y) < 0.8) choices.push(i);
			}
			const id = choices[Math.floor(Math.random() * choices.length)];
			if (id === undefined) return;
			const vehicle = vehicles.lift(id);
			vehicle.velocity.set((Math.random() - 0.5) * 10, 14, 16 + Math.random() * 8);
			vehicles.release(vehicle);
		},

		dispose() {
			host.removeEventListener('touchstart', touchstart);
		}
	};
}
