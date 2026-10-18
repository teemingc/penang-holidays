<script lang="ts">
	interface Props {
		/** The path to request, such as /2026/7 */
		path: string;
		/** The full URL it's at, to show */
		url: string;
		/** What the request returns, shown faintly until it's sent */
		preview: unknown;
		reducedMotion: boolean;
	}

	let { path, url, preview, reducedMotion }: Props = $props();

	// Shown as just the path; Copy gives the full URL
	const endpoint = $derived(url.slice(new URL(url).origin.length));

	let stage = $state<'idle' | 'sending' | 'done'>('idle');
	let elapsed = $state(0);
	let status = $state('');
	let headers = $state<[string, string][]>([]);
	let shown = $state('');

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

	// Which send is the latest: an older one still streaming in stops when a new one starts
	let run = 0;

	async function send() {
		if (stage === 'sending') return;
		const id = ++run;
		// Sent before: the last response stays put until the new one replaces it
		const first = !shown;
		stage = 'sending';
		const started = performance.now();
		const request = fetch(path)
			.then(async (res) => {
				elapsed = Math.round(performance.now() - started);
				status = `${res.status} ${res.statusText || (res.ok ? 'OK' : '')}`.trim();
				headers = ['content-type', 'cache-control', 'access-control-allow-origin'].flatMap(
					(name) => {
						const value = res.headers.get(name);
						return value ? [[name, value] as [string, string]] : [];
					}
				);
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

		const body = await request;
		stage = 'done';

		if (reducedMotion) {
			shown = body;
			return;
		}

		// Sent again: the response glitches through random characters and settles back into place,
		// left to right, without anything moving. true, false and null stay as they are, so no colour
		// changes with them
		if (!first) {
			const settle = [...body].map((_, i) => (i / body.length) * 200 + Math.random() * 100);
			const started = performance.now();
			for (let t = 0; t < 300; t = performance.now() - started) {
				shown = body.replace(/\b(?:true|false|null)\b|[a-z0-9]/gi, (c, i) =>
					c.length > 1 || t >= (settle[i] ?? 0) ? c : glitch(c)
				);
				await wait(32);
				if (id !== run) return;
			}
			shown = body;
			return;
		}

		// The first response streams in, a little at a time
		for (let i = 0; i <= body.length; i += 24) {
			shown = body.slice(0, i);
			await wait(16);
			// Sent again while this one was still coming in: the new one takes over
			if (id !== run) return;
		}
		shown = body;
	}

	const text = $derived(stage === 'idle' ? JSON.stringify(preview, null, 2) : shown);

	// The JSON, split into keys, strings, numbers and the rest, to colour each
	const tokens = $derived(
		[
			...text.matchAll(
				/("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)|[^"\w-]+|\w+|-/g
			)
		].map((m) =>
			m[1] && m[2]
				? { text: m[1], kind: 'key', rest: m[2] }
				: m[1]
					? { text: m[1], kind: 'string', rest: '' }
					: m[3]
						? { text: m[3], kind: 'literal', rest: '' }
						: m[4]
							? { text: m[4], kind: 'number', rest: '' }
							: { text: m[0], kind: '', rest: '' }
		)
	);
</script>

<!-- The labels never change, so nothing around them moves: Send dims while it's on its way,
     and Copy sends a little "Copied" floating up off it -->
{#snippet label()}Send{/snippet}

<div class="request">
	{#snippet command(key: 'button' | 'label')}
		<div class="command">
			<code><span class="method">GET</span> {endpoint}</code>
			{#if key === 'button'}
				<button onclick={send} disabled={stage === 'sending'}>{@render label()}</button>
				<!-- Both words share one slot, as wide as the longer, and swap in place -->
				<button class="copy" onclick={copy} aria-label="Copy the URL">
					<span class="word" class:gone={copied} aria-hidden="true">Copy</span>
					<span class="word" class:gone={!copied} aria-hidden="true">Copied</span>
				</button>
				<span class="visually-hidden" role="status">{copied ? 'Copied' : ''}</span>
			{:else}
				<span class="send">{@render label()}</span>
				<span class="send copy">
					<span class="word" class:gone={copied}>Copy</span>
					<span class="word" class:gone={!copied}>Copied</span>
				</span>
			{/if}
		</div>
	{/snippet}

	<div class="line">
		{@render command('button')}

		<!-- The request, mirrored in the sea below it and broken up by ripples -->
		<div class="reflection" aria-hidden="true">
			<div class="mirror">{@render command('label')}</div>
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

	<!-- Always there, so the page doesn't shift when the response arrives: until then, a faint
	     preview of it -->
	<div class="terminal">
		{#if status}
			<p class="status">
				<span>{status}</span>
				<span class="time">{elapsed} ms</span>
			</p>
			{#each headers as [name, value] (name)}
				<p class="header"><span>{name}:</span> {value}</p>
			{/each}
		{/if}
		<pre class:ghost={stage === 'idle'}>{#each tokens as token, i (i)}<span class={token.kind}
					>{token.text}</span
				>{token.rest}{/each}</pre>
	</div>
	<!-- Read out once when the response arrives, not as it streams in -->
	<span class="visually-hidden" role="status"
		>{stage === 'sending' ? 'Sending' : stage === 'done' ? `${status}, ${elapsed} ms` : ''}</span
	>
</div>

<style>
	.request {
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr);
		gap: 1rem;
		width: 100%;
		font-family: 'IBM Plex Mono', ui-monospace, monospace;
	}

	/* The request, set in type on the sky with the word that sends it, and room underneath
	   for its reflection */
	.line {
		position: relative;
		margin-bottom: 1.75rem;
	}

	.command {
		display: flex;
		align-items: baseline;
		gap: 1.25rem;
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

	button,
	.send {
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		font-size: 0.6em;
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.3em;
		cursor: pointer;
		/* A press is felt the moment it happens, however fast the response comes back */
		transition: transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
	}

	button:hover {
		text-decoration-thickness: 2px;
	}

	button:active:not(:disabled) {
		transform: scale(0.97);
	}

	button:disabled {
		cursor: default;
		opacity: 0.45;
		transition:
			opacity 0.15s ease-out,
			transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
	}

	/* The reflection is only type, so it's pressed along with the button above it */
	.line:has(button:not(.copy):active:not(:disabled)) .send:not(.copy),
	.line:has(button.copy:active) .send.copy {
		transform: scale(0.97);
	}

	.copy {
		display: inline-grid;
	}

	/* The word changes with a short crossfade and the slightest blur, no movement */
	.word {
		grid-area: 1 / 1;
		justify-self: start;
		transition:
			opacity 0.18s ease-out,
			filter 0.18s ease-out;
	}

	.word.gone {
		opacity: 0;
		filter: blur(2px);
	}

	@media (prefers-reduced-motion: reduce) {
		.word {
			transition: none;
		}

		/* Pressed, it dims instead of shrinking */
		button:active:not(:disabled),
		.line:has(button:not(.copy):active:not(:disabled)) .send:not(.copy),
		.line:has(button.copy:active) .send.copy {
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
		gap: 1rem;
		font-weight: 600;
		color: var(--ink);
	}

	.time {
		color: var(--ink-soft);
		font-weight: 400;
	}

	.header span {
		color: var(--ink);
	}

	pre {
		margin: 0.75rem 0 0;
		transition: opacity 0.3s ease-out;
		font: inherit;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	/* An example until it's sent: a little fainter than the real thing, still easy to read */
	.ghost {
		margin: 0;
		opacity: 0.9;
	}

	.string {
		color: var(--accent);
	}

	.number,
	.literal {
		color: var(--ink);
	}
</style>
