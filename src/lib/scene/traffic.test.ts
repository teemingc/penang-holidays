import { describe, expect, test } from 'vitest';
import { busyAt } from './traffic';

describe('how busy the bridge is', () => {
	test('is a jam from six in the morning to nine at night', () => {
		for (let m = 6 * 60; m <= 21 * 60; m += 15) expect(busyAt(m)).toBeGreaterThanOrEqual(0.85);
	});

	test('is empty in the small hours', () => {
		for (let m = 2 * 60; m <= 5 * 60; m += 15) expect(busyAt(m)).toBe(0);
	});

	test('thins out after nine and comes round again at midnight', () => {
		expect(busyAt(22 * 60)).toBeLessThan(0.5);
		expect(busyAt(1440)).toBeCloseTo(busyAt(0));
	});
});
