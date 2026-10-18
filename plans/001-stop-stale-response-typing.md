# 001 — Stop the previous response typing in when Send is pressed again

- **Commit:** 0b9f508
- **Severity:** HIGH
- **Category:** Interruptibility & springs
- **Estimated scope:** 1 file, ~8 lines

## Problem

After a response arrives, `send()` types it into the terminal 24 characters every 16ms. By then `stage` is already `'done'`, so the Send button is enabled again. If the user presses Send while the text is still typing in, the old loop keeps running next to the new one. Both write `shown`, so the text jumps between two lengths and, when the old loop finishes, it shrinks back and types in again. Motion that the user can trigger again has to give way to the newer run, not keep going alongside it.

## Where

| File                     | Lines | What's there                                                                  |
| ------------------------ | ----- | ----------------------------------------------------------------------------- |
| `src/lib/Request.svelte` | 21    | `let body = '';`, a component-level variable shared by every call to `send()` |
| `src/lib/Request.svelte` | 49–91 | `send()`, including the typing loop at 86–90                                  |

### Current code

```ts
// src/lib/Request.svelte:21
let body = '';
```

```ts
// src/lib/Request.svelte:49
async function send() {
	if (stage === 'sending') return;
	stage = 'sending';
	shown = '';
	const started = performance.now();
	const request = fetch(path);
	// …unchanged…

	body = await request;
	stage = 'done';

	// The response streams in, a little at a time
	if (reducedMotion) {
		shown = body;
		return;
	}
	for (let i = 0; i <= body.length; i += 24) {
		shown = body.slice(0, i);
		await wait(16);
	}
	shown = body;
}
```

## Target

```ts
// Which send is the latest: an older one still streaming in stops when a new one starts
let run = 0;
```

```ts
async function send() {
	if (stage === 'sending') return;
	const id = ++run;
	stage = 'sending';
	shown = '';
	const started = performance.now();
	const request = fetch(path);
	// …unchanged…

	const body = await request;
	stage = 'done';

	// The response streams in, a little at a time
	if (reducedMotion) {
		shown = body;
		return;
	}
	for (let i = 0; i <= body.length; i += 24) {
		shown = body.slice(0, i);
		await wait(16);
		// Sent again while this one was still coming in: the new one takes over
		if (id !== run) return;
	}
	shown = body;
}
```

**Why these values:**

- `run` / `id` is a plain generation counter. It doesn't need `$state` because nothing renders it.
- `body` becomes a `const` inside `send()`, so each run types its own response and never reads one that a newer run has already replaced.
- The check comes right after `await wait(16)`, which is the only point where a newer `send()` can have started. A stale loop therefore stops within 16ms and never writes `shown` again.
- The typing speed (24 characters every 16ms) does not change.

## Conventions to follow

- Comments in this file are short plain sentences with no trailing full stop, describing what the user sees (for example `// The response streams in, a little at a time`). Write the new comments the same way.
- Tabs for indentation; Prettier config is in `prettier.config.js`.

## Steps

1. Delete `let body = '';` at line 21.
2. Add `let run = 0;` with its comment just above `async function send()`. Keep it next to the other module-level state, such as `const wait`.
3. In `send()`, add `const id = ++run;` straight after the `if (stage === 'sending') return;` guard.
4. Change `body = await request;` to `const body = await request;`.
5. In the `for` loop, add the `if (id !== run) return;` check and its comment directly after `await wait(16);`.

## Out of scope

- Don't change the typing speed, the chunk size, or the reduced-motion branch.
- Don't change the `disabled={stage === 'sending'}` logic on the button. Send should stay enabled while the text types in.
- Don't touch `copy()`, the reflection, or the tokenizer.

## Verification

**Build**

- [ ] `pnpm check` and `pnpm lint` pass.
- [ ] `pnpm test` passes.

**Behavior**

- [ ] Start the dev server (`.claude/launch.json` → `dev`, port 5291). Press Send, then press it again 2–3 times while the JSON is still typing in. The terminal clears, the new response types in from the start, and it never jumps between two lengths or shrinks back afterwards.
- [ ] Press Send once and wait: it still types in at the same speed as before.
- [ ] With `prefers-reduced-motion: reduce` emulated, the response appears all at once, as before.

**Feel**

- [ ] Record the screen while pressing Send repeatedly, then step through it frame by frame. Each press should give exactly one clean clear-and-retype, with no flicker frames in between.

## Notes

None. This is a correctness fix with no taste involved.
