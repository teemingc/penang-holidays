/**
 * The little flag in the header is cloth, not cloud: a car flying close by doesn't tear it, but
 * its gust sets the flag flapping hard and leaning away from it, and it settles back
 */
export function createFlag(flag: HTMLElement, reduced: () => boolean) {
	// Its middle, in the header's coordinates, and its width
	let box = { x: 0, y: 0, w: 0 };

	// The gust at the flag: how strong, and which way it blew; and how far the flag has caught
	// up with it. It flaps faster, the wave and its folds sped up together so the ripple holds,
	// and leans from the hoist. Only what the compositor can do on its own: the animations'
	// rates and the flag's transform, written only when they've moved enough to see, and not
	// at all once it's calm
	let gust = 0;
	let gustWay = 1;
	let flapping = 0;
	let rate = 1;
	let animations: Animation[] = [];

	// Flicked with a finger, the flag is blown about as by a car flying close by, away from
	// the side it was flicked on
	function flick(event: PointerEvent) {
		if (reduced()) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		const cloth = flag.getBoundingClientRect();
		gust = Math.max(gust, 0.9);
		gustWay = event.clientX < cloth.left + cloth.width / 2 ? 1 : -1;
	}
	flag.addEventListener('pointerdown', flick);

	return {
		/** Where it is in the header, which is at `header` */
		measure(header: DOMRect) {
			const cloth = flag.getBoundingClientRect();
			box = {
				x: cloth.left - header.left + cloth.width / 2,
				y: cloth.top - header.top + cloth.height / 2,
				w: cloth.width
			};
		},

		/** Something passing from (x, y) in the header by (dx, dy), `length` pixels in all */
		pass(x: number, y: number, dx: number, dy: number, length: number) {
			if (!box.w) return;
			// How close it came to the flag along the way, and how fast it was going
			const along = Math.max(0, Math.min(1, ((box.x - x) * dx + (box.y - y) * dy) / length ** 2));
			const miss = Math.hypot(x + dx * along - box.x, y + dy * along - box.y);
			const reach = box.w * 2.5;
			if (miss < reach) {
				const strength = (1 - miss / reach) ** 1.5 * Math.min(1, length / 10);
				if (strength > gust) {
					gust = strength;
					gustWay = Math.sign(dx) || gustWay;
				}
			}
		},

		flutter(dt: number) {
			if (gust === 0 && flapping === 0) return;
			// It catches the gust at once, and the gust dies away over a couple of seconds
			gust = gust < 0.005 ? 0 : gust * Math.exp(-dt * 1.6);
			flapping += (gust - flapping) * Math.min(1, dt * (gust > flapping ? 14 : 4));
			if (gust === 0 && flapping < 0.005) flapping = 0;
			const next = 1 + flapping * 3.5;
			if (Math.abs(next - rate) > 0.04 || (flapping === 0 && rate !== 1)) {
				rate = flapping === 0 ? 1 : next;
				if (!animations.length) animations = flag.getAnimations({ subtree: true });
				for (const animation of animations) animation.updatePlaybackRate(rate);
			}
			flag.style.transform = flapping
				? `rotate(${gustWay * flapping * 7}deg) scaleX(${1 - flapping * (gustWay < 0 ? 0.3 : 0.08)})`
				: '';
		},

		dispose() {
			flag.removeEventListener('pointerdown', flick);
			gust = flapping = 0;
			flag.style.transform = '';
			for (const animation of animations) animation.updatePlaybackRate(1);
		}
	};
}

export type Flag = ReturnType<typeof createFlag>;
