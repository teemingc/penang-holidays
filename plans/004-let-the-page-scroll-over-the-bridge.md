# 004 — Let a swipe over the bridge scroll the page unless it lands on a vehicle

- **Commit:** 0b9f508
- **Severity:** MEDIUM
- **Category:** Accessibility (gesture)
- **Estimated scope:** 1 file, ~15 lines

## Problem

`.scene` has `touch-action: none`, so the browser never pans the page from any touch inside it. On a phone the scene is 75vw tall (up to 30rem), which is a large part of the screen. A swipe that starts anywhere on the bridge or the sea does nothing, not just one that grabs a car. The comment says the aim is "Dragging a vehicle doesn't scroll the page". This plan keeps that aim and limits it to touches that actually land on a vehicle.

## Where

| File                   | Lines                | What's there                                                                                          |
| ---------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/lib/Scene.svelte` | 1637–1644            | `.scene` styles with `touch-action: none`                                                             |
| `src/lib/Scene.svelte` | 1380–1410            | `aim(event: PointerEvent)` and `nearest(event: PointerEvent)`, which find the vehicle under a pointer |
| `src/lib/Scene.svelte` | 1477–1480, 1611–1616 | Pointer listeners being added and removed                                                             |

### Current code

```css
/* src/lib/Scene.svelte:1637 */
.scene {
	position: relative;
	width: 100%;
	height: 100%;
	/* Dragging a vehicle doesn't scroll the page */
	touch-action: none;
	-webkit-tap-highlight-color: transparent;
}
```

```ts
// src/lib/Scene.svelte:1380
function aim(event: PointerEvent) {
	const r = host.getBoundingClientRect();
	pointer.set(
		((event.clientX - r.left) / r.width) * 2 - 1,
		1 - ((event.clientY - r.top) / r.height) * 2
	);
	return r;
}
function nearest(event: PointerEvent) {
	const r = aim(event);
	let best: number | null = null;
	let reach = (event.pointerType === 'touch' ? 28 : 16) ** 2;
```

```ts
// src/lib/Scene.svelte:1477
host.addEventListener('pointerdown', down);
host.addEventListener('pointermove', move);
host.addEventListener('pointerup', up);
host.addEventListener('pointercancel', up);
```

## Target

```css
.scene {
	position: relative;
	width: 100%;
	height: 100%;
	/* The page scrolls past the bridge; only a touch on a vehicle holds it still, to drag */
	touch-action: pan-y pinch-zoom;
	-webkit-tap-highlight-color: transparent;
}
```

```ts
// Anything with a place on screen: a pointer, or a finger on a touch screen
type Spot = { clientX: number; clientY: number; pointerType: string };

function aim(event: Spot) {
	// …unchanged…
}
function nearest(event: Spot) {
	// …unchanged…
}
```

```ts
// A finger that lands on a vehicle picks it up, and the page holds still for the drag;
// anywhere else, it scrolls as usual
function touchstart(event: TouchEvent) {
	const touch = event.touches[0];
	if (event.touches.length !== 1 || !touch) return;
	if (nearest({ clientX: touch.clientX, clientY: touch.clientY, pointerType: 'touch' }) !== null) {
		event.preventDefault();
	}
}

host.addEventListener('touchstart', touchstart, { passive: false });
host.addEventListener('pointerdown', down);
host.addEventListener('pointermove', move);
host.addEventListener('pointerup', up);
host.addEventListener('pointercancel', up);
```

and in the cleanup:

```ts
host.removeEventListener('touchstart', touchstart);
```

**Why these values:**

- `pan-y` lets a vertical swipe scroll the page, and `pinch-zoom` keeps zoom working. Horizontal pans still aren't handled by the browser, so a sideways drag on the bridge never fights with a horizontal swipe.
- A non-passive `touchstart` that calls `preventDefault()` is the one reliable way, in both Safari and Chrome, to stop a pan that `touch-action` would otherwise allow. It only does so when `nearest()` finds a vehicle, using the same 28px touch reach as `down()`, so the two always agree.
- When a swipe starts away from a vehicle, the browser takes over the pan and fires `pointercancel`. That calls `up()`, which returns early because `held` is `null`, so nothing breaks.

## Conventions to follow

- Event handlers in this file are named functions declared just above the `addEventListener` block (`down`, `move`, `up`). Put `touchstart` there too.
- Comments are plain sentences describing what happens.
- `nearest()` must stay the only hit-test. Don't write a second one.

## Steps

1. Above `function aim`, add the `Spot` type with its comment. Change the parameter types of `aim` and `nearest` from `PointerEvent` to `Spot`. Their bodies stay as they are. `down` and `move` still pass `PointerEvent`s, which match `Spot`.
2. Add `function touchstart` with its comment directly above `host.addEventListener('pointerdown', down);`.
3. Add `host.addEventListener('touchstart', touchstart, { passive: false });` as the first listener.
4. In the `onMount` cleanup, add `host.removeEventListener('touchstart', touchstart);` next to the other `removeEventListener` calls.
5. In `.scene`'s CSS, change `touch-action: none;` to `touch-action: pan-y pinch-zoom;` and replace its comment with the one from Target.

## Out of scope

- Don't change `down`, `move`, `up`, how a throw's speed is measured, or the 28px/16px reach.
- Don't change the cursor logic.
- Don't add a long-press-to-grab mechanic.

## Verification

**Build**

- [ ] `pnpm check` and `pnpm lint` pass.

**Behavior** (on a real phone, iOS Safari and Android Chrome, against the dev server on your LAN; DevTools touch emulation does not reproduce `touch-action` faithfully)

- [ ] Swipe up over empty sea or sky in the scene: the page scrolls.
- [ ] Put a finger on a car and drag: the car follows 1:1 and the page does not scroll, including when you drag straight up or down.
- [ ] Flick a car upward: it throws as before.
- [ ] Pinch over the scene: the page zooms.
- [ ] On desktop, dragging with the mouse works exactly as before.

**Feel**

- [ ] On the phone, scroll the page past the scene a few times as if reading. It should never feel sticky. Then grab a car mid-scroll: the drag should take hold on the first touch.

## Notes

A touch that starts on a vehicle and is meant as a scroll will grab the vehicle. With a 28px reach on small cars, that should be rare, but check it on a real device.
