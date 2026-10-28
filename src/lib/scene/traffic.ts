import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Bridge } from './bridge.js';
import { createJam } from './jam.js';
import {
	BIKES,
	CARS,
	LANES,
	PER_LANE,
	SPAN,
	TRAFFIC_REACH,
	UNSEEN,
	deckSlope,
	deckY,
	wrap
} from './layout.js';

// Car paint, as on Malaysian roads: mostly white, silver, grey and black, with Myvi reds
// and blues, maroon and the odd bronze
const PAINT = [
	'#f4f4f2',
	'#c3c7cc',
	'#1c1d20',
	'#f4f4f2',
	'#b3121b',
	'#6b6e73',
	'#f4f4f2',
	'#1f5fbf',
	'#c3c7cc',
	'#7a1426',
	'#1c1d20',
	'#a88a5e',
	'#f4f4f2',
	'#1c2a4a',
	'#c3c7cc'
];

/**
 * The cars in the jam and the motorcycles weaving through it. Vehicles are numbered: the cars
 * first, then the motorcycles
 */
export function createTraffic(scene: THREE.Scene, bridge: Bridge) {
	// The ones that have been picked up, and are out of the traffic
	const taken = new Set<number>();
	// Where each car and motorcycle is, for picking them up
	const spots = new Float32Array((CARS + BIKES) * 3);
	const dummy = new THREE.Object3D();
	const jam = createJam(taken);

	// The jam: every car an instance of one simple model, a body and a cabin
	const carGeometry = mergeGeometries([
		new THREE.BoxGeometry(5, 1.3, 2.1).translate(0, 0.85, 0),
		new THREE.BoxGeometry(2.6, 1, 1.9).translate(-0.3, 1.95, 0)
	]);
	const cars = new THREE.InstancedMesh(
		carGeometry,
		bridge.lampLit(new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 })),
		CARS
	);
	for (let i = 0; i < CARS; i++) {
		cars.setColorAt(i, new THREE.Color(PAINT[(i * 7919) % PAINT.length]));
	}
	scene.add(cars);
	// Each car's pair of lights on the end facing the viewer, just off the bumper: headlights
	// coming, tail lights going. They come on as it gets dark
	const headlights = bridge.lights(new Array(PER_LANE * 3 * 2 * 3).fill(0), 0xfff6e0, 8);
	const taillights = bridge.lights(new Array(PER_LANE * 3 * 2 * 3).fill(0), 0xff2a1a, 7);

	function drive(t: number) {
		jam.update(t);
		const heads = headlights.geometry.attributes.position as THREE.BufferAttribute;
		const tails = taillights.geometry.attributes.position as THREE.BufferAttribute;
		let h = 0;
		let k = 0;
		LANES.forEach((lane, l) => {
			for (let i = 0; i < PER_LANE; i++) {
				const n = l * PER_LANE + i;
				const along = wrap(jam.travelled[n]!, SPAN);
				const x = lane.way > 0 ? along - TRAFFIC_REACH : TRAFFIC_REACH - along;
				const z = jam.across[n]!;
				// Nosing the way it's swerving
				const yaw = -Math.atan2(jam.drift[n]!, lane.way * Math.max(jam.pace[n]!, 4));
				const y = deckY(x) + 0.1;
				const slope = deckSlope(x);
				const gone = taken.has(n);
				spots.set([x, y, z], n * 3);
				dummy.position.set(x, y, z);
				dummy.rotation.set(0, yaw, lane.way > 0 ? slope : -slope);
				dummy.scale.setScalar(gone ? 0 : 1);
				dummy.updateMatrix();
				cars.setMatrixAt(n, dummy.matrix);
				// The west end of each car faces the viewer
				for (const side of [-0.75, 0.75]) {
					const ly = gone ? UNSEEN : y;
					if (lane.way < 0) heads.setXYZ(h++, x - 2.7, ly + 0.9, z + side);
					else tails.setXYZ(k++, x - 2.7, ly + 1.1, z + side);
				}
			}
		});
		cars.instanceMatrix.needsUpdate = true;
		heads.needsUpdate = tails.needsUpdate = true;
	}

	// Motorcycles filtering past the jam in the gaps between the lanes and darting across from
	// one gap to the other
	const bikeGeometry = mergeGeometries([
		new THREE.BoxGeometry(2, 0.9, 0.5).translate(0, 0.75, 0),
		new THREE.BoxGeometry(0.6, 0.9, 0.55).translate(-0.2, 1.6, 0),
		new THREE.BoxGeometry(0.4, 0.4, 0.4).translate(-0.1, 2.25, 0)
	]);
	const bikes = new THREE.InstancedMesh(
		bikeGeometry,
		bridge.lampLit(new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 })),
		BIKES
	);
	for (let i = 0; i < BIKES; i++) {
		bikes.setColorAt(i, new THREE.Color(PAINT[(i * 104729) % PAINT.length]));
	}
	scene.add(bikes);
	const bikeLights = bridge.lights(new Array(BIKES * 3).fill(0), 0xfff6e0, 3);
	const bikeTails = bridge.lights(new Array(BIKES * 3).fill(0), 0xff2a1a, 2.4);
	const riders = Array.from({ length: BIKES }, (_, i) => ({
		way: i % 2 ? 1 : -1,
		along: (i * 2963) % SPAN,
		speed: 6 + ((i * 37) % 7),
		phase: i * 1.7,
		away: false
	}));

	function ride(distance: number, t: number) {
		const heads = bikeLights.geometry.attributes.position as THREE.BufferAttribute;
		const tails = bikeTails.geometry.attributes.position as THREE.BufferAttribute;
		riders.forEach((rider, i) => {
			rider.along += distance * (rider.speed / 9);
			const x = wrap(rider.along * rider.way, SPAN) - TRAFFIC_REACH;
			// Mostly in one gap or the other, crossing over quickly
			const z = -rider.way * (5.6 + 1.7 * Math.tanh(3 * Math.sin(t * 0.35 + rider.phase)));
			const y = deckY(x) + 0.1;
			const slope = deckSlope(x);
			const gone = taken.has(CARS + i);
			// Gone off the bridge, the next one along comes in from the end
			if (gone) rider.away = true;
			else if (rider.away) {
				rider.away = false;
				rider.along = Math.ceil(rider.along / SPAN) * SPAN + 0.01;
			}
			spots.set([x, y, z], (CARS + i) * 3);
			dummy.position.set(x, y, z);
			dummy.rotation.set(0, rider.way > 0 ? 0 : Math.PI, rider.way > 0 ? slope : -slope);
			dummy.scale.setScalar(gone ? 0 : 1);
			dummy.updateMatrix();
			bikes.setMatrixAt(i, dummy.matrix);
			const facing = rider.way < 0 ? heads : tails;
			const hidden = rider.way < 0 ? tails : heads;
			facing.setXYZ(i, x - 1.1, gone ? UNSEEN : y + 1.1, z);
			hidden.setXYZ(i, 0, UNSEEN, 0);
		});
		bikes.instanceMatrix.needsUpdate = true;
		heads.needsUpdate = tails.needsUpdate = true;
	}

	return {
		taken,
		/** Where each vehicle is, as x, y, z one after another, by its number */
		spots,

		/** The jam at t, and the motorcycles ridden on a distance, which never stop */
		update(t: number, distance: number) {
			drive(t);
			ride(distance, t);
		},

		/** The lights come on as the sky darkens */
		light(level: number) {
			headlights.material.opacity = level;
			taillights.material.opacity = level;
			bikeLights.material.opacity = bikeTails.material.opacity = level;
		},

		/** A vehicle's model and paint, and which way it's going, to take it out of the traffic */
		look(id: number, tint: THREE.Color) {
			const car = id < CARS;
			const j = car ? id : id - CARS;
			(car ? cars : bikes).getColorAt(j, tint);
			return {
				car,
				geometry: car ? carGeometry : bikeGeometry,
				way: car ? LANES[Math.floor(j / PER_LANE)]!.way : riders[j]!.way
			};
		}
	};
}

export type Traffic = ReturnType<typeof createTraffic>;
