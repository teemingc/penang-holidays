// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface Window {
		/** Keeps the sky painted until the page takes over: see src/lib/boot.ts */
		skyWatch: ResizeObserver;
	}
}

declare module 'svelte/elements' {
	interface SvelteWindowAttributes {
		/** The time of day the sky shows has been picked, or put back to now: see src/lib/sky.ts */
		onskytime?: (event: Event) => void;
	}
}

export {};
