<script lang="ts">
	// The fonts are linked from the head rather than imported, so they're registered once: an
	// imported stylesheet is swapped for another as the page hydrates in development, and the
	// text flashes in its fallback font while they load again
	import fonts from '#lib/fonts.css?url';
	// The Latin files every page uses, fetched alongside the stylesheets instead of after them
	import newsreader from '@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2?url';
	import plex400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url';
	import plex600 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2?url';
	import { onMount, tick } from 'svelte';
	import { afterNavigate, onNavigate } from '$app/navigation';
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
	import { paintSky, tint } from '#lib/backdrop.js';
	import { getPage } from '#lib/holidays.remote.js';
	import { TAGS } from '#lib/languages.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, locales, localizeHref } from '#lib/paraglide/runtime.js';
	import { SCHOOL_SOURCE_URL, SOURCE_URL } from '#lib/source.js';
	import { currentYear, inksAcross, now, penangDate, sunAt } from '#lib/sky.js';

	const language = $derived(getLocale());

	const data = $derived(await getPage(language));

	const reducedMotion = new MediaQuery('prefers-reduced-motion: reduce');

	// Where the API lives
	const ORIGIN = 'https://penang-holidays.teemingc.workers.dev';

	// How many strips the little flag in the title is cut into, to wave
	const STRIPS = 24;

	// each language named in the page's own, for the switcher in the title
	const LANGUAGE_NAMES = { en: m.language_en, ms: m.language_ms };

	// The year shown and requested: the one the page was built in, then the one it's opened in,
	// then whichever is picked
	let opened = $state<number>();
	let picked = $state<number>();
	// Today in Penang, once the page is open, to leave out what's passed and mark what's next
	let today = $state<string>();
	onMount(() => {
		opened = currentYear(now(), data.years);
		today = penangDate(now());
	});
	const year = $derived(picked ?? opened ?? data.year);
	// This year and any after it, to pick from: a year that's begun since the page was built
	// leaves the last behind
	const years = $derived(data.years.filter((y) => y >= (opened ?? data.year)));

	// english is the default so it needs no ?lang=
	const path = $derived(
		resolve('/[year]', { year: String(year) }) + (language === 'en' ? '' : `?lang=${language}`)
	);

	// The year's holidays by month, the next one marked. The ones gone by are hidden until
	// asked for, from the first paint, by a style src/app.html writes for the day it is, so the
	// list never shrinks once the page knows the day itself
	// The school holidays are shown with them but set apart, and counted as none of this: they
	// aren't days off work.
	// A holiday has no id of its own and two can fall on one date, so each is known by its date
	// and which of that date's it is: the same in every language, so a switch changes its words
	// in place
	const everything = $derived.by(() => {
		const holidays = data.holidays[year] ?? [];
		return holidays.map((h, i) => ({
			...h,
			id: `${h.date}.${holidays.slice(0, i).filter((o) => o.date === h.date).length}`
		}));
	});
	const all = $derived(everything.filter((h) => h.type !== 'school'));
	let showEarlier = $state(false);
	const monthName = $derived(
		new Intl.DateTimeFormat(TAGS[language], { month: 'long', timeZone: 'UTC' })
	);
	const months = $derived.by(() => {
		const next = today ? all.find((h) => h.date >= today!)?.date : undefined;
		const tag = TAGS[language];
		const weekday = new Intl.DateTimeFormat(tag, { weekday: 'long', timeZone: 'UTC' });
		const relative = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' });
		// A school holiday's days: Monday, 16 Feb for one, and 21 – 29 Mar for a run of them
		const one = new Intl.DateTimeFormat(tag, {
			weekday: 'long',
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC'
		});
		const run = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', timeZone: 'UTC' });
		const rows = everything.map((h) => {
			const date = new Date(`${h.date}T00:00:00Z`);
			const days = today ? Math.round((+date - +new Date(`${today}T00:00:00Z`)) / 864e5) : 0;
			const school = h.type === 'school';
			// A school holiday is gone once its last day is
			const last = h.endDate ?? h.date;
			return {
				...h,
				school,
				last,
				day: date.getUTCDate(),
				weekday: weekday.format(date),
				days: h.endDate ? run.formatRange(date, new Date(`${last}T00:00:00Z`)) : one.format(date),
				passed: today ? last < today : false,
				next: !school && h.date === next,
				until: relative.format(days, 'day')
			};
		});
		// Each is under its month, and one that runs into other months is under those too, at
		// their head: the months of this year it has days in, so one that began the year before,
		// as the school holiday over the new year does, starts under January
		const within = (month: string) => (month < `${year}-01` ? `${year}-01` : month.slice(0, 7));
		const placed = rows.flatMap((row) => {
			const first = within(row.date);
			const final = row.last > `${year}-12-31` ? `${year}-12` : row.last.slice(0, 7);
			const count = Number(final.slice(5)) - Number(first.slice(5)) + 1;
			return Array.from({ length: count }, (_, i) => ({
				key: `${year}-${String(Number(first.slice(5)) + i).padStart(2, '0')}`,
				// the ones running on from an earlier month come before the month's own
				order: i === 0 && first === row.date.slice(0, 7) ? row.date : '',
				row
			}));
		});
		placed.sort((a, b) => a.key.localeCompare(b.key) || a.order.localeCompare(b.order));
		return [...Map.groupBy(placed, ({ key }) => key)].map(([key, holidays]) => ({
			key,
			name: monthName.format(new Date(`${key}-01T00:00:00Z`)),
			holidays: holidays.map(({ row }) => row)
		}));
	});

	// The ones gone by, folded into one place in the table: a tally for each of them, of it and
	// all before it, of which src/app.html shows the one that ends at the last gone by
	const tallies = $derived.by(() => {
		const first = all[0] && monthName.format(new Date(`${all[0].date}T00:00:00Z`));
		return all.map((h, i) => {
			const last = monthName.format(new Date(`${h.date}T00:00:00Z`));
			return {
				id: h.id,
				date: h.date,
				next: all[i + 1]?.date,
				range: first === last ? last : `${first}–${last}`,
				count: i === 0 ? m.holiday_one() : m.holidays_count({ count: i + 1 })
			};
		});
	});

	// Whether the scene has drawn its first frame, to take the place of its snapshot
	let ready = $state(false);

	// The title, which cars flung off the bridge fly through as cloud, handed to the scene
	let masthead = $state<HTMLElement>();
	// The sky the bridge is in, which its canvas reaches up to the top of
	let pane = $state<HTMLElement>();
	// Only looked up when something happens, as the languages below are, so neither is state
	let almanac: HTMLElement | undefined;

	$effect(() => {
		document.documentElement.lang = TAGS[language];
	});

	let languages: HTMLElement | undefined;

	// A time of day being previewed, `?time=21:30`, carried over to the other language. Only
	// read in the browser, as the page is prerendered
	let preview = $state('');
	onMount(() => {
		const time = new URL(location.href).searchParams.get('time');
		if (time) preview = `?${new URLSearchParams({ time })}`;
	});

	// A switch of language animates the elements themselves, not a view transition: Safari
	// lays its snapshots out a little off when the page is scrolled or its bars move, so the
	// real words jerked into place as they took over at the end. The new words fade in where
	// they are, through a slight blur, and the underline glides from the old language to the new
	const fadeTiming = () => ({
		duration: reducedMotion.current ? 200 : 240,
		easing: 'cubic-bezier(0.19, 1, 0.22, 1)'
	});
	// With reduced motion, the words only fade
	function fadeIn(words: Iterable<Element>) {
		const frames = reducedMotion.current
			? { opacity: [0, 1] }
			: { opacity: [0, 1], filter: ['blur(2px)', 'blur(0)'] };
		for (const el of words) el.animate(frames, fadeTiming());
	}
	// Another year's holidays take the place of this one's the same way
	async function pick(y: number) {
		if (y === year) return;
		picked = y;
		await tick();
		fadeIn(almanac?.querySelectorAll('h3, time, .name, .when, .note') ?? []);
	}
	let switchedFrom: typeof language | undefined;
	onNavigate(({ from, to }) => {
		// each language is its own path, / or /ms
		if (from?.url.pathname === to?.url.pathname) return;
		switchedFrom = language;
	});
	afterNavigate(() => {
		const old = switchedFrom;
		switchedFrom = undefined;
		if (!old) return;
		const words = [
			// The title's words, not the title: a filter on it would gather them, lifted in front
			// of the sky's canvas, back behind it until it ends, and flatten the flag
			...(masthead?.querySelectorAll('h1 .words') ?? []),
			...(almanac?.querySelectorAll('h2, h3, .name, .when, .note') ?? []),
			...document.querySelectorAll('.request .copy, .request .send, .foot > *')
		];
		// The language line holds the underline, which has to stay in sight as it glides, so its
		// words fade by their colour alone
		const line = languages?.querySelectorAll('.languages > span, .languages a') ?? [];
		for (const el of line) el.animate([{ color: 'transparent' }, {}], fadeTiming());
		fadeIn(words);
		if (reducedMotion.current) return;
		// From the old language's name, where the new sentence has put it
		const underline = languages?.querySelector('.chosen');
		const before = languages?.querySelector(`a[hreflang="${TAGS[old]}"]`);
		if (!underline || !before) return;
		const from = before.getBoundingClientRect();
		const to = underline.getBoundingClientRect();
		underline.animate(
			{
				transform: [`translateX(${from.left - to.left}px) scaleX(${from.width / to.width})`, 'none']
			},
			{ duration: 250, easing: 'cubic-bezier(0.645, 0.045, 0.355, 1)' }
		);
	});

	const rgb = ([r, g, b]: number[]) => `rgb(${Math.round(r!)} ${Math.round(g!)} ${Math.round(b!)})`;

	// Each part of the page in type legible against the stretch of sky behind it, once the
	// scene has drawn the sky and can say what colour it is at each height; until then, the
	// page's own type, set for the top of the sky, which is all there is
	let skyColour: ((y: number) => number[]) | undefined;
	// Where each part is down the page, measured afresh but for while the sun's dragged, when
	// nothing moves and the type is set again every frame
	let parts: { el: HTMLElement; from: number; to: number }[] = [];
	function measure() {
		const grid = almanac?.getBoundingClientRect();
		parts = [...document.querySelectorAll<HTMLElement>('.masthead, .almanac, .request, .foot')].map(
			(el) => {
				let { top: from, bottom: to } = el.getBoundingClientRect();
				// The request is held in view beside the holidays, so it's over any of their sky
				if (el.classList.contains('request') && grid) {
					from = Math.min(from, grid.top);
					to = Math.max(to, grid.bottom);
				}
				return { el, from: from + scrollY, to: to + scrollY };
			}
		);
	}
	// Set once a frame at most, however many times the sky changes in it
	let inking = 0;
	const inkBySection = () => {
		inking ||= requestAnimationFrame(() => {
			inking = 0;
			if (!skyColour) return;
			if (document.documentElement.dataset.scrubbing === undefined || !parts.length) measure();
			for (const { el, from, to } of parts) {
				const inks = inksAcross(
					[from, (from + to) / 2, to].map((y) => skyColour!(y) as [number, number, number])
				);
				el.style.setProperty('--ink', rgb(inks.ink));
				el.style.setProperty('--ink-soft', rgb(inks.soft));
				el.style.setProperty('--ink-faint', rgb(inks.faint));
				el.style.setProperty('--accent', rgb(inks.accent));
				el.style.color = 'var(--ink)';
			}
		});
	};

	// Kept up with the sky when the sun's moved round it; set up once the page is
	let onSkytime = () => {};

	// The sky follows the time of day in Penang: set before the first paint by src/lib/boot.ts,
	// and kept up to date here, blended across twilight just as the scene's is. The sea around
	// it deepens with the sky, one solid colour at every edge, and the browser's bars with it
	onMount(() => {
		const update = () => {
			const sun = sunAt(now());
			const root = document.documentElement;
			const { top, palette } = tint(sun);
			// Not while the sun's dragged round the sky, when the scene's own sky covers all but
			// the strip above it, which is left the plain top of the sky, as it keeps up
			if (root.dataset.scrubbing === undefined) paintSky(top, palette, sun.elevation);
			else root.style.backgroundImage = 'none';
			inkBySection();
		};

		// src/lib/boot.ts has painted the sky until now
		window.skyWatch.disconnect();
		update();
		const timer = setInterval(update, 60_000);
		const observer = new ResizeObserver(update);
		observer.observe(document.body);
		// and at once, when the sun's moved round the sky to another time of day
		onSkytime = update;
		return () => {
			clearInterval(timer);
			observer.disconnect();
			onSkytime = () => {};
		};
	});
</script>

<svelte:window onskytime={() => onSkytime()} />

<svelte:head>
	<title>{m.title()}</title>
	{#each [newsreader, plex400, plex600] as font (font)}
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
	<!-- Where the sky over Penang is, behind the title and the bridge: the scene draws it -->
	<div class="sky" aria-hidden="true" bind:this={pane}></div>

	<header class="masthead" bind:this={masthead}>
		<!-- Under the title, the languages the holidays are named in are the switcher itself: each name links to
		     the page in that language. Client navigation without a reset keeps the scene
		     running, the scroll position and focus. No whitespace between the parts, the
		     messages hold their own spaces since chinese has none -->
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
		<p class="languages" bind:this={languages}>
			<span>{m.languages_in()}</span>{#each locales as locale, i (locale)}{#if i > 0}<span
						>{m.languages_and()}</span
					>{/if}<!-- resolved, with only the time being previewed after it --><!-- eslint-disable-next-line svelte/no-navigation-without-resolve --><a
					href={resolve(localizeHref('/', { locale }) as Path) + preview}
					hreflang={TAGS[locale]}
					aria-current={locale === language ? 'page' : undefined}
					data-sveltekit-reset="false"
					>{LANGUAGE_NAMES[locale]()}{#if locale === language}<span
							class="chosen"
							aria-hidden="true"
						></span>{/if}</a
				>{/each}
		</p>
	</header>

	<!-- The bridge, with the sun, moon and stars in the sky above it. Cars flung off it fly up
	     through the title and the flag -->
	<div class="plate">
		<!-- three.js is most of the page's weight, so the scene loads after everything else -->
		{#await import('#lib/Scene.svelte') then { default: Scene }}
			<Scene
				reducedMotion={reducedMotion.current}
				header={masthead}
				{pane}
				onready={() => (ready = true)}
				onsky={(colourAt) => {
					skyColour = colourAt;
					inkBySection();
				}}
			/>
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

	<section class="almanac" aria-labelledby="almanac-heading" bind:this={almanac}>
		<!-- The heading's sentence is finished by the year, or with next year's holidays out, by
		     the year picked, which shows its holidays and is the year the request asks for -->
		<div class="years">
			{#if years.length > 1}
				<h2 id="almanac-heading">{m.holidays_in()}</h2>
				{#each years as y (y)}
					<button aria-pressed={y === year} onclick={() => pick(y)}>{y}</button>
				{/each}
			{:else}
				<h2 id="almanac-heading">{m.holidays_in()} <span class="year">{year}</span></h2>
			{/if}
		</div>

		<div class={['months', { all: showEarlier }]}>
			<!-- The holidays gone by, folded into the table's first place, but there to look back on -->
			<div class="fold">
				{#each tallies as tally (tally.id)}
					<div class="tally" data-date={tally.date} data-next={tally.next}>
						<h3>{tally.range}</h3>
						<p>{tally.count}</p>
					</div>
				{/each}
				<button
					class="earlier"
					aria-expanded={showEarlier}
					onclick={() => (showEarlier = !showEarlier)}
					>{showEarlier ? m.hide_earlier() : m.show_earlier()}</button
				>
			</div>
			{#each months as month (month.key)}
				<div class="month">
					<h3>{month.name}</h3>
					<ol>
						{#each month.holidays as holiday (holiday.id)}
							{#if holiday.school}
								<!-- Not a day off work, so it's set small, without the day that leads the others.
								     It's gone, to the style that hides those, once its last day is -->
								<li class={['school', { passed: holiday.passed }]} data-date={holiday.last}>
									<span class="name">{holiday.name}</span>
									<span class="when">{holiday.days}</span>
								</li>
							{:else}
								<li class={{ passed: holiday.passed, next: holiday.next }} data-date={holiday.date}>
									<time datetime={holiday.date}>{holiday.day}</time>
									<span class="name">{holiday.name}{holiday.tentative ? ' *' : ''}</span>
									<span class="when"
										>{holiday.weekday}{#if holiday.next}, {holiday.until}{/if}</span
									>
								</li>
							{/if}
						{/each}
					</ol>
				</div>
			{/each}
		</div>

		<!-- Shown by the same style, once every one of them is gone -->
		<p class="note over">{m.holidays_over()}</p>
	</section>

	<!-- The request speaks for itself, so it has no heading of its own -->
	<section class="request">
		<Request
			{language}
			{path}
			url={ORIGIN + path}
			previewHeaders={data.previewHeaders}
			reducedMotion={reducedMotion.current}
		/>
	</section>

	<footer class="foot">
		<p>
			{m.sourced_from()}<a href={SOURCE_URL} rel="external">penang.gov.my</a>{m.sourced_and()}<a
				href={SCHOOL_SOURCE_URL}
				rel="external">moe.gov.my</a
			>{m.sourced_end()}
		</p>
		<a class="github" href="https://github.com/teemingc/penang-holidays">
			<svg viewBox="0 0 16 16" aria-hidden="true"
				><path
					d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"
				/></svg
			>{m.source_on_github()}
		</a>
	</footer>
</div>

<style>
	/* The page is the top of the sky, one solid colour at every edge of the screen. A browser
	   that fills its bars, or the sides of a folding phone, with the page's colour fills them
	   with this, so they always match. It's set for the time of day by src/app.html and below;
	   here, the night's, for a page without scripts. The flag's yellow marks only what's
	   chosen or next */
	:global(:root) {
		/* The type, for a page without scripts: otherwise set for the sky by src/lib/sky.ts's
		   inksFor, light or dark, and never too faint to read against it */
		--ink: #f4f8fb;
		--ink-soft: rgb(244 248 251 / 0.74);
		--ink-faint: rgb(244 248 251 / 0.54);
		--accent: #f6cf4f;
		/* The sky's colours for a page without scripts, always night: otherwise blended from
		   src/lib/sky.ts, as the scene's sky is, so the two meet without a seam */
		--top: rgb(5 8 20);
		--horizon: rgb(22 32 66);
		/* The corners of everything boxed: one for boxes and keys, round for the years */
		--radius: 0.375rem;
		--round: 999px;
		--serif:
			'Newsreader Variable', Georgia, 'Songti SC', 'Noto Serif CJK SC', 'Noto Serif SC', serif;
		color-scheme: dark;
		background: var(--top);
		transition: background-color 4s ease;
	}

	/* While the sun's dragged round the sky, the page's colours keep up with it */
	:global(:root[data-scrubbing]),
	:global(:root[data-scrubbing] body) {
		transition: none;
	}

	/* Dark type on a bright sky */
	:global(:root[data-ink='dark']) {
		color-scheme: light;
	}

	:global(body) {
		color: var(--ink);
		/* Turning dark for the day as slowly as the sky turns light */
		transition: color 4s ease;
		font-family: var(--serif);
		font-variant-numeric: tabular-nums;
	}

	.page {
		/* The ground around everything, widened past a notch or the corners of a phone on its
		   side, which viewport-fit=cover in src/app.html lets the ground itself reach under */
		--gutter: clamp(1.25rem, 4vw, 3.5rem);
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(20rem, 26rem);
		grid-template-areas:
			'masthead masthead'
			'plate plate'
			'almanac request'
			'foot foot';
		column-gap: clamp(2rem, 5vw, 5rem);
		max-width: 90rem;
		margin: 0 auto;
		padding: max(var(--gutter), env(safe-area-inset-top))
			max(var(--gutter), env(safe-area-inset-right)) max(var(--gutter), env(safe-area-inset-bottom))
			max(var(--gutter), env(safe-area-inset-left));
	}

	/* Rounded, so its focus ring is too */
	a {
		border-radius: var(--radius);
		color: inherit;
		text-underline-offset: 0.18em;
		text-decoration-thickness: 1px;
	}

	a:hover {
		text-decoration-thickness: 2px;
	}

	:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 3px;
	}

	.masthead {
		grid-area: masthead;
	}

	h1 {
		margin: 0;
		font-size: clamp(2.75rem, 6vw, 5.75rem);
		font-weight: 600;
		line-height: 1.08;
		letter-spacing: -0.005em;
		text-wrap: balance;
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
		/* A flick leans it from the hoist; see src/lib/scene/flag.ts */
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
		/* clear when it isn't folding, as with reduced motion, or it blacks out the flag */
		opacity: 0;
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

	/* In the same face as the title, a size down, so the two read as one statement */
	.languages {
		margin: clamp(0.5rem, 1.5vw, 1rem) 0 clamp(1.5rem, 3.5vw, 3rem);
		font-size: clamp(1.375rem, 2.1vw, 1.875rem);
		font-weight: 450;
		line-height: 1.4;
	}

	/* The other language is a link, underlined like any; the one the page is in is set apart by
	   its weight and a heavier line under it, not just its colour */
	.languages a {
		position: relative;
		color: var(--ink-soft);
		text-decoration-color: currentColor;
		/* the old language's own underline fades in as the chosen one glides away from it */
		transition:
			color 0.2s ease,
			text-decoration-color 0.25s ease;
	}

	.languages [aria-current='page'] {
		font-weight: 600;
		text-decoration-color: transparent;
	}

	.languages a:hover,
	.languages [aria-current='page'] {
		color: var(--ink);
	}

	/* a separate line so it can glide to the next chosen language */
	.chosen {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0.02em;
		height: 0.07em;
		/* the ink itself, not the word's colour, which the smoke hides while it stands in for it */
		background: var(--ink);
		/* glides from the last language, see afterNavigate */
		transform-origin: left;
	}

	/* Where the sky is: behind the title and the bridge. The scene draws it, from its top, which
	   is the page's own colour, to its horizon, misting out into the page */
	.sky {
		grid-column: 1 / -1;
		grid-row: 1 / span 2;
	}

	/* The words are in front of the bridge's canvas, which reaches up behind them: a car flung
	   up passes behind them, as cloud. The title itself isn't lifted, so the canvas, which
	   comes after it, is drawn over the flag: a car passes in front of that */
	.words,
	.languages {
		position: relative;
		z-index: 1;
	}

	/* The bridge and the strait, at the foot of the sky. The sea takes the accent for the time
	   of day, which src/lib/Scene.svelte reads from here */
	.plate {
		--accent: #6fd0ff;
		grid-area: plate;
		position: relative;
		height: clamp(16rem, 36vw, 34rem);
		color: #f3f4f7;
		/* Sized by the page, never by what's in it, so the still can follow its shape */
		container-type: size;
	}

	:global(:root[data-sky='dawn']) .plate {
		--accent: #ffd2b8;
	}

	:global(:root[data-sky='day']) .plate {
		--accent: #063f73;
		color: #0b1d36;
	}

	:global(:root[data-sky='dusk']) .plate {
		--accent: #ffc58f;
	}

	/* Framed as the scene is: its camera's field of view is set by the height, so the still is
	   fitted to the height and cropped at the sides. It's the bridge and the sea alone, on the
	   page's own sky, eased out as they are: the sea across its lower part, and both at the
	   sides, where the page's margins come */
	.still {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: var(--night) center / auto 100% no-repeat;
		mask-image:
			linear-gradient(to right, transparent, #000 6%, #000 94%, transparent),
			linear-gradient(to top, transparent, #000 45%);
		mask-composite: intersect;
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

	/* The year's holidays, set like a tide table: the day large, what it is beside it */
	.almanac {
		grid-area: almanac;
		padding-top: clamp(2rem, 5vw, 4rem);
		/* Its heading and the request beside it read along one line */
		align-self: baseline;
	}

	/* What each column is, quietly, over it */
	h2 {
		margin: 0 0 0.75rem;
		color: var(--ink-soft);
		font-size: 1rem;
		font-weight: 600;
	}

	.years {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		margin-bottom: clamp(1.5rem, 4vw, 3rem);
		font-size: clamp(1.25rem, 2.5vw, 1.75rem);
	}

	/* Set as the start of a sentence the picked year finishes */
	.years h2 {
		/* As far from the first year as each year is from the next: a button's padding and border */
		margin: 0 calc(0.5em + 2px) 0 0;
		color: var(--ink);
		font-size: inherit;
		font-weight: 400;
	}

	/* Numerals have no descenders, so the line's room for them is moved above, to sit the
	   digits in the middle of the ring. And as tall as capitals, in a heavier weight, they look
	   to float above the lowercase words before them on the same baseline, so they're set a
	   touch lower, by eye */
	.years button {
		padding: calc(0.25rem + 0.125em) 0.5em calc(0.25rem - 0.125em);
		translate: 0 0.05em;
		border: 2px solid transparent;
		border-radius: var(--round);
		background: none;
		color: var(--ink-soft);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		transition:
			color 0.15s ease,
			border-color 0.15s ease,
			scale 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
	}

	.years button:hover {
		color: var(--ink);
	}

	/* A press is felt, as the request's buttons are, though not with reduced motion */
	.years button:active {
		scale: 0.97;
	}

	/* Pressed, it dims instead of shrinking, as the request's buttons do */
	@media (prefers-reduced-motion: reduce) {
		.years button:active {
			scale: none;
			opacity: 0.7;
		}
	}

	/* With only this year's holidays out, the year is simply the end of the sentence */
	.year {
		font-weight: 600;
	}

	.years [aria-pressed='true'] {
		border-color: var(--ink);
		color: var(--ink);
	}

	.months {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 2rem clamp(1.5rem, 3vw, 2.5rem);
	}

	h3 {
		margin: 0 0 0.5rem;
		padding-bottom: 0.375rem;
		border-bottom: 2px solid var(--ink);
		font-size: 1.125rem;
		font-weight: 700;
	}

	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: 3.375rem minmax(0, 1fr);
		grid-template-areas: 'day name' 'day when';
		column-gap: 0.75rem;
		padding: 0.5rem 0;
		border-radius: var(--radius);
		line-height: 1.3;
	}

	/* Set as a drop cap: its figures stand from the top of the name's capitals to the foot of
	   the line below it. Newsreader's figures are 0.6955em tall, so at 2.75rem they're as tall
	   as those two lines. Its line box is kept within them, so the row isn't any taller, and it's
	   moved down, not pushed, by what puts its figures on them */
	li time {
		grid-area: day;
		align-self: start;
		justify-self: end;
		font-size: 2.75rem;
		font-weight: 600;
		line-height: 0.8;
		translate: 0 0.12em;
	}

	.name {
		grid-area: name;
		font-weight: 600;
		text-wrap: pretty;
	}

	.when {
		grid-area: when;
		color: var(--ink-soft);
		font-size: 0.875rem;
	}

	/* Struck through and quieter once it's passed, but never too faint to read */
	li.passed {
		color: var(--ink-faint);
	}

	li.passed .when {
		color: inherit;
	}

	li.passed .name {
		text-decoration: line-through;
		text-decoration-thickness: 1px;
	}

	/* Asked for, the ones gone by fade in where they'll be, to tell them from what was already
	   there; put away again, they just go */
	.months.all li.passed,
	.months.all .month h3 {
		transition: opacity 0.2s cubic-bezier(0.19, 1, 0.22, 1);

		@starting-style {
			opacity: 0;
		}
	}

	/* A school holiday, which is no day off work: under the names of the others, small and
	   quiet, with no day standing before it */
	li.school {
		grid-template-areas: '. name' '. when';
		padding: 0.25rem 0;
		color: var(--ink-soft);
	}

	.school .name {
		font-size: 0.875rem;
		font-weight: 400;
	}

	.school .when {
		font-size: 0.8125rem;
	}

	li.school.passed {
		color: var(--ink-faint);
	}

	.over {
		display: none;
	}

	/* Shown, before the first paint, only once there's one gone by: see src/app.html */
	.fold,
	.tally {
		display: none;
	}

	.fold {
		color: var(--ink-faint);
	}

	.fold h3 {
		border-color: currentColor;
	}

	.tally p {
		margin: 0;
		padding: 0.5rem 0 0.25rem;
		font-size: 1.125rem;
		line-height: 1.3;
	}

	/* A quiet line of text that says what it does, underlined as a link would be */
	.earlier {
		position: relative;
		margin: 0;
		padding: 0;
		border: 0;
		background: none;
		color: var(--ink-soft);
		font: inherit;
		font-size: 0.875rem;
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.18em;
		cursor: pointer;
	}

	.earlier:hover {
		color: var(--ink);
		text-decoration-thickness: 2px;
	}

	/* One line of small text, touched across the 44px a finger needs */
	.earlier::before {
		content: '';
		position: absolute;
		inset: 50% 0 auto;
		height: 2.75rem;
		translate: 0 -50%;
	}

	/* The next holiday, picked out by its type alone: its day and how long till it, in the
	   accent, which is set legible against the sky at every hour */
	li.next time,
	li.next .when {
		color: var(--accent);
	}

	.note {
		margin: 2rem 0 0;
		color: var(--ink-soft);
		font-size: 0.875rem;
	}

	/* Beside the holidays, held in view as they scroll past */
	.request {
		grid-area: request;
		position: sticky;
		top: max(var(--gutter), env(safe-area-inset-top));
		/* its first line on the baseline of the holidays' heading */
		align-self: baseline;
		display: flex;
		flex-direction: column;
		min-width: 0;
		height: min(38rem, 100dvh - 2 * var(--gutter));
	}

	.foot {
		grid-area: foot;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-top: clamp(3rem, 6vw, 5rem);
		color: var(--ink-soft);
	}

	.foot p {
		margin: 0;
	}

	.foot a {
		color: var(--ink);
	}

	.github {
		display: inline-flex;
		align-items: center;
		gap: 0.5em;
	}

	.github svg {
		flex: none;
		width: 1.25em;
		height: 1.25em;
		fill: currentColor;
	}

	/* Narrow, everything stacks, the request under the holidays at the height of its docs */
	@media (max-width: 56.25em) {
		.page {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: 'masthead' 'plate' 'almanac' 'request' 'foot';
		}

		.plate {
			height: min(70vw, 75svh);
		}

		/* Below the holidays now, a section of its own, set well apart from them */
		.request {
			position: static;
			height: auto;
			margin-top: clamp(4rem, 14vw, 6rem);
		}
	}
</style>
