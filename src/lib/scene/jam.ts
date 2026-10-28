import { CAR_GAP, CARS, LANES, PER_LANE, SPAN, hash } from './layout.js';

// Into a gap, every driver drives as they do in Penang: most keep up with the car ahead;
// some speed off, weaving through to either side of whoever's in the way; some sit right
// on the bumper of the car in front; and some hog the fast lane at their own pace
type Driver = {
	/** Top speed, units a second; how hard they speed up and brake */
	top: number;
	accel: number;
	brake: number;
	/** The gap kept to the car ahead: standing, and seconds of it at speed */
	standing: number;
	headway: number;
	/** Room wanted to cut into another lane, ahead and behind */
	cut: [number, number];
	/** Makes for the fast lane, by the median, and stays there at their own pace */
	hog: boolean;
	/** How quickly they swing across into the next lane */
	swerve: number;
};

function driver(n: number): Driver {
	const kind = hash(n, 0);
	const r = hash(n, 1);
	// Speeders
	if (kind < 0.25)
		return {
			top: 30 + r * 10,
			accel: 9,
			brake: 14,
			standing: 6,
			headway: 0.3,
			cut: [8, 5],
			hog: false,
			swerve: 3.5
		};
	// Tailgaters
	if (kind < 0.45)
		return {
			top: 21 + r * 5,
			accel: 7,
			brake: 13,
			standing: 5.4,
			headway: 0.1,
			cut: [10, 6],
			hog: false,
			swerve: 2.5
		};
	// Lane hoggers
	if (kind < 0.53)
		return {
			top: 11 + r * 3,
			accel: 3,
			brake: 6,
			standing: 6.4,
			headway: 0.8,
			cut: [12, 8],
			hog: true,
			swerve: 1
		};
	return {
		top: 15 + r * 5,
		accel: 5,
		brake: 8,
		standing: 6.2,
		headway: 0.5,
		cut: [14, 9],
		hog: false,
		swerve: 1.6
	};
}

// Stop, lurch on a few metres, stop: each lane in its own rhythm, the lurch reaching the
// cars further back a moment later
function lurch(t: number) {
	const cycle = t / 5;
	const f = cycle - Math.floor(cycle);
	const go = f < 0.3 ? (1 - Math.cos((f / 0.3) * Math.PI)) / 2 : 1;
	return (Math.floor(cycle) + go) * 4;
}

/**
 * The jam, car by car. Each lane is a queue, front to back. A car's place in it, its slot, says
 * where the jam would have it; one taken out of the queue leaves a gap, and every car behind
 * moves up a slot and drives on to close it. Cars leave at the far end and join again at the
 * back of the shortest lane their way, coming in from the near end, as do the ones that were
 * thrown off once they're gone
 */
export function createJam(taken: ReadonlySet<number>) {
	const drivers = Array.from({ length: CARS }, (_, n) => driver(n));
	// A little irregularity, so the queue doesn't look drawn with a ruler
	const jitter = Array.from({ length: CARS }, (_, i) => Math.sin(i * 12.9898) * 1.2);
	const travelled = new Float64Array(CARS);
	const pace = new Float32Array(CARS);
	const slot = new Float64Array(CARS);
	// Which lane each car is in, where it is across the deck on its way there, and when it
	// last changed lanes
	const laneOf = Uint8Array.from({ length: CARS }, (_, n) => Math.floor(n / PER_LANE));
	const across = Float32Array.from(laneOf, (l) => LANES[l]!.z);
	const drift = new Float32Array(CARS);
	const changed = new Float64Array(CARS).fill(-Infinity);
	const queues = LANES.map((lane, l) =>
		Array.from({ length: PER_LANE }, (_, i) => l * PER_LANE + (lane.way > 0 ? PER_LANE - 1 - i : i))
	);
	const queued = new Uint8Array(CARS).fill(1);
	// The heads of the queues a whole span short of the far end, which is the same place on the
	// bridge, so they don't come round to the back again for an hour of lurching
	const front = LANES.map(
		(lane, l) => (lane.way > 0 ? (PER_LANE - 1) * CAR_GAP - SPAN : 0) + l * 2.3
	);
	const placed = (n: number, l: number, t: number) =>
		front[l]! - slot[n]! * CAR_GAP + jitter[n]! + lurch(t + l * 1.7 - slot[n]! * 0.12);
	queues.forEach((lane, l) =>
		lane.forEach((n, q) => {
			slot[n] = q;
			travelled[n] = placed(n, l, 0);
		})
	);
	let jammed = 0;

	// The shortest lane going the same way as lane l
	function shortest(l: number) {
		let best = l;
		LANES.forEach((lane, m) => {
			if (lane.way === LANES[l]!.way && queues[m]!.length < queues[best]!.length) best = m;
		});
		return best;
	}

	function rejoin(n: number, l: number, t: number) {
		const lane = queues[l]!;
		const last = lane[lane.length - 1];
		slot[n] = last === undefined ? 0 : slot[last]! + 1;
		laneOf[n] = l;
		across[n] = LANES[l]!.z;
		travelled[n] = Math.min(travelled[n]!, placed(n, l, t));
		pace[n] = 0;
		lane.push(n);
		queued[n] = 1;
	}

	const renumber = (lane: number[], from: number) => {
		for (let q = from; q < lane.length; q++) slot[lane[q]!] = q;
	};

	// Stuck behind someone slower with a gap opening up beside them, a driver cuts into it,
	// on whichever side it is. A lane hogger needs no reason to move over to the fast lane,
	// and none to leave it
	function overtake(n: number, l: number, q: number, t: number) {
		const driver = drivers[n]!;
		const lane = queues[l]!;
		const leader = lane[q - 1];
		if (t - changed[n]! < 2) return false;
		const inside = (m: number) => Math.abs(LANES[m]!.z) < Math.abs(LANES[l]!.z);
		if (!driver.hog) {
			if (leader === undefined || pace[leader]! > driver.top * 0.75) return false;
			const room = travelled[leader]! - travelled[n]!;
			if (room > driver.standing + 8 + pace[n]! * 0.6) return false;
		}
		const sides = [l - 1, l + 1].filter(
			(m) => LANES[m]?.way === LANES[l]!.way && (!driver.hog || inside(m))
		);
		if (hash(n, t) < 0.5) sides.reverse();
		const [ahead, behind] = driver.cut;
		for (const m of sides) {
			const other = queues[m]!;
			let i = 0;
			while (i < other.length && travelled[other[i]!]! >= travelled[n]!) i++;
			const before = other[i - 1];
			const after = other[i];
			if (before !== undefined && travelled[before]! - travelled[n]! < ahead) continue;
			if (after !== undefined && travelled[n]! - travelled[after]! < behind) continue;
			// Across, and everyone behind on both sides takes their new place in the queue
			lane.splice(q, 1);
			renumber(lane, q);
			other.splice(i, 0, n);
			renumber(other, i);
			laneOf[n] = m;
			changed[n] = t;
			return true;
		}
		return false;
	}

	function update(t: number) {
		const dt = Math.max(0, t - jammed);
		jammed = t;
		queues.forEach((lane, l) => {
			// Out of the queue when picked up, everyone behind moving up a slot
			for (let q = lane.length - 1; q >= 0; q--) {
				const n = lane[q]!;
				if (!taken.has(n)) continue;
				lane.splice(q, 1);
				queued[n] = 0;
				renumber(lane, q);
			}
			// Past the far end, round to the back of the shortest lane, from the near end
			while (lane.length && travelled[lane[0]!]! >= SPAN) {
				const n = lane.shift()!;
				renumber(lane, 0);
				travelled[n]! -= SPAN;
				rejoin(n, shortest(l), t);
			}
		});
		for (let n = 0; n < CARS; n++) {
			if (!queued[n] && !taken.has(n)) {
				travelled[n] = 0;
				rejoin(n, shortest(Math.floor(n / PER_LANE)), t);
			}
		}
		const moving: number[] = [];
		queues.forEach((lane, l) => {
			// In the order they are on the road: one joined at the back of a lane still catching
			// up can be ahead of the cars it was queued behind, and waits for them to pass
			for (let q = 1; q < lane.length; q++) {
				const n = lane[q]!;
				let p = q;
				while (p > 0 && travelled[lane[p - 1]!]! < travelled[n]!) {
					lane[p] = lane[p - 1]!;
					p--;
				}
				if (p === q) continue;
				lane[p] = n;
				renumber(lane, p);
			}
			lane.forEach((n, q) => {
				const driver = drivers[n]!;
				// Up with the jam, or driving on to catch it up, held back by whoever's ahead
				const target = placed(n, l, t);
				const left = target - travelled[n]!;
				if (left < 0.5) {
					// Cut in on, it waits for the jam to move on before closing up again
					if (left > -0.5) travelled[n] = target;
					pace[n] = 0;
					return;
				}
				const leader = lane[q - 1];
				let room = left;
				let limit = Infinity;
				if (leader !== undefined) {
					const gap =
						travelled[leader]! - travelled[n]! - driver.standing - driver.headway * pace[n]!;
					room = Math.min(room, Math.max(0, gap));
					limit = Math.sqrt(2 * driver.brake * Math.max(0, gap)) + pace[leader]!;
				}
				pace[n] = Math.min(
					pace[n]! + driver.accel * dt,
					driver.top,
					Math.sqrt(2 * driver.brake * left),
					limit
				);
				travelled[n] = Math.min(travelled[n]! + Math.min(pace[n]! * dt, room), target);
				moving.push(n);
			});
		});
		// Then the overtaking, a car at a time
		for (const n of moving) {
			const l = laneOf[n]!;
			overtake(n, l, queues[l]!.indexOf(n), t);
		}
		// Swinging across into the lane they're in
		for (let n = 0; n < CARS; n++) {
			const to = LANES[laneOf[n]!]!.z;
			const was = across[n]!;
			across[n] = to + (was - to) * Math.exp(-dt * drivers[n]!.swerve);
			drift[n] = dt > 0 ? (across[n]! - was) / dt : 0;
		}
	}

	return {
		/** How far along its way each car has come, how fast, and where it is across the deck */
		travelled,
		pace,
		across,
		/** How fast each car is moving across the deck */
		drift,
		update
	};
}
