<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
	import { moonAt, now, paletteAt, sunAt } from './sky.js';

	interface Props {
		reducedMotion: boolean;
		/** Called once the scene has drawn its first frame */
		onready?: () => void;
	}

	let { reducedMotion, onready }: Props = $props();

	// The canvases are hidden until the first frame is on them: some browsers paint a canvas
	// white for a moment before anything is drawn to it
	let shown = $state(false);

	// The Penang Bridge across the strait, in metres, at the time of day it is in Penang. x runs
	// east along the bridge, y is up from the sea, and z is south, towards the viewer

	// The deck rises from the approaches to the main span, where ships pass under it
	const deckY = (x: number) => 9 + 24 * Math.exp(-((x / 650) ** 2));
	const DECK_HALF = 12;
	const DECK_DEPTH = 3;
	const GRAVITY = 40;
	// As hard as a vehicle can be flung, in units a second: a hard flick crosses the page
	const FLING = 320;
	const REACH = 2400;
	const PIER_GAP = 45;
	// Lamp posts along both edges of the deck
	const LAMP_GAP = 36;
	const LAMP_FIRST = -REACH + 18;
	// The two pylons, each a pair of tapering legs either side of the deck, topped with a spire
	const PYLONS = [-112, 112];
	const LEG_Z = 14;
	const PYLON_HEIGHT = 100;
	const SPIRE = 16;
	// Three lanes each way. In Malaysia traffic keeps left, so eastbound runs on the north side
	const LANES = [
		{ z: -2.2, way: 1 },
		{ z: -5.6, way: 1 },
		{ z: -9, way: 1 },
		{ z: 2.2, way: -1 },
		{ z: 5.6, way: -1 },
		{ z: 9, way: -1 }
	];
	// Bumper to bumper, as it always is
	const CAR_GAP = 7;
	const TRAFFIC_REACH = 1500;
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

	let host: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let ocean: HTMLCanvasElement;
	// Throws a car off the bridge, for the keyboard; set up with the scene
	let throwOne = () => {};

	function keydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		throwOne();
	}

	const color = (rgb: number[]) =>
		new THREE.Color().setRGB(rgb[0]! / 255, rgb[1]! / 255, rgb[2]! / 255, THREE.SRGBColorSpace);

	// A soft round dot, for lights seen from afar
	// Weathered concrete: a fine grain, blotches and stains, and streaks where the rain runs down
	function concreteTexture() {
		const size = 256;
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = size;
		const ctx = canvas.getContext('2d')!;
		let seed = 11;
		const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
		ctx.fillStyle = '#e8e8e8';
		ctx.fillRect(0, 0, size, size);
		for (let i = 0; i < 60; i++) {
			const x = random() * size;
			const y = random() * size;
			const r = 10 + random() * 50;
			const g = ctx.createRadialGradient(x, y, 0, x, y, r);
			const shade = random() < 0.5 ? '0 0 0' : '255 255 255';
			g.addColorStop(0, `rgb(${shade} / ${0.04 + random() * 0.06})`);
			g.addColorStop(1, `rgb(${shade} / 0)`);
			ctx.fillStyle = g;
			ctx.fillRect(x - r, y - r, r * 2, r * 2);
		}
		for (let i = 0; i < 50; i++) {
			ctx.fillStyle = `rgb(40 40 40 / ${0.03 + random() * 0.05})`;
			ctx.fillRect(random() * size, random() * size, 1 + random() * 3, 20 + random() * 120);
		}
		for (let i = 0; i < 9000; i++) {
			ctx.fillStyle = random() < 0.5 ? 'rgb(0 0 0 / 0.12)' : 'rgb(255 255 255 / 0.12)';
			ctx.fillRect(random() * size, random() * size, 1, 1);
		}
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
		return texture;
	}

	function glowTexture() {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 64;
		const ctx = canvas.getContext('2d')!;
		const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
		g.addColorStop(0, 'rgba(255,255,255,1)');
		g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
		g.addColorStop(1, 'rgba(255,255,255,0)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 64, 64);
		return new THREE.CanvasTexture(canvas);
	}

	onMount(() => {
		const still = reducedMotion;
		const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
		renderer.toneMapping = THREE.ACESFilmicToneMapping;

		const scene = new THREE.Scene();
		scene.fog = new THREE.Fog(0x000000, 900, 7000);
		const camera = new THREE.PerspectiveCamera(30, 1, 1, 20000);
		// Up high off the south shore, looking down on the main span
		camera.position.set(-250, 110, 330);
		camera.lookAt(40, 32, 0);

		const sunLight = new THREE.DirectionalLight(0xffffff, 1);
		scene.add(sunLight, sunLight.target);
		const skyLight = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
		scene.add(skyLight);

		const glow = glowTexture();
		// By night the lamp posts cast pools of light on the road: brightest under each lamp and
		// by the edges of the deck where they stand, lighting whatever's there in its own colour.
		// Worked out in the shader from where each surface is, rather than with hundreds of lights
		const lampGlow = { value: new THREE.Color(0, 0, 0) };
		function lampLit<M extends THREE.MeshStandardMaterial>(material: M) {
			material.onBeforeCompile = (shader) => {
				shader.uniforms.lampGlow = lampGlow;
				shader.vertexShader = shader.vertexShader
					.replace(
						'#include <common>',
						'#include <common>\nvarying vec3 vLampAt;\nvarying float vLampUp;'
					)
					.replace(
						'#include <project_vertex>',
						`#include <project_vertex>
						mat4 lampModel = modelMatrix;
						#ifdef USE_INSTANCING
							lampModel = modelMatrix * instanceMatrix;
						#endif
						vLampAt = (lampModel * vec4(transformed, 1.0)).xyz;
						vLampUp = normalize(mat3(lampModel) * objectNormal).y;`
					);
				shader.fragmentShader = shader.fragmentShader
					.replace(
						'#include <common>',
						'#include <common>\nuniform vec3 lampGlow;\nvarying vec3 vLampAt;\nvarying float vLampUp;'
					)
					.replace(
						'#include <emissivemap_fragment>',
						`#include <emissivemap_fragment>
						// Lamps every ${LAMP_GAP} m, at x = ${LAMP_FIRST} and on
						float lampD = mod(vLampAt.x - ${LAMP_FIRST}.0 + ${LAMP_GAP / 2}.0, ${LAMP_GAP}.0) - ${LAMP_GAP / 2}.0;
						float pool = exp(-lampD * lampD / 90.0) * (0.55 + 0.45 * smoothstep(2.0, ${DECK_HALF}.0, abs(vLampAt.z)));
						pool *= smoothstep(-2.0, 2.0, vLampAt.y - 2.0);
						totalEmissiveRadiance += diffuseColor.rgb * lampGlow * pool * (0.3 + 0.7 * max(vLampUp, 0.0));`
					);
			};
			return material;
		}

		// Matte, weathered concrete
		const weathered = concreteTexture();
		const concrete = new THREE.MeshStandardMaterial({
			color: 0xcfcbc2,
			map: weathered,
			roughness: 1
		});
		const pylonStone = new THREE.MeshStandardMaterial({
			color: 0xd8cfb8,
			map: weathered,
			roughness: 1
		});
		const asphalt = lampLit(new THREE.MeshStandardMaterial({ color: 0x3b3e45, roughness: 0.95 }));

		// The deck, in short straight lengths following its rise and fall
		const deck: THREE.BufferGeometry[] = [];
		const road: THREE.BufferGeometry[] = [];
		const step = 20;
		for (let x = -REACH; x < REACH; x += step) {
			const y0 = deckY(x);
			const y1 = deckY(x + step);
			const slope = Math.atan2(y1 - y0, step);
			const length = Math.hypot(step, y1 - y0) + 0.3;
			const place = (g: THREE.BufferGeometry, lift: number) =>
				g.rotateZ(slope).translate(x + step / 2, (y0 + y1) / 2 + lift, 0);
			deck.push(place(new THREE.BoxGeometry(length, DECK_DEPTH, DECK_HALF * 2), -DECK_DEPTH / 2));
			for (const z of [-DECK_HALF + 0.3, DECK_HALF - 0.3]) {
				deck.push(place(new THREE.BoxGeometry(length, 1.1, 0.5), 0.55).translate(0, 0, z));
			}
			road.push(place(new THREE.BoxGeometry(length, 0.1, DECK_HALF * 2 - 1.2), 0.05));
		}
		scene.add(new THREE.Mesh(mergeGeometries(deck), concrete));
		scene.add(new THREE.Mesh(mergeGeometries(road), asphalt));

		// Piers carrying the approaches: two columns and a cap, every so often
		const piers: THREE.BufferGeometry[] = [];
		for (let x = -REACH + PIER_GAP / 2; x < REACH; x += PIER_GAP) {
			if (Math.abs(x) < 150) continue;
			const under = deckY(x) - DECK_DEPTH;
			for (const z of [-7, 7]) {
				piers.push(new THREE.CylinderGeometry(1.4, 1.7, under, 10).translate(x, under / 2 - 1, z));
			}
			piers.push(new THREE.BoxGeometry(3, 2, DECK_HALF * 2 - 2).translate(x, under - 1, 0));
		}
		scene.add(new THREE.Mesh(mergeGeometries(piers), concrete));

		// The pylons, and the fans of stay cables from each leg down to the deck
		const pylons: THREE.BufferGeometry[] = [];
		const cablePoints: number[] = [];
		const cableAlong: number[] = [];
		const spires: number[] = [];
		for (const px of PYLONS) {
			for (const lz of [-LEG_Z, LEG_Z]) {
				pylons.push(
					new THREE.CylinderGeometry(1.4, 3, PYLON_HEIGHT, 4)
						.rotateY(Math.PI / 4)
						.translate(px, PYLON_HEIGHT / 2 - 2, lz)
				);
				pylons.push(
					new THREE.ConeGeometry(1.4, SPIRE, 4)
						.rotateY(Math.PI / 4)
						.translate(px, PYLON_HEIGHT - 2 + SPIRE / 2, lz)
				);
				spires.push(px, PYLON_HEIGHT - 2 + SPIRE + 0.6, lz);
				for (const side of [-1, 1]) {
					for (let k = 0; k < 8; k++) {
						const ax = px + side * (16 + k * 12.5);
						cablePoints.push(px, 58 + k * 4.6, lz * 0.98, ax, deckY(ax) + 0.8, lz * 0.82);
						cableAlong.push(px, ax);
					}
				}
			}
			pylons.push(
				new THREE.BoxGeometry(5, 4, LEG_Z * 2 + 4).translate(px, deckY(px) - DECK_DEPTH - 3, 0)
			);
		}
		scene.add(new THREE.Mesh(mergeGeometries(pylons), pylonStone));

		const cableGeometry = new THREE.BufferGeometry();
		cableGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cablePoints, 3));
		const cableColors = new Float32Array(cablePoints.length);
		cableGeometry.setAttribute('color', new THREE.BufferAttribute(cableColors, 3));
		const cables = new THREE.LineSegments(
			cableGeometry,
			new THREE.LineBasicMaterial({ vertexColors: true, transparent: true })
		);
		scene.add(cables);

		// Lights seen from afar: soft dots that grow with nearness
		const lights = (positions: number[], tint: number, size: number) => {
			const geometry = new THREE.BufferGeometry();
			geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
			const points = new THREE.Points(
				geometry,
				new THREE.PointsMaterial({
					color: tint,
					size,
					map: glow,
					transparent: true,
					depthWrite: false,
					blending: THREE.AdditiveBlending
				})
			);
			scene.add(points);
			return points;
		};

		// Lamp posts along both edges
		const lampPosts: THREE.BufferGeometry[] = [];
		const lampHeads: number[] = [];
		for (let x = LAMP_FIRST; x < REACH; x += LAMP_GAP) {
			for (const z of [-DECK_HALF + 0.6, DECK_HALF - 0.6]) {
				const y = deckY(x);
				lampPosts.push(new THREE.CylinderGeometry(0.15, 0.2, 10, 5).translate(x, y + 5, z));
				lampHeads.push(x, y + 10.2, z);
			}
		}
		scene.add(new THREE.Mesh(mergeGeometries(lampPosts), concrete));
		const lamps = lights(lampHeads, 0xffd08a, 9);
		const beacons = lights(spires, 0xff2a2a, 10);

		// The jam: every car an instance of one simple model, a body and a cabin
		const carGeometry = mergeGeometries([
			new THREE.BoxGeometry(5, 1.3, 2.1).translate(0, 0.85, 0),
			new THREE.BoxGeometry(2.6, 1, 1.9).translate(-0.3, 1.95, 0)
		]);
		const perLane = Math.floor((TRAFFIC_REACH * 2) / CAR_GAP);
		const carCount = perLane * LANES.length;
		const cars = new THREE.InstancedMesh(
			carGeometry,
			lampLit(new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 })),
			carCount
		);
		for (let i = 0; i < carCount; i++) {
			cars.setColorAt(i, new THREE.Color(PAINT[(i * 7919) % PAINT.length]));
		}
		scene.add(cars);
		// Each car's pair of lights on the end facing the viewer, just off the bumper: headlights
		// coming, tail lights going. They come on as it gets dark
		const headlights = lights(new Array(perLane * 3 * 2 * 3).fill(0), 0xfff6e0, 8);
		const taillights = lights(new Array(perLane * 3 * 2 * 3).fill(0), 0xff2a1a, 7);
		// A little irregularity, so the queue doesn't look drawn with a ruler
		const jitter = Array.from({ length: carCount }, (_, i) => Math.sin(i * 12.9898) * 1.2);

		const dummy = new THREE.Object3D();
		// Where each car and motorcycle is, for picking them up; and the ones that have been
		const carSpot = new Float32Array(carCount * 3);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read only by the render loop
		const taken = new Set<number>();

		// Stop, lurch on a few metres, stop: each lane in its own rhythm, the lurch reaching the
		// cars further back a moment later
		function lurch(t: number) {
			const cycle = t / 5;
			const f = cycle - Math.floor(cycle);
			const go = f < 0.3 ? (1 - Math.cos((f / 0.3) * Math.PI)) / 2 : 1;
			return (Math.floor(cycle) + go) * 4;
		}

		// Each lane is a queue, front to back. A car's place in it, its slot, says where the jam
		// would have it; one taken out of the queue leaves a gap, and every car behind moves up a
		// slot and drives on to close it. Cars leave at the far end and join again at the back of
		// the shortest lane their way, coming in from the near end, as do the ones that were
		// thrown off once they're gone
		const SPAN = TRAFFIC_REACH * 2;
		// Into a gap, every driver drives as they do in Penang: most keep up with the car ahead;
		// some speed off, weaving through to either side of whoever's in the way; some sit right
		// on the bumper of the car in front; and some hog the fast lane at their own pace
		type Driver = {
			/** Top speed, units a second; how hard they speed up and brake */
			top: number;
			accel: number;
			brake: number;
			/** The gap kept to the car ahead: standing, and seconds of it at speed */
			standing: number;
			headway: number;
			/** Room wanted to cut into another lane, ahead and behind */
			cut: [number, number];
			/** Makes for the fast lane, by the median, and stays there at their own pace */
			hog: boolean;
			/** How quickly they swing across into the next lane */
			swerve: number;
		};
		const hash = (n: number, k: number) => {
			const v = Math.sin(n * 127.1 + k * 311.7) * 43758.5453;
			return v - Math.floor(v);
		};
		const drivers: Driver[] = Array.from({ length: carCount }, (_, n) => {
			const kind = hash(n, 0);
			const r = hash(n, 1);
			// Speeders
			if (kind < 0.25)
				return {
					top: 30 + r * 10,
					accel: 9,
					brake: 14,
					standing: 6,
					headway: 0.3,
					cut: [8, 5],
					hog: false,
					swerve: 3.5
				};
			// Tailgaters
			if (kind < 0.45)
				return {
					top: 21 + r * 5,
					accel: 7,
					brake: 13,
					standing: 5.4,
					headway: 0.1,
					cut: [10, 6],
					hog: false,
					swerve: 2.5
				};
			// Lane hoggers
			if (kind < 0.53)
				return {
					top: 11 + r * 3,
					accel: 3,
					brake: 6,
					standing: 6.4,
					headway: 0.8,
					cut: [12, 8],
					hog: true,
					swerve: 1
				};
			return {
				top: 15 + r * 5,
				accel: 5,
				brake: 8,
				standing: 6.2,
				headway: 0.5,
				cut: [14, 9],
				hog: false,
				swerve: 1.6
			};
		});
		const travelled = new Float64Array(carCount);
		const pace = new Float32Array(carCount);
		const slot = new Float64Array(carCount);
		// Which lane each car is in, where it is across the deck on its way there, and when it
		// last changed lanes
		const laneOf = Uint8Array.from({ length: carCount }, (_, n) => Math.floor(n / perLane));
		const across = Float32Array.from(laneOf, (l) => LANES[l]!.z);
		const drift = new Float32Array(carCount);
		const changed = new Float64Array(carCount).fill(-Infinity);
		const queues = LANES.map((lane, l) =>
			Array.from({ length: perLane }, (_, i) => l * perLane + (lane.way > 0 ? perLane - 1 - i : i))
		);
		const queued = new Uint8Array(carCount).fill(1);
		// The heads of the queues a whole span short of the far end, which is the same place on the
		// bridge, so they don't come round to the back again for an hour of lurching
		const front = LANES.map(
			(lane, l) => (lane.way > 0 ? (perLane - 1) * CAR_GAP - SPAN : 0) + l * 2.3
		);
		const placed = (n: number, l: number, t: number) =>
			front[l]! - slot[n]! * CAR_GAP + jitter[n]! + lurch(t + l * 1.7 - slot[n]! * 0.12);
		queues.forEach((lane, l) =>
			lane.forEach((n, q) => {
				slot[n] = q;
				travelled[n] = placed(n, l, 0);
			})
		);
		let jammed = 0;

		// The shortest lane going the same way as lane l
		function shortest(l: number) {
			let best = l;
			LANES.forEach((lane, m) => {
				if (lane.way === LANES[l]!.way && queues[m]!.length < queues[best]!.length) best = m;
			});
			return best;
		}

		function rejoin(n: number, l: number, t: number) {
			const lane = queues[l]!;
			const last = lane[lane.length - 1];
			slot[n] = last === undefined ? 0 : slot[last]! + 1;
			laneOf[n] = l;
			across[n] = LANES[l]!.z;
			travelled[n] = Math.min(travelled[n]!, placed(n, l, t));
			pace[n] = 0;
			lane.push(n);
			queued[n] = 1;
		}

		const renumber = (lane: number[], from: number) => {
			for (let q = from; q < lane.length; q++) slot[lane[q]!] = q;
		};

		// Stuck behind someone slower with a gap opening up beside them, a driver cuts into it,
		// on whichever side it is. A lane hogger needs no reason to move over to the fast lane,
		// and none to leave it
		function overtake(n: number, l: number, q: number, t: number) {
			const driver = drivers[n]!;
			const lane = queues[l]!;
			const leader = lane[q - 1];
			if (t - changed[n]! < 2) return false;
			const inside = (m: number) => Math.abs(LANES[m]!.z) < Math.abs(LANES[l]!.z);
			if (!driver.hog) {
				if (leader === undefined || pace[leader]! > driver.top * 0.75) return false;
				const room = travelled[leader]! - travelled[n]!;
				if (room > driver.standing + 8 + pace[n]! * 0.6) return false;
			}
			const sides = [l - 1, l + 1].filter(
				(m) => LANES[m]?.way === LANES[l]!.way && (!driver.hog || inside(m))
			);
			if (hash(n, t) < 0.5) sides.reverse();
			const [ahead, behind] = driver.cut;
			for (const m of sides) {
				const other = queues[m]!;
				let i = 0;
				while (i < other.length && travelled[other[i]!]! >= travelled[n]!) i++;
				const before = other[i - 1];
				const after = other[i];
				if (before !== undefined && travelled[before]! - travelled[n]! < ahead) continue;
				if (after !== undefined && travelled[n]! - travelled[after]! < behind) continue;
				// Across, and everyone behind on both sides takes their new place in the queue
				lane.splice(q, 1);
				renumber(lane, q);
				other.splice(i, 0, n);
				renumber(other, i);
				laneOf[n] = m;
				changed[n] = t;
				return true;
			}
			return false;
		}

		function jam(t: number) {
			const dt = Math.max(0, t - jammed);
			jammed = t;
			queues.forEach((lane, l) => {
				// Out of the queue when picked up, everyone behind moving up a slot
				for (let q = lane.length - 1; q >= 0; q--) {
					const n = lane[q]!;
					if (!taken.has(n)) continue;
					lane.splice(q, 1);
					queued[n] = 0;
					renumber(lane, q);
				}
				// Past the far end, round to the back of the shortest lane, from the near end
				while (lane.length && travelled[lane[0]!]! >= SPAN) {
					const n = lane.shift()!;
					renumber(lane, 0);
					travelled[n]! -= SPAN;
					rejoin(n, shortest(l), t);
				}
			});
			for (let n = 0; n < carCount; n++) {
				if (!queued[n] && !taken.has(n)) {
					travelled[n] = 0;
					rejoin(n, shortest(Math.floor(n / perLane)), t);
				}
			}
			const moving: number[] = [];
			queues.forEach((lane, l) => {
				// In the order they are on the road: one joined at the back of a lane still catching
				// up can be ahead of the cars it was queued behind, and waits for them to pass
				for (let q = 1; q < lane.length; q++) {
					const n = lane[q]!;
					let p = q;
					while (p > 0 && travelled[lane[p - 1]!]! < travelled[n]!) {
						lane[p] = lane[p - 1]!;
						p--;
					}
					if (p === q) continue;
					lane[p] = n;
					renumber(lane, p);
				}
				lane.forEach((n, q) => {
					const driver = drivers[n]!;
					// Up with the jam, or driving on to catch it up, held back by whoever's ahead
					const target = placed(n, l, t);
					const left = target - travelled[n]!;
					if (left < 0.5) {
						// Cut in on, it waits for the jam to move on before closing up again
						if (left > -0.5) travelled[n] = target;
						pace[n] = 0;
						return;
					}
					const leader = lane[q - 1];
					let room = left;
					let limit = Infinity;
					if (leader !== undefined) {
						const gap =
							travelled[leader]! - travelled[n]! - driver.standing - driver.headway * pace[n]!;
						room = Math.min(room, Math.max(0, gap));
						limit = Math.sqrt(2 * driver.brake * Math.max(0, gap)) + pace[leader]!;
					}
					pace[n] = Math.min(
						pace[n]! + driver.accel * dt,
						driver.top,
						Math.sqrt(2 * driver.brake * left),
						limit
					);
					travelled[n] = Math.min(travelled[n]! + Math.min(pace[n]! * dt, room), target);
					moving.push(n);
				});
			});
			// Then the overtaking, a car at a time
			for (const n of moving) {
				const l = laneOf[n]!;
				overtake(n, l, queues[l]!.indexOf(n), t);
			}
			// Swinging across into the lane they're in
			for (let n = 0; n < carCount; n++) {
				const to = LANES[laneOf[n]!]!.z;
				const was = across[n]!;
				across[n] = to + (was - to) * Math.exp(-dt * drivers[n]!.swerve);
				drift[n] = dt > 0 ? (across[n]! - was) / dt : 0;
			}
		}

		function traffic(t: number) {
			jam(t);
			const heads = headlights.geometry.attributes.position as THREE.BufferAttribute;
			const tails = taillights.geometry.attributes.position as THREE.BufferAttribute;
			let h = 0;
			let k = 0;
			LANES.forEach((lane, l) => {
				for (let i = 0; i < perLane; i++) {
					const n = l * perLane + i;
					const along = ((travelled[n]! % SPAN) + SPAN) % SPAN;
					const x = lane.way > 0 ? along - TRAFFIC_REACH : TRAFFIC_REACH - along;
					const z = across[n]!;
					// Nosing the way it's swerving
					const yaw = -Math.atan2(drift[n]!, lane.way * Math.max(pace[n]!, 4));
					const y = deckY(x) + 0.1;
					const slope = Math.atan2(deckY(x + 1) - deckY(x - 1), 2);
					const gone = taken.has(n);
					carSpot.set([x, y, z], n * 3);
					dummy.position.set(x, y, z);
					dummy.rotation.set(0, yaw, lane.way > 0 ? slope : -slope);
					dummy.scale.setScalar(gone ? 0 : 1);
					dummy.updateMatrix();
					cars.setMatrixAt(n, dummy.matrix);
					// The west end of each car faces the viewer
					for (const side of [-0.75, 0.75]) {
						const ly = gone ? -100 : y;
						if (lane.way < 0) heads.setXYZ(h++, x - 2.7, ly + 0.9, z + side);
						else tails.setXYZ(k++, x - 2.7, ly + 1.1, z + side);
					}
				}
			});
			cars.instanceMatrix.needsUpdate = true;
			heads.needsUpdate = tails.needsUpdate = true;
		}

		// Motorcycles, as many as there are in Penang, filtering past the jam in the gaps between
		// the lanes and darting across from one gap to the other
		const BIKES = 90;
		const bikeGeometry = mergeGeometries([
			new THREE.BoxGeometry(2, 0.9, 0.5).translate(0, 0.75, 0),
			new THREE.BoxGeometry(0.6, 0.9, 0.55).translate(-0.2, 1.6, 0),
			new THREE.BoxGeometry(0.4, 0.4, 0.4).translate(-0.1, 2.25, 0)
		]);
		const bikeSpot = new Float32Array(BIKES * 3);
		const bikes = new THREE.InstancedMesh(
			bikeGeometry,
			lampLit(new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 })),
			BIKES
		);
		for (let i = 0; i < BIKES; i++) {
			bikes.setColorAt(i, new THREE.Color(PAINT[(i * 104729) % PAINT.length]));
		}
		scene.add(bikes);
		const bikeLights = lights(new Array(BIKES * 3).fill(0), 0xfff6e0, 3);
		const bikeTails = lights(new Array(BIKES * 3).fill(0), 0xff2a1a, 2.4);
		const riders = Array.from({ length: BIKES }, (_, i) => ({
			way: i % 2 ? 1 : -1,
			along: (i * 2963) % (TRAFFIC_REACH * 2),
			speed: 6 + ((i * 37) % 7),
			phase: i * 1.7,
			away: false
		}));

		function motorcycles(ride: number, t: number) {
			const heads = bikeLights.geometry.attributes.position as THREE.BufferAttribute;
			const tails = bikeTails.geometry.attributes.position as THREE.BufferAttribute;
			const span = TRAFFIC_REACH * 2;
			riders.forEach((rider, i) => {
				rider.along += ride * (rider.speed / 9);
				const x = ((((rider.along * rider.way) % span) + span) % span) - TRAFFIC_REACH;
				// Mostly in one gap or the other, crossing over quickly
				const z = -rider.way * (5.6 + 1.7 * Math.tanh(3 * Math.sin(t * 0.35 + rider.phase)));
				const y = deckY(x) + 0.1;
				const slope = Math.atan2(deckY(x + 1) - deckY(x - 1), 2);
				const gone = taken.has(carCount + i);
				// Gone off the bridge, the next one along comes in from the end
				if (gone) rider.away = true;
				else if (rider.away) {
					rider.away = false;
					rider.along = Math.ceil(rider.along / span) * span + 0.01;
				}
				bikeSpot.set([x, y, z], i * 3);
				dummy.position.set(x, y, z);
				dummy.rotation.set(0, rider.way > 0 ? 0 : Math.PI, rider.way > 0 ? slope : -slope);
				dummy.scale.setScalar(gone ? 0 : 1);
				dummy.updateMatrix();
				bikes.setMatrixAt(i, dummy.matrix);
				const facing = rider.way < 0 ? heads : tails;
				const hidden = rider.way < 0 ? tails : heads;
				facing.setXYZ(i, x - 1.1, gone ? -100 : y + 1.1, z);
				hidden.setXYZ(i, 0, -100, 0);
			});
			bikes.instanceMatrix.needsUpdate = true;
			heads.needsUpdate = tails.needsUpdate = true;
		}

		// The sky: the sun, the moon in its phase and stars after dark, each where it really is
		// over George Town right now
		const SKY = 9000;
		const skyward = (elevation: number, azimuth: number, target: THREE.Vector3) =>
			target.set(
				Math.sin(azimuth) * Math.cos(elevation),
				Math.sin(elevation),
				-Math.cos(azimuth) * Math.cos(elevation)
			);
		const heavenly = (map: THREE.Texture, color: number, additive: boolean) =>
			new THREE.Sprite(
				new THREE.SpriteMaterial({
					map,
					color,
					fog: false,
					transparent: true,
					depthWrite: false,
					blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
				})
			);

		const sunDisc = heavenly(glow, 0xfff1c8, true);
		sunDisc.scale.setScalar(1500);
		scene.add(sunDisc);

		// The moon, drawn in its phase: the half towards the sun lit, and an ellipse that adds
		// to it past half moon or bites into it before, over a faint earthshine
		const moonCanvas = document.createElement('canvas');
		moonCanvas.width = moonCanvas.height = 128;
		const moonTexture = new THREE.CanvasTexture(moonCanvas);
		moonTexture.colorSpace = THREE.SRGBColorSpace;
		const moonDisc = heavenly(moonTexture, 0xffffff, false);
		moonDisc.scale.setScalar(360);
		const moonGlow = heavenly(glow, 0xcdd8ff, true);
		moonGlow.scale.setScalar(1200);
		scene.add(moonGlow, moonDisc);
		function drawMoon(lit: number, waxing: boolean) {
			const c = moonCanvas.getContext('2d')!;
			const [m, r] = [64, 56];
			c.clearRect(0, 0, 128, 128);
			c.fillStyle = '#f6f2e4';
			c.beginPath();
			c.arc(m, m, r, -Math.PI / 2, Math.PI / 2, !waxing);
			c.fill();
			c.globalCompositeOperation = lit > 0.5 ? 'source-over' : 'destination-out';
			c.beginPath();
			c.ellipse(m, m, Math.max(0.01, r * Math.abs(2 * lit - 1)), r, 0, 0, Math.PI * 2);
			c.fill();
			c.globalCompositeOperation = 'destination-over';
			c.fillStyle = 'rgb(200 210 235 / 0.16)';
			c.beginPath();
			c.arc(m, m, r, 0, Math.PI * 2);
			c.fill();
			c.globalCompositeOperation = 'source-over';
			moonTexture.needsUpdate = true;
		}

		// Stars, in two sets that twinkle out of step
		let starSeed = 3;
		const starRandom = () => (starSeed = (starSeed * 16807) % 2147483647) / 2147483647;
		const stars = [0, 1].map(() => {
			const positions: number[] = [];
			for (let i = 0; i < 700; i++) {
				const y = 0.04 + starRandom() * 0.96;
				const a = starRandom() * Math.PI * 2;
				const r = Math.sqrt(1 - y * y);
				positions.push(Math.cos(a) * r * SKY, y * SKY, Math.sin(a) * r * SKY);
			}
			const points = new THREE.Points(
				new THREE.BufferGeometry().setAttribute(
					'position',
					new THREE.Float32BufferAttribute(positions, 3)
				),
				new THREE.PointsMaterial({
					color: 0xffffff,
					size: 1.6,
					sizeAttenuation: false,
					fog: false,
					transparent: true,
					depthWrite: false
				})
			);
			scene.add(points);
			return points;
		});
		let starlight = 0;

		function twinkle() {
			stars[0]!.material.opacity = starlight * (0.75 + 0.25 * Math.sin(performance.now() / 700));
			stars[1]!.material.opacity = starlight * (0.75 + 0.25 * Math.cos(performance.now() / 900));
		}

		function skyLights(sunPosition: { elevation: number; azimuth: number }) {
			skyward(sunPosition.elevation, sunPosition.azimuth, sunDisc.position)
				.multiplyScalar(SKY)
				.add(camera.position);
			sunDisc.visible = sunPosition.elevation > -0.03;
			// Redder near the horizon
			const low = 1 - Math.min(1, Math.max(0, sunPosition.elevation / 0.3));
			sunDisc.material.color.set(0xfff1c8).lerp(new THREE.Color(0xff8a40), low);

			const moon = moonAt(now());
			skyward(moon.elevation, moon.azimuth, moonDisc.position)
				.multiplyScalar(SKY * 0.95)
				.add(camera.position);
			moonGlow.position.copy(moonDisc.position);
			moonDisc.visible = moonGlow.visible = moon.elevation > -0.02;
			drawMoon(moon.lit, moon.waxing);
			// Pale in daylight, bright at night
			moonDisc.material.opacity = 0.45 + 0.55 * palette.lamps;
			moonGlow.material.opacity = 0.35 * palette.lamps * moon.lit;

			starlight = Math.max(0, (palette.lamps - 0.4) / 0.6);
		}

		// Penang Hill and its neighbours on the island to the west, hazy in the distance
		const hills = new THREE.PlaneGeometry(7000, 3500, 70, 35).rotateX(-Math.PI / 2);
		const positions = hills.attributes.position as THREE.BufferAttribute;
		for (let i = 0; i < positions.count; i++) {
			const x = positions.getX(i) - 4200;
			const z = positions.getZ(i) - 2400;
			const peaks =
				780 * Math.exp(-(((x + 4300) / 1100) ** 2) - ((z + 2200) / 800) ** 2) +
				480 * Math.exp(-(((x + 2900) / 900) ** 2) - ((z + 1900) / 700) ** 2) +
				300 * Math.exp(-(((x + 5600) / 1200) ** 2) - ((z + 2700) / 900) ** 2);
			positions.setXYZ(i, x, peaks - 30, z);
		}
		hills.computeVertexNormals();
		scene.add(
			new THREE.Mesh(
				hills,
				new THREE.MeshStandardMaterial({ color: 0x2f4a3c, roughness: 1, flatShading: true })
			)
		);

		// The sea, set in type: a grid of characters, each picked by the height of the waves
		// at the spot in the strait it covers, so it lies in the same perspective as the bridge
		// and fades into the page's sky towards the horizon. By night the lamps are mirrored in
		// it as warm streaks
		const RAMP = ' .,-~~=';
		const CELL_W = 9;
		const CELL_H = 15;
		const LEVELS = 4;
		const sea = ocean.getContext('2d')!;
		const ray = new THREE.Raycaster();
		const surface = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
		const hit = new THREE.Vector3();
		const ndc = new THREE.Vector2();
		const projected = new THREE.Vector3();
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
			const dx = x + sunward.x * t;
			const dz = z + sunward.z * t;
			if (Math.abs(dz) < DECK_HALF && Math.abs(dx) < REACH) return true;
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
		const RIPPLE_LIFE = 2.8;
		// Plain, not reactive: only the render loop reads it
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const glints = new Set<number>();

		const waves = (x: number, z: number, t: number) =>
			Math.sin(x * 0.045 + t * 1.1 + Math.sin(z * 0.03) * 2) * 0.5 +
			Math.sin(z * 0.08 - t * 0.8 + x * 0.012) * 0.35 +
			Math.sin((x + z) * 0.11 + t * 1.7) * 0.15;

		// Which cells the lamps' reflections fall in: a short streak below each lamp's mirror
		// image, on the near side of the deck
		function reflect() {
			glints.clear();
			const { clientWidth: w, clientHeight: h } = host;
			const cols = Math.ceil(w / CELL_W);
			for (let i = 0; i < lampHeads.length; i += 3) {
				const [x, y, z] = [lampHeads[i]!, lampHeads[i + 1]!, lampHeads[i + 2]!];
				if (z < 0) continue;
				projected.set(x, -y, z).project(camera);
				if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) continue;
				const col = Math.floor((((projected.x + 1) / 2) * w) / CELL_W);
				const end = Math.floor((((1 - projected.y) / 2) * h) / CELL_H);
				projected.set(x, 0, z).project(camera);
				const start = Math.floor((((1 - projected.y) / 2) * h) / CELL_H);
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
		function measureSea() {
			const { clientWidth: w, clientHeight: h } = host;
			cells.cols = Math.ceil(w / CELL_W);
			cells.rows = Math.ceil(h / CELL_H);
			const count = cells.cols * cells.rows;
			cells.x = new Float32Array(count);
			cells.z = new Float32Array(count);
			cells.level = new Int8Array(count).fill(-1);
			cells.shade = new Uint8Array(count);
			for (let row = 0; row < cells.rows; row++) {
				ndc.y = 1 - (((row + 0.5) * CELL_H) / h) * 2;
				for (let col = 0; col < cells.cols; col++) {
					ndc.x = ((col + 0.5) * CELL_W * 2) / w - 1;
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
			shadeSea();
		}
		function shadeSea() {
			for (let c = 0; c < cells.level.length; c++) {
				cells.shade[c] = cells.level[c]! > 0 && shadowed(cells.x[c]!, cells.z[c]!) ? 1 : 0;
			}
		}

		function drawSea(t: number) {
			const { clientWidth: w, clientHeight: h } = host;
			const seconds = performance.now() / 1000;
			while (splashes[0] && seconds - splashes[0].at > RIPPLE_LIFE + 1) splashes.shift();
			sea.clearRect(0, 0, w, h);
			const { cols, rows } = cells;
			const lit = palette.lamps > 0.3;
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
					sea.globalAlpha = level === LEVELS ? palette.lamps : ((level + 1) / LEVELS) * 0.85;
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
						const px = ((projected.x + 1) / 2) * w;
						const py = ((1 - projected.y) / 2) * h;
						if (a) sea.lineTo(px, py);
						else sea.moveTo(px, py);
					}
					sea.stroke();
				}
			}
		}

		// Picking vehicles up and dropping them in the sea. Each one taken out of the traffic is
		// a mesh of its own, cut off at the waterline, so it can bob there or sink out of sight
		type State = 'held' | 'falling' | 'floating' | 'sinking' | 'blasting';
		interface Loose {
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
		const loose: Loose[] = [];
		const waterline = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
		renderer.localClippingEnabled = true;

		function lift(id: number) {
			const car = id < carCount;
			const j = car ? id : id - carCount;
			const tint = new THREE.Color();
			(car ? cars : bikes).getColorAt(j, tint);
			const mesh = new THREE.Mesh(
				car ? carGeometry : bikeGeometry,
				lampLit(
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
				.multiplyScalar(0.45 * palette.lamps);
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
						map: glow,
						transparent: true,
						opacity: palette.lamps,
						depthWrite: false,
						blending: THREE.AdditiveBlending,
						clippingPlanes: waterline
					})
				);
				mesh.add(lamp);
			}
			mesh.position.fromArray(car ? carSpot : bikeSpot, j * 3);
			const way = car ? LANES[Math.floor(j / perLane)]!.way : riders[j]!.way;
			mesh.rotation.y = way > 0 ? 0 : Math.PI;
			scene.add(mesh);
			taken.add(id);
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
			taken.delete(vehicle.id);
			loose.splice(loose.indexOf(vehicle), 1);
		}

		const overDeck = (p: THREE.Vector3) => Math.abs(p.z) < DECK_HALF && Math.abs(p.x) < REACH;

		function splashDown(vehicle: Loose, seconds: number) {
			const { mesh, velocity } = vehicle;
			splashes.push({ x: mesh.position.x, z: mesh.position.z, at: seconds });
			spray(mesh.position, Math.min(1.6, 0.8 + -velocity.y / 40));
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
			if (still) remove(vehicle);
		}

		// The splash: droplets thrown up and out, falling back to the water
		const DROPS = 600;
		// Spent drops and sparks are parked behind the camera, where nothing is drawn
		const PARKED = [0, 0, 100_000];
		const dropPositions = new Float32Array(DROPS * 3);
		for (let i = 0; i < DROPS; i++) dropPositions.set(PARKED, i * 3);
		const dropVelocities = new Float32Array(DROPS * 3);
		const drops = new THREE.Points(
			new THREE.BufferGeometry().setAttribute(
				'position',
				new THREE.BufferAttribute(dropPositions, 3)
			),
			new THREE.PointsMaterial({
				color: 0xf2f7fb,
				size: 3.2,
				map: glow,
				transparent: true,
				opacity: 0.9,
				depthWrite: false
			})
		);
		drops.frustumCulled = false;
		scene.add(drops);
		let nextDrop = 0;

		function spray(at: THREE.Vector3, strength: number, count = 120, height = 0.3) {
			for (let i = 0; i < count; i++) {
				const n = nextDrop++ % DROPS;
				const angle = Math.random() * Math.PI * 2;
				const out = (3 + Math.random() * 9) * strength;
				dropPositions.set(
					[at.x + Math.cos(angle) * 1.5, height, at.z + Math.sin(angle) * 1.5],
					n * 3
				);
				dropVelocities.set(
					[Math.cos(angle) * out, (10 + Math.random() * 18) * strength, Math.sin(angle) * out],
					n * 3
				);
			}
		}

		let wasMoving = false;
		function droplets(dt: number) {
			let moving = false;
			for (let n = 0; n < DROPS; n++) {
				const i = n * 3;
				if (dropPositions[i + 2] === PARKED[2]) continue;
				dropVelocities[i + 1]! -= 30 * dt;
				dropPositions[i]! += dropVelocities[i]! * dt;
				dropPositions[i + 1]! += dropVelocities[i + 1]! * dt;
				dropPositions[i + 2]! += dropVelocities[i + 2]! * dt;
				if (dropPositions[i + 1]! < 0) dropPositions.set(PARKED, i);
				moving = true;
			}
			// Only sent to the GPU again while there's a splash in the air
			if (moving || wasMoving) drops.geometry.attributes.position!.needsUpdate = true;
			wasMoving = moving;
		}

		// Through the uprights: a thrown car passing between a pylon's two legs, above the deck,
		// is a field goal. Fireworks go up from both spires and the cables strobe gold and white
		let cheering = -Infinity;
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
				const [left, right] = [legA.project(camera).x, legB.project(camera).x].sort(
					(a, b) => a - b
				);
				if (x > left! && x < right!) now = k;
			});
			const entered = now !== null && vehicle.between === null;
			vehicle.between = now;
			if (!entered || vehicle.scored || vehicle.velocity.length() < 15) return;
			vehicle.scored = true;
			cheering = performance.now() / 1000;
			if (still) return;
			// Nobody lets off fireworks in daylight: by day the cables' strobe is the celebration
			if (palette.lamps < 0.5) return;
			// Shells go up from the water all around the pylon, a few at a time
			const px = PYLONS[now!]!;
			for (let k = 0; k < 12; k++) {
				shells.push({
					at: seconds() + k * 0.22 + Math.random() * 0.15,
					x: px + (Math.random() - 0.5) * 340,
					y: 0,
					z: -60 + Math.random() * 90,
					rise: 62 + Math.random() * 26,
					drift: (Math.random() - 0.5) * 8,
					tint: FIREWORK[Math.floor(Math.random() * FIREWORK.length)]!,
					launched: false
				});
			}
		}

		const SPARKS = 3000;
		const sparkPositions = new Float32Array(SPARKS * 3);
		for (let i = 0; i < SPARKS; i++) sparkPositions.set(PARKED, i * 3);
		const sparkVelocities = new Float32Array(SPARKS * 3);
		// Each spark keeps its colour and fades out, rather than darkening: the canvas is
		// see-through over the page's sky, where a dark spark would show as a black speck
		const sparkColors = new Float32Array(SPARKS * 4);
		const sparkTints = new Float32Array(SPARKS * 3);
		const sparkLife = new Float32Array(SPARKS);
		const sparks = new THREE.Points(
			new THREE.BufferGeometry()
				.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3))
				.setAttribute('color', new THREE.BufferAttribute(sparkColors, 4)),
			new THREE.PointsMaterial({
				size: 4,
				map: glow,
				vertexColors: true,
				transparent: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending
			})
		);
		sparks.frustumCulled = false;
		scene.add(sparks);
		let nextSpark = 0;
		const FIREWORK = [0xffd400, 0xffffff, 0x36c5ff, 0xff4d4d, 0xffb020];

		const seconds = () => performance.now() / 1000;
		interface Shell {
			at: number;
			x: number;
			y: number;
			z: number;
			rise: number;
			drift: number;
			tint: number;
			launched: boolean;
		}
		const shells: Shell[] = [];

		function spark(x: number, y: number, z: number, v: number[], tint: THREE.Color, life: number) {
			const n = nextSpark++ % SPARKS;
			sparkPositions.set([x, y, z], n * 3);
			sparkVelocities.set(v, n * 3);
			sparkTints.set([tint.r, tint.g, tint.b], n * 3);
			sparkLife[n] = life;
		}

		// Each shell climbs on a trail of sparks, slowing, and bursts near the top of its climb
		const trail = new THREE.Color(0xffd9a0);
		function shellsUp(dt: number) {
			const now = seconds();
			for (const shell of [...shells]) {
				if (now < shell.at) continue;
				shell.launched = true;
				shell.y += shell.rise * dt;
				shell.x += shell.drift * dt;
				shell.rise -= 30 * dt;
				spark(shell.x, shell.y, shell.z, [0, -2, 0], trail, 0.35);
				if (shell.rise < 8) {
					burst(shell.x, shell.y, shell.z, shell.tint);
					shells.splice(shells.indexOf(shell), 1);
				}
			}
		}

		function burst(x: number, y: number, z: number, colour: number) {
			const tint = new THREE.Color(colour);
			for (let i = 0; i < 140; i++) {
				const n = nextSpark++ % SPARKS;
				// Evenly about a sphere, opening wide
				const u = Math.random() * 2 - 1;
				const a = Math.random() * Math.PI * 2;
				const speed = 46 + Math.random() * 12;
				const r = Math.sqrt(1 - u * u);
				sparkPositions.set([x, y, z], n * 3);
				sparkVelocities.set(
					[Math.cos(a) * r * speed, u * speed * 0.8 + 4, Math.sin(a) * r * speed],
					n * 3
				);
				sparkTints.set([tint.r, tint.g, tint.b], n * 3);
				sparkLife[n] = 1.6 + Math.random() * 0.7;
			}
		}

		let wasBurning = false;
		function fireworks(dt: number) {
			shellsUp(dt);
			let burning = false;
			for (let n = 0; n < SPARKS; n++) {
				const i = n * 3;
				if (sparkLife[n]! <= 0) continue;
				sparkLife[n]! -= dt;
				const drag = Math.exp(-dt * 1.8);
				sparkVelocities[i]! *= drag;
				sparkVelocities[i + 1]! = sparkVelocities[i + 1]! * drag - 9 * dt;
				sparkVelocities[i + 2]! *= drag;
				sparkPositions[i]! += sparkVelocities[i]! * dt;
				sparkPositions[i + 1]! += sparkVelocities[i + 1]! * dt;
				sparkPositions[i + 2]! += sparkVelocities[i + 2]! * dt;
				const glowing = Math.max(0, Math.min(1, sparkLife[n]!));
				sparkColors.set([sparkTints[i]!, sparkTints[i + 1]!, sparkTints[i + 2]!, glowing], n * 4);
				if (sparkLife[n]! <= 0) sparkPositions.set(PARKED, i);
				burning = true;
			}
			// Only sent to the GPU again while there are sparks in the air
			if (burning || wasBurning) {
				sparks.geometry.attributes.position!.needsUpdate = true;
				sparks.geometry.attributes.color!.needsUpdate = true;
			}
			wasBurning = burning;
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
			if (((1 - onScreen.y) / 2) * host.clientHeight > -above - 40) return false;
			// Only now and then; mostly it just falls back
			if (Math.random() >= 0.1) return false;
			// Further along the way it's heading across the page, far off, still in sight
			onScreen.copy(p).project(camera);
			toward.copy(p).addScaledVector(velocity, 0.05).project(camera).sub(onScreen);
			toward.z = 0;
			toward.setLength(0.5 + Math.random() * 0.2);
			const top = 1 + (2 * above) / host.clientHeight - 0.15;
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

		function physics(dt: number, seconds: number) {
			droplets(dt);
			fireworks(dt);
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
						twinkles.push({
							x: ((onScreen.x + 1) / 2) * host.clientWidth,
							y: ((1 - onScreen.y) / 2) * host.clientHeight,
							at: seconds
						});
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

		// The header is cloud: a car passing through it punches a hole, drags the cloud along in
		// its direction of flight and leaves it in wisps, and it all drifts slowly back together.
		// While it's disturbed, the header is drawn into a picture that's shown in its place on a
		// canvas of its own, where a shader pushes it about by a small map of the disturbance:
		// which way each bit of it was pushed, and how badly it was torn. An SVG filter on the
		// header itself would be simpler, but Safari doesn't run one on a page's text, and every
		// other browser redraws the whole thing on the processor each time the map changes
		const header = document.querySelector('header');
		const WAKE_SCALE = 0.25;
		let headerBox = { x: 0, y: 0, w: 0, h: 0 };
		// The disturbance, per cell of the map: which way it was pushed, and how torn it is
		let pushX = new Float32Array(0);
		let pushY = new Float32Array(0);
		let torn = new Float32Array(0);
		let spare = new Float32Array(0);
		let W = 0;
		let H = 0;
		let stirred = -Infinity;
		// The little flag in the header is cloth, not cloud: a car flying close by doesn't tear it,
		// but its gust sets the flag flapping hard and leaning away from it, and it settles back
		const flag = header?.querySelector<HTMLElement>('.flag') ?? null;
		// Its middle, in the header's coordinates, and its width
		let flagBox = { x: 0, y: 0, w: 0 };

		// The canvas the smoke is drawn on: over the header and a margin around it, for anything
		// pushed or blown out past its edges
		const overlay = document.createElement('canvas');
		overlay.setAttribute('aria-hidden', 'true');
		Object.assign(overlay.style, {
			position: 'absolute',
			zIndex: '1',
			pointerEvents: 'none',
			display: 'none'
		});
		document.body.append(overlay);
		const smoke = new THREE.WebGLRenderer({ canvas: overlay, alpha: true, antialias: false });
		smoke.setClearColor(0x000000, 0);
		// The header as it looks, drawn into a canvas of its own
		const picture = document.createElement('canvas');
		const drawing = picture.getContext('2d')!;
		const pictured = new THREE.CanvasTexture(picture);
		pictured.premultiplyAlpha = true;
		pictured.generateMipmaps = false;
		pictured.minFilter = THREE.LinearFilter;
		// The disturbance, red and green for the push and blue for the tear
		let wake = new THREE.DataTexture(new Uint8Array(4), 1, 1);
		const SMOKE_VERTEX = /* glsl */ `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = vec4(position.xy, 0.0, 1.0);
			}
		`;
		// Just as the SVG filter it replaces: the header pushed by the map, and where it's torn,
		// that pushed again by noise into wisps and blurred into smoke, then thinned out
		const SMOKE_FRAGMENT = /* glsl */ `
			precision highp float;
			uniform sampler2D picture;
			uniform sampler2D wake;
			// The canvas, the margin around the header and the header, in CSS pixels
			uniform vec2 size;
			uniform vec2 margin;
			uniform vec2 box;
			varying vec2 vUv;

			bool outside(vec2 uv) {
				return any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)));
			}
			vec4 seen(vec2 q) {
				vec2 uv = (q + margin) / size;
				return outside(uv) ? vec4(0.0) : texture2D(picture, vec2(uv.x, 1.0 - uv.y));
			}
			vec4 disturbance(vec2 q) {
				vec2 uv = q / box;
				return outside(uv) ? vec4(0.5, 0.5, 0.0, 0.0) : texture2D(wake, uv);
			}
			vec4 pushed(vec2 q) {
				return seen(q + 40.0 * (disturbance(q).rg - 0.5));
			}

			vec2 hash(vec2 p) {
				p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
				return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
			}
			float noise(vec2 p) {
				vec2 i = floor(p);
				vec2 f = fract(p);
				vec2 u = f * f * (3.0 - 2.0 * f);
				return mix(
					mix(dot(hash(i), f), dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
					mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash(i + 1.0), f - 1.0), u.x),
					u.y
				);
			}
			// Stretched sideways, like the cloud
			vec2 turbulence(vec2 q) {
				vec2 p = q * vec2(0.03, 0.08);
				vec2 sum = vec2(0.0);
				float amplitude = 1.0;
				for (int i = 0; i < 3; i++) {
					sum += amplitude * vec2(noise(p), noise(p + vec2(17.3, -9.1)));
					p *= 2.0;
					amplitude *= 0.5;
				}
				return sum * 0.5 + 0.5;
			}

			void main() {
				vec2 q = vec2(vUv.x, 1.0 - vUv.y) * size - margin;
				float tear = disturbance(q).b;
				vec4 colour = pushed(q);
				if (tear > 0.004) {
					vec4 wisps = vec4(0.0);
					float total = 0.0;
					for (int i = -1; i <= 1; i++) {
						for (int j = -1; j <= 1; j++) {
							vec2 o = vec2(float(i), float(j)) * 2.5;
							float weight = exp(-dot(o, o) / 12.5);
							vec2 s = q + o;
							wisps += weight * pushed(s + 22.0 * (turbulence(s) - 0.5));
							total += weight;
						}
					}
					vec4 smoky = wisps / total * tear;
					colour = smoky + colour * (1.0 - tear) * (1.0 - smoky.a);
				}
				gl_FragColor = colour * (1.0 - 0.85 * tear);
			}
		`;
		const smokeMaterial = new THREE.ShaderMaterial({
			uniforms: {
				picture: { value: pictured },
				wake: { value: wake },
				size: { value: new THREE.Vector2() },
				margin: { value: new THREE.Vector2() },
				box: { value: new THREE.Vector2() }
			},
			vertexShader: SMOKE_VERTEX,
			fragmentShader: SMOKE_FRAGMENT,
			blending: THREE.NoBlending,
			depthTest: false,
			depthWrite: false
		});
		const smokeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), smokeMaterial);
		smokeQuad.frustumCulled = false;
		const smokeScene = new THREE.Scene().add(smokeQuad);
		const smokeCamera = new THREE.Camera();
		let smoking = false;

		function measure() {
			if (!header) return;
			stop();
			const origin = host.getBoundingClientRect();
			const box = header.getBoundingClientRect();
			headerBox = {
				x: box.left - origin.left,
				y: box.top - origin.top,
				w: box.width,
				h: box.height
			};
			if (flag) {
				const cloth = flag.getBoundingClientRect();
				flagBox = {
					x: cloth.left - box.left + cloth.width / 2,
					y: cloth.top - box.top + cloth.height / 2,
					w: cloth.width
				};
			}
			W = Math.max(1, Math.round(box.width * WAKE_SCALE));
			H = Math.max(1, Math.round(box.height * WAKE_SCALE));
			const cells = W * H;
			pushX = new Float32Array(cells);
			pushY = new Float32Array(cells);
			torn = new Float32Array(cells);
			spare = new Float32Array(cells);
			wake.dispose();
			wake = new THREE.DataTexture(new Uint8Array(cells * 4), W, H);
			wake.magFilter = wake.minFilter = THREE.LinearFilter;
			smokeMaterial.uniforms.wake!.value = wake;
			calm();

			const margin = { x: Math.round(box.width * 0.05), y: Math.round(box.height * 0.25) };
			const width = Math.ceil(box.width) + margin.x * 2;
			const height = Math.ceil(box.height) + margin.y * 2;
			Object.assign(overlay.style, {
				left: `${box.left + window.scrollX - margin.x}px`,
				top: `${box.top + window.scrollY - margin.y}px`
			});
			const ratio = Math.min(2, window.devicePixelRatio);
			smoke.setPixelRatio(ratio);
			smoke.setSize(width, height);
			picture.width = width * ratio;
			picture.height = height * ratio;
			// Drawn to in the page's own coordinates
			drawing.setTransform(
				ratio,
				0,
				0,
				ratio,
				(margin.x - box.left) * ratio,
				(margin.y - box.top) * ratio
			);
			const { uniforms } = smokeMaterial;
			(uniforms.size!.value as THREE.Vector2).set(width, height);
			(uniforms.margin!.value as THREE.Vector2).set(margin.x, margin.y);
			(uniforms.box!.value as THREE.Vector2).set(box.width, box.height);
		}

		// The header's words as they are now, every letter where the page has put it. The flag
		// isn't in it: the page's own keeps waving in its place, untouched
		// Plain, not reactive: only the smoke reads it
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const written = new Set<HTMLElement>();
		function photograph() {
			if (!header) return;
			// In their own colours, even while they're hidden
			for (const words of written) words.style.color = '';
			drawing.save();
			drawing.resetTransform();
			drawing.clearRect(0, 0, picture.width, picture.height);
			drawing.restore();
			const range = document.createRange();
			const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
			for (
				let node = walker.nextNode() as Text | null;
				node;
				node = walker.nextNode() as Text | null
			) {
				const parent = node.parentElement!;
				if (parent.closest('[aria-hidden="true"]') || !node.data.trim()) continue;
				written.add(parent);
				const style = getComputedStyle(parent);
				drawing.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
				drawing.fillStyle = style.color;
				// From the top of the text's box down to its baseline
				const ascent = drawing.measureText('H').fontBoundingBoxAscent;
				for (let i = 0; i < node.data.length; i++) {
					if (!node.data[i]!.trim()) continue;
					range.setStart(node, i);
					range.setEnd(node, i + 1);
					const rect = range.getClientRects()[0];
					if (rect) drawing.fillText(node.data[i]!, rect.left, rect.top + ascent);
				}
			}
			for (const link of header.querySelectorAll('a')) {
				const style = getComputedStyle(link);
				if (!style.textDecorationLine.includes('underline')) continue;
				drawing.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
				drawing.fillStyle = style.textDecorationColor;
				const ascent = drawing.measureText('H').fontBoundingBoxAscent;
				const offset = parseFloat(style.textUnderlineOffset) || 0;
				const thickness = parseFloat(style.textDecorationThickness) || 1;
				for (const rect of link.getClientRects()) {
					drawing.fillRect(rect.left, rect.top + ascent + offset, rect.width, thickness);
				}
			}
			pictured.needsUpdate = true;
			if (smoking) for (const words of written) words.style.color = 'transparent';
		}

		// The header's colours change with the phase of the day: the picture follows at once
		const phases = new MutationObserver(() => {
			if (smoking) photograph();
		});
		phases.observe(document.documentElement, { attributes: true, attributeFilter: ['data-sky'] });

		// The smoke takes the header's place, drawn as it is before the header is hidden, so
		// there's never a frame without it
		function start() {
			if (smoking || !header) return;
			smoking = true;
			photograph();
			paint();
			overlay.style.display = '';
			smoke.render(smokeScene, smokeCamera);
			for (const words of written) words.style.color = 'transparent';
		}
		function stop() {
			if (!smoking || !header) return;
			smoking = false;
			stirred = -Infinity;
			overlay.style.display = 'none';
			for (const words of written) words.style.color = '';
		}

		function calm() {
			pushX.fill(0);
			pushY.fill(0);
			torn.fill(0);
			paint();
		}

		// The map, from the disturbance, for the shader to read; returns how torn the worst of it
		// still is. At rest it pushes nothing and tears nothing
		function paint() {
			let left = 0;
			const map = wake.image.data as Uint8Array;
			for (let c = 0, i = 0; c < torn.length; c++, i += 4) {
				left = Math.max(left, torn[c]!);
				map[i] = 128 - pushX[c]! * 127;
				map[i + 1] = 128 - pushY[c]! * 127;
				map[i + 2] = torn[c]! * 255;
				map[i + 3] = 255;
			}
			wake.needsUpdate = true;
			return left;
		}

		// Where a vehicle is on screen, from frame to frame, to know which way it's going
		const trails = new WeakMap<Loose, { x: number; y: number }>();
		function waft(vehicle: Loose) {
			if (still || !header) return;
			onScreen.copy(vehicle.mesh.position).project(camera);
			const x = ((onScreen.x + 1) / 2) * host.clientWidth - headerBox.x;
			const y = ((1 - onScreen.y) / 2) * host.clientHeight - headerBox.y;
			const last = trails.get(vehicle);
			trails.set(vehicle, { x, y });
			if (!last) return;
			const inside = (px: number, py: number) =>
				px > -20 && px < headerBox.w + 20 && py > -20 && py < headerBox.h + 20;
			if (!inside(x, y) && !inside(last.x, last.y)) return;
			const dx = x - last.x;
			const dy = y - last.y;
			const length = Math.hypot(dx, dy);
			if (length < 0.5) return;
			if (flagBox.w) {
				// How close it came to the flag along the way, and how fast it was going
				const along = Math.max(
					0,
					Math.min(1, ((flagBox.x - last.x) * dx + (flagBox.y - last.y) * dy) / length ** 2)
				);
				const miss = Math.hypot(last.x + dx * along - flagBox.x, last.y + dy * along - flagBox.y);
				const reach = flagBox.w * 2.5;
				if (miss < reach) {
					const strength = (1 - miss / reach) ** 1.5 * Math.min(1, length / 10);
					if (strength > gust) {
						gust = strength;
						gustWay = Math.sign(dx) || gustWay;
					}
				}
			}
			// Along the way it went, the cloud is torn and dragged on in its direction of flight
			const radius = 13 * WAKE_SCALE;
			const ax = last.x * WAKE_SCALE;
			const ay = last.y * WAKE_SCALE;
			const bx = x * WAKE_SCALE;
			const by = y * WAKE_SCALE;
			const ux = dx / length;
			const uy = dy / length;
			const span = length * WAKE_SCALE;
			const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - radius));
			const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + radius));
			const y0 = Math.max(0, Math.floor(Math.min(ay, by) - radius));
			const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + radius));
			for (let cy = y0; cy <= y1; cy++) {
				for (let cx = x0; cx <= x1; cx++) {
					const along = Math.max(0, Math.min(span, (cx - ax) * ux + (cy - ay) * uy));
					const d = Math.hypot(cx - (ax + ux * along), cy - (ay + uy * along));
					if (d > radius) continue;
					const weight = (1 - d / radius) ** 2;
					const c = cy * W + cx;
					torn[c] = Math.max(torn[c]!, weight);
					pushX[c] = pushX[c]! + (ux * weight - pushX[c]!) * weight;
					pushY[c] = pushY[c]! + (uy * weight - pushY[c]!) * weight;
				}
			}
			stirred = performance.now();
			start();
		}

		// The gust at the flag: how strong, and which way it blew; and how far the flag has caught
		// up with it. It flaps faster, the wave and its folds sped up together so the ripple holds,
		// and leans from the hoist. Only what the compositor can do on its own: the animations'
		// rates and the flag's transform, written only when they've moved enough to see, and not
		// at all once it's calm
		let gust = 0;
		let gustWay = 1;
		let flapping = 0;
		let rate = 1;
		let flagAnimations: Animation[] = [];
		function flutter(dt: number) {
			if (!flag || (gust === 0 && flapping === 0)) return;
			// It catches the gust at once, and the gust dies away over a couple of seconds
			gust = gust < 0.005 ? 0 : gust * Math.exp(-dt * 1.6);
			flapping += (gust - flapping) * Math.min(1, dt * (gust > flapping ? 14 : 4));
			if (gust === 0 && flapping < 0.005) flapping = 0;
			const next = 1 + flapping * 3.5;
			if (Math.abs(next - rate) > 0.04 || (flapping === 0 && rate !== 1)) {
				rate = flapping === 0 ? 1 : next;
				if (!flagAnimations.length) flagAnimations = flag.getAnimations({ subtree: true });
				for (const animation of flagAnimations) animation.updatePlaybackRate(rate);
			}
			flag.style.transform = flapping
				? `rotate(${gustWay * flapping * 7}deg) scaleX(${1 - flapping * (gustWay < 0 ? 0.3 : 0.08)})`
				: '';
		}

		// The disturbance spreads a little and, slowly, fades back to calm, in steady steps of a
		// thirtieth of a second however fast the screen draws: slow enough that nobody can tell
		const SETTLE_STEP = 1 / 30;
		let owed = 0;
		function settle(dt: number) {
			if (!header || stirred === -Infinity) return;
			if (stirred === 0) {
				owed = 0;
				stop();
				calm();
				return;
			}
			// Never more than a few steps at once, after a stall
			owed = Math.min(owed + dt, SETTLE_STEP * 3);
			if (owed < SETTLE_STEP) return;
			const heal = 0.995;
			for (; owed >= SETTLE_STEP; owed -= SETTLE_STEP) {
				for (const field of [pushX, pushY, torn]) {
					for (let cy = 0; cy < H; cy++) {
						for (let cx = 0; cx < W; cx++) {
							const c = cy * W + cx;
							const l = cx > 0 ? field[c - 1]! : field[c]!;
							const r = cx < W - 1 ? field[c + 1]! : field[c]!;
							const u = cy > 0 ? field[c - W]! : field[c]!;
							const d = cy < H - 1 ? field[c + W]! : field[c]!;
							spare[c] = (field[c]! * 0.92 + (l + r + u + d) * 0.02) * heal;
						}
					}
					field.set(spare);
				}
			}
			if (paint() < 0.02) stirred = 0;
			smoke.render(smokeScene, smokeCamera);
		}

		// The vehicle nearest the pointer on screen, within reach of a fingertip
		const pointer = new THREE.Vector2();
		const onScreen = new THREE.Vector3();
		// Anything with a place on screen: a pointer, or a finger on a touch screen
		type Spot = { clientX: number; clientY: number; pointerType: string };

		function aim(event: Spot) {
			const r = host.getBoundingClientRect();
			pointer.set(
				((event.clientX - r.left) / r.width) * 2 - 1,
				1 - ((event.clientY - r.top) / r.height) * 2
			);
			return r;
		}
		function nearest(event: Spot) {
			const r = aim(event);
			let best: number | null = null;
			let reach = (event.pointerType === 'touch' ? 28 : 16) ** 2;
			const look = (spots: Float32Array, count: number, offset: number) => {
				for (let i = 0; i < count; i++) {
					if (taken.has(offset + i)) continue;
					onScreen.fromArray(spots, i * 3);
					onScreen.y += 1;
					onScreen.project(camera);
					if (onScreen.z > 1) continue;
					const dx = ((onScreen.x - pointer.x) * r.width) / 2;
					const dy = ((onScreen.y - pointer.y) * r.height) / 2;
					if (dx * dx + dy * dy < reach) {
						reach = dx * dx + dy * dy;
						best = offset + i;
					}
				}
			};
			look(carSpot, carCount, 0);
			look(bikeSpot, BIKES, carCount);
			return best;
		}

		const grab = new THREE.Plane();
		const skim = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
		const target = new THREE.Vector3();
		let held: Loose | null = null;
		let moved = 0;
		// Where it's been over the last moments of the drag, to tell how fast it's being swung
		const FLING_WINDOW = 100;
		let swing: { at: number; p: THREE.Vector3 }[] = [];

		// Swiping through the traffic: pressed down away from any vehicle and dragged across, every
		// one the pointer passes over is batted up into the air, the way the swipe went
		let sweeping = false;
		let sweep: { at: number; x: number; y: number }[] = [];

		// The vehicles within reach of the stretch of screen the pointer just crossed, and how
		// close to its line each one was, from 1 right on it to 0 at the edge of reach
		function crossed(a: Spot, b: Spot) {
			const r = host.getBoundingClientRect();
			const reach = (b.pointerType === 'touch' ? 28 : 16) ** 2;
			const ax = a.clientX - r.left;
			const ay = a.clientY - r.top;
			const bx = b.clientX - r.left - ax;
			const by = b.clientY - r.top - ay;
			const length = bx * bx + by * by || 1;
			const hits: { id: number; close: number }[] = [];
			const look = (spots: Float32Array, count: number, offset: number) => {
				for (let i = 0; i < count; i++) {
					if (taken.has(offset + i)) continue;
					onScreen.fromArray(spots, i * 3);
					onScreen.y += 1;
					onScreen.project(camera);
					if (onScreen.z > 1) continue;
					const x = ((onScreen.x + 1) / 2) * r.width - ax;
					const y = ((1 - onScreen.y) / 2) * r.height - ay;
					const t = THREE.MathUtils.clamp((x * bx + y * by) / length, 0, 1);
					const dx = x - t * bx;
					const dy = y - t * by;
					const d = dx * dx + dy * dy;
					if (d < reach) hits.push({ id: offset + i, close: 1 - Math.sqrt(d / reach) });
				}
			};
			look(carSpot, carCount, 0);
			look(bikeSpot, BIKES, carCount);
			return hits;
		}

		function swipe(event: PointerEvent) {
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
			// How fast the pointer's going across the screen, in pixels a second
			const speed = Math.hypot(event.clientX - first.x, event.clientY - first.y) / span;
			const force = Math.min(1, speed / 3000);
			for (const { id, close } of hits) {
				const vehicle = lift(id);
				// Not the way it's swiped: something huge is tearing along under the deck, and every
				// vehicle over it bursts straight up and is thrown out over the side it was on,
				// tumbling, the faster the swipe the higher. Right over it they go highest, off to
				// the side much less, motorcycles being light the highest of all, and no two alike
				const side = Math.sign(vehicle.mesh.position.z) || 1;
				const light = id >= carCount ? 1.3 : 1;
				const up = (46 + force * 34) * (0.7 + close * 0.5) * (0.75 + Math.random() * 0.75);
				vehicle.velocity.set(
					(Math.random() - 0.5) * 8,
					up * light,
					side * (8 + Math.random() * 14)
				);
				release(vehicle);
				vehicle.spin.multiplyScalar(2 + force * 2);
			}
		}

		function down(event: PointerEvent) {
			const id = nearest(event);
			if (id === null) {
				if (event.pointerType === 'mouse' && event.button !== 0) return;
				sweeping = true;
				sweep = [{ at: performance.now(), x: event.clientX, y: event.clientY }];
				host.setPointerCapture(event.pointerId);
				return;
			}
			event.preventDefault();
			held = lift(id);
			// Carried along and above its own line across the bridge, so it can be dropped back
			// on the deck, or flung between a pylon's posts
			grab.set(new THREE.Vector3(0, 0, 1), -held.mesh.position.z);
			host.setPointerCapture(event.pointerId);
			host.style.cursor = 'grabbing';
			moved = performance.now();
			swing = [{ at: moved, p: held.mesh.position.clone() }];
		}

		function move(event: PointerEvent) {
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
			waft(held);
			held.mesh.rotation.z = THREE.MathUtils.clamp(-held.velocity.x * 0.004, -0.5, 0.5);
			moved = now;
		}

		function up() {
			sweeping = false;
			if (!held) return;
			// Held still before letting go: it drops rather than flies
			if (performance.now() - moved > 120) held.velocity.set(0, 0, 0);
			release(held);
			held = null;
			host.style.cursor = '';
		}

		// From the keyboard: a car from the middle of the view, over the railing towards you
		throwOne = () => {
			const choices: number[] = [];
			for (let i = 0; i < carCount; i++) {
				if (taken.has(i)) continue;
				onScreen.fromArray(carSpot, i * 3).project(camera);
				if (Math.abs(onScreen.x) < 0.6 && Math.abs(onScreen.y) < 0.8) choices.push(i);
			}
			const id = choices[Math.floor(Math.random() * choices.length)];
			if (id === undefined) return;
			const vehicle = lift(id);
			vehicle.velocity.set((Math.random() - 0.5) * 10, 14, 16 + Math.random() * 8);
			release(vehicle);
		};

		// A finger that lands on a vehicle picks it up, and the page holds still for the drag;
		// anywhere else, it scrolls as usual
		function touchstart(event: TouchEvent) {
			const touch = event.touches[0];
			if (event.touches.length !== 1 || !touch) return;
			if (
				nearest({ clientX: touch.clientX, clientY: touch.clientY, pointerType: 'touch' }) !== null
			) {
				event.preventDefault();
			}
		}

		host.addEventListener('touchstart', touchstart, { passive: false });
		host.addEventListener('pointerdown', down);
		host.addEventListener('pointermove', move);
		host.addEventListener('pointerup', up);
		host.addEventListener('pointercancel', up);

		// The light for the time of day in Penang, from the sun, or by night from the moon
		let palette = paletteAt(sunAt(now()));
		function light() {
			const sun = sunAt(now());
			palette = paletteAt(sun);
			skyLights(sun);
			const night = sun.elevation < 0;
			const elevation = Math.max(0.12, Math.abs(sun.elevation));
			const azimuth = night ? sun.azimuth + Math.PI : sun.azimuth;
			const direction = new THREE.Vector3(
				Math.sin(azimuth) * Math.cos(elevation),
				Math.sin(elevation),
				-Math.cos(azimuth) * Math.cos(elevation)
			);
			sunLight.position.copy(direction).multiplyScalar(2000);
			sunLight.color = color(palette.light);
			sunLight.intensity = palette.strength;
			skyLight.color = color(palette.ambient);
			skyLight.groundColor = color(palette.sea);
			skyLight.intensity = 0.4 + palette.strength * 0.25;

			(scene.fog as THREE.Fog).color = color(palette.horizon);
			// The sea takes the page's accent, which src/routes/+page.svelte sets for the time of day
			ink = getComputedStyle(host).getPropertyValue('--accent').trim() || ink;
			darkInk = new THREE.Color(ink).getHSL({ h: 0, s: 0, l: 0 }).l < 0.5;
			// Only the sun casts a shadow worth seeing
			sunward.copy(direction);
			shade = night ? 0 : Math.min(1, palette.strength / 1.2);
			shadeSea();

			// The bridge's lights come on as the sky darkens
			lamps.material.opacity = palette.lamps;
			headlights.material.opacity = palette.lamps;
			taillights.material.opacity = palette.lamps;
			bikeLights.material.opacity = bikeTails.material.opacity = palette.lamps;
			lampGlow.value.set(0xffe2b0).multiplyScalar(1.6 * palette.lamps);
			renderer.toneMappingExposure = night ? 1.1 : 0.9;
		}

		// The cables are white by day; at night they're strung with lights that drift in colour
		const led = new THREE.Color();
		const white = new THREE.Color(0xe8ecf4);
		const gold = new THREE.Color(0xffc21a);
		function cableLights(t: number) {
			const since = performance.now() / 1000 - cheering;
			for (let i = 0; i < cableAlong.length; i++) {
				const x = cableAlong[i]!;
				led.setHSL((((0.62 + 0.2 * Math.sin(x * 0.012 - t * 0.25)) % 1) + 1) % 1, 0.85, 0.6);
				led.lerp(white, 1 - palette.lamps);
				// After a field goal, every cable strobes gold and white for a few seconds: under three
				// flashes a second, the most that's safe for anyone sensitive to flashing
				if (since < 3) {
					const flash = still ? gold : Math.sin(since * 17 + x * 0.05) > 0 ? gold : white;
					led.copy(flash);
				}
				cableColors.set([led.r, led.g, led.b], i * 3);
			}
			(cableGeometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
		}

		// The bridge's canvas reaches up behind the header, so a car flung high can fly over the
		// page and through the words. It's drawn through a second camera that sees the same view as
		// the first, extended upwards; everything else works in the first camera's view
		const tall = new THREE.PerspectiveCamera();
		let above = 0;
		function resize() {
			const { clientWidth: w, clientHeight: h } = host;
			if (!w || !h) return;
			above = Math.min(800, Math.max(0, host.getBoundingClientRect().top + window.scrollY));
			renderer.setSize(w, h + above);
			canvas.style.top = `${-above}px`;
			canvas.style.setProperty('--fade', `${h * 0.15}px`);
			const ratio = Math.min(2, window.devicePixelRatio);
			ocean.width = w * ratio;
			ocean.height = h * ratio;
			ocean.style.width = `${w}px`;
			ocean.style.height = `${h}px`;
			sea.setTransform(ratio, 0, 0, ratio, 0, 0);
			// Plex Mono is 0.6em wide, so each character fills one cell
			sea.font = `${CELL_W / 0.6}px 'IBM Plex Mono', ui-monospace, monospace`;
			sea.textBaseline = 'middle';
			camera.aspect = w / h;
			// Narrow screens step back, to keep both pylons in view
			camera.fov = w / h < 1 ? 46 : 30;
			camera.updateProjectionMatrix();
			// Never rendered itself, so its place in the world is kept up to date here
			camera.updateMatrixWorld();
			measureSea();
			tall.copy(camera);
			tall.setViewOffset(w, h, 0, -above, w, h + above);
			reflect();
			measure();
		}
		const observer = new ResizeObserver(resize);
		observer.observe(host);
		observer.observe(document.querySelector('header') ?? host);
		document.fonts?.ready.then(resize);
		resize();
		light();

		let frame = 0;
		let previous = performance.now();
		let lit = previous;
		let clock = 0;
		function loop(now: number) {
			frame = requestAnimationFrame(loop);
			const dt = Math.min(0.1, (now - previous) / 1000);
			previous = now;
			if (now - lit > 60_000) {
				light();
				lit = now;
			}

			// With reduced motion the traffic holds still
			if (!still) clock += dt;
			traffic(clock);
			// The motorcycles never stop
			motorcycles(still ? 0 : dt * 9, clock);
			physics(dt, now / 1000);
			settle(dt);
			flutter(dt);
			cableLights(clock);
			beacons.material.opacity =
				still || Math.sin(clock * 3) > -0.3 || now / 1000 - cheering < 3 ? 1 : 0.15;
			if (!still) twinkle();
			drawSea(clock);
			renderer.render(scene, tall);
			if (!drawn) {
				drawn = true;
				shown = true;
				onready?.();
			}
		}
		let drawn = false;
		frame = requestAnimationFrame(loop);

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			phases.disconnect();
			host.removeEventListener('touchstart', touchstart);
			host.removeEventListener('pointerdown', down);
			host.removeEventListener('pointermove', move);
			host.removeEventListener('pointerup', up);
			host.removeEventListener('pointercancel', up);
			renderer.dispose();
			gust = flapping = 0;
			if (flag) flag.style.transform = '';
			for (const animation of flagAnimations) animation.updatePlaybackRate(1);
			stop();
			overlay.remove();
			smoke.dispose();
			pictured.dispose();
			wake.dispose();
			smokeMaterial.dispose();
			smokeQuad.geometry.dispose();
		};
	});
</script>

<div
	class="scene"
	class:shown
	bind:this={host}
	role="button"
	tabindex="0"
	aria-label="Throw a car off the Penang Bridge into the sea"
	onkeydown={keydown}
>
	<canvas class="ocean" bind:this={ocean}></canvas>
	<canvas class="bridge" bind:this={canvas}></canvas>
</div>

<style>
	.scene {
		position: relative;
		width: 100%;
		height: 100%;
		/* The page scrolls past the bridge; only a touch on a vehicle holds it still, to drag */
		touch-action: pan-y pinch-zoom;
		-webkit-tap-highlight-color: transparent;
	}

	.scene:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 3px;
	}

	.scene canvas {
		position: absolute;
		left: 0;
		top: 0;
		display: block;
		/* The page's links stay clickable under the bridge's canvas */
		pointer-events: none;
	}

	.scene:not(.shown) canvas {
		visibility: hidden;
	}

	/* Feathered on every side, so the sea melts into the page's sky */
	.ocean {
		mask-image:
			linear-gradient(to right, transparent, #000 10%, #000 90%, transparent),
			linear-gradient(to bottom, transparent, #000 10%, #000 85%, transparent);
		mask-composite: intersect;
	}

	/* Feathered at the sides and the foot; open at the top, where cars fly over the header */
	.bridge {
		mask-image:
			linear-gradient(to right, transparent, #000 10%, #000 90%, transparent),
			linear-gradient(to top, transparent, #000 var(--fade, 15%));
		mask-composite: intersect;
	}
</style>
