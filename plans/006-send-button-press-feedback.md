# 006 — Give Send and Copy a press response, mirrored in the reflection

- **Commit:** 0b9f508
- **Severity:** MEDIUM
- **Category:** Physicality & origin
- **Estimated scope:** 1 file, ~25 lines of CSS

## Problem

Send and Copy are buttons styled as underlined text. Hovering thickens the underline, but pressing does nothing, so a click feels like it wasn't received. Send is meant to dim while the request is on its way (the comment at line 120 says so), but the dim is a 150ms fade and the request comes back in a few milliseconds (2 ms on the dev server), so not a single frame of it shows. Rule: if a button responds to hover but not to the press, the press feels dead. Press feedback should be felt rather than seen, at `scale(0.97)` over about 150ms. The buttons are also mirrored in the sea below them by plain `<span>`s, which can never be `:active`, so the reflection has to be pressed along with them or the illusion breaks.

## Where

| File                     | Lines   | What's there                                                                                                          |
| ------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/lib/Request.svelte` | 120–145 | The `command` snippet: real `<button>`s for `key === 'button'`, mirrored `<span class="send">`s for `key === 'label'` |
| `src/lib/Request.svelte` | 207–211 | `.line`, which contains both the buttons and `.reflection`                                                            |
| `src/lib/Request.svelte` | 257–279 | `button, .send` base styles, `button:hover`, `button:disabled`                                                        |
| `src/lib/Request.svelte` | 299–303 | The `prefers-reduced-motion: reduce` block                                                                            |

### Current code

```svelte
<!-- src/lib/Request.svelte:128 -->
{#if key === 'button'}
	<button onclick={send} disabled={stage === 'sending'}>{@render label()}</button>
	<!-- Both words share one slot, as wide as the longer, and swap in place -->
	<button class="copy" onclick={copy} aria-label="Copy the URL">
	…
{:else}
	<span class="send">{@render label()}</span>
	<span class="send copy">
	…
{/if}
```

```css
/* src/lib/Request.svelte:257 */
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
}

button:hover {
	text-decoration-thickness: 2px;
}

button:disabled {
	cursor: default;
	opacity: 0.45;
	transition: opacity 0.15s ease-out;
}
```

```css
/* src/lib/Request.svelte:299 */
@media (prefers-reduced-motion: reduce) {
	.word {
		transition: none;
	}
}
```

## Target

```css
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
```

```css
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
```

**Why these values:**

- `scale(0.97)`: you feel the press rather than see it. Going to 0.9 or below reads as the button visibly shrinking.
- `0.15s`: the duration budget for a button press is about 150ms. Durations in this file are written in seconds (`0.15s`, `0.18s`, `0.3s`), so this is too.
- `cubic-bezier(0.25, 0.46, 0.45, 0.94)` (ease-out-quad) is the curve for a button press. The shrink starts at once and settles gently, and the release eases back the same way.
- The `:disabled` rule repeats the `transform` transition because Send becomes disabled in the same moment the press is released. Without it, the disabled rule's transition list (opacity only) would replace the base one, and Send would snap back from 0.97 instead of easing back.
- `:not(:disabled)` stops a disabled Send from reacting to a press.
- `transform-origin` stays at its default (`center`). That's right for a word shrinking in place.
- The mirror spans need no `display` change. They're children of `.command`, which is `display: flex`, so they're flex items and transforms already apply to them.
- Under reduced motion nothing moves: the press becomes an instant dim to `0.7`. Reduced motion means gentler, not none, and this keeps the confirmation.

## Conventions to follow

- `src/lib/Request.svelte` is the exemplar. Its `.word` crossfade (lines 285–297) shows the house style: a short comment saying what the motion does, then a transition list written with the duration in seconds.
- CSS comments in this file are one plain sentence above the rule, describing what the reader sees, with no full stop.
- Add to the existing `@media (prefers-reduced-motion: reduce)` block. Don't create a second one.

## Steps

1. In the `button, .send` rule, add the comment and the `transition: transform 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);` line from Target, after `cursor: pointer;`.
2. Directly after the `button:hover` rule, add the `button:active:not(:disabled)` rule.
3. In `button:disabled`, replace `transition: opacity 0.15s ease-out;` with the two-item transition from Target.
4. Directly after `button:disabled`, add the `.line:has(...)` reflection rule with its comment.
5. In the existing `@media (prefers-reduced-motion: reduce)` block, add the reduced-motion press rule with its comment after the `.word` rule.
6. Run `pnpm check`. Svelte must not report an unused-selector warning for the `.line:has(...)` selectors. If it does, report it rather than adding `:global()`.

## Out of scope

- Don't change the markup, the labels, or the `disabled` logic. The labels never change, and that's a deliberate decision (comment at line 120).
- Don't hold Send in its "sending" state for a minimum time to make the dim visible. That would hold back the response just to show an animation.
- Don't touch the hover underline, the `.word` crossfade, the reflection's filter, or `.mirror`'s transform.
- Don't add a `will-change`.

## Verification

**Build**

- [ ] `pnpm check` (no unused-selector warnings), `pnpm lint` and `pnpm test` pass.

**Behavior**

- [ ] Start the dev server (`.claude/launch.json` → `dev`, port 5291). Press and hold on Send: it shrinks slightly, and the reflected "Send" in the sea below shrinks with it. Release: both ease back.
- [ ] Same for Copy: the button and its reflection shrink on press, and the Copy/Copied crossfade still plays.
- [ ] Press and hold Send, drag off it and release: it eases back without sending, which is standard button behaviour.
- [ ] With `prefers-reduced-motion: reduce` emulated in DevTools: pressing dims both the button and its reflection to 70% and nothing changes size.
- [ ] On a real iPhone in Safari, tap Send and Copy. iOS only applies `:active` when there's a touch listener on the element or a parent. If the press doesn't show there, add `ontouchstart={() => {}}` to both `<button>`s in the `key === 'button'` branch, then check again. Svelte 5 makes `ontouchstart` passive, so scrolling isn't affected.

**Feel**

- [ ] Record a click at 60fps and step through it frame by frame. The shrink should reach most of its depth in the first 2–3 frames and settle, not crawl. At normal speed you should feel it more than see it. If it doesn't register at all, try `0.96`, and don't go below that.
- [ ] Click Send ten times in a row at normal speed. It should never feel slow or bouncy.

## Notes

- The mirrored "Send" doesn't dim when the real one is disabled, because the span is never `:disabled`. With responses this fast it never shows, so this plan leaves it alone.
- Whether 3% reads on underlined text about 19px tall can only be judged by looking. That's what the feel-check is for.
