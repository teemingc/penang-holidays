import * as THREE from 'three';
import { moonAt, now, type Palette, type Sun } from '../sky.js';
import { seeded } from './layout.js';

// How far off the sky is drawn
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

/**
 * The sky: the sun, the moon in its phase and stars after dark, each where it really is over
 * George Town right now; and Penang Hill on the island beneath it
 */
export function createHeavens(scene: THREE.Scene, camera: THREE.Camera, glow: THREE.Texture) {
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
	const random = seeded(3);
	const stars = [0, 1].map(() => {
		const positions: number[] = [];
		for (let i = 0; i < 700; i++) {
			const y = 0.04 + random() * 0.96;
			const a = random() * Math.PI * 2;
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

	return {
		/** Where the sun and moon are now, and how bright the moon and stars are against the sky */
		light(sun: Sun, palette: Palette) {
			skyward(sun.elevation, sun.azimuth, sunDisc.position)
				.multiplyScalar(SKY)
				.add(camera.position);
			sunDisc.visible = sun.elevation > -0.03;
			// Redder near the horizon
			const low = 1 - Math.min(1, Math.max(0, sun.elevation / 0.3));
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
		},

		twinkle() {
			stars[0]!.material.opacity = starlight * (0.75 + 0.25 * Math.sin(performance.now() / 700));
			stars[1]!.material.opacity = starlight * (0.75 + 0.25 * Math.cos(performance.now() / 900));
		}
	};
}
