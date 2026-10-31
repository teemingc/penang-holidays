<script lang="ts">
	interface Props {
		/** The path to request, such as /2026 */
		path: string;
		/** The full URL it's at, to show */
		url: string;
		/** The headers the response comes with, as name and value, shown until it's sent */
		previewHeaders: [string, string][];
		reducedMotion: boolean;
	}

	import { onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import { morpher, scrambler, tokenize, type Token } from './terminal.js';

	let { path, url, previewHeaders, reducedMotion }: Props = $props();

	// Shown as just the path; Copy gives the full URL
	const endpoint = $derived(url.slice(new URL(url).origin.length));
	// With the docs, the path says which parts are yours to choose; sent, it's the one requested
	const TEMPLATE = '/{year}';

	// What each field of the response means, in the order they come, shown until the request's
	// sent and again whenever they're asked for. Short enough to fit a phone without wrapping
	const DOCS = `{
  "holidays": [
    {
      "date": string,  // YYYY-MM-DD
      "name": string,  // in Malay
      "type": "federal" | "state",
      "tentative": boolean  // date may move
    }
  ]
}`;

	let stage = $state<'idle' | 'sending' | 'done'>('idle');
	// The docs, or the response to the last request
	let view = $state<'docs' | 'response'>('docs');
	let elapsed = $state(0);
	let status = $state('');
	let headers: [string, string][] = [];

	// The headers worth showing, in this order
	const SHOWN = ['content-type', 'cache-control', 'access-control-allow-origin'];
	const pick = (get: (name: string) => string | null | undefined) =>
		SHOWN.flatMap((name) => {
			const value = get(name);
			return value ? [[name, value] as [string, string]] : [];
		});
	// What the response comes with, shown with the docs
	const exampleHeaders = $derived(
		pick((name) => previewHeaders.find(([key]) => key === name)?.[1])
	);

	// The body, status line and headers as they're drawn, scrambling as they change. The real
	// values above are what's read out
	let shown = $state(DOCS);
	let shownPath = $state(TEMPLATE);
	let shownStatus = $state('');
	let shownTime = $state('');
	// Replaced whole on every frame, never changed in place
	let shownHeaders = $state.raw<[string, string][]>([]);

	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	// The full URL, to paste wherever it's needed
	// Confirmed in place for a moment, then back to how it was
	let copied = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;
	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
		} catch {
			// Where the clipboard API isn't allowed, the old way: select it and copy
			const field = document.createElement('textarea');
			field.value = url;
			field.style.position = 'fixed';
			field.style.opacity = '0';
			document.body.append(field);
			field.select();
			document.execCommand('copy');
			field.remove();
		}
		copied = true;
		clearTimeout(copiedTimer);
		copiedTimer = setTimeout(() => (copied = false), 1600);
	}

	// Which change is the latest: an older one still settling stops when a new one starts
	let run = 0;

	// Gone from the page, nothing's left running: whatever's settling stops, and so does the tick
	onDestroy(() => {
		run++;
		clearTimeout(copiedTimer);
	});

	interface Drawn {
		path: string;
		body: string;
		status: string;
		time: string;
		headers: [string, string][];
	}

	// From the docs to the response, from one response to the next, or back to the docs: what's
	// there glitches through random characters and settles on what's next, without anything moving
	async function settle(next: Drawn, id: number) {
		const show = () => {
			shownPath = next.path;
			shown = next.body;
			shownStatus = next.status;
			shownTime = next.time;
			shownHeaders = next.headers;
		};
		if (reducedMotion) return show();
		const scrambled = {
			path: morpher(shownPath, next.path),
			body: scrambler(next.body),
			status: scrambler(next.status),
			time: scrambler(next.time),
			headers: next.headers.map(([name, value]) => [name, scrambler(value)] as const)
		};
		const started = performance.now();
		for (let t = 0; t < 300; t = performance.now() - started) {
			shownPath = scrambled.path(t);
			shown = scrambled.body(t);
			shownStatus = scrambled.status(t);
			shownTime = scrambled.time(t);
			shownHeaders = scrambled.headers.map(([name, value]) => [name, value(t)]);
			await wait(32);
			if (id !== run) return;
		}
		show();
	}

	async function send() {
		if (stage === 'sending') return;
		const id = ++run;
		stage = 'sending';
		const started = performance.now();
		const body = await fetch(path)
			.then(async (res) => {
				elapsed = Math.round(performance.now() - started);
				status = `${res.status} ${res.statusText || (res.ok ? 'OK' : '')}`.trim();
				headers = pick((name) => res.headers.get(name));
				const text = await res.text();
				try {
					return JSON.stringify(JSON.parse(text), null, 2);
				} catch {
					return text;
				}
			})
			.catch(() => {
				elapsed = Math.round(performance.now() - started);
				status = 'No response';
				headers = [];
				return 'The request didn’t get through. Check your connection and send it again.';
			});
		stage = 'done';
		view = 'response';
		await settle({ path: endpoint, body, status, time: `${elapsed} ms`, headers }, id);
	}

	function readDocs() {
		stage = 'idle';
		view = 'docs';
		settle({ path: TEMPLATE, body: DOCS, status: '', time: '', headers: exampleHeaders }, ++run);
	}

	const tokens = $derived(tokenize(shown));
	const docsTokens = tokenize(DOCS);
</script>

<div class="request">
	{#snippet command()}
		<!-- The parts in braces are placeholders, quieter than the rest -->
		<code
			><span class="method">GET</span>
			{#each shownPath.split(/(\{[^}]*\})/) as part, i (i)}<span
					class={{ slot: part.startsWith('{') }}>{part}</span
				>{/each}</code
		>
	{/snippet}

	<!-- The copy icon, or a tick once it's copied, each drawing centred in its box -->
	{#snippet icons()}
		<svg class={['icon', { gone: copied }]} viewBox="0 -0.5 16 16" aria-hidden="true">
			<rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
			<path
				d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5"
			/>
		</svg>
		<svg class={['icon', { gone: !copied }]} viewBox="0 0.375 16 16" aria-hidden="true">
			<path d="m3 8.5 3.25 3.25L13 5" />
		</svg>
	{/snippet}

	<div class="line">
		<div class="command">
			{@render command()}
			<!-- Copy sits with the path it copies; the icon swaps to a tick in place -->
			<button class="copy" onclick={copy} aria-label="Copy the URL" title="Copy the full URL">
				{@render icons()}
			</button>
			<span class="visually-hidden" role="status">{copied ? 'Copied' : ''}</span>
		</div>

		<!-- The request, mirrored in the sea below it and broken up by ripples -->
		<div class="reflection" aria-hidden="true">
			<div class="mirror command">
				{@render command()}
				<!-- The icon is part of the line, so the sea shows it too -->
				<span class="copy">{@render icons()}</span>
			</div>
			<svg width="0" height="0">
				<filter id="ripple">
					<feTurbulence type="fractalNoise" baseFrequency="0.008 0.32" numOctaves="2" seed="3">
						{#if !reducedMotion}
							<animate
								attributeName="baseFrequency"
								dur="7s"
								values="0.008 0.32; 0.011 0.4; 0.008 0.32"
								repeatCount="indefinite"
							/>
						{/if}
					</feTurbulence>
					<feDisplacementMap
						in="SourceGraphic"
						scale="16"
						xChannelSelector="R"
						yChannelSelector="G"
					/>
				</filter>
			</svg>
		</div>
	</div>

	<!-- One key heads the column: Send while the docs are up, Read docs once the response is.
	     Both labels share its place, as wide as the longer, and swap there, so nothing on the row
	     moves when they do or when the status lands beside them -->
	<div class="bar">
		<button
			class="send"
			onclick={view === 'docs' ? send : readDocs}
			disabled={stage === 'sending'}
			aria-label={view === 'docs' ? 'Send request' : 'Read docs'}
		>
			<span class={['label', { gone: view !== 'docs' }]} aria-hidden="true">
				<span class="keycap">↵</span>
				Send request
			</span>
			<span class={['label', { gone: view === 'docs' }]} aria-hidden="true">
				<!-- An open book, drawn in the same hairline as the copy icon -->
				<span class="keycap">
					<svg class="book" viewBox="0 0 16 16">
						<path
							d="M8 4.25C6.5 3.1 4.5 2.8 2.5 3v9.25c2-.2 4 .1 5.5 1.25 1.5-1.15 3.5-1.45 5.5-1.25V3c-2-.2-4 .1-5.5 1.25Z"
						/>
						<path d="M8 4.25v9.25" />
					</svg>
				</span>
				Read docs
			</span>
		</button>
		{#if shownStatus}
			<p class="status" in:fade={{ duration: reducedMotion ? 0 : 180 }}>
				<span>{shownStatus}</span>
				<span class="time">{shownTime}</span>
			</p>
		{/if}
	</div>

	<!-- Always there, so the page doesn't shift when the response arrives: until then, the docs -->
	{#snippet json(tokens: Token[])}{#each tokens as token, i (i)}<span class={token.kind}
				>{token.text}</span
			>{token.rest}{/each}{/snippet}

	{#snippet headerList(headers: [string, string][])}
		{#each headers as [name, value] (name)}
			<p class="header"><span>{name}:</span> {value}</p>
		{/each}
	{/snippet}

	<!-- Fading back while the request's on its way, until the response glitches in over it -->
	<div class={['terminal', { waiting: stage === 'sending' }]}>
		<!-- Unseen, the docs as they first show, to size the box by on a phone -->
		<div class="fit" aria-hidden="true">
			<div class="headers">
				{@render headerList(exampleHeaders)}
			</div>
			<pre>{@render json(docsTokens)}</pre>
		</div>
		<div class="scroll">
			<!-- With the docs, the headers the response comes with, a little fainter -->
			<div class={['headers', { ghost: !shownStatus }]}>
				{@render headerList(shownStatus ? shownHeaders : exampleHeaders)}
			</div>
			<pre>{@render json(tokens)}</pre>
		</div>
	</div>
	<!-- Read out once when the response arrives, not as it streams in -->
	<span class="visually-hidden" role="status"
		>{stage === 'sending' ? 'Sending' : stage === 'done' ? `${status}, ${elapsed} ms` : ''}</span
	>
</div>

<style>
	.request {
		display: grid;
		grid-template-rows: auto auto auto minmax(0, 1fr);
		gap: 1rem;
		width: 100%;
		font-family: 'IBM Plex Mono', ui-monospace, monospace;
	}

	/* The request, set in type on the sky, with room underneath for its reflection */
	.line {
		position: relative;
		margin-bottom: 1.75rem;
	}

	.command {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		font-size: clamp(1.5rem, 2.3vw, 2rem);
		line-height: 1.2;
	}

	/* Upside down, fading with depth, and rippled */
	.reflection {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		pointer-events: none;
		mask-image: linear-gradient(rgb(0 0 0 / 0.45), transparent 90%);
	}

	.reflection .mirror {
		transform: translateY(85%) scaleY(-0.85);
		transform-origin: top;
		filter: url(#ripple) blur(0.4px);
	}

	.reflection svg {
		position: absolute;
	}

	code {
		color: var(--ink);
		font: inherit;
	}

	.method {
		font-weight: 600;
		color: var(--accent);
	}

	.slot {
		color: var(--ink-soft);
	}

	button {
		padding: 0;
		border: 0;
		font: inherit;
		cursor: pointer;
		/* A press is felt the moment it happens, however fast the response comes back */
		transition: transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
	}

	button:active:not(:disabled) {
		transform: scale(0.97);
	}

	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
	}

	/* A quiet glyph after the path, brightening on hover */
	.copy {
		display: inline-grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		/* Centred on the capitals by hand, from IBM Plex Mono's metrics: an ascent of 1.02em
		   and a descent of 0.27em in a 1.2em line put the baseline 0.975em down, and its
		   capitals, 0.698em tall, are centred 0.626em down */
		margin-top: calc(0.626em - 0.875rem);
		border-radius: 0.375rem;
		background: none;
		color: var(--ink-soft);
	}

	/* The reflection is only an image of it, so it's pressed along with the button above it */
	.line:has(button.copy:active) .mirror .copy {
		transform: scale(0.97);
	}

	.copy:hover {
		color: var(--ink);
		background: color-mix(in srgb, var(--ink) 10%, transparent);
	}

	/* The icons swap with a short crossfade and the slightest blur, no movement */
	.icon {
		grid-area: 1 / 1;
		width: 1rem;
		height: 1rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.4;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition:
			opacity 0.18s ease-out,
			filter 0.18s ease-out;
	}

	.icon.gone {
		opacity: 0;
		filter: blur(2px);
	}

	/* Sent the way a terminal sends a line: a press of Return, drawn as a key in the same
	   hairline ink as the rest of the column rather than a filled button */
	.bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-height: 2.25rem;
	}

	.send {
		display: inline-grid;
		background: none;
		color: var(--accent);
		font-size: 0.8125rem;
		font-weight: 600;
		line-height: 1;
	}

	/* The labels swap with the same short crossfade and blur as the copy icon, no movement */
	.label {
		grid-area: 1 / 1;
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: 0.625rem;
		transition:
			opacity 0.18s ease-out,
			filter 0.18s ease-out;
	}

	.label.gone {
		opacity: 0;
		filter: blur(2px);
		pointer-events: none;
	}

	.book {
		width: 0.875rem;
		height: 0.875rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.keycap {
		display: inline-grid;
		place-items: center;
		width: 1.75rem;
		height: 1.5rem;
		border: 1px solid color-mix(in srgb, var(--ink) 35%, transparent);
		border-bottom-width: 2px;
		border-radius: 0.3125rem;
		color: var(--ink);
		font-size: 1rem;
		font-weight: 400;
		transition:
			border-color 0.15s ease-out,
			background-color 0.15s ease-out;
	}

	.send:hover .keycap {
		border-color: color-mix(in srgb, var(--ink) 60%, transparent);
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}

	/* Pressed, the key goes down rather than the whole thing shrinking */
	.send:active:not(:disabled) {
		transform: none;
	}

	.send:active:not(:disabled) .keycap {
		border-bottom-width: 1px;
		translate: 0 1px;
	}

	.send:disabled {
		cursor: default;
		opacity: 0.5;
		transition: opacity 0.15s ease-out;
	}

	@media (prefers-reduced-motion: reduce) {
		.icon,
		.label {
			transition: none;
		}

		/* Pressed, it dims instead of shrinking */
		button:active:not(:disabled) {
			transform: none;
			opacity: 0.7;
		}
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	/* The response, streaming in as plain text, fading out where it scrolls */
	/* The rest of the column on a wide screen */
	.terminal {
		display: grid;
		grid-template-rows: minmax(0, 1fr);
		min-height: 0;
		mask-image: linear-gradient(#000 85%, transparent);
		color: var(--ink-soft);
		font-size: 0.75rem;
		line-height: 1.55;
	}

	.terminal p {
		margin: 0;
	}

	.fit {
		display: none;
	}

	.scroll {
		min-height: 0;
		overflow: auto;
		scrollbar-width: thin;
		scrollbar-color: color-mix(in srgb, var(--ink) 25%, transparent) transparent;
	}

	/* Stacked, as tall as the docs, so there's no gap under them and nothing moves when the
	   response arrives: a longer one scrolls. The unseen copy sets the height, and the
	   response, sized to contain nothing, fills it. The fade falls in the room left under the
	   last line, which shows in full once it's scrolled to */
	@media (max-width: 900px) and (orientation: portrait),
		(max-width: 900px) and (min-height: 501px) {
		.terminal {
			grid-template-rows: auto;
			mask-image: linear-gradient(#000 calc(100% - 1.5rem), transparent);
		}

		.fit,
		.scroll {
			grid-area: 1 / 1;
			padding-bottom: 1.5rem;
		}

		.fit {
			display: block;
			visibility: hidden;
		}

		.scroll {
			contain: size;
		}
	}

	.status {
		display: flex;
		gap: 0.75rem;
		margin: 0;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--ink);
	}

	.time {
		color: var(--ink-soft);
		font-weight: 400;
	}

	.headers {
		padding-bottom: 0.75rem;
	}

	.header span {
		color: var(--ink);
	}

	pre {
		margin: 0;
		font: inherit;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	/* An example until it's sent: a little fainter than the real thing, still easy to read */
	.ghost {
		opacity: 0.9;
	}

	.headers,
	pre {
		transition: opacity 0.3s ease-out;
	}

	.waiting .headers,
	.waiting pre {
		opacity: 0.35;
	}

	@media (prefers-reduced-motion: reduce) {
		.headers,
		pre {
			transition: none;
		}
	}

	.comment {
		color: color-mix(in srgb, var(--ink-soft) 75%, transparent);
	}

	.string {
		color: var(--accent);
	}

	.number,
	.literal {
		color: var(--ink);
	}
</style>
