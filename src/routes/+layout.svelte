<script lang="ts">
	import { browser } from '$app/env';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import { baseLocale, extractLocaleFromUrl, overwriteGetLocale } from '#lib/paraglide/runtime.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// read the locale from page.url so the words update on client navigation
	if (browser) overwriteGetLocale(() => extractLocaleFromUrl(page.url.href) ?? baseLocale);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
	:global(body) {
		margin: 0;
		font-size: 16px;
		line-height: 1.6;
		-webkit-font-smoothing: antialiased;
	}
</style>
