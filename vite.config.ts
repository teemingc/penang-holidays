import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { fileURLToPath } from 'node:url';
import { build, type Plugin, type Rolldown } from 'vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';

/**
 * src/lib/boot.ts as a script to inline, the default export of `virtual:boot`: bundled on its
 * own with what it imports, so the script that colours the sky before the page's first paint
 * is built from the same src/lib/sky.ts the page is, rather than a copy of it kept by hand
 */
function boot(): Plugin {
	const entry = fileURLToPath(new URL('./src/lib/boot.ts', import.meta.url));
	return {
		name: 'boot',
		resolveId: (id) => (id === 'virtual:boot' ? '\0virtual:boot' : undefined),
		async load(id) {
			if (id !== '\0virtual:boot') return;
			const result = await build({
				configFile: false,
				logLevel: 'silent',
				build: {
					write: false,
					minify: true,
					lib: { entry, formats: ['iife'], name: 'boot' }
				}
			});
			// One bundle, of one chunk: not watching, and in the one format
			const [chunk] = (result as Rolldown.RolldownOutput[])[0]!.output;
			// Bundled again when any of it changes
			for (const file of chunk.moduleIds) this.addWatchFile(file);
			// never the end of the script it's inlined in
			const code = chunk.code.trim().replaceAll('</script', '<\\/script');
			return `export default ${JSON.stringify(code)};`;
		}
	};
}

export default defineConfig({
	plugins: [
		boot(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				// Lets components await data, such as what a remote function returns
				experimental: { async: true }
			},
			adapter: adapter(),
			experimental: { remoteFunctions: true }
		}),
		// only the page is localised, / in english and /ms in malay, api paths stay as they are
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true,
			strategy: ['url', 'baseLocale'],
			urlPatterns: [
				{
					pattern: '/',
					localized: [
						['ms', '/ms'],
						['en', '/']
					]
				}
			]
		})
	],
	// A port of its own, so it never lands on another project's dev server
	server: { port: 5291, strictPort: true },
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
