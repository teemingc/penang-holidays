<script lang="ts">
	// The fonts are linked from the head rather than imported, so they're registered once: an
	// imported stylesheet is swapped for another as the page hydrates in development, and the
	// text flashes in its fallback font while they load again
	import fonts from '#lib/fonts.css?url';
	// The Latin files every page uses, fetched alongside the stylesheets instead of after them
	import newsreader from '@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2?url';
	import schibsted from '@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2?url';
	import plex400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url';
	import plex600 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2?url';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { MediaQuery } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import type { Path } from '$app/types';
	import Request from '#lib/Request.svelte';
	import flag from '#lib/assets/penang-flag.svg';
	import dawn from '#lib/assets/bridge/dawn.webp';
	import day from '#lib/assets/bridge/day.webp';
	import dusk from '#lib/assets/bridge/dusk.webp';
	import night from '#lib/assets/bridge/night.webp';
	// The page at dusk, for when it's shared; drawn by scripts/og.html
	import og from '#lib/assets/og.png';
	import { getPage } from '#lib/holidays.remote.js';
	import { TAGS } from '#lib/languages.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, locales, localizeHref } from '#lib/paraglide/runtime.js';
	import { SOURCE_URL } from '#lib/source.js';
	import { currentYear, now, paletteAt, phaseOf, shade, sunAt } from '#lib/sky.js';

	const language = $derived(getLocale());

	const data = $derived(await getPage(language));

	const reducedMotion = new MediaQuery('prefers-reduced-motion: reduce');

	// Where the API lives
	const ORIGIN = 'https://penang-holidays.teemingc.workers.dev';

	// each language in its own name for the switcher
	const NAMES = { en: 'English', ms: 'Melayu' };

	// How many strips the little flag in the headline is cut into, to wave
	const STRIPS = 24;

	// The year to request: the one the page was built in, then the one it's opened in
	let opened = $state<number>();
	onMount(() => (opened = currentYear(now(), data.years)));
	const year = $derived(opened ?? data.year);

	// english is the default so it needs no ?lang=
	const path = $derived(
		resolve('/[year]', { year: String(year) }) + (language === 'en' ? '' : `?lang=${language}`)
	);

	// Whether the scene has drawn its first frame, to take the place of its snapshot
	let ready = $state(false);

	// Where cars fly through the words, handed to the scene
	let header = $state<HTMLElement>();

	$effect(() => {
		document.documentElement.lang = TAGS[language];
	});

	// only the named parts are captured so the scene and the request stay live
	// names are set only during a switch since a name puts the words behind the canvas
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		const root = document.documentElement;
		root.classList.add('switching');
		return new Promise((resolve) => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
			transition.finished.finally(() => root.classList.remove('switching'));
		});
	});

	const rgb = ([r, g, b]: number[]) => `rgb(${Math.round(r!)} ${Math.round(g!)} ${Math.round(b!)})`;

	// The page's colours follow the time of day in Penang: set before the first paint by
	// src/app.html, and kept up to date here. The type changes colour with the phase of the
	// day, while the sky behind it blends across twilight, just as the scene's does
	onMount(() => {
		const update = () => {
			const sun = sunAt(now());
			const root = document.documentElement;
			const phase = phaseOf(sun);
			root.dataset.sky = phase;
			const { top, horizon } = paletteAt(sun);
			root.style.setProperty('--top', rgb(shade(top, phase)));
			root.style.setProperty('--horizon', rgb(shade(horizon, phase)));
			document
				.querySelector('meta[name="theme-color"]')
				?.setAttribute('content', rgb(shade(top, phase)));
		};
		update();
		const timer = setInterval(update, 60_000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head>
	<title>{m.title()}</title>
	{#each [newsreader, schibsted, plex400, plex600] as font (font)}
		<link rel="preload" href={font} as="font" type="font/woff2" crossorigin="anonymous" />
	{/each}
	<link rel="stylesheet" href={fonts} />
	<meta name="description" content={m.description()} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={ORIGIN + localizeHref('/')} />
	<meta property="og:title" content={m.heading_lead() + m.heading_last()} />
	<meta property="og:description" content={m.description()} />
	<!-- the image is in english whatever the language of the page -->
	<meta property="og:image" content={new URL(og, ORIGIN).href} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta
		property="og:image:alt"
		content="Every Penang holiday, over the Penang Bridge at dusk, with the Penang flag"
	/>
	<meta name="twitter:card" content="summary_large_image" />
	<!-- each language version for search engines -->
	<link rel="canonical" href={ORIGIN + localizeHref('/')} />
	{#each locales as locale (locale)}
		<link rel="alternate" hreflang={TAGS[locale]} href={ORIGIN + localizeHref('/', { locale })} />
	{/each}
	<link rel="alternate" hreflang="x-default" href={ORIGIN + '/'} />
</svelte:head>

<div class="page">
	<header bind:this={header}>
		<!-- no whitespace between spans, the messages hold their own spaces since chinese has none -->
		<h1>
			<span class="words">{m.heading_lead()}</span><span class="last"
				><span class="words">{m.heading_last()}</span>
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
			{m.sourced_from()}<a href={SOURCE_URL} rel="external">penang.gov.my</a>{m.sourced_end()}
		</p>
	</header>

	<div class="scene">
		<!-- three.js is most of the page's weight, so the scene loads after everything else -->
		{#await import('#lib/Scene.svelte') then { default: Scene }}
			<Scene reducedMotion={reducedMotion.current} {header} onready={() => (ready = true)} />
		{/await}
		<!-- A still of the scene at each time of day, shown until three.js has loaded and drawn it -->
		<div
			class={['still', { ready }]}
			aria-hidden="true"
			style:--dawn={`url("${dawn}")`}
			style:--day={`url("${day}")`}
			style:--dusk={`url("${dusk}")`}
			style:--night={`url("${night}")`}
		></div>
	</div>

	<section class="request" aria-label={m.try_api()}>
		<Request
			{language}
			{path}
			url={ORIGIN + path}
			previewHeaders={data.previewHeaders}
			reducedMotion={reducedMotion.current}
		/>
	</section>

	<footer class="foot">
		<!-- client navigation keeps the scene running and the scroll position -->
		<nav class="languages" aria-label={m.languages()}>
			{#each locales as locale (locale)}
				<a
					href={resolve(localizeHref('/', { locale }) as Path)}
					hreflang={TAGS[locale]}
					lang={TAGS[locale]}
					aria-current={locale === language ? 'page' : undefined}
					data-sveltekit-noscroll
					>{NAMES[locale]}{#if locale === language}<span class="chosen" aria-hidden="true"
						></span>{/if}</a
				>
			{/each}
		</nav>
		<!-- icon only so switching language does not shift the links beside it -->
		<a
			class="github"
			href="https://github.com/teemingc/penang-holidays"
			aria-label="Source on GitHub"
			title="Source on GitHub"
		>
			<svg viewBox="0 0 16 16" aria-hidden="true"
				><path
					d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"
				/></svg
			>
		</a>
	</footer>
</div>

<style>
	/* The sky over Penang right now: night, dawn, day or dusk. The sky's own colours here are
	   only for a page without scripts, which is always night: otherwise --top and --horizon are
	   blended from src/lib/sky.ts, as the scene's sky is, so the two meet without a seam */
	:global(:root) {
		--top: rgb(5 8 20);
		--horizon: rgb(22 32 66);
		--ink: #f3f4f7;
		--ink-soft: rgb(243 244 247 / 0.7);
		--accent: #6fd0ff;
		/* chinese serif fallback, the page fonts have no chinese */
		--serif-cjk: 'Songti SC', 'Noto Serif CJK SC', 'Noto Serif SC', 'SimSun';
		color-scheme: dark;
	}

	:global(:root[data-sky='dawn']) {
		--accent: #ffd2b8;
		--ink-soft: rgb(243 244 247 / 0.8);
	}

	:global(:root[data-sky='day']) {
		--ink: #0b1d36;
		--ink-soft: rgb(11 29 54 / 0.85);
		--accent: #063f73;
		color-scheme: light;
	}

	:global(:root[data-sky='dusk']) {
		--accent: #ffc58f;
		--ink-soft: rgb(243 244 247 / 0.8);
	}

	/* The solid colour is what a browser tints its bars with, and shows past the ends of the
	   page. It's the root's, so the body's sky can go beneath the body */
	:global(:root) {
		background: var(--top);
	}

	:global(body) {
		min-height: 100dvh;
		background: none;
		color: var(--ink);
		font-family: 'Schibsted Grotesk Variable', system-ui, sans-serif;
	}

	/* The sky, fixed to the screen however far the page scrolls: Safari on iOS ignores a fixed
	   background, and would stretch it down the whole page instead, so it's a layer of its own */
	:global(body::before) {
		content: '';
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 100lvh;
		z-index: -1;
		/* Under Safari's bar it isn't drawn, and the page's own colour shows instead, the
		   horizon, so it's the horizon by the top of the bar */
		background: linear-gradient(var(--top), var(--horizon) 100svh);
	}

	/* On a phone held upright, Safari shows the page's own colour under its bars, past the
	   sky, and tints them with it, so it's the foot of the sky. Nothing is fixed along either
	   edge: Safari paints anything there as a solid band over the page, instead of letting the
	   page scroll beneath its bars. On its side, there's no bar at the foot, and the page's
	   colour is the top of the sky */
	@media (max-width: 900px) and (orientation: portrait) {
		:global(:root) {
			background: var(--horizon);
		}
	}

	/* On its side, as Safari's bar slides away the screen grows, and the sky is moved to fill
	   it a moment late, leaving the page's colour, the top of the sky, in a dark strip at the
	   foot. With no bar at the foot to paint it as a band, the sky can reach past both edges
	   of the screen, in its own colours, to cover whatever's uncovered */
	@media (orientation: landscape) and (max-height: 500px) {
		:global(body::before) {
			top: -50lvh;
			height: 200lvh;
			background: linear-gradient(var(--top) 25%, var(--horizon) 75%);
		}
	}

	/* A bigger screen on its side, like a folding phone's, has Safari's bars down a side and
	   along the foot. Safari fills them with the page's own colour, solid, never the sky's
	   gradient, so it's the horizon, which the foot of the sky meets */
	@media (orientation: landscape) and (pointer: coarse) and (min-height: 501px) {
		:global(:root) {
			background: var(--horizon);
		}
	}

	.page {
		/* How far below the top of its area the request starts */
		--drop: clamp(0.5rem, 9vh, 6rem);
		/* The page reaches every edge of the screen (viewport-fit=cover in src/app.html), so
		   the gutters widen to keep the words clear of a notch or the corners of a phone on its
		   side; what bleeds to the edges, bleeds by as much */
		--gutter: 2.5rem;
		--left: max(var(--gutter), env(safe-area-inset-left));
		--right: max(var(--gutter), env(safe-area-inset-right));
		--bottom: max(1.5rem, env(safe-area-inset-bottom));
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(20rem, 26rem);
		grid-template-rows: auto minmax(0, 1fr) auto;
		grid-template-areas:
			'header header'
			'scene request'
			'. github';
		column-gap: 3rem;
		height: 100dvh;
		padding: 2.5rem var(--right) var(--bottom) var(--left);
		box-sizing: border-box;
		overflow: hidden;
	}

	/* The header itself isn't lifted, so the bridge's canvas, which comes after it, is drawn
	   over the flag: a car flung up there passes in front of it */
	header {
		grid-area: header;
	}

	/* The words are in front of the sky: clouds, and anything flung up there, pass behind them */
	.words,
	header p {
		position: relative;
		z-index: 1;
	}

	h1 {
		margin: 0;
		font-family: 'Newsreader Variable', Georgia, var(--serif-cjk), serif;
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
		/* A gust from a passing car leans it from the hoist; see Scene.svelte */
		transform-origin: left center;
		/* It can be flicked, too */
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
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

	/* Against a bright sky, a soft shadow lifts it off the page: cast by the cloth as it is, so
	   it waves with it. The filter is applied by the compositor, over the strips as they turn */
	:global(:root[data-sky='day']) .flag {
		filter: drop-shadow(0 0.05em 0.05em rgb(11 29 54 / 0.35));
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
		font-family: 'Newsreader Variable', Georgia, var(--serif-cjk), serif;
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
		margin: 0.5rem calc(-1 * var(--right)) 0 calc(-1 * var(--left));
		position: relative;
		/* Sized by the page, never by what's in it, so the still can follow its shape */
		container-type: size;
	}

	/* Framed as the scene is: its camera's field of view is set by the height, so the still is
	   fitted to the height and cropped at the sides, which are feathered just as the scene's are */
	.still {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: var(--night) center / auto 100% no-repeat;
		mask-image: linear-gradient(to right, transparent, #000 10%, #000 90%, transparent);
		transition: opacity 0.6s ease-out;
	}

	:global(:root[data-sky='dawn']) .still {
		background-image: var(--dawn);
	}

	:global(:root[data-sky='day']) .still {
		background-image: var(--day);
	}

	:global(:root[data-sky='dusk']) .still {
		background-image: var(--dusk);
	}

	/* Taller than it's wide, the scene's camera steps back from a 30° to a 46° field of view
	   (src/lib/Scene.svelte), so the bridge shrinks by tan(15°) / tan(23°) about the middle */
	@container (aspect-ratio < 1) {
		.still {
			background-size: auto 63.1%;
		}
	}

	.still.ready {
		opacity: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.still {
			transition: none;
		}
	}

	/* Level with the bridge, and filling the rest of the column so the response has room
	   without the page moving */
	.request {
		grid-area: request;
		display: flex;
		min-width: 0;
		min-height: 0;
		padding-top: var(--drop);
	}

	.foot {
		grid-area: github;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem 1.75rem;
		padding-top: 1rem;
		/* In the serif of the line under the title, which it answers */
		font-family: 'Newsreader Variable', Georgia, var(--serif-cjk), serif;
		font-weight: 450;
		font-size: 1.0625rem;
	}

	.foot a {
		color: var(--ink-soft);
		text-decoration: none;
	}

	/* Small, so it takes the full ink in the evening shade */
	:global(:root:is([data-sky='dawn'], [data-sky='dusk'])) .foot a {
		color: var(--ink);
	}

	.foot a:hover {
		color: var(--ink);
	}

	.languages {
		display: flex;
		gap: 1rem;
	}

	.languages a {
		position: relative;
		transition: color 0.2s ease;
	}

	/* a separate line so it can move to the next chosen language */
	.languages [aria-current='page'] {
		color: var(--ink);
	}

	.chosen {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0.05em;
		height: 1px;
		background: currentColor;
	}

	/* named only during a language switch, see onNavigate */
	:global(:root.switching) {
		view-transition-name: none;
	}

	:global(:root.switching) h1 {
		view-transition-name: heading;
	}

	:global(:root.switching) header p {
		view-transition-name: sourced;
	}

	:global(:root.switching) .flag {
		view-transition-name: flag;
	}

	:global(:root.switching) .chosen {
		view-transition-name: chosen;
	}

	/* let clicks through the view transition overlay */
	:global(::view-transition) {
		pointer-events: none;
	}

	/* old and new words keep their own size from the line start instead of stretching */
	:global(::view-transition-old(heading)),
	:global(::view-transition-new(heading)),
	:global(::view-transition-old(sourced)),
	:global(::view-transition-new(sourced)) {
		inline-size: auto;
		block-size: auto;
	}

	:global(::view-transition-old(heading)),
	:global(::view-transition-old(sourced)) {
		animation: words-out 150ms cubic-bezier(0.19, 1, 0.22, 1) both;
	}

	:global(::view-transition-new(heading)),
	:global(::view-transition-new(sourced)) {
		animation: words-in 240ms cubic-bezier(0.19, 1, 0.22, 1) both;
	}

	@keyframes -global-words-out {
		to {
			opacity: 0;
			filter: blur(2px);
		}
	}

	@keyframes -global-words-in {
		from {
			opacity: 0;
			filter: blur(2px);
			transform: translateY(4px);
		}
	}

	:global(::view-transition-group(flag)),
	:global(::view-transition-group(chosen)) {
		animation-duration: 250ms;
		animation-timing-function: cubic-bezier(0.645, 0.045, 0.355, 1);
	}

	/* reduced motion only fades the words */
	@media (prefers-reduced-motion: reduce) {
		:global(::view-transition-old(heading)),
		:global(::view-transition-old(sourced)) {
			animation: fade-out 150ms ease both;
		}

		:global(::view-transition-new(heading)),
		:global(::view-transition-new(sourced)) {
			animation: fade-in 200ms ease both;
		}

		:global(::view-transition-group(flag)),
		:global(::view-transition-group(chosen)) {
			animation-duration: 0s;
		}
	}

	@keyframes -global-fade-out {
		to {
			opacity: 0;
		}
	}

	@keyframes -global-fade-in {
		from {
			opacity: 0;
		}
	}

	.github {
		display: flex;
	}

	.github svg {
		width: 1.125rem;
		height: 1.125rem;
		fill: currentColor;
	}

	/* Narrow, the page is stacked, except on a phone on its side, which keeps the columns */
	@media (max-width: 900px) and (orientation: portrait),
		(max-width: 900px) and (min-height: 501px) {
		.page {
			grid-template-columns: minmax(0, 1fr);
			/* The link sits at the foot of the screen, however short the page */
			grid-template-rows: auto auto auto 1fr;
			grid-template-areas: 'header' 'scene' 'request' 'github';
			height: auto;
			min-height: 100dvh;
			overflow: visible;
			--gutter: 1.5rem;
			padding-top: 2.75rem;
		}

		.scene {
			height: 75vw;
			max-height: 30rem;
			margin: 1.5rem calc(-1 * var(--right)) 1.5rem calc(-1 * var(--left));
		}

		.page {
			--drop: 0px;
		}

		/* Wider than a phone, the words keep to a column in the middle as wide as the title,
		   so the request isn't left against one side with the screen empty beside it; the
		   bridge still runs edge to edge */
		header,
		.request,
		.foot {
			justify-self: center;
			width: 100%;
			max-width: 32rem;
		}

		/* Hung from the same edge as everything above it */
		.foot {
			align-self: end;
			justify-content: flex-start;
			padding-top: 1.5rem;
		}
	}

	/* A phone on its side is as short as a letterbox, so rather than squeeze into it, the page
	   scrolls: the request takes a column as tall as its docs, and the title sits over the
	   bridge in the other. The bridge fills the rest of the first screen and no more, about
	   7rem under the title, however long the docs make the page: stretched to their height, it
	   would draw a sea as tall as the page. The languages and the link to the code wait under
	   the docs, where they do on a wider screen */
	@media (orientation: landscape) and (max-height: 500px) {
		.page {
			grid-template-columns: minmax(0, 1fr) 21rem;
			grid-template-rows: auto max(60svh, 100svh - 7rem) 1fr auto;
			grid-template-areas:
				'header request'
				'scene request'
				'. request'
				'. github';
			column-gap: 2rem;
			--gutter: 1.5rem;
			--drop: 0px;
			height: auto;
			min-height: 100dvh;
			overflow: visible;
			padding-top: 1.25rem;
		}

		/* The title is sized to keep to one line across its column, about 11.6em with the
		   flag, and to the height of the screen, which is what's short */
		header {
			container-type: inline-size;
		}

		/* It sits on the same baseline as the request beside it: in Newsreader the baseline
		   is 0.78em down its line, and in the request's IBM Plex Mono, at the size set in
		   src/lib/Request.svelte, 0.975em down */
		h1 {
			margin-top: calc(0.975 * clamp(1.5rem, 2.3vw, 2rem) - 0.78em);
			font-size: clamp(1.75rem, min(10svh, 100cqi / 11.6), 2.75rem);
		}

		header p {
			margin-top: 0.5rem;
			font-size: clamp(1.0625rem, 5svh, 1.25rem);
		}

		/* Clear of the request beside it, which the feathered edge leads into */
		.scene {
			margin: 0.5rem 0 0 calc(-1 * var(--left));
		}
	}
</style>
