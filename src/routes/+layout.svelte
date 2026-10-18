<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
	:global(:root) {
		--bg: #ffffff;
		--fg: #1f2328;
		--muted: #59636e;
		--link: #0969da;
		--code-bg: #f6f8fa;
		--border: #d1d9e0;
		color-scheme: light dark;
	}

	@media (prefers-color-scheme: dark) {
		:global(:root) {
			--bg: #0d1117;
			--fg: #e6edf3;
			--muted: #9198a1;
			--link: #4493f8;
			--code-bg: #151b23;
			--border: #3d444d;
		}
	}

	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--fg);
		font:
			16px/1.6 system-ui,
			sans-serif;
	}
</style>
