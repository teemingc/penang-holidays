// Declared in a file of its own, without imports or exports, so it declares the module rather
// than adding to one
declare module 'virtual:boot' {
	/** src/lib/boot.ts, bundled into a script to inline: see vite.config.ts */
	const code: string;
	export default code;
}
