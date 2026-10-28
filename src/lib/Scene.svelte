<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { now, paletteAt, sunAt } from './sky.js';
	import { createBridge } from './scene/bridge.js';
	import { createEffects } from './scene/effects.js';
	import { createFlag } from './scene/flag.js';
	import { createHeavens } from './scene/heavens.js';
	import { createInput } from './scene/input.js';
	import { createSea } from './scene/sea.js';
	import { createSmoke } from './scene/smoke.js';
	import { createTraffic } from './scene/traffic.js';
	import { createVehicles } from './scene/vehicles.js';

	interface Props {
		reducedMotion: boolean;
		/** The page's header, which cars fly through as cloud; its `.flag` flaps in their gust */
		header?: HTMLElement;
		/** Called once the scene has drawn its first frame */
		onready?: () => void;
	}

	let { reducedMotion, header, onready }: Props = $props();

	// The canvases are hidden until the first frame is on them: some browsers paint a canvas
	// white for a moment before anything is drawn to it
	let shown = $state(false);

	let host: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let ocean: HTMLCanvasElement;
	// Throws a car off the bridge, for the keyboard; set up with the scene
	let throwOne = () => {};
	// Picks up, drags and lets go of a vehicle, for a pointer; set up with the scene
	let handle: { down(event: PointerEvent): void; move(event: PointerEvent): void; up(): void } = {
		down() {},
		move() {},
		up() {}
	};

	function keydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		throwOne();
	}

	const color = (rgb: number[]) =>
		new THREE.Color().setRGB(rgb[0]! / 255, rgb[1]! / 255, rgb[2]! / 255, THREE.SRGBColorSpace);

	// The Penang Bridge across the strait, at the time of day it is in Penang: see ./scene/
	onMount(() => {
		const reduced = () => reducedMotion;
		const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		// Vehicles in the sea are cut off at the waterline
		renderer.localClippingEnabled = true;

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

		// The bridge's canvas reaches up behind the header, so a car flung high can fly over the
		// page and through the words. It's drawn through a second camera that sees the same view as
		// the first, extended upwards; everything else works in the first camera's view
		const tall = new THREE.PerspectiveCamera();
		let above = 0;

		// The light for the time of day in Penang, from the sun, or by night from the moon
		let palette = paletteAt(sunAt(now()));

		const bridge = createBridge(scene);
		const traffic = createTraffic(scene, bridge);
		const heavens = createHeavens(scene, camera, bridge.glow);
		const sea = createSea(ocean, camera, bridge.lampHeads);
		const effects = createEffects(scene, bridge.glow);
		const cloth = header?.querySelector<HTMLElement>('.flag');
		const flag = cloth ? createFlag(cloth, reduced) : null;
		const smoke = header ? createSmoke(header, host, flag, reduced) : null;
		const vehicles = createVehicles({
			scene,
			camera,
			host,
			bridge,
			traffic,
			effects,
			sea,
			smoke,
			palette: () => palette,
			reduced,
			above: () => above
		});
		const input = createInput(host, camera, traffic, vehicles);
		handle = input;
		throwOne = input.throwOne;

		function light() {
			const sun = sunAt(now());
			palette = paletteAt(sun);
			heavens.light(sun, palette);
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
			// The sea takes the page's accent, which src/routes/+page.svelte sets for the time of
			// day, and only the sun casts a shadow worth seeing on it
			sea.light(
				direction,
				night ? 0 : Math.min(1, palette.strength / 1.2),
				getComputedStyle(host).getPropertyValue('--accent').trim()
			);

			// The bridge's lights come on as the sky darkens
			bridge.light(palette.lamps);
			traffic.light(palette.lamps);
			renderer.toneMappingExposure = night ? 1.1 : 0.9;
		}

		function resize() {
			const { clientWidth: w, clientHeight: h } = host;
			if (!w || !h) return;
			above = Math.min(800, Math.max(0, host.getBoundingClientRect().top + window.scrollY));
			renderer.setSize(w, h + above);
			canvas.style.top = `${-above}px`;
			canvas.style.setProperty('--fade', `${h * 0.15}px`);
			camera.aspect = w / h;
			// Narrow screens step back, to keep both pylons in view
			camera.fov = w / h < 1 ? 46 : 30;
			camera.updateProjectionMatrix();
			// Never rendered itself, so its place in the world is kept up to date here
			camera.updateMatrixWorld();
			sea.resize(w, h, Math.min(2, window.devicePixelRatio));
			tall.copy(camera);
			tall.setViewOffset(w, h, 0, -above, w, h + above);
			smoke?.measure();
		}
		const observer = new ResizeObserver(resize);
		observer.observe(host);
		observer.observe(header ?? host);
		document.fonts?.ready.then(resize);
		resize();
		light();

		let frame = 0;
		let previous = performance.now();
		let lit = previous;
		let clock = 0;
		let drawn = false;
		function loop(now: number) {
			frame = requestAnimationFrame(loop);
			const dt = Math.min(0.1, (now - previous) / 1000);
			previous = now;
			if (now - lit > 60_000) {
				light();
				lit = now;
			}

			// With reduced motion the traffic holds still, but the motorcycles never stop
			if (!reducedMotion) clock += dt;
			traffic.update(clock, reducedMotion ? 0 : dt * 9);
			effects.update(dt);
			vehicles.update(dt, now / 1000);
			smoke?.settle(dt);
			flag?.flutter(dt);
			bridge.update(clock, palette.lamps, vehicles.sinceGoal(), reducedMotion);
			if (!reducedMotion) heavens.twinkle();
			sea.draw(clock, palette.lamps);
			renderer.render(scene, tall);
			if (!drawn) {
				drawn = true;
				shown = true;
				onready?.();
			}
		}
		frame = requestAnimationFrame(loop);

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			input.dispose();
			renderer.dispose();
			flag?.dispose();
			smoke?.dispose();
		};
	});
</script>

<div
	class={['scene', { shown }]}
	bind:this={host}
	role="button"
	tabindex="0"
	aria-label="Throw a car off the Penang Bridge into the sea"
	onkeydown={keydown}
	onpointerdown={(event) => handle.down(event)}
	onpointermove={(event) => handle.move(event)}
	onpointerup={() => handle.up()}
	onpointercancel={() => handle.up()}
>
	<canvas class="ocean" bind:this={ocean}></canvas>
	<canvas class="bridge" bind:this={canvas}></canvas>
</div>

<style>
	.scene {
		position: relative;
		width: 100%;
		height: 100%;
		/* The page scrolls past the bridge; only a touch on the bridge holds it still, to swipe
		   or drag */
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
