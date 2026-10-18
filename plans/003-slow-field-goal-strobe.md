# 003 — Slow the field-goal cable strobe below three flashes a second

- **Commit:** 0b9f508
- **Severity:** MEDIUM
- **Category:** Accessibility
- **Estimated scope:** 1 file, 2 lines

## Problem

When a thrown car passes between a pylon's posts, every cable switches between gold and white for 3 seconds, following `Math.sin(since * 22 + …)`. That is 22 / 2π ≈ 3.5 cycles a second. WCAG 2.3.1 sets a limit of three flashes in any one second. Reduced motion already turns the strobe into a steady gold, but people who are sensitive to flashing don't necessarily turn on reduced motion, so the default version has to stay under the limit too.

## Where

| File                   | Lines     | What's there                      |
| ---------------------- | --------- | --------------------------------- |
| `src/lib/Scene.svelte` | 1530–1535 | The strobe inside `cableLights()` |

### Current code

```ts
// src/lib/Scene.svelte:1530
// After a field goal, every cable strobes gold and white for a few seconds
if (since < 3) {
	const flash = still ? gold : Math.sin(since * 22 + x * 0.05) > 0 ? gold : white;
	led.copy(flash);
}
```

## Target

```ts
// After a field goal, every cable strobes gold and white for a few seconds: under three
// flashes a second, the most that's safe for anyone sensitive to flashing
if (since < 3) {
	const flash = still ? gold : Math.sin(since * 17 + x * 0.05) > 0 ? gold : white;
	led.copy(flash);
}
```

**Why these values:**

- `17` gives 17 / 2π ≈ 2.7 cycles a second: under 3, with a margin for frames that land unevenly, while still reading as a celebration.
- `x * 0.05` (the pattern running along the cables), the 3s length, and the colours stay the same.

## Conventions to follow

- Comments in `Scene.svelte` are plain sentences describing the scene, with a colon to add a reason. Keep that voice.

## Steps

1. In `cableLights()`, change `since * 22` to `since * 17`.
2. Replace the one-line comment above the `if` with the two-line comment from Target.

## Out of scope

- The `beacons` blink at `Math.sin(clock * 3)` (about 0.5 Hz) is fine. Leave it alone.
- Don't change the reduced-motion branch (`still ? gold`).
- Don't change the fireworks.

## Verification

**Build**

- [ ] `pnpm check` and `pnpm lint` pass.

**Behavior**

- [ ] Run the dev server and throw cars (drag and fling one up between a pylon's two posts) until you score a field goal. The cables still strobe for about 3s.
- [ ] Record the screen at 60fps and count the gold-to-white-to-gold cycles in one second: 2–3, not 3–4.

**Feel**

- [ ] Watch it at night (or set `data-sky` by hand) with fresh eyes. It should still feel like a celebration, not slow. If it reads as sluggish, don't go back above 18 (2.9 Hz).

## Notes

The cables are thin, so the strobe may well be under WCAG's area threshold for a "general flash" anyway. This change isn't based on that: it's cheap, and it removes the question.
