// How Request.svelte draws text: glitching through random characters as it changes, and JSON
// coloured by what each part of it is

// A random character of the same kind, so letters stay letters and digits stay digits
function glitch(c: string) {
	if (/\d/.test(c)) return String(Math.floor(Math.random() * 10));
	const letter = String.fromCharCode(97 + Math.floor(Math.random() * 26));
	return c === c.toUpperCase() ? letter.toUpperCase() : letter;
}

// When each character lands, in milliseconds: in turn, left to right, give or take
const landings = (text: string) =>
	[...text].map((_, i) => (i / text.length) * 200 + Math.random() * 100);

/**
 * Draws text scrambled at a moment in its settling, each character landing in turn, left to
 * right. true, false and null stay as they are, so no colour changes with them
 */
export function scrambler(text: string) {
	const settle = landings(text);
	return (t: number) =>
		text.replace(/\b(?:true|false|null)\b|[a-z0-9]/gi, (c, i) =>
			c.length > 1 || t >= (settle[i] ?? 0) ? c : glitch(c)
		);
}

/**
 * The same, for a path that may be longer or shorter than the one before: it grows or shrinks a
 * character at a time as it settles, so whatever's after it glides rather than jumps. The
 * slashes and braces hold still
 */
export function morpher(from: string, to: string) {
	const settle = landings(to);
	return (t: number) => {
		const length = Math.round(from.length + (to.length - from.length) * Math.min(1, t / 300));
		let text = '';
		for (let i = 0; i < length; i++) {
			const c = to[i] ?? from[i] ?? '';
			text += t >= (settle[i] ?? Infinity) || !/[a-z0-9]/i.test(c) ? c : glitch(c);
		}
		return text;
	};
}

export interface Token {
	text: string;
	kind: '' | 'comment' | 'key' | 'string' | 'literal' | 'number';
	/** What follows a key: its colon, and any space before it */
	rest: string;
}

/** The JSON, split into comments, keys, strings, numbers and the rest, to colour each */
export function tokenize(text: string): Token[] {
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
