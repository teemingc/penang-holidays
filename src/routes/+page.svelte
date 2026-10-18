<script lang="ts">
	import '@fontsource-variable/newsreader';
	import '@fontsource-variable/schibsted-grotesk';
	import '@fontsource/ibm-plex-mono/400.css';
	import '@fontsource/ibm-plex-mono/600.css';
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import Request from '#lib/Request.svelte';
	import flag from '#lib/assets/penang-flag.svg';
	import { now, paletteAt, phaseOf, sunAt } from '#lib/sky.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const reducedMotion = new MediaQuery('prefers-reduced-motion: reduce');

	// Where the API lives
	const ORIGIN = 'https://penang-holidays.teemingc.workers.dev';

	// How many strips the little flag in the headline is cut into, to wave
	const STRIPS = 24;

	const path = $derived(
		resolve('/[year]/[month]', { year: String(data.year), month: String(data.month) })
	);

	const rgb = ([r, g, b]: number[]) => `rgb(${Math.round(r!)} ${Math.round(g!)} ${Math.round(b!)})`;

	// The page's colours follow the time of day in Penang: set before the first paint by
	// src/app.html, and kept up to date here. The type changes colour with the phase of the
	// day, while the sky behind it blends across twilight, just as the scene's does
	onMount(() => {
		const update = () => {
			const sun = sunAt(now());
			const root = document.documentElement;
			root.dataset.sky = phaseOf(sun);
			const { top, horizon } = paletteAt(sun);
			root.style.setProperty('--top', rgb(top));
			root.style.setProperty('--horizon', rgb(horizon));
		};
		update();
		const timer = setInterval(update, 60_000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head>
	<title>Penang Holidays API</title>
	<meta
		name="description"
		content="Penang public holidays from the state government portal, as a free JSON API."
	/>
</svelte:head>

<div class="page">
	<header>
		<h1>
			Every Penang <span class="last"
				>holiday
				<!-- A little Penang flag, waving: vertical strips of it swing in perspective one after
			     another, so a ripple runs from the hoist to the fly -->
				<span class="flag" aria-hidden="true" style:--flag={`url("${flag}")`}>
					{#each { length: STRIPS }, i (i)}
						<span class="strip" style:--i={i}></span>
					{/each}
				</span></span
			>
		</h1>
		<p>
			Free JSON, straight from <a
				href="https://www.penang.gov.my/index.php/component/sppagebuilder/page/50">penang.gov.my</a
			>.
		</p>
	</header>

	<div class="scene">
		<!-- three.js is most of the page's weight, so the scene loads after everything else -->
		{#await import('#lib/Scene.svelte') then { default: Scene }}
			<Scene reducedMotion={reducedMotion.current} />
		{/await}
	</div>

	<section class="request" aria-label="Try the API">
		<Request
			{path}
			url={`${ORIGIN}/${data.year}/${data.month}`}
			preview={data.preview}
			reducedMotion={reducedMotion.current}
		/>
	</section>

	<a class="github" href="https://github.com/teemingc/penang-holidays">
		<svg viewBox="0 0 16 16" aria-hidden="true"
			><path
				d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"
			/></svg
		>
		Source on GitHub
	</a>
</div>

<style>
	/* The sky over Penang right now: night, dawn, day or dusk. The sky's own colours here are
	   only for a page without scripts: otherwise --top and --horizon are blended from
	   src/lib/sky.ts, as the scene's sky is, so the two meet without a seam */
	:global(:root) {
		--top: rgb(5 8 20);
		--horizon: rgb(22 32 66);
		--ink: #f3f4f7;
		--ink-soft: rgb(243 244 247 / 0.7);
		--accent: #6fd0ff;
		--button: #0a72c2;
		color-scheme: dark;
	}

	:global(:root[data-sky='dawn']) {
		--top: rgb(52 66 128);
		--horizon: rgb(246 172 150);
		--accent: #ffd2b8;
	}

	:global(:root[data-sky='day']) {
		--top: rgb(92 160 226);
		--horizon: rgb(206 230 246);
		--ink: #0b1d36;
		--ink-soft: rgb(11 29 54 / 0.72);
		--accent: #0a5fb0;
		color-scheme: light;
	}

	:global(:root[data-sky='dusk']) {
		--top: rgb(38 40 98);
		--horizon: rgb(244 140 82);
		--accent: #ffc58f;
		--button: #c2410c;
	}

	:global(body) {
		min-height: 100dvh;
		background: linear-gradient(var(--top), var(--horizon)) fixed;
		color: var(--ink);
		font-family: 'Schibsted Grotesk Variable', system-ui, sans-serif;
	}

	.page {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(20rem, 26rem);
		grid-template-rows: auto minmax(0, 1fr) auto;
		grid-template-areas:
			'header header'
			'scene request'
			'. github';
		column-gap: 3rem;
		height: 100dvh;
		padding: 2.5rem 2.5rem 1.5rem;
		box-sizing: border-box;
		overflow: hidden;
	}

	/* In front of the sky: clouds, and anything flung up there, pass behind the words */
	header {
		position: relative;
		z-index: 1;
		grid-area: header;
	}

	h1 {
		margin: 0;
		font-family: 'Newsreader Variable', Georgia, serif;
		font-weight: 600;
		font-size: clamp(2.75rem, 5vw, 5.25rem);
		line-height: 1.08;
		letter-spacing: -0.005em;
		color: var(--ink);
	}

	/* The flag never wraps onto a line of its own */
	.last {
		white-space: nowrap;
	}

	/* Sits on the baseline like a capital letter, a little shorter than the cap height. Each
	   strip shows its own slice of the flag, and swings a moment after the one before it */
	.flag {
		--width: 1.3em;
		position: relative;
		display: inline-flex;
		width: var(--width);
		height: 0.65em;
		margin: 0 0 0 0.22em;
		perspective: 1.5em;
		vertical-align: -0.02em;
	}

	/* Everything here animates only transform and opacity, which the browser can do without
	   repainting: the flag's look is in its backgrounds, and the light and shade of each fold
	   is a dark layer over it that fades in and out */
	.strip {
		position: relative;
		flex: 1;
		/* Cloth: the grain of the fabric, shade along the hems, and the flag itself */
		background:
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9 0.55' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.35 0 0 0 0 0.35 0.7 0 0 0 -0.2'/%3E%3C/filter%3E%3Crect width='48' height='48' filter='url(%23n)'/%3E%3C/svg%3E")
				calc(var(--i) * var(--width) / -24) 0 / 24px,
			linear-gradient(rgb(0 0 0 / 0.06), transparent 30%, transparent 70%, rgb(0 0 0 / 0.1)),
			var(--flag) calc(var(--i) * var(--width) / -24) 0 / var(--width) 100% no-repeat;
		transform-origin: left center;
		animation: wave 2.4s ease-in-out infinite;
		animation-delay: calc(var(--i) * -0.07s);
		/* The strips overlap by a pixel, so no seams show as they turn */
		margin-right: -1px;
	}

	.strip::after {
		content: '';
		position: absolute;
		inset: 0;
		background: #000;
		border-radius: inherit;
		animation: fold 2.4s ease-in-out infinite;
		animation-delay: inherit;
	}

	.strip:first-child {
		border-radius: 0.05em 0 0 0.05em;
	}

	.strip:last-child {
		border-radius: 0 0.05em 0.05em 0;
	}

	/* Against a bright sky, a soft shadow lifts it off the page: drawn once, behind it */
	.flag::before {
		content: '';
		position: absolute;
		inset: 0.04em 0.02em -0.03em;
		border-radius: 0.06em;
		box-shadow: 0 0.05em 0.1em rgb(11 29 54 / 0.35);
		opacity: 0;
	}

	:global(:root[data-sky='day']) .flag::before {
		opacity: 1;
	}

	@keyframes wave {
		0%,
		100% {
			transform: translateY(-0.03em) rotateY(-14deg);
		}
		50% {
			transform: translateY(0.03em) rotateY(14deg);
		}
	}

	@keyframes fold {
		0%,
		100% {
			opacity: 0;
		}
		50% {
			opacity: 0.1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.strip,
		.strip::after {
			animation: none;
		}
	}

	header p {
		margin: 1rem 0 0;
		font-family: 'Newsreader Variable', Georgia, serif;
		font-weight: 450;
		font-size: clamp(1.375rem, 2.1vw, 1.875rem);
		line-height: 1.4;
		letter-spacing: 0.005em;
		color: var(--ink-soft);
	}

	a {
		color: inherit;
		text-underline-offset: 0.18em;
		text-decoration-thickness: 1px;
	}

	a:hover {
		text-decoration-thickness: 2px;
	}

	header a {
		color: var(--ink);
	}

	:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}

	.scene {
		grid-area: scene;
		min-height: 0;
		margin: 0.5rem -2.5rem 0;
	}

	/* Level with the bridge, and filling the rest of the column so the response has room
	   without the page moving */
	.request {
		grid-area: request;
		display: flex;
		min-width: 0;
		min-height: 0;
		padding-top: clamp(0.5rem, 9vh, 6rem);
	}

	.github {
		grid-area: github;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
		padding-top: 1rem;
		font-size: 0.875rem;
		color: var(--ink-soft);
		text-decoration: none;
	}

	.github:hover {
		color: var(--ink);
	}

	.github svg {
		width: 1rem;
		height: 1rem;
		fill: currentColor;
	}

	@media (max-width: 900px) {
		.page {
			grid-template-columns: minmax(0, 1fr);
			/* The link sits at the foot of the screen, however short the page */
			grid-template-rows: auto auto auto 1fr;
			grid-template-areas: 'header' 'scene' 'request' 'github';
			height: auto;
			min-height: 100dvh;
			overflow: visible;
			padding: 2.75rem 1.5rem 1.5rem;
		}

		.scene {
			height: 75vw;
			max-height: 30rem;
			margin: 1.5rem -1.5rem 1.5rem;
		}

		.request {
			padding-top: 0;
		}

		.github {
			align-self: end;
			justify-content: center;
			padding-top: 1.5rem;
		}
	}
</style>
