# 005 — Heal the header's cloud wake by elapsed time, not by frames

- **Commit:** 0b9f508
- **Severity:** MEDIUM
- **Category:** Cohesion, hierarchy & spatial consistency (timing)
- **Estimated scope:** 1 file, ~15 lines

## Problem

When a car flies through the headline it tears the "cloud". `settle()` spreads that damage and heals it by a fixed amount on every other frame (`heal = 0.995`), so how fast it heals depends on the display's refresh rate. At 60Hz the headline takes about 26s to clear, on a 120Hz ProMotion screen about 13s, and longer when the browser throttles frames. Everything else in the scene (falling, bobbing, sinking) is scaled by `dt`, so this is the one effect that runs at a different speed on different machines. The slow heal itself is a deliberate choice ("slowly, fades back to calm") and stays as it is. Only its dependence on the frame rate goes.

## Where

| File                   | Lines     | What's there                                  |
| ---------------------- | --------- | --------------------------------------------- |
| `src/lib/Scene.svelte` | 1334–1370 | `settling` counter and `settle()`             |
| `src/lib/Scene.svelte` | ~1600     | `settle();` called from `loop()` without `dt` |

### Current code

```ts
// src/lib/Scene.svelte:1334
// Each frame the disturbance spreads a little and, slowly, fades back to calm
let settling = 0;
function settle() {
	if (!header || stirred === -Infinity) return;
	if (stirred === 0) {
		stirred = -Infinity;
		header.style.filter = '';
		calm();
		return;
	}
	// Spreading out a little, and healing slowly, every other frame: slow enough that
	// nobody can tell, and half the work
	if (++settling % 2) return;
	const W = wakeMap.width;
	const H = wakeMap.height;
	const heal = 0.995;
	let left = 0;
	for (const field of [pushX, pushY, torn]) {
		for (let cy = 0; cy < H; cy++) {
			for (let cx = 0; cx < W; cx++) {
				// …diffusion…
				spare[c] = (field[c]! * 0.92 + (l + r + u + d) * 0.02) * heal;
			}
		}
		field.set(spare);
	}
	const data = pixels!.data;
	for (let c = 0; c < torn.length; c++) {
		// …write pixels, track `left`…
	}
	wake.putImageData(pixels!, 0, 0);
	if (left < 0.02) stirred = 0;
	wakeImage.setAttribute('href', wakeMap.toDataURL());
}
```

```ts
// src/lib/Scene.svelte:~1600, inside loop()
physics(dt, now / 1000);
settle();
```

## Target

```ts
// The disturbance spreads a little and, slowly, fades back to calm, in steady steps of a
// thirtieth of a second however fast the screen draws: slow enough that nobody can tell
const SETTLE_STEP = 1 / 30;
let owed = 0;
function settle(dt: number) {
	if (!header || stirred === -Infinity) return;
	if (stirred === 0) {
		stirred = -Infinity;
		owed = 0;
		header.style.filter = '';
		calm();
		return;
	}
	// Never more than a few steps at once, after a stall
	owed = Math.min(owed + dt, SETTLE_STEP * 3);
	if (owed < SETTLE_STEP) return;
	const W = wakeMap.width;
	const H = wakeMap.height;
	const heal = 0.995;
	let left = 0;
	for (; owed >= SETTLE_STEP; owed -= SETTLE_STEP) {
		for (const field of [pushX, pushY, torn]) {
			// …diffusion loop, unchanged…
			field.set(spare);
		}
	}
	// …pixel write, putImageData, `left` threshold and toDataURL, unchanged and once per call…
}
```

```ts
// in loop()
physics(dt, now / 1000);
settle(dt);
```

**Why these values:**

- `SETTLE_STEP = 1 / 30`: every other frame at 60Hz is a step every 1/30s, so the timing tuned on a 60Hz screen is kept exactly: about 26s to clear, the same spread per step, the same `0.995` heal and the same `0.92` / `0.02` diffusion weights.
- At most 3 steps at once matches the `dt` limit of 0.1s in `loop()`, so a stalled tab catches up a little instead of running hundreds of steps in one frame.
- The pixel write and `toDataURL()` still happen at most once per call. On a 120Hz screen they now run every 4th frame instead of every 2nd, which also halves that work there.
- `owed = 0` on calm, so the next car's wake starts on a whole step.

## Conventions to follow

- Elsewhere in this file, time-dependent motion is scaled by `dt` from `loop()`. `physics(dt, …)` is the exemplar, for example `velocity.multiplyScalar(Math.exp(-dt * 0.5))`. This plan uses a fixed timestep instead because diffusion is a stencil and can't be scaled by `dt`.
- Constants are `UPPER_SNAKE` next to where they're used (`WAKE_SCALE`, `RIPPLE_LIFE`).

## Steps

1. Replace `let settling = 0;` with `const SETTLE_STEP = 1 / 30;` and `let owed = 0;`. Replace the comment above them with the Target comment.
2. Change `function settle()` to `function settle(dt: number)`.
3. In the `stirred === 0` branch, add `owed = 0;`.
4. Delete the "every other frame" comment and `if (++settling % 2) return;`. In their place, put the `owed = Math.min(…)` line with its comment, and `if (owed < SETTLE_STEP) return;`.
5. Wrap the existing `for (const field of [pushX, pushY, torn]) { … }` block (and only that block) in `for (; owed >= SETTLE_STEP; owed -= SETTLE_STEP) { … }`. Keep `const W`, `const H`, `const heal` and `let left` above the new loop.
6. In `loop()`, change `settle();` to `settle(dt);`.

## Out of scope

- Don't change `heal`, the diffusion weights, `WAKE_SCALE`, the `0.02` stop threshold, or the SVG filter.
- Don't change `waft()`.
- Don't replace `toDataURL()`. Whether the filter is expensive is a separate question, covered in Notes.

## Verification

**Build**

- [ ] `pnpm check` and `pnpm lint` pass.

**Behavior**

- [ ] On a 60Hz display, fling a car up through the headline. Time it from the tear until `header.style.filter` is back to `''` (watch it in DevTools Elements). It should take about the same as before, roughly 20–30s depending on the tear.
- [ ] Repeat on a 120Hz display (ProMotion Mac or iPhone), or in Chrome with `--disable-frame-rate-limit`. The time should match the 60Hz run within a couple of seconds.
- [ ] With reduced motion emulated, cars don't tear the cloud (`waft` returns early). Unchanged.

**Feel**

- [ ] Record the headline healing at 60Hz and at 120Hz and compare them side by side. The wisps should drift back together at the same pace, with no visible stepping. If stepping shows at 120Hz, report it rather than changing `SETTLE_STEP`.

## Notes

The audit couldn't tell from the code whether keeping the headline under this filter (two displacement maps, turbulence, a Gaussian blur) for ~26s, with `toDataURL()` re-encoded at every step, drops frames in Safari. Profile one healing in Safari's Timelines (with CPU and Rendering checked) and record what you see in this plan. If paint regularly goes over ~6ms, that is a separate plan.
