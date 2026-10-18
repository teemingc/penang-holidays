<script lang="ts">
	interface Props {
		/** The path to request, such as /2026/7 */
		path: string;
		/** The full URL it's at, to show */
		url: string;
		/** The headers the response comes with, as name and value, shown until it's sent */
		previewHeaders: [string, string][];
		reducedMotion: boolean;
	}

	import { fade } from 'svelte/transition';

	let { path, url, previewHeaders, reducedMotion }: Props = $props();

	// Shown as just the path; Copy gives the full URL
	const endpoint = $derived(url.slice(new URL(url).origin.length));

	// What each field of the response means, in the order they come, shown until the request's
	// sent and again whenever they're asked for. Short enough to fit a phone without wrapping
	const DOCS = `{
  "year": number,
  "source": string,    // where it's from
  "holidays": [
    {
      "date": string,  // YYYY-MM-DD
      "name": string,  // in Malay
      "type": "federal" | "state",
      "tentative": boolean  // may change
    }
  ],
  "month": number      // 1 to 12
}`;

	let stage = $state<'idle' | 'sending' | 'done'>('idle');
	// The docs, or the response to the last request
	let view = $state<'docs' | 'response'>('docs');
	let elapsed = $state(0);
	let status = $state('');
	let headers = $state<[string, string][]>([]);

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
	let shownStatus = $state('');
	let shownTime = $state('');
	let shownHeaders = $state<[string, string][]>([]);

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

	// A random character of the same kind, so letters stay letters and digits stay digits
	function glitch(c: string) {
		if (/\d/.test(c)) return String(Math.floor(Math.random() * 10));
		const letter = String.fromCharCode(97 + Math.floor(Math.random() * 26));
		return c === c.toUpperCase() ? letter.toUpperCase() : letter;
	}

	// Draws text scrambled at a moment in its settling, each character landing in turn, left to
	// right. true, false and null stay as they are, so no colour changes with them
	function scrambler(text: string) {
		const settle = [...text].map((_, i) => (i / text.length) * 200 + Math.random() * 100);
		return (t: number) =>
			text.replace(/\b(?:true|false|null)\b|[a-z0-9]/gi, (c, i) =>
				c.length > 1 || t >= (settle[i] ?? 0) ? c : glitch(c)
			);
	}

	// Which change is the latest: an older one still settling stops when a new one starts
	let run = 0;

	interface Drawn {
		body: string;
		status: string;
		time: string;
		headers: [string, string][];
	}

	// From the docs to the response, from one response to the next, or back to the docs: what's
	// there glitches through random characters and settles on what's next, without anything moving
	async function settle(next: Drawn, id: number) {
		const show = () => {
			shown = next.body;
			shownStatus = next.status;
			shownTime = next.time;
			shownHeaders = next.headers;
		};
		if (reducedMotion) return show();
		const scrambled = {
			body: scrambler(next.body),
			status: scrambler(next.status),
			time: scrambler(next.time),
			headers: next.headers.map(([name, value]) => [name, scrambler(value)] as const)
		};
		const started = performance.now();
		for (let t = 0; t < 300; t = performance.now() - started) {
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
		await settle({ body, status, time: `${elapsed} ms`, headers }, id);
	}

	function readDocs() {
		stage = 'idle';
		view = 'docs';
		settle({ body: DOCS, status: '', time: '', headers: exampleHeaders }, ++run);
	}

	// The JSON, split into comments, keys, strings, numbers and the rest, to colour each
	function tokenize(text: string) {
		return [
			...text.matchAll(
				/(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)|[^"\w/-]+|\w+|[-/]/g
			)
		].map((m) =>
			m[1]
				? { text: m[1], kind: 'comment', rest: '' }
				: m[2] && m[3]
					? { text: m[2], kind: 'key', rest: m[3] }
					: m[2]
						? { text: m[2], kind: 'string', rest: '' }
						: m[4]
							? { text: m[4], kind: 'literal', rest: '' }
							: m[5]
								? { text: m[5], kind: 'number', rest: '' }
								: { text: m[0], kind: '', rest: '' }
		);
	}

	const tokens = $derived(tokenize(shown));
</script>

<div class="request">
	{#snippet command()}
		<code><span class="method">GET</span> {endpoint}</code>
	{/snippet}

	<!-- The copy icon, or a tick once it's copied, each drawing centred in its box -->
	{#snippet icons()}
		<svg class="icon" class:gone={copied} viewBox="0 -0.5 16 16" aria-hidden="true">
			<rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
			<path
				d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5"
			/>
		</svg>
		<svg class="icon" class:gone={!copied} viewBox="0 0.375 16 16" aria-hidden="true">
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

	<!-- Send heads the response it brings back, the status lands beside it, and the docs can be
	     read again from the far end. The labels never change, so nothing on the row moves -->
	<div class="bar">
		<button class="send" onclick={send} disabled={stage === 'sending'}>
			<span class="return" aria-hidden="true">↵</span>
			Send request
		</button>
		{#if shownStatus}
			<p class="status" in:fade={{ duration: reducedMotion ? 0 : 180 }}>
				<span>{shownStatus}</span>
				<span class="time">{shownTime}</span>
			</p>
		{/if}
		{#if view === 'response'}
			<button
				class="docs"
				onclick={readDocs}
				disabled={stage === 'sending'}
				in:fade={{ duration: reducedMotion ? 0 : 180 }}>Read docs</button
			>
		{/if}
	</div>

	<!-- Always there, so the page doesn't shift when the response arrives: until then, the docs -->
	{#snippet json(tokens: ReturnType<typeof tokenize>)}{#each tokens as token, i (i)}<span
				class={token.kind}>{token.text}</span
			>{token.rest}{/each}{/snippet}

	<!-- Fading back while the request's on its way, until the response glitches in over it -->
	<div class="terminal" class:waiting={stage === 'sending'}>
		<!-- With the docs, the headers the response comes with, a little fainter -->
		<div class="headers" class:ghost={!shownStatus}>
			{#each shownStatus ? shownHeaders : exampleHeaders as [name, value] (name)}
				<p class="header"><span>{name}:</span> {value}</p>
			{/each}
		</div>
		<pre>{@render json(tokens)}</pre>
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

	@media (max-width: 900px) {
		.terminal {
			height: min(46vh, 26rem);
		}
	}

	.method {
		font-weight: 600;
		color: var(--accent);
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
		display: inline-flex;
		align-items: center;
		gap: 0.625rem;
		background: none;
		color: var(--accent);
		font-size: 0.8125rem;
		font-weight: 600;
		line-height: 1;
	}

	.return {
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

	.send:hover .return {
		border-color: color-mix(in srgb, var(--ink) 60%, transparent);
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}

	/* Pressed, the key goes down rather than the whole thing shrinking */
	.send:active:not(:disabled) {
		transform: none;
	}

	.send:active:not(:disabled) .return {
		border-bottom-width: 1px;
		translate: 0 1px;
	}

	/* Quieter than Send, at the far end of its row */
	.docs {
		margin-left: auto;
		background: none;
		color: var(--ink-soft);
		font-size: 0.75rem;
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.25em;
	}

	.docs:hover {
		color: var(--ink);
	}

	.docs:disabled {
		cursor: default;
		opacity: 0.5;
	}

	.send:disabled {
		cursor: default;
		opacity: 0.5;
		transition: opacity 0.15s ease-out;
	}

	@media (prefers-reduced-motion: reduce) {
		.icon {
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
	/* The rest of the column on a wide screen; a fixed share of the screen on a phone */
	.terminal {
		min-height: 0;
		overflow: auto;
		mask-image: linear-gradient(#000 85%, transparent);
		scrollbar-width: thin;
		scrollbar-color: color-mix(in srgb, var(--ink) 25%, transparent) transparent;
		color: var(--ink-soft);
		font-size: 0.75rem;
		line-height: 1.55;
	}

	.terminal p {
		margin: 0;
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
