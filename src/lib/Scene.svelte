<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import * as THREE from 'three';
	import { m } from './paraglide/messages.js';
	import {
		arcAt,
		choose,
		minutesAt,
		minutesOf,
		now,
		paletteAt,
		picked,
		shade,
		sunAt,
		todayAt,
		waterOf
	} from './sky.js';
	import { createBridge } from './scene/bridge.js';
	import { createEffects } from './scene/effects.js';
	import { createFlag } from './scene/flag.js';
	import { createHeavens } from './scene/heavens.js';
	import { createInput } from './scene/input.js';
	import { SKY_LAYER, createMist } from './scene/mist.js';
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
		/**
		 * Called whenever the sky changes, with the colour of the sky, from 0 to 255, `y` CSS
		 * pixels down the page, for the type over it
		 */
		onsky?: (colourAt: (y: number) => number[]) => void;
	}

	let { reducedMotion, header, pane, onready, onsky }: Props = $props();

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

	// The sun and moon, on their round of the sky, where they're shown on the scene, from its
	// top left, in CSS pixels, and how much of each is above the horizon, from 0 to 1
	let bodies = $state.raw({ sun: { x: 0, y: 0, shown: 0 }, moon: { x: 0, y: 0, shown: 0 } });
	// That round: an ellipse about the middle of the horizon, `line` down the scene
	let round = { cx: 0, rx: 1, ry: 1, line: 0 };
	// The time of day the sky shows, for a screen reader
	let minutes = $state(0);
	let time = $state('');
	// The sky lit for the time of day it shows, whenever that's picked; set up with the scene
	let onTime = () => {};
	// Which is being dragged
	let held = $state<'sun' | 'moon' | null>(null);
	// Moving the sun or moon round the sky moves the time of day, the sun opposite the moon.
	// Where it's held, around the round, carried on from where it was rather than wrapping; left
	// be when the pointer's near the middle, where the smallest move would swing it right round;
	// and swung at most so far a frame, so a pointer across the middle takes it smoothly round
	// rather than flicking it to the other side of the sky
	let angle = 0;
	function aim(body: 'sun' | 'moon', event: PointerEvent) {
		const box = host.getBoundingClientRect();
		const x = (round.cx - (event.clientX - box.left)) / round.rx;
		const y = (round.line - (event.clientY - box.top)) / round.ry;
		if (Math.hypot(x, y) < 0.25) return;
		let to = Math.atan2(y, x);
		while (to - angle > Math.PI) to -= Math.PI * 2;
		while (to - angle < -Math.PI) to += Math.PI * 2;
		angle += Math.max(-0.3, Math.min(0.3, to - angle));
		choose(todayAt(minutesAt(angle - (body === 'moon' ? Math.PI : 0))));
	}
	// Aimed once a frame, however often the pointer moves, at where it last was
	let aiming = 0;
	let latest: PointerEvent | null = null;
	function grab(body: 'sun' | 'moon', event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		held = body;
		angle = arcAt(minutesOf(now())) + (body === 'moon' ? Math.PI : 0);
		// The page's colours follow the sky at once, not over the seconds they take to turn
		// with the time of day
		document.documentElement.dataset.scrubbing = '';
		aim(body, event);
	}
	function drag(event: PointerEvent) {
		if (!held) return;
		latest = event;
		aiming ||= requestAnimationFrame(() => {
			aiming = 0;
			if (held && latest) aim(held, latest);
		});
	}
	function letGo() {
		if (!held) return;
		cancelAnimationFrame(aiming);
		aiming = 0;
		held = null;
		delete document.documentElement.dataset.scrubbing;
		// Lit again in full, the bridge's shadow on the sea worked out again and the page's type
		// set for the sky, once the frame that lets go is drawn
		const later = window.requestIdleCallback ?? ((then: () => void) => setTimeout(then, 50));
		later(() => dispatchEvent(new Event('skytime')));
	}
	// A quarter of an hour at a time from the keyboard, an hour with shift; Escape for now
	function nudge(event: KeyboardEvent) {
		const step = event.shiftKey ? 60 : 15;
		const by: Record<string, number> = {
			ArrowRight: step,
			ArrowUp: step,
			PageUp: 60,
			ArrowLeft: -step,
			ArrowDown: -step,
			PageDown: -60
		};
		if (event.key === 'Escape' && picked()) {
			event.preventDefault();
			choose(null);
		} else if (event.key in by) {
			event.preventDefault();
			choose(todayAt(Math.round(minutesOf(now()) / 15) * 15 + by[event.key]!));
		}
	}

	const color = (rgb: number[]) =>
		new THREE.Color().setRGB(rgb[0]! / 255, rgb[1]! / 255, rgb[2]! / 255, THREE.SRGBColorSpace);

	// Lit afresh after a navigation, which can change the time of day being previewed, so the
	// scene's sky never disagrees with the page's
	let relight = () => {};
	afterNavigate(() => relight());

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
		// The sky's canvas, and the sea drawn into it, reach further still, out to the sides of
		// the window, so their mist can thin out right at the edges of the screen, past the
		// page's margins
		const wide = new THREE.PerspectiveCamera();
		const broad = new THREE.PerspectiveCamera();

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
		// Only the sky and the sea mist out: the bridge already fades into the distance by
		// the scene's fog, and misting it too hid it on wide screens
		const mist = createMist(heaven, scene, wide, ocean);
		const sea = createSea(ocean, broad, bridge.lampHeads);
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

		// The sun on its round of the sky, at the time of day the sky shows: an ellipse about the
		// middle of the horizon, its top half the day, rising at its left and setting at its
		// right, and its bottom half the night, behind the horizon, with the moon opposite. Not
		// where the sun really is, often behind the camera, but where it can be seen and moved.
		// The sky is warmest around it, with a path of gold across the water when it's low
		let sunNow = sunAt(now());
		let across = 1;
		let left = 0;
		let deep = 1;
		let line = 0;
		const RADIUS = 24;
		function placeSun() {
			const { clientWidth: w } = host;
			round = {
				cx: w / 2,
				rx: Math.min(w * 0.42, 560),
				// rising as high as it can without going behind the title and the languages
				ry: Math.max(
					48,
					line -
						((header?.getBoundingClientRect().bottom ?? 0) - host.getBoundingClientRect().top) -
						RADIUS -
						12
				),
				line
			};
			const angle = arcAt(minutesOf(now()));
			const at = (a: number) => {
				const x = round.cx - round.rx * Math.cos(a);
				const y = line - round.ry * Math.sin(a);
				// Going down behind the horizon
				const t = Math.min(1, Math.max(0, (line - y + RADIUS) / (RADIUS * 1.6)));
				return { x, y, shown: t * t * (3 - 2 * t) };
			};
			const [sun, moon] = [at(angle), at(angle + Math.PI)];
			const towards = ({ x, y }: { x: number; y: number }) =>
				new THREE.Vector3(((x + left) / across) * 2 - 1, 1 - ((y + above) / deep) * 2, 0.5)
					.unproject(wide)
					.sub(wide.position)
					.normalize();
			heavens.place(towards(sun), sun.shown, towards(moon), moon.shown);
			bodies = { sun, moon };
			minutes = Math.round(minutesOf(now()));
			time = new Intl.DateTimeFormat(document.documentElement.lang || 'en', {
				hour: 'numeric',
				minute: '2-digit',
				timeZone: 'Asia/Kuala_Lumpur'
			}).format(now());
			const warmth = Math.max(0, 1 - Math.abs(sunNow.elevation) / ((12 * Math.PI) / 180));
			const low = angle <= Math.PI ? (1 - Math.sin(angle)) ** 2 : 0;
			// The horizon glows less after dark, and never white: by full night, only a faint
			// haze low over the strait
			const dark = Math.min(1, Math.max(0, -sunNow.elevation / ((8 * Math.PI) / 180)));
			mist.sun((sun.x + left) / across, warmth, sun.shown * low, 1 - 0.8 * dark);
			// down the page, from the top of the sky's canvas, measured the once
			const top = heaven.getBoundingClientRect().top + scrollY;
			onsky?.((y) => mist.colourAt(y - top));
		}

		// Lit for the time of day the sky shows; `quick`, while the sun's being dragged, without
		// working out the bridge's shadow on the sea again
		function light(quick = false) {
			const sun = sunAt(now());
			sunNow = sun;
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
			// Through twilight, with the sun low and the horizon glowing behind it, the bridge is a
			// silhouette against the sky: less lit by the sun, in the cool light of the sky overhead
			// rather than the warm light of the horizon, the nearer the sun is to it
			const twilight = Math.max(0, 1 - Math.abs(sun.elevation) / ((12 * Math.PI) / 180));
			const overhead = shade(palette.top, sun);
			sunLight.position.copy(direction).multiplyScalar(2000);
			sunLight.color = color(palette.light);
			sunLight.intensity = palette.strength * (1 - 0.6 * twilight);
			skyLight.color = color(
				palette.ambient.map((c, i) => c + (overhead[i]! - c) * 0.7 * twilight)
			);
			skyLight.groundColor = color(palette.sea);
			skyLight.intensity = 0.4 + palette.strength * 0.25;

			(scene.fog as THREE.Fog).color = color(palette.horizon);
			// The sea takes the page's accent, which src/routes/+page.svelte sets for the time of
			// day, and only the sun casts a shadow worth seeing on it
			if (!quick)
				sea.light(
					direction,
					night ? 0 : Math.min(1, palette.strength / 1.2),
					getComputedStyle(host).getPropertyValue('--accent').trim()
				);

			// The bridge's lights come on as the sky darkens
			bridge.light(palette.lamps);
			traffic.light(palette.lamps);
			traffic.at(minutesOf(now()));
			const exposure = night ? 1.1 : 0.9;
			renderer.toneMappingExposure = exposure * (1 - 0.3 * twilight);
			// The top is the page's own, shaded through twilight as it is, so the mist melts into
			// it; the rest is the scene's own, in all its colour, as the type is set for it
			mist.light(
				{
					top: overhead,
					mid: palette.mid,
					horizon: palette.horizon,
					sea: waterOf(palette, sun.elevation)
				},
				exposure
			);
			placeSun();
		}

		// Drawn once more after a resize, which clears the canvases, if they aren't being drawn
		// anyway: the sky's reaches down the whole page, so it's in sight with the bridge long gone
		let repaint = () => {};

		function resize() {
			const { clientWidth: w, clientHeight: h } = host;
			if (!w || !h) return;
			const top = pane ? pane.getBoundingClientRect().top : -window.scrollY;
			above = Math.min(800, Math.max(0, host.getBoundingClientRect().top - top));
			renderer.setSize(w, h + above);
			canvas.style.top = `${-above}px`;
			heaven.style.top = `${-above}px`;
			const box = host.getBoundingClientRect();
			left = box.left;
			across = document.documentElement.clientWidth;
			heaven.style.left = `${-left}px`;
			camera.aspect = w / h;
			// Narrow screens step back, to keep both pylons in view
			camera.fov = w / h < 1 ? 46 : 30;
			camera.updateProjectionMatrix();
			// Never rendered itself, so its place in the world is kept up to date here
			camera.updateMatrixWorld();
			tall.copy(camera);
			tall.setViewOffset(w, h, 0, -above, w, h + above);
			broad.copy(camera);
			broad.setViewOffset(w, h, -left, 0, across, h);
			sea.resize(across, h, Math.min(2, window.devicePixelRatio), left);
			// And down to the foot of the page, its horizon's colour running on behind everything
			// below the bridge. Measured to the body, which the canvas itself doesn't stretch
			const under = Math.max(0, document.body.getBoundingClientRect().bottom - box.bottom);
			deep = h + above + under;
			wide.copy(camera);
			wide.setViewOffset(w, h, -left, -above, across, deep);
			// Kept within what any browser will draw a canvas as tall as
			const ratio = Math.min(2, window.devicePixelRatio, 8192 / deep);
			// Where the sea meets the sky: a point on the water far off in the direction the camera
			// looks, on screen
			const ahead = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
			const far = camera.position.clone().addScaledVector(ahead, 15000).setY(0).project(camera);
			line = ((1 - far.y) / 2) * h;
			mist.resize(across, deep, above, h, ratio, above + line);
			placeSun();
			smoke?.measure();
			repaint();
		}
		const observer = new ResizeObserver(resize);
		observer.observe(host);
		observer.observe(header ?? host);
		if (pane) observer.observe(pane);
		// The window, which the sky's canvas spans, can widen without the page past its widest
		observer.observe(document.documentElement);
		// And the page can grow longer, holidays gone by shown, without the scene changing
		observer.observe(document.body);
		document.fonts?.ready.then(resize);
		resize();
		light();
		relight = light;
		// The time of day picked, or put back to now: lit at once, quickly while it's dragged,
		// and how fast it's going by, in minutes a second, for the traffic
		let lapse = 1;
		let pace = 0;
		let sped = 0;
		let lastMinutes = minutesOf(now());
		onTime = () => {
			const at = performance.now();
			const m = minutesOf(now());
			const by = Math.abs(((m - lastMinutes + 2160) % 1440) - 720);
			if (held && at > sped) pace = (by * 1000) / Math.max(16, at - sped);
			[lastMinutes, sped] = [m, at];
			light(held !== null);
		};

		let frame = 0;
		let previous = performance.now();
		let lit = previous;
		let clock = 0;
		let drawn = false;
		let drift = 0;
		let looping = true;
		function paint() {
			sea.draw(clock, palette.lamps);
			mist.draw(drift);
			renderer.render(scene, tall);
		}
		function loop(now: number) {
			frame = requestAnimationFrame(loop);
			const dt = Math.min(0.1, (now - previous) / 1000);
			previous = now;
			if (now - lit > 60_000) {
				light();
				lit = now;
			}

			// With reduced motion the traffic holds still, but the motorcycles never stop
			// Sped up, like a time lapse, while the sun's dragged round the sky: as fast as the
			// time of day's going by, up to sixteen times, and easing back once it stops
			const hurry = held && now - sped < 150 ? 1 + Math.min(15, pace / 6) : 1;
			lapse += (hurry - lapse) * (1 - Math.exp(-dt * 6));
			if (!reducedMotion) clock += dt * lapse;
			traffic.update(clock, reducedMotion ? 0 : dt * 9 * lapse);
			effects.update(dt);
			vehicles.update(dt, now / 1000);
			smoke?.settle(dt);
			flag?.flutter(dt);
			bridge.update(clock, palette.lamps, vehicles.sinceGoal(), reducedMotion);
			if (!reducedMotion) heavens.twinkle();
			drift = reducedMotion ? 0 : now / 1000;
			paint();
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
			looping = !!entry?.isIntersecting;
			if (!looping) return;
			previous = performance.now();
			frame = requestAnimationFrame(loop);
		});
		sight.observe(pane ?? host);
		repaint = () => {
			if (!looping) requestAnimationFrame(paint);
		};

		return () => {
			cancelAnimationFrame(frame);
			onTime = () => {};
			observer.disconnect();
			sight.disconnect();
			input.dispose();
			renderer.dispose();
			mist.dispose();
			flag?.dispose();
			smoke?.dispose();
		};
	});
</script>

<!-- Its label is its own text, shown for a keyboard once it has focus -->
<!-- The time of day picked, or put back to now -->
<svelte:window onskytime={() => onTime()} />

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

<!-- The sun and the moon, each moved round the sky to move the time of day, by pointer or
     with the arrow keys, and Escape for now -->
{#if shown}
	{#each ['sun', 'moon'] as const as body (body)}
		{@const at = bodies[body]}
		<div
			class={['body', { up: at.shown > 0.3, held: held === body }]}
			role="slider"
			tabindex={at.shown > 0.3 ? 0 : -1}
			aria-label={body === 'sun' ? m.sky_sun() : m.sky_moon()}
			aria-valuemin={0}
			aria-valuemax={1439}
			aria-valuenow={minutes}
			aria-valuetext={time}
			style:translate="calc({at.x}px - 50%) calc({at.y}px - 50%)"
			onpointerdown={(event) => grab(body, event)}
			onpointermove={drag}
			onpointerup={letGo}
			onpointercancel={letGo}
			onkeydown={nudge}
		></div>
	{/each}
{/if}

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
		/* Most of the way in at once, as the still over the bridge fades out just as fast, so the
		   bridge never dims between the two */
		transition: opacity 0.6s cubic-bezier(0.19, 1, 0.22, 1);
	}

	.scene:not(.shown) canvas {
		opacity: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.scene canvas {
			transition: none;
		}
	}

	/* Over the sun and the moon, to take hold of them by; only there while they're up */
	.body {
		position: absolute;
		/* Moved from the scene's top left to be centred on the sun or the moon, without laying
		   anything out again as it's dragged */
		left: 0;
		top: 0;
		/* in front of the title, which it can rise behind */
		z-index: 2;
		width: 3.5rem;
		height: 3.5rem;
		border-radius: var(--round);
		cursor: grab;
		touch-action: none;
		visibility: hidden;
	}

	.body.up {
		visibility: visible;
	}

	.body.held {
		cursor: grabbing;
	}

	.body:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 2px;
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

	/* The bridge isn't misted, which hid it on wide screens: it fades into the distance by the
	   scene's fog, and only where it runs off the canvas, at the sides and the foot, is it
	   eased out, so it has no hard edge */
	.scene .bridge {
		mask-image:
			linear-gradient(to right, transparent, #000 6%, #000 94%, transparent),
			linear-gradient(to top, transparent, #000 12%);
		mask-composite: intersect;
	}

	/* Never shown itself: it's drawn into the sky's canvas, into the mist */
	.scene .ocean {
		display: none;
	}
</style>
