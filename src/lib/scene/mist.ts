import * as THREE from 'three';

// The layer the sky's own things are on, the sun, moon, stars and hills: drawn into the mist,
// apart from the bridge
export const SKY_LAYER = 1;

// A quad over the whole canvas, in clip space, whatever camera it's drawn with; moved and
// scaled, it covers part of it
const quad = (material: THREE.ShaderMaterial) => {
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
	mesh.frustumCulled = false;
	return new THREE.Scene().add(mesh);
};

const VERTEX = /* glsl */ `
	varying vec2 vUv;
	void main() {
		vUv = uv;
		gl_Position = modelMatrix * vec4(position.xy, 0.0, 1.0);
	}
`;

// Value noise, summed over octaves, for the mist
const NOISE = /* glsl */ `
	float hash(vec2 p) {
		return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
	}
	float noise(vec2 p) {
		vec2 i = floor(p);
		vec2 f = fract(p);
		vec2 u = f * f * (3.0 - 2.0 * f);
		return mix(
			mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
			mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
			u.y
		);
	}
	float fbm(vec2 p) {
		float v = 0.0;
		float a = 0.5;
		for (int i = 0; i < 5; i++) {
			v += a * noise(p);
			p = p * 2.03 + vec2(1.7, 9.2);
			a *= 0.5;
		}
		return v;
	}
`;

// The sky's colour, `down` of the way down the canvas and `x` across it, but for the sun's
// path; written once more, for the type, in `colourAt` below
const GRADIENT = /* glsl */ `
	vec3 sky(float down, float x) {
		float y = down * height;
		// Warmest towards the sun: away from it, through twilight, the horizon is pinker, nearer
		// the band above it
		float near = exp(-pow((x - sunX) / 0.55, 2.0));
		vec3 low = mix(mix(horizon, mid, 0.4 * warmth), horizon, near);
		vec3 colour;
		if (y < line) {
			float t = y / max(line, 1.0);
			colour = t < 0.55
				? mix(top, mid, smoothstep(0.0, 0.55, t))
				: mix(mid, low, smoothstep(0.55, 1.0, t));
		} else {
			colour = mix(low, sea, smoothstep(0.0, scene * 0.9, y - line));
		}
		// Brightest along the horizon itself, the glow rising a little way above it and
		// spreading further below, into the haze over the water, but never reaching the very
		// top, the page's own colour
		float off = y - line;
		float glow = exp(-pow(off / (scene * (off < 0.0 ? 0.3 : 0.4)), 2.0));
		glow *= smoothstep(0.0, 160.0, y) * mix(0.7, 1.15, near);
		// paler towards white by day, but after dark only ever the horizon's own colour
		return mix(colour, mix(low, vec3(1.0), 0.4 * glowing * glowing), glow * 0.85 * glowing);
	}
`;

/**
 * The sky, from its top at the top of the canvas through a band of colour to the horizon,
 * where the sea meets it, and below that the water, darker, on down the page. Warmest towards
 * where the sun is, and brightest along the horizon, so the bridge stands against it; with
 * the sun ahead and low, a path of gold across the water beneath it. Written straight to the
 * canvas in the page's colours, so it isn't tone mapped, and dithered, so its long, dark
 * gradients don't band. `colourAt` below works out the same, for the type
 */
const SKY = /* glsl */ `
	uniform vec3 top;
	uniform vec3 mid;
	uniform vec3 horizon;
	uniform vec3 sea;
	// Where the sea meets the sky, from the top of the canvas, the canvas's height and width,
	// and how high the scene is, all in CSS pixels
	uniform float line;
	uniform float height;
	uniform float wide;
	uniform float scene;
	// Across the canvas, from 0 to 1, where the sun is, or would be off either side; how much
	// it colours the sky, through twilight; and how far ahead of the camera it is, for its path
	uniform float sunX;
	uniform float warmth;
	uniform float ahead;
	// How strongly the horizon glows, and how pale, less after dark
	uniform float glowing;
	varying vec2 vUv;
	${NOISE}
	${GRADIENT}
	void main() {
		vec3 colour = sky(1.0 - vUv.y, vUv.x);
		// The sun's path across the water, when it's low ahead
		float off = (1.0 - vUv.y) * height - line;
		if (off > 0.0 && ahead > 0.0) {
			float path = exp(-pow((vUv.x - sunX) * wide / (scene * 0.06 + off * 0.12), 2.0));
			path *= smoothstep(0.0, 12.0, off) * exp(-off / (scene * 0.6));
			colour = mix(colour, mix(horizon, vec3(1.0, 0.86, 0.58), 0.5), path * ahead * warmth * 0.7);
		}
		colour += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
		gl_FragColor = vec4(colour, 1.0);
	}
`;

/**
 * Mist: how much of what's drawn is left at each point, multiplied into it. All of it, but
 * for an eased stretch across the foot, where it thins to nothing, its edge rising and
 * falling in broad, slow swells. However they push it, it's nothing at the foot itself
 */
const MIST = /* glsl */ `
	uniform float time;
	uniform float aspect;
	// The canvas's height, in CSS pixels
	uniform float height;
	varying vec2 vUv;
	${NOISE}
	void main() {
		// In screens of 800 CSS pixels, so the mist's swells are as big on a canvas that runs
		// on down a long page as on one a screen high
		vec2 p = (vUv - 0.5) * vec2(aspect, 1.0) * height / 800.0;
		float t = time;
		// Only the foot of the page fades into the page's own colour, where a browser takes the
		// colour of its bars and its overscroll from it. Not the top, where the sky starts in
		// the page's colour, nor the sides, as the sky's colour only changes from top to foot
		float band = 160.0;
		// Its edge rises and falls in broad, slow swells, so it never runs straight across, and
		// never smoky. They only ever pull the mist up from the foot, never down past it
		float swells = noise(vec2(p.x * 0.9, 0.0) + vec2(3.1, t * 0.03));
		float e = vUv.y * height - band * 0.6 * smoothstep(0.15, 0.85, swells);
		float f = clamp(e / band, 0.0, 1.0);
		float mist = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
		gl_FragColor = vec4(mist);
	}
`;

// The mist, drawn small, as it's soft, and stretched over the canvas
const APPLY = /* glsl */ `
	uniform sampler2D mist;
	varying vec2 vUv;
	void main() {
		gl_FragColor = vec4(0.0, 0.0, 0.0, texture2D(mist, vUv).r);
	}
`;

// The sea's 2D canvas, thinning out raggedly across the lower part of it, as the sky's
// colour runs on below it down the page
const PICTURE = /* glsl */ `
	uniform sampler2D picture;
	varying vec2 vUv;
	${NOISE}
	void main() {
		vec4 colour = texture2D(picture, vUv);
		float ragged = (fbm(vec2(vUv.x * 9.0, vUv.y * 3.0)) - 0.5) * 0.25;
		colour.a *= smoothstep(0.0, 0.45, vUv.y + ragged);
		gl_FragColor = colour;
	}
`;

/**
 * The mist, laid over whatever `renderer` has drawn so it thins out into nothing. Worked out
 * from the same time and the same shape of canvas, it's the same mist on any canvas
 */
export function createMask(renderer: THREE.WebGLRenderer) {
	const mist = new THREE.ShaderMaterial({
		vertexShader: VERTEX,
		fragmentShader: MIST,
		uniforms: {
			time: { value: 0 },
			aspect: { value: 1 },
			height: { value: 1 }
		},
		depthTest: false,
		depthWrite: false
	});
	// A quarter of the canvas's CSS pixels, in each direction: plenty for something this soft,
	// and a fraction of the noise to work out each frame
	const small = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
	const apply = new THREE.ShaderMaterial({
		vertexShader: VERTEX,
		fragmentShader: APPLY,
		uniforms: { mist: { value: small.texture } },
		transparent: true,
		depthTest: false,
		depthWrite: false,
		// What's drawn is kept only as much as there's mist: its colour and its alpha, which
		// the canvas holds premultiplied, are both multiplied by the mist's alpha
		blending: THREE.CustomBlending,
		blendEquation: THREE.AddEquation,
		blendSrc: THREE.ZeroFactor,
		blendDst: THREE.SrcAlphaFactor,
		blendSrcAlpha: THREE.ZeroFactor,
		blendDstAlpha: THREE.SrcAlphaFactor
	});
	const mistScene = quad(mist);
	const applyScene = quad(apply);

	return {
		/** For a canvas `width` by `height` CSS pixels */
		resize(width: number, height: number) {
			mist.uniforms.aspect!.value = width / height;
			mist.uniforms.height!.value = height;
			small.setSize(Math.ceil(width / 4), Math.ceil(height / 4));
		},

		/** Over what's drawn, the mist as it is `time` seconds in */
		apply(time: number) {
			const clear = renderer.autoClear;
			mist.uniforms.time!.value = time;
			renderer.setRenderTarget(small);
			renderer.render(mistScene, flat);
			renderer.setRenderTarget(null);
			renderer.autoClear = false;
			renderer.render(applyScene, flat);
			renderer.autoClear = clear;
		},

		dispose() {
			small.dispose();
		}
	};
}

const flat = new THREE.Camera();

/** The sky's colours, from 0 to 255 */
export interface Colours {
	top: number[];
	mid: number[];
	horizon: number[];
	sea: number[];
}

/**
 * The sky and the sea, on a canvas of their own beneath the bridge's and reaching on down the
 * page, in the horizon's colour, below the sea: the sky's colours, the
 * sun, moon, stars and hills drawn through `camera`, and the sea set in type on `sea`, all
 * thinning out at the edge into mist, so it melts into the page with no edge anywhere
 */
export function createMist(
	canvas: HTMLCanvasElement,
	scene: THREE.Scene,
	camera: THREE.Camera,
	sea: HTMLCanvasElement
) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
	renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.autoClear = false;
	renderer.setClearColor(0x000000, 0);
	const mask = createMask(renderer);

	const sky = new THREE.ShaderMaterial({
		vertexShader: VERTEX,
		fragmentShader: SKY,
		uniforms: {
			top: { value: new THREE.Vector3() },
			mid: { value: new THREE.Vector3() },
			horizon: { value: new THREE.Vector3() },
			sea: { value: new THREE.Vector3() },
			line: { value: 0 },
			height: { value: 1 },
			wide: { value: 1 },
			scene: { value: 1 },
			sunX: { value: 0.5 },
			warmth: { value: 0 },
			ahead: { value: 0 },
			glowing: { value: 1 }
		},
		depthTest: false,
		depthWrite: false
	});
	const skyScene = quad(sky);

	// The sea's own canvas, drawn in as a picture beneath the bridge
	const water = new THREE.CanvasTexture(sea);
	water.generateMipmaps = false;
	water.minFilter = THREE.LinearFilter;
	const seaScene = quad(
		new THREE.ShaderMaterial({
			vertexShader: VERTEX,
			fragmentShader: PICTURE,
			uniforms: { picture: { value: water } },
			transparent: true,
			depthTest: false,
			depthWrite: false
		})
	);
	const seaQuad = seaScene.children[0]!;

	return {
		/**
		 * `width` by `height` CSS pixels, at `ratio` pixels to each, the sea `top` of them down
		 * and `below` of them high, the horizon `line` of them down
		 */
		resize(width: number, height: number, top: number, below: number, ratio: number, line: number) {
			renderer.setPixelRatio(ratio);
			renderer.setSize(width, height);
			mask.resize(width, height);
			sky.uniforms.line!.value = line;
			sky.uniforms.height!.value = height;
			sky.uniforms.wide!.value = width;
			sky.uniforms.scene!.value = below;
			const share = below / height;
			seaQuad.scale.y = share;
			seaQuad.position.y = 1 - (2 * top + below) / height;
			seaQuad.updateMatrixWorld();
			// The sea's canvas has changed size, so it's uploaded afresh
			water.dispose();
		},

		/** The sky's colours, top and horizon, from 0 to 255, and the exposure the scene's lit at */
		light(colours: Colours, exposure: number) {
			for (const name of ['top', 'mid', 'horizon', 'sea'] as const) {
				const [r, g, b] = colours[name];
				sky.uniforms[name]!.value.set(r! / 255, g! / 255, b! / 255);
			}
			renderer.toneMappingExposure = exposure;
		},

		/**
		 * Where the sun is across the canvas, from 0 to 1, or beyond either side; how much it
		 * colours the sky, from 0 to 1; how far ahead of the camera it is, from 0 to 1; and how
		 * strongly the horizon glows, from 0 to 1
		 */
		sun(x: number, warmth: number, ahead: number, glowing = 1) {
			sky.uniforms.glowing!.value = glowing;
			sky.uniforms.sunX!.value = x;
			sky.uniforms.warmth!.value = warmth;
			sky.uniforms.ahead!.value = ahead;
		},

		/**
		 * The sky's colour, from 0 to 255, `y` CSS pixels down the canvas in the middle of it,
		 * as the sky's shader and the mist over it work it out, if without the mist's swells
		 */
		colourAt(y: number): number[] {
			const u = sky.uniforms;
			const get = (name: string) => (u[name]!.value as THREE.Vector3).toArray();
			const [top, mid, horizon, sea] = ['top', 'mid', 'horizon', 'sea'].map(get) as number[][];
			const line = u.line!.value as number;
			const scene = u.scene!.value as number;
			const height = u.height!.value as number;
			const near = Math.exp(-(((0.5 - (u.sunX!.value as number)) / 0.55) ** 2));
			const mixed = (a: number[], b: number[], t: number) => a.map((c, i) => c + (b[i]! - c) * t);
			const step = (from: number, to: number, x: number) => {
				const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
				return t * t * (3 - 2 * t);
			};
			const low = mixed(mixed(horizon!, mid!, 0.4 * (u.warmth!.value as number)), horizon!, near);
			let colour: number[];
			if (y < line) {
				const t = y / Math.max(line, 1);
				colour =
					t < 0.55 ? mixed(top!, mid!, step(0, 0.55, t)) : mixed(mid!, low, step(0.55, 1, t));
			} else colour = mixed(low, sea!, step(0, scene * 0.9, y - line));
			const off = y - line;
			const glow =
				Math.exp(-((off / (scene * (off < 0 ? 0.3 : 0.4))) ** 2)) *
				step(0, 160, y) *
				(0.7 + 0.45 * near);
			const glowing = u.glowing!.value as number;
			colour = mixed(colour, mixed(low, [1, 1, 1], 0.4 * glowing ** 2), glow * 0.85 * glowing);
			// thinned out into the page's own colour across the foot
			const f = Math.min(1, Math.max(0, (height - y - 0.3 * 160) / 160));
			const mist = f * f * f * (f * (f * 6 - 15) + 10);
			return mixed(top!, colour, mist).map((c) => c * 255);
		},

		/** The sky as it is `time` seconds in, the mist drifted that far, once the sea's drawn */
		draw(time: number) {
			renderer.clear();
			renderer.render(skyScene, flat);
			const layers = camera.layers.mask;
			camera.layers.set(SKY_LAYER);
			renderer.render(scene, camera);
			camera.layers.mask = layers;
			water.needsUpdate = true;
			renderer.render(seaScene, flat);
			mask.apply(time);
		},

		dispose() {
			mask.dispose();
			water.dispose();
			renderer.dispose();
		}
	};
}
