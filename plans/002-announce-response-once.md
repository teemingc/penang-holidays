# 002 — Announce the response once, not every chunk typed in

- **Commit:** 0b9f508
- **Severity:** MEDIUM
- **Category:** Accessibility
- **Estimated scope:** 1 file, ~6 lines

## Problem

The terminal `div` has `aria-live="polite"`, and that is the box the response types into: `shown` changes about every 16ms, roughly 100 times for a month's JSON. Screen readers queue an announcement for each change, so the user hears a stream of overlapping JSON fragments. An animation must not change what assistive technology reports. Typing the text in is visual decoration, so the live region should report the result once.

## Where

| File                     | Lines   | What's there                                                                       |
| ------------------------ | ------- | ---------------------------------------------------------------------------------- |
| `src/lib/Request.svelte` | 170–185 | `.terminal` with `aria-live="polite"`, the status lines and the typed-in `<pre>`   |
| `src/lib/Request.svelte` | 130     | The existing hidden `role="status"` that announces "Copied" (this is the exemplar) |
| `src/lib/Request.svelte` | 296–303 | The `.visually-hidden` class                                                       |

### Current code

```svelte
<!-- src/lib/Request.svelte:170 -->
<!-- Always there, so the page doesn't shift when the response arrives: until then, a faint
     preview of it -->
<div class="terminal" aria-live="polite">
	{#if stage === 'done'}
```

```svelte
<!-- src/lib/Request.svelte:130 (exemplar) -->
<span class="visually-hidden" role="status">{copied ? 'Copied' : ''}</span>
```

## Target

```svelte
<!-- Always there, so the page doesn't shift when the response arrives: until then, a faint
     preview of it -->
<div class="terminal">
	{#if stage === 'done'}
	…unchanged…
</div>
<!-- Read out once when the response arrives, not as it streams in -->
<span class="visually-hidden" role="status"
	>{stage === 'sending' ? 'Sending' : stage === 'done' ? `${status}, ${elapsed} ms` : ''}</span
>
```

**Why these values:**

- `role="status"` is a polite live region already, the same pattern as the Copy announcement on line 130.
- When the response arrives, `status` and `elapsed` are set before `stage = 'done'` (see lines 56–57 and 72–73 of `send()`), so the announcement is complete in one update, for example "200 OK, 42 ms" or "No response, 1200 ms".
- "Sending" confirms the button press without reading out the request.
- The body text itself is not announced. It is still in the DOM, fully typed in within about 2s, and a screen reader user can move into it.

## Conventions to follow

- Reuse the existing `.visually-hidden` class. Don't add a new one.
- Follow the placement of the existing `role="status"` span: next to the thing it describes, inside `.request`.
- HTML comments in this file are a short description above the element. Keep that style.

## Steps

1. Remove `aria-live="polite"` from `<div class="terminal">`.
2. Directly after the closing `</div>` of `.terminal` (still inside `<div class="request">`), add the `<span class="visually-hidden" role="status">` from Target, with its comment.
3. Check that `.request`'s `grid-template-rows: auto auto minmax(0, 1fr)` still lays out correctly. The span is `position: absolute` through `.visually-hidden`, so it takes no grid cell. If it does take one, move the span inside `.line` instead.

## Out of scope

- Don't change how the response types in or how fast.
- Don't add `tabindex` or other keyboard behaviour to the terminal. That is a separate decision.
- Don't change the Copy status span.

## Verification

**Build**

- [ ] `pnpm check` and `pnpm lint` pass.

**Behavior**

- [ ] In DevTools' Accessibility pane, `.terminal` is no longer a live region and the new span is `status`.
- [ ] With VoiceOver (macOS: ⌘F5) on, press Send. You hear "Sending", then one announcement such as "200 OK, 38 ms", and no JSON fragments.
- [ ] Press Send again: it announces again, because the text goes through `'Sending'` first, so the region always changes.
- [ ] The visual layout of the terminal and the line above it is pixel-identical to before.

**Feel**

- [ ] Not a motion change. Listen to it once with VoiceOver and confirm it sounds calm, not chatty.

## Notes

Whether to also read out the response headers is a content decision. Leaving them out keeps the announcement short.
