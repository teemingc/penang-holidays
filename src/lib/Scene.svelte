<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { m } from './paraglide/messages.js';
	import { now, paletteAt, shade, sunAt } from './sky.js';
	import { createBridge } from './scene/bridge.js';
	import { createEffects } from './scene/effects.js';
	import { createFlag } from './scene/flag.js';
	import { createHeavens } from './scene/heavens.js';
	import { createInput } from './scene/input.js';
	import { SKY_LAYER, createMask, createMist } from './scene/mist.js';
	import { createSea } from './scene/sea.js';
	import { createSmoke } from './scene/smoke.js';
	import { createTraffic } from './scene/traffic.js';
	import { createVehicles } from './scene/vehicles.js';

	interface Props {
		reducedMotion: boolean;
		/** The page's header, which cars fly through as cloud; its `.flag` flaps in their gust */
		header?: HTMLElement;
		/** The window the scene is seen through; the bridge's canvas reaches up to its top */
		pane?: HTMLElement;
		/** Called once the scene has drawn its first frame */
		onready?: () => void;
	}

	let { reducedMotion, header, pane, onready }: Props = $props();

	// The canvases are hidden until the first frame is on them, and then fade in as the still
	// fades out: some browsers paint a canvas white for a moment before anything is drawn to it
	let shown = $state(false);

	let host: HTMLButtonElement;
	let canvas: HTMLCanvasElement;
	let ocean: HTMLCanvasElement;
	let heaven: HTMLCanvasElement;
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

		// The light falls on the sky's things as well as the bridge
		const sunLight = new THREE.DirectionalLight(0xffffff, 1);
		sunLight.layers.enableAll();
		scene.add(sunLight, sunLight.target);
		const skyLight = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
		skyLight.layers.enableAll();
		scene.add(skyLight);

		// The bridge's canvas reaches up behind the header, so a car flung high can fly across the
		// window and through the words. It's drawn through a second camera that sees the same view as
		// the first, extended upwards; everything else works in the first camera's view
		const tall = new THREE.PerspectiveCamera();
		let above = 0;

		// The light for the time of day in Penang, from the sun, or by night from the moon
		let palette = paletteAt(sunAt(now()));

		const bridge = createBridge(scene);
		const traffic = createTraffic(scene, bridge);
		// The sky's things are drawn into the mist, on a canvas of their own beneath the sea
		const before = new Set(scene.children);
		const heavens = createHeavens(scene, camera, bridge.glow);
		for (const child of scene.children) {
			if (!before.has(child)) child.traverse((object) => object.layers.set(SKY_LAYER));
		}
		const mist = createMist(heaven, scene, tall, ocean);
		// And the bridge thins out into the same mist, but for the header above it
		const mask = createMask(renderer);
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
			mist.light(
				shade(palette.top, sun),
				shade(palette.horizon, sun),
				renderer.toneMappingExposure
			);
		}

		function resize() {
			const { clientWidth: w, clientHeight: h } = host;
			if (!w || !h) return;
			const top = pane ? pane.getBoundingClientRect().top : -window.scrollY;
			above = Math.min(800, Math.max(0, host.getBoundingClientRect().top - top));
			renderer.setSize(w, h + above);
			canvas.style.top = `${-above}px`;
			heaven.style.top = `${-above}px`;
			camera.aspect = w / h;
			// Narrow screens step back, to keep both pylons in view
			camera.fov = w / h < 1 ? 46 : 30;
			camera.updateProjectionMatrix();
			// Never rendered itself, so its place in the world is kept up to date here
			camera.updateMatrixWorld();
			sea.resize(w, h, Math.min(2, window.devicePixelRatio));
			tall.copy(camera);
			tall.setViewOffset(w, h, 0, -above, w, h + above);
			mist.resize(w, h + above, h, Math.min(2, window.devicePixelRatio));
			mask.resize(w, h + above, above / (h + above));
			smoke?.measure();
		}
		const observer = new ResizeObserver(resize);
		observer.observe(host);
		observer.observe(header ?? host);
		if (pane) observer.observe(pane);
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
			const drift = reducedMotion ? 0 : now / 1000;
			sea.draw(clock, palette.lamps);
			mist.draw(drift);
			renderer.render(scene, tall);
			mask.apply(drift);
			if (!drawn) {
				drawn = true;
				shown = true;
				onready?.();
			}
		}
		frame = requestAnimationFrame(loop);

		// Nothing is drawn while the sky and the bridge are scrolled out of sight, to spare the
		// battery; it picks up where it left off, without a jump, when they're back
		const sight = new IntersectionObserver(([entry]) => {
			cancelAnimationFrame(frame);
			if (!entry?.isIntersecting) return;
			previous = performance.now();
			frame = requestAnimationFrame(loop);
		});
		sight.observe(pane ?? host);

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			sight.disconnect();
			input.dispose();
			renderer.dispose();
			mist.dispose();
			mask.dispose();
			flag?.dispose();
			smoke?.dispose();
		};
	});
</script>

<!-- Its label is its own text, shown for a keyboard once it has focus -->
<button
	type="button"
	class={['scene', { shown }]}
	bind:this={host}
	onkeydown={keydown}
	onpointerdown={(event) => handle.down(event)}
	onpointermove={(event) => handle.move(event)}
	onpointerup={() => handle.up()}
	onpointercancel={() => handle.up()}
>
	<canvas class="heaven" bind:this={heaven}></canvas>
	<canvas class="ocean" bind:this={ocean}></canvas>
	<canvas class="bridge" bind:this={canvas}></canvas>
	<span class="label">{m.throw_car()}</span>
</button>

<style>
	.scene {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: inherit;
		/* The page scrolls past the bridge; only a touch on the bridge holds it still, to swipe
		   or drag */
		touch-action: pan-y pinch-zoom;
		-webkit-tap-highlight-color: transparent;
	}

	/* Inside its edges, since the window it's seen through clips anything past them */
	.scene:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: -0.75rem;
		border-radius: var(--radius);
	}

	.scene canvas {
		position: absolute;
		left: 0;
		top: 0;
		display: block;
		/* The page's links stay clickable under the bridge's canvas */
		pointer-events: none;
		transition: opacity 0.6s ease-in;
	}

	.scene:not(.shown) canvas {
		opacity: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.scene canvas {
			transition: none;
		}
	}

	/* Out of sight until the scene has keyboard focus, then along its foot */
	.label {
		position: absolute;
		left: 50%;
		bottom: 1.25rem;
		width: max-content;
		max-width: calc(100% - 3rem);
		padding: 0.25rem 0.75rem;
		border-radius: var(--radius);
		background: rgb(4 10 24 / 0.75);
		color: #f3f4f7;
		font-size: 0.875rem;
		line-height: 1.4;
		text-align: center;
		translate: -50% 0;
	}

	.scene:not(:focus-visible) .label {
		clip-path: inset(50%);
		width: 1px;
		height: 1px;
		overflow: hidden;
		white-space: nowrap;
	}

	/* The sky is behind everything on the page: it reaches up behind the title, and drawn over
	   the flag, which isn't lifted like the words are, its mist dimmed it */
	.scene .heaven {
		z-index: -1;
	}

	/* Never shown itself: it's drawn into the sky's canvas, into the mist */
	.scene .ocean {
		display: none;
	}
</style>
