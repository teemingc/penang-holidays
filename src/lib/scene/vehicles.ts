import * as THREE from 'three';
import type { Palette } from '../sky.js';
import type { Bridge } from './bridge.js';
import type { Effects } from './effects.js';
import { DECK_HALF, LEG_Z, PYLON_HEIGHT, PYLONS, SPIRE, deckY, overDeck } from './layout.js';
import type { Sea } from './sea.js';
import type { Smoke } from './smoke.js';
import type { Traffic } from './traffic.js';

const GRAVITY = 40;
// As hard as a vehicle can be flung, in units a second: a hard flick crosses the page
const FLING = 320;

type State = 'held' | 'falling' | 'floating' | 'sinking' | 'blasting';

export interface Loose {
	id: number;
	mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
	velocity: THREE.Vector3;
	spin: THREE.Vector3;
	state: State;
	until: number;
	bob: number;
	heave: number;
	/** Which pylon's posts it's between on screen, if any, and whether it's scored */
	between: number | null;
	/** Flown off the top of the page: blasting off into the distance, or back down */
	flown: boolean;
	from: THREE.Vector3;
	to: THREE.Vector3;
	since: number;
	scored: boolean;
}

interface Options {
	scene: THREE.Scene;
	camera: THREE.Camera;
	host: HTMLElement;
	bridge: Bridge;
	traffic: Traffic;
	effects: Effects;
	sea: Sea;
	smoke: Smoke | null;
	palette: () => Palette;
	reduced: () => boolean;
	/** How far the scene's canvas reaches up above it, in CSS pixels */
	above: () => number;
}

/**
 * Picking vehicles up and dropping them in the sea. Each one taken out of the traffic is a mesh
 * of its own, cut off at the waterline, so it can bob there or sink out of sight
 */
export function createVehicles({
	scene,
	camera,
	host,
	bridge,
	traffic,
	effects,
	sea,
	smoke,
	palette,
	reduced,
	above
}: Options) {
	const loose: Loose[] = [];
	const waterline = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
	const onScreen = new THREE.Vector3();
	const ray = new THREE.Raycaster();
	const ndc = new THREE.Vector2();
	// The last field goal, in seconds
	let cheering = -Infinity;

	function lift(id: number) {
		const tint = new THREE.Color();
		const { car, geometry, way } = traffic.look(id, tint);
		const lamps = palette().lamps;
		const mesh = new THREE.Mesh(
			geometry,
			bridge.lampLit(
				new THREE.MeshStandardMaterial({
					color: tint,
					roughness: 0.4,
					metalness: 0.1,
					clippingPlanes: waterline
				})
			)
		);
		// Its lights, and a faint glow of its own, so it can be followed after dark
		// Dark paint is lifted towards a moonlit grey, so even a black car shows against the sea
		mesh.material.emissive
			.copy(tint)
			.lerp(new THREE.Color(0x9aa8c4), 0.55)
			.multiplyScalar(0.45 * lamps);
		const length = car ? 2.6 : 1.1;
		for (const [end, tint, size] of [
			[length, 0xfff6e0, 6],
			[-length, 0xff2a1a, 5]
		] as const) {
			const lamp = new THREE.Points(
				new THREE.BufferGeometry().setAttribute(
					'position',
					new THREE.Float32BufferAttribute(car ? [end, 1, -0.75, end, 1, 0.75] : [end, 1.1, 0], 3)
				),
				new THREE.PointsMaterial({
					color: tint,
					size,
					map: bridge.glow,
					transparent: true,
					opacity: lamps,
					depthWrite: false,
					blending: THREE.AdditiveBlending,
					clippingPlanes: waterline
				})
			);
			mesh.add(lamp);
		}
		mesh.position.fromArray(traffic.spots, id * 3);
		mesh.rotation.y = way > 0 ? 0 : Math.PI;
		scene.add(mesh);
		traffic.taken.add(id);
		const vehicle: Loose = {
			id,
			mesh,
			velocity: new THREE.Vector3(),
			spin: new THREE.Vector3(),
			state: 'held',
			// A car bobs a few seconds before it goes down; a motorcycle goes straight down
			until: car ? 3 + Math.random() * 3 : 0.4,
			bob: Math.random() * 6,
			heave: 0,
			between: null,
			scored: false,
			flown: false,
			from: new THREE.Vector3(),
			to: new THREE.Vector3(),
			since: 0
		};
		loose.push(vehicle);
		return vehicle;
	}

	// Back into the traffic, or gone to the bottom: either way, its place in the queue fills
	function remove(vehicle: Loose) {
		scene.remove(vehicle.mesh);
		vehicle.mesh.material.dispose();
		for (const lamp of vehicle.mesh.children as THREE.Points[]) {
			lamp.geometry.dispose();
			(lamp.material as THREE.Material).dispose();
		}
		traffic.taken.delete(vehicle.id);
		loose.splice(loose.indexOf(vehicle), 1);
	}

	function splashDown(vehicle: Loose, seconds: number) {
		const { mesh, velocity } = vehicle;
		sea.splash(mesh.position.x, mesh.position.z, seconds);
		effects.spray(mesh.position, Math.min(1.6, 0.8 + -velocity.y / 40));
		// It plunges, then bobs back up
		vehicle.heave = velocity.y * 0.12;
		mesh.rotation.x = Math.atan2(Math.sin(mesh.rotation.x), Math.cos(mesh.rotation.x));
		mesh.rotation.z = Math.atan2(Math.sin(mesh.rotation.z), Math.cos(mesh.rotation.z));
		velocity.set(velocity.x * 0.1, 0, velocity.z * 0.1);
		vehicle.state = 'floating';
		vehicle.until += seconds;
	}

	function release(vehicle: Loose) {
		vehicle.velocity.clampLength(0, FLING);
		vehicle.spin.set((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6);
		vehicle.state = 'falling';
		// Never back onto the bridge: let go above the deck, it's given just enough sideways
		// speed to clear the edge on its way down, out towards the viewer, or over the far
		// side when it's already headed that way
		const p = vehicle.mesh.position;
		const { velocity } = vehicle;
		if (overDeck(p) && p.y > deckY(p.x)) {
			const drop = p.y - deckY(p.x) + 3;
			const fall = (velocity.y + Math.sqrt(velocity.y ** 2 + 2 * GRAVITY * drop)) / GRAVITY;
			const time = Math.max(fall, 0.25);
			if (velocity.z < 0) {
				velocity.z = Math.min(velocity.z, -Math.min((DECK_HALF + 4 + p.z) / time, 70));
			} else {
				velocity.z = Math.max(velocity.z, Math.min((DECK_HALF + 4 - p.z) / time, 70));
			}
		}
		// With reduced motion it's gone at once, to the bottom
		if (reduced()) remove(vehicle);
	}

	// Where it is on screen, for the header's smoke to know which way it's going
	function waft(vehicle: Loose) {
		if (!smoke) return;
		onScreen.copy(vehicle.mesh.position).project(camera);
		smoke.waft(
			vehicle,
			((onScreen.x + 1) / 2) * host.clientWidth,
			((1 - onScreen.y) / 2) * host.clientHeight
		);
	}

	// Through the uprights: a thrown car passing between a pylon's two legs, above the deck,
	// is a field goal. Fireworks go up from both spires and the cables strobe gold and white.
	// Judged as it looks: thrown, it flies in between the two spires of a pylon on screen,
	// at their depth and above the deck
	const legA = new THREE.Vector3();
	const legB = new THREE.Vector3();
	const depth = (v: THREE.Vector3) => v.clone().applyMatrix4(camera.matrixWorldInverse).z;
	function goal(vehicle: Loose) {
		const p = vehicle.mesh.position;
		let now: number | null = null;
		PYLONS.forEach((px, k) => {
			if (p.y < deckY(px) + 4 || p.y > PYLON_HEIGHT + SPIRE) return;
			legA.set(px, p.y, -LEG_Z);
			legB.set(px, p.y, LEG_Z);
			const [near, far] = [depth(legA), depth(legB)].sort((a, b) => a - b);
			const d = depth(p);
			if (d < near! - 15 || d > far! + 15) return;
			const x = onScreen.copy(p).project(camera).x;
			const [left, right] = [legA.project(camera).x, legB.project(camera).x].sort((a, b) => a - b);
			if (x > left! && x < right!) now = k;
		});
		const entered = now !== null && vehicle.between === null;
		vehicle.between = now;
		if (!entered || vehicle.scored || vehicle.velocity.length() < 15) return;
		vehicle.scored = true;
		cheering = performance.now() / 1000;
		if (reduced()) return;
		// Nobody lets off fireworks in daylight: by day the cables' strobe is the celebration
		if (palette().lamps < 0.5) return;
		effects.celebrate(PYLONS[now!]!);
	}

	// Flung hard enough to sail off the top of the page, once in a while it's blasting off
	// instead: it carries on the way it was thrown, at the speed it was thrown, curving away
	// into the distance and shrinking until it's gone in a twinkle
	const toward = new THREE.Vector3();
	const apex = new THREE.Vector3();
	function blastOff(vehicle: Loose, seconds: number) {
		const { velocity } = vehicle;
		if (vehicle.flown || velocity.y <= 0) return false;
		vehicle.flown = true;
		// Only when the top of its arc would be off the page
		const p = vehicle.mesh.position;
		const rise = velocity.y / GRAVITY;
		apex.copy(p).addScaledVector(velocity, rise);
		apex.y -= (GRAVITY * rise ** 2) / 2;
		onScreen.copy(apex).project(camera);
		if (((1 - onScreen.y) / 2) * host.clientHeight > -above() - 40) return false;
		// Only now and then; mostly it just falls back
		if (Math.random() >= 0.1) return false;
		// Further along the way it's heading across the page, far off, still in sight
		onScreen.copy(p).project(camera);
		toward.copy(p).addScaledVector(velocity, 0.05).project(camera).sub(onScreen);
		toward.z = 0;
		toward.setLength(0.5 + Math.random() * 0.2);
		const top = 1 + (2 * above()) / host.clientHeight - 0.15;
		ndc.set(
			THREE.MathUtils.clamp(onScreen.x + toward.x, -0.85, 0.85),
			THREE.MathUtils.clamp(onScreen.y + toward.y, 0.2, top)
		);
		ray.setFromCamera(ndc, camera);
		ray.ray.at(1300, vehicle.to);
		vehicle.since = seconds;
		vehicle.state = 'blasting';
		return true;
	}

	function update(dt: number, seconds: number) {
		for (const vehicle of [...loose]) {
			const { mesh, velocity, spin } = vehicle;
			const p = mesh.position;
			const settle = 1 - Math.exp(-dt * 2);
			if (vehicle.state === 'falling') {
				const before = p.y;
				velocity.y -= GRAVITY * dt;
				p.addScaledVector(velocity, dt);
				waft(vehicle);
				goal(vehicle);
				if (blastOff(vehicle, seconds)) continue;
				mesh.rotation.x += spin.x * dt;
				mesh.rotation.z += spin.z * dt;
				const deck = deckY(p.x);
				// Just in case it would still come down on the deck, it skips over the edge
				if (overDeck(p) && before >= deck && p.y < deck) p.z = DECK_HALF + 3;
				else if (p.y <= 0) splashDown(vehicle, seconds);
			} else if (vehicle.state === 'blasting') {
				// Turning smoothly from its throw towards the distance, at the speed it was
				// thrown, tumbling, then a twinkle where it vanishes
				const speed = velocity.length();
				toward.subVectors(vehicle.to, p).setLength(speed);
				velocity.lerp(toward, 1 - Math.exp(-dt * 3)).setLength(speed);
				p.addScaledVector(velocity, dt);
				mesh.rotation.x += spin.x * dt;
				mesh.rotation.z += spin.z * dt;
				if (p.distanceTo(vehicle.to) < speed * dt * 2 || seconds - vehicle.since > 6) {
					onScreen.copy(p).project(camera);
					sea.twinkle(
						((onScreen.x + 1) / 2) * host.clientWidth,
						((1 - onScreen.y) / 2) * host.clientHeight,
						seconds
					);
					remove(vehicle);
				}
			} else if (vehicle.state === 'floating') {
				// Bobbing on the swell: sprung towards the surface, overshooting and settling
				const t = seconds;
				const level = -0.7 + Math.sin(t * 1.8 + vehicle.bob) * 0.35;
				vehicle.heave += ((level - p.y) * 14 - vehicle.heave * 2.2) * dt;
				p.y += vehicle.heave * dt;
				p.x += velocity.x * dt;
				p.z += velocity.z * dt;
				velocity.multiplyScalar(Math.exp(-dt * 0.5));
				mesh.rotation.x += (Math.sin(t * 1.3 + vehicle.bob) * 0.14 - mesh.rotation.x) * settle;
				mesh.rotation.z += (Math.cos(t * 1.1 + vehicle.bob) * 0.1 - mesh.rotation.z) * settle;
				if (seconds > vehicle.until) vehicle.state = 'sinking';
			} else if (vehicle.state === 'sinking') {
				// Engine first, slowly at first, then faster as the water pours in
				p.y -= dt * (0.5 - p.y * 0.35);
				mesh.rotation.z += dt * 0.25;
				if (p.y < -8) remove(vehicle);
			}
		}
	}

	return {
		lift,
		release,
		waft,
		update,
		/** Seconds since the last field goal */
		sinceGoal: () => performance.now() / 1000 - cheering
	};
}

export type Vehicles = ReturnType<typeof createVehicles>;
