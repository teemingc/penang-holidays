import * as THREE from 'three';
import type { Flag } from './flag.js';

const WAKE_SCALE = 0.25;
// The disturbance spreads a little and, slowly, fades back to calm, in steady steps of a
// thirtieth of a second however fast the screen draws: slow enough that nobody can tell
const SETTLE_STEP = 1 / 30;

const SMOKE_VERTEX = /* glsl */ `
	varying vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = vec4(position.xy, 0.0, 1.0);
	}
`;
// Just as the SVG filter it replaces: the header pushed by the map, and where it's torn,
// that pushed again by noise into wisps and blurred into smoke, then thinned out
const SMOKE_FRAGMENT = /* glsl */ `
	precision highp float;
	uniform sampler2D picture;
	uniform sampler2D wake;
	// The canvas, the margin around the header and the header, in CSS pixels
	uniform vec2 size;
	uniform vec2 margin;
	uniform vec2 box;
	varying vec2 vUv;

	bool outside(vec2 uv) {
		return any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)));
	}
	vec4 seen(vec2 q) {
		vec2 uv = (q + margin) / size;
		return outside(uv) ? vec4(0.0) : texture2D(picture, vec2(uv.x, 1.0 - uv.y));
	}
	vec4 disturbance(vec2 q) {
		vec2 uv = q / box;
		return outside(uv) ? vec4(128.0 / 255.0, 128.0 / 255.0, 0.0, 0.0) : texture2D(wake, uv);
	}
	// The push is stored around 128, which is a little over half: read as half, the
	// header at rest would be drawn a fraction of a pixel off, and blurred by it
	vec4 pushed(vec2 q) {
		return seen(q + 20.0 * (disturbance(q).rg * 255.0 - 128.0) / 127.0);
	}

	vec2 hash(vec2 p) {
		p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
		return fract(sin(p) * 43758.5453) * 2.0 - 1.0;
	}
	float noise(vec2 p) {
		vec2 i = floor(p);
		vec2 f = fract(p);
		vec2 u = f * f * (3.0 - 2.0 * f);
		return mix(
			mix(dot(hash(i), f), dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
			mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash(i + 1.0), f - 1.0), u.x),
			u.y
		);
	}
	// Stretched sideways, like the cloud
	vec2 turbulence(vec2 q) {
		vec2 p = q * vec2(0.03, 0.08);
		vec2 sum = vec2(0.0);
		float amplitude = 1.0;
		for (int i = 0; i < 3; i++) {
			sum += amplitude * vec2(noise(p), noise(p + vec2(17.3, -9.1)));
			p *= 2.0;
			amplitude *= 0.5;
		}
		return sum * 0.5 + 0.5;
	}

	void main() {
		vec2 q = vec2(vUv.x, 1.0 - vUv.y) * size - margin;
		float tear = disturbance(q).b;
		vec4 colour = pushed(q);
		// Only where it's torn enough to see: as it heals, a trace of the tear spreads over
		// all of it, and the wisps are the costliest thing drawn on the page
		if (tear > 0.02) {
			vec4 wisps = vec4(0.0);
			float total = 0.0;
			// The noise barely changes across the blur, so it's worked out once for all of it
			vec2 drift = 22.0 * (turbulence(q) - 0.5);
			for (int i = -1; i <= 1; i++) {
				for (int j = -1; j <= 1; j++) {
					vec2 o = vec2(float(i), float(j)) * 2.5;
					float weight = exp(-dot(o, o) / 12.5);
					wisps += weight * pushed(q + o + drift);
					total += weight;
				}
			}
			vec4 smoky = wisps / total * tear;
			colour = smoky + colour * (1.0 - tear) * (1.0 - smoky.a);
		}
		gl_FragColor = colour * (1.0 - 0.85 * tear);
	}
`;

/**
 * The header is cloud: a car passing through it punches a hole, drags the cloud along in its
 * direction of flight and leaves it in wisps, and it all drifts slowly back together. While it's
 * disturbed, the header is drawn into a picture that's shown in its place on a canvas of its
 * own, where a shader pushes it about by a small map of the disturbance: which way each bit of
 * it was pushed, and how badly it was torn. An SVG filter on the header itself would be simpler,
 * but Safari doesn't run one on a page's text, and every other browser redraws the whole thing
 * on the processor each time the map changes
 */
export function createSmoke(
	header: HTMLElement,
	host: HTMLElement,
	flag: Flag | null,
	reduced: () => boolean
) {
	// Where the header is in the scene
	let headerBox = { x: 0, y: 0, w: 0, h: 0 };
	// The disturbance, per cell of the map: which way it was pushed, and how torn it is
	let pushX = new Float32Array(0);
	let pushY = new Float32Array(0);
	let torn = new Float32Array(0);
	let spare = new Float32Array(0);
	let W = 0;
	let H = 0;
	let stirred = -Infinity;

	// The canvas the smoke is drawn on: over the header and a margin around it, for anything
	// pushed or blown out past its edges
	const overlay = document.createElement('canvas');
	overlay.setAttribute('aria-hidden', 'true');
	Object.assign(overlay.style, {
		position: 'absolute',
		zIndex: '1',
		pointerEvents: 'none',
		display: 'none'
	});
	document.body.append(overlay);
	const smoke = new THREE.WebGLRenderer({ canvas: overlay, alpha: true, antialias: false });
	smoke.setClearColor(0x000000, 0);
	// The header as it looks, drawn into a canvas of its own
	const picture = document.createElement('canvas');
	const drawing = picture.getContext('2d')!;
	const pictured = new THREE.CanvasTexture(picture);
	pictured.premultiplyAlpha = true;
	pictured.generateMipmaps = false;
	pictured.minFilter = THREE.LinearFilter;
	// The disturbance, red and green for the push and blue for the tear
	let wake = new THREE.DataTexture(new Uint8Array(4), 1, 1);
	const smokeMaterial = new THREE.ShaderMaterial({
		uniforms: {
			picture: { value: pictured },
			wake: { value: wake },
			size: { value: new THREE.Vector2() },
			margin: { value: new THREE.Vector2() },
			box: { value: new THREE.Vector2() }
		},
		vertexShader: SMOKE_VERTEX,
		fragmentShader: SMOKE_FRAGMENT,
		blending: THREE.NoBlending,
		depthTest: false,
		depthWrite: false
	});
	const smokeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), smokeMaterial);
	smokeQuad.frustumCulled = false;
	const smokeScene = new THREE.Scene().add(smokeQuad);
	const smokeCamera = new THREE.Camera();
	let smoking = false;

	// The header's words as they are now, every letter where the page has put it. The flag
	// isn't in it: the page's own keeps waving in its place, untouched
	// Plain, not reactive: only the smoke reads it
	const written = new Set<HTMLElement>();
	// How far below the top of its first letter the text sits on its line, read from a mark of
	// no size set on the baseline just before it, on the same line
	const mark = document.createElement('span');
	mark.style.cssText = 'display: inline-block; width: 0; height: 0; vertical-align: baseline';
	function baselineOf(node: Text, range: Range) {
		const first = node.data.search(/\S/);
		range.setStart(node, first);
		range.setEnd(node, first + 1);
		const top = range.getClientRects()[0]?.top;
		if (top === undefined) return;
		node.before(mark);
		const baseline = mark.getBoundingClientRect().top;
		mark.remove();
		return baseline - top;
	}
	// The margin around the header in the picture, and its pixels to a CSS pixel
	let framing = { x: 0, y: 0, ratio: 1 };
	function photograph() {
		// In their own colours, even while they're hidden
		for (const words of written) words.style.color = '';
		drawing.resetTransform();
		drawing.clearRect(0, 0, picture.width, picture.height);
		// Drawn to in the window's coordinates, from where the header is now: the page may
		// have scrolled since it was measured
		const box = header.getBoundingClientRect();
		const { x, y, ratio } = framing;
		drawing.setTransform(ratio, 0, 0, ratio, (x - box.left) * ratio, (y - box.top) * ratio);
		const range = document.createRange();
		const letters: { text: string; x: number; y: number; font: string; colour: string }[] = [];
		const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
		for (
			let node = walker.nextNode() as Text | null;
			node;
			node = walker.nextNode() as Text | null
		) {
			const parent = node.parentElement!;
			if (parent.closest('[aria-hidden="true"]') || !node.data.trim()) continue;
			written.add(parent);
			const style = getComputedStyle(parent);
			const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
			drawing.font = font;
			// From the top of the text's box down to its baseline, as the page lays it out: the
			// canvas's own metrics are rounded, and can put a large line a pixel too high
			const ascent = baselineOf(node, range) ?? drawing.measureText('H').fontBoundingBoxAscent;
			for (let i = 0; i < node.data.length; i++) {
				if (!node.data[i]!.trim()) continue;
				range.setStart(node, i);
				range.setEnd(node, i + 1);
				const rect = range.getClientRects()[0];
				if (rect) {
					letters.push({
						text: node.data[i]!,
						x: rect.left,
						y: rect.top + ascent,
						font,
						colour: style.color
					});
				}
			}
		}
		// The underlines go first, and are cut away around the letters as the page cuts them
		// around descenders, before the letters are drawn over them
		let underlined = false;
		for (const link of header.querySelectorAll('a')) {
			const style = getComputedStyle(link);
			if (!style.textDecorationLine.includes('underline')) continue;
			underlined = true;
			drawing.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
			drawing.fillStyle = style.textDecorationColor;
			const text = [...link.childNodes].find(
				(node): node is Text => node instanceof Text && !!node.data.trim()
			);
			const ascent =
				(text && baselineOf(text, range)) ?? drawing.measureText('H').fontBoundingBoxAscent;
			const offset = parseFloat(style.textUnderlineOffset) || 0;
			const thickness = parseFloat(style.textDecorationThickness) || 1;
			for (const rect of link.getClientRects()) {
				drawing.fillRect(rect.left, rect.top + ascent + offset, rect.width, thickness);
			}
		}
		if (underlined) {
			drawing.globalCompositeOperation = 'destination-out';
			drawing.lineWidth = 3;
			drawing.lineJoin = 'round';
			for (const { text, x, y, font } of letters) {
				drawing.font = font;
				drawing.strokeText(text, x, y);
			}
			drawing.globalCompositeOperation = 'source-over';
		}
		for (const { text, x, y, font, colour } of letters) {
			drawing.font = font;
			drawing.fillStyle = colour;
			drawing.fillText(text, x, y);
		}
		pictured.needsUpdate = true;
		if (smoking) for (const words of written) words.style.color = 'transparent';
	}

	// The header's colours change with the phase of the day: the picture follows at once
	const phases = new MutationObserver(() => {
		if (smoking) photograph();
	});
	phases.observe(document.documentElement, { attributes: true, attributeFilter: ['data-sky'] });

	// The smoke takes the header's place, drawn as it is before the header is hidden, so
	// there's never a frame without it
	function start() {
		if (smoking) return;
		smoking = true;
		photograph();
		paint();
		overlay.style.display = '';
		smoke.render(smokeScene, smokeCamera);
		for (const words of written) words.style.color = 'transparent';
	}
	function stop() {
		if (!smoking) return;
		smoking = false;
		stirred = -Infinity;
		overlay.style.display = 'none';
		for (const words of written) words.style.color = '';
	}

	function calm() {
		pushX.fill(0);
		pushY.fill(0);
		torn.fill(0);
		paint();
	}

	// The map, from the disturbance, for the shader to read; returns how torn the worst of it
	// still is. At rest it pushes nothing and tears nothing
	function paint() {
		let left = 0;
		const map = wake.image.data as Uint8Array;
		for (let c = 0, i = 0; c < torn.length; c++, i += 4) {
			left = Math.max(left, torn[c]!);
			map[i] = 128 - pushX[c]! * 127;
			map[i + 1] = 128 - pushY[c]! * 127;
			map[i + 2] = torn[c]! * 255;
			map[i + 3] = 255;
		}
		wake.needsUpdate = true;
		return left;
	}

	// Where each thing passing through was the last time, to know which way it's going
	const trails = new WeakMap<object, { x: number; y: number }>();
	let owed = 0;

	return {
		/** Where the header is, and the smoke made ready to take its place */
		measure() {
			stop();
			const origin = host.getBoundingClientRect();
			const box = header.getBoundingClientRect();
			headerBox = {
				x: box.left - origin.left,
				y: box.top - origin.top,
				w: box.width,
				h: box.height
			};
			flag?.measure(box);
			W = Math.max(1, Math.round(box.width * WAKE_SCALE));
			H = Math.max(1, Math.round(box.height * WAKE_SCALE));
			const cells = W * H;
			pushX = new Float32Array(cells);
			pushY = new Float32Array(cells);
			torn = new Float32Array(cells);
			spare = new Float32Array(cells);
			wake.dispose();
			wake = new THREE.DataTexture(new Uint8Array(cells * 4), W, H);
			wake.magFilter = wake.minFilter = THREE.LinearFilter;
			smokeMaterial.uniforms.wake!.value = wake;
			calm();

			const margin = { x: Math.round(box.width * 0.05), y: Math.round(box.height * 0.25) };
			const width = Math.ceil(box.width) + margin.x * 2;
			const height = Math.ceil(box.height) + margin.y * 2;
			Object.assign(overlay.style, {
				left: `${box.left + window.scrollX - margin.x}px`,
				top: `${box.top + window.scrollY - margin.y}px`
			});
			const ratio = Math.min(2, window.devicePixelRatio);
			smoke.setPixelRatio(ratio);
			smoke.setSize(width, height);
			picture.width = width * ratio;
			picture.height = height * ratio;
			framing = { ...margin, ratio };
			const { uniforms } = smokeMaterial;
			(uniforms.size!.value as THREE.Vector2).set(width, height);
			(uniforms.margin!.value as THREE.Vector2).set(margin.x, margin.y);
			(uniforms.box!.value as THREE.Vector2).set(box.width, box.height);
			// Drawn once, unseen, so the first car through doesn't wait on the smoke being made
			// ready to draw, or on the header's letters being drawn into a canvas for the first time
			photograph();
			smoke.render(smokeScene, smokeCamera);
		},

		/**
		 * Something passing at (x, y) in the scene, in CSS pixels: through the header, it tears
		 * and drags the cloud along the way it went since it was last seen
		 */
		waft(thing: object, sx: number, sy: number) {
			if (reduced()) return;
			const x = sx - headerBox.x;
			const y = sy - headerBox.y;
			const last = trails.get(thing);
			trails.set(thing, { x, y });
			if (!last) return;
			const inside = (px: number, py: number) =>
				px > -20 && px < headerBox.w + 20 && py > -20 && py < headerBox.h + 20;
			if (!inside(x, y) && !inside(last.x, last.y)) return;
			const dx = x - last.x;
			const dy = y - last.y;
			const length = Math.hypot(dx, dy);
			if (length < 0.5) return;
			flag?.pass(last.x, last.y, dx, dy, length);
			// Along the way it went, the cloud is torn and dragged on in its direction of flight
			const radius = 13 * WAKE_SCALE;
			const ax = last.x * WAKE_SCALE;
			const ay = last.y * WAKE_SCALE;
			const bx = x * WAKE_SCALE;
			const by = y * WAKE_SCALE;
			const ux = dx / length;
			const uy = dy / length;
			const span = length * WAKE_SCALE;
			const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - radius));
			const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + radius));
			const y0 = Math.max(0, Math.floor(Math.min(ay, by) - radius));
			const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + radius));
			for (let cy = y0; cy <= y1; cy++) {
				for (let cx = x0; cx <= x1; cx++) {
					const along = Math.max(0, Math.min(span, (cx - ax) * ux + (cy - ay) * uy));
					const d = Math.hypot(cx - (ax + ux * along), cy - (ay + uy * along));
					if (d > radius) continue;
					const weight = (1 - d / radius) ** 2;
					const c = cy * W + cx;
					torn[c] = Math.max(torn[c]!, weight);
					pushX[c] = pushX[c]! + (ux * weight - pushX[c]!) * weight;
					pushY[c] = pushY[c]! + (uy * weight - pushY[c]!) * weight;
				}
			}
			stirred = performance.now();
			start();
		},

		settle(dt: number) {
			if (stirred === -Infinity) return;
			if (stirred === 0) {
				owed = 0;
				stop();
				calm();
				return;
			}
			// Never more than a few steps at once, after a stall
			owed = Math.min(owed + dt, SETTLE_STEP * 3);
			if (owed < SETTLE_STEP) return;
			const heal = 0.995;
			for (; owed >= SETTLE_STEP; owed -= SETTLE_STEP) {
				for (const field of [pushX, pushY, torn]) {
					for (let cy = 0; cy < H; cy++) {
						for (let cx = 0; cx < W; cx++) {
							const c = cy * W + cx;
							const l = cx > 0 ? field[c - 1]! : field[c]!;
							const r = cx < W - 1 ? field[c + 1]! : field[c]!;
							const u = cy > 0 ? field[c - W]! : field[c]!;
							const d = cy < H - 1 ? field[c + W]! : field[c]!;
							spare[c] = (field[c]! * 0.92 + (l + r + u + d) * 0.02) * heal;
						}
					}
					field.set(spare);
				}
			}
			if (paint() < 0.02) stirred = 0;
			smoke.render(smokeScene, smokeCamera);
		},

		dispose() {
			phases.disconnect();
			stop();
			overlay.remove();
			smoke.dispose();
			pictured.dispose();
			wake.dispose();
			smokeMaterial.dispose();
			smokeQuad.geometry.dispose();
		}
	};
}

export type Smoke = ReturnType<typeof createSmoke>;
