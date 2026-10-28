import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
	DECK_DEPTH,
	DECK_HALF,
	LAMP_FIRST,
	LAMP_GAP,
	LEG_Z,
	PIER_GAP,
	PYLON_HEIGHT,
	PYLONS,
	REACH,
	SPIRE,
	deckY,
	seeded
} from './layout.js';

// Weathered concrete: a fine grain, blotches and stains, and streaks where the rain runs down
function concreteTexture() {
	const size = 256;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	const random = seeded(11);
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

// A soft round dot, for lights seen from afar
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

/** The bridge itself, its lamps and its cables, and what the rest of the scene shares with it */
export function createBridge(scene: THREE.Scene) {
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
	scene.add(
		new THREE.LineSegments(
			cableGeometry,
			new THREE.LineBasicMaterial({ vertexColors: true, transparent: true })
		)
	);

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

	// The cables are white by day; at night they're strung with lights that drift in colour
	const led = new THREE.Color();
	const white = new THREE.Color(0xe8ecf4);
	const gold = new THREE.Color(0xffc21a);

	return {
		glow,
		lampLit,
		lights,
		/** Where each lamp is, as x, y, z one after another */
		lampHeads,

		/** The bridge's lights, from off to full, as the sky darkens */
		light(level: number) {
			lamps.material.opacity = level;
			lampGlow.value.set(0xffe2b0).multiplyScalar(1.6 * level);
		},

		/** The cables at t, and the spires' beacons, `since` seconds after a field goal */
		update(t: number, level: number, since: number, reducedMotion: boolean) {
			for (let i = 0; i < cableAlong.length; i++) {
				const x = cableAlong[i]!;
				led.setHSL((((0.62 + 0.2 * Math.sin(x * 0.012 - t * 0.25)) % 1) + 1) % 1, 0.85, 0.6);
				led.lerp(white, 1 - level);
				// After a field goal, every cable strobes gold and white for a few seconds: under three
				// flashes a second, the most that's safe for anyone sensitive to flashing
				if (since < 3) {
					const flash = reducedMotion ? gold : Math.sin(since * 17 + x * 0.05) > 0 ? gold : white;
					led.copy(flash);
				}
				cableColors.set([led.r, led.g, led.b], i * 3);
			}
			(cableGeometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
			beacons.material.opacity = reducedMotion || Math.sin(t * 3) > -0.3 || since < 3 ? 1 : 0.15;
		}
	};
}

export type Bridge = ReturnType<typeof createBridge>;
