<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const latest = $derived(String(data.years.at(-1)));
</script>

<svelte:head>
	<title>Penang Holidays API</title>
	<meta
		name="description"
		content="Penang public holidays from the state government portal, as a free JSON API."
	/>
</svelte:head>

<main>
	<h1>Penang Holidays API</h1>
	<p>
		Penang public holidays as JSON, scraped from the
		<a href="https://www.penang.gov.my/index.php/component/sppagebuilder/page/50">
			Penang state government portal</a
		>. Free to use, no key needed.
	</p>

	<h2>Endpoints</h2>
	<dl>
		<dt><a href={resolve('/years')}><code>GET /years</code></a></dt>
		<dd>The years available: {data.years.join(', ')}</dd>

		<dt><a href={resolve('/[year]', { year: latest })}><code>GET /{latest}</code></a></dt>
		<dd>Every holiday in a year</dd>

		<dt>
			<a href={resolve('/[year]/[month]', { year: latest, month: '3' })}
				><code>GET /{latest}/3</code></a
			>
		</dt>
		<dd>Holidays in one month, 1 to 12</dd>
	</dl>

	<h2>Response</h2>
	<p>The first two holidays of <code>GET /{latest}</code>:</p>
	<pre><code>{JSON.stringify(data.example, null, 2)}</code></pre>

	<ul>
		<li><code>name</code> is the name as published, in Malay.</li>
		<li>
			<code>type</code> is <code>federal</code> (Hari Kelepasan Am Persekutuan) or
			<code>state</code> (Hari Kelepasan Am Negeri).
		</li>
		<li>
			<code>tentative</code> means the portal marks the date as subject to change, usually for holidays
			that depend on a moon sighting.
		</li>
		<li>Two holidays can share a date.</li>
	</ul>

	<h2>Good to know</h2>
	<ul>
		<li>
			The data is exactly what the portal lists. Replacement days and holidays declared after
			publication are only included if the portal lists them.
		</li>
		<li>Responses are cached for an hour and allow requests from any origin (CORS).</li>
		<li>
			The data is checked every December, when the next year's holidays are usually published.
		</li>
	</ul>

	<p>
		Source code and raw JSON files are on
		<a href="https://github.com/teemingc/penang-holidays">GitHub</a>.
	</p>
</main>

<style>
	main {
		max-width: 42rem;
		margin: 0 auto;
		padding: 3rem 1rem;
	}

	h1 {
		margin-top: 0;
		font-size: 2rem;
		line-height: 1.2;
	}

	h2 {
		margin-top: 2.5rem;
		font-size: 1.25rem;
	}

	a {
		color: var(--link);
	}

	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.875em;
	}

	pre {
		overflow-x: auto;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--code-bg);
	}

	dt {
		margin-top: 1rem;
	}

	dd {
		margin-left: 0;
		color: var(--muted);
	}

	li + li {
		margin-top: 0.25rem;
	}
</style>
