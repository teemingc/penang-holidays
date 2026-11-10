import { describe, expect, test } from 'vitest';
import { arcAt, minutesAt } from './sky';

const times = { rise: 7 * 60 + 10, set: 18 * 60 + 56 };

describe('the sun around its round of the sky', () => {
	test('rises at 0, is highest halfway through the day and sets at π', () => {
		expect(arcAt(times.rise, times)).toBeCloseTo(0);
		expect(arcAt((times.rise + times.set) / 2, times)).toBeCloseTo(Math.PI / 2);
		expect(arcAt(times.set, times)).toBeCloseTo(Math.PI);
	});

	test('goes on round through the night', () => {
		expect(arcAt(0, times)).toBeGreaterThan(Math.PI);
		expect(arcAt(0, times)).toBeLessThan(Math.PI * 2);
	});

	test('is at the time it says, all round', () => {
		for (let m = 0; m < 1440; m += 37) expect(minutesAt(arcAt(m, times), times)).toBeCloseTo(m);
	});
});
