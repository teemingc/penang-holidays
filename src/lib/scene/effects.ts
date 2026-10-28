import * as THREE from 'three';

// Spent drops and sparks are parked behind the camera, where nothing is drawn
const PARKED = [0, 0, 100_000];
const DROPS = 600;
const SPARKS = 3000;
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

/** The splashes where things go into the sea, and fireworks for a field goal */
export function createEffects(scene: THREE.Scene, glow: THREE.Texture) {
	// The splash: droplets thrown up and out, falling back to the water
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
			// Evenly about a sphere, opening wide
			const u = Math.random() * 2 - 1;
			const a = Math.random() * Math.PI * 2;
			const speed = 46 + Math.random() * 12;
			const r = Math.sqrt(1 - u * u);
			spark(
				x,
				y,
				z,
				[Math.cos(a) * r * speed, u * speed * 0.8 + 4, Math.sin(a) * r * speed],
				tint,
				1.6 + Math.random() * 0.7
			);
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

	return {
		/** Droplets thrown up from the water where something's gone in, as hard as `strength` */
		spray(at: THREE.Vector3, strength: number, count = 120, height = 0.3) {
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
		},

		/** Shells going up from the water all around the pylon at x, a few at a time */
		celebrate(x: number) {
			for (let k = 0; k < 12; k++) {
				shells.push({
					at: seconds() + k * 0.22 + Math.random() * 0.15,
					x: x + (Math.random() - 0.5) * 340,
					y: 0,
					z: -60 + Math.random() * 90,
					rise: 62 + Math.random() * 26,
					drift: (Math.random() - 0.5) * 8,
					tint: FIREWORK[Math.floor(Math.random() * FIREWORK.length)]!,
					launched: false
				});
			}
		},

		update(dt: number) {
			droplets(dt);
			fireworks(dt);
		}
	};
}

export type Effects = ReturnType<typeof createEffects>;
