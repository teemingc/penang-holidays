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

/**
 * The sky, from its top at the top of the canvas to the horizon a screen's height below, as
 * the page's own always was. Written straight to the canvas in the page's colours, so it isn't
 * tone mapped, and dithered, so its long, dark gradients don't band
 */
const SKY = /* glsl */ `
	uniform vec3 top;
	uniform vec3 horizon;
	// How much of the canvas's height a screen's height is
	uniform float reach;
	varying vec2 vUv;
	${NOISE}
	void main() {
		vec3 colour = mix(top, horizon, min(1.0, (1.0 - vUv.y) / reach));
		colour += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
		gl_FragColor = vec4(colour, 1.0);
	}
`;

/**
 * Mist: how much of what's drawn is left at each point, multiplied into it. Roughly an oval,
 * but its edge is pushed in and out by noise that is itself pushed about by noise, so it
 * billows and curls rather than bulging evenly, and it thins into wisps towards the edge. It
 * all drifts slowly. It's nothing at the canvas's own edges, whatever the noise does, except
 * across the top `open` of it, which is left clear
 */
const MIST = /* glsl */ `
	uniform float time;
	uniform float aspect;
	uniform float open;
	varying vec2 vUv;
	${NOISE}
	void main() {
		vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
		float t = time;
		vec2 q = vec2(fbm(p * 1.4 + t * 0.03), fbm(p * 1.4 + vec2(5.2, 1.3) - t * 0.025));
		vec2 r = vec2(
			fbm(p * 2.0 + 3.5 * q + vec2(1.7, 9.2) + t * 0.04),
			fbm(p * 2.0 + 3.5 * q + vec2(8.3, 2.8) - t * 0.035)
		);
		float d = length((vUv - vec2(0.5, 0.5)) / vec2(0.62, 0.6));
		d += (r.x - 0.5) * 0.6 + (q.y - 0.5) * 0.3;
		float mist = 1.0 - smoothstep(0.55, 1.05, d);
		// Wisps: towards the edge, only the thicker parts of finer mist are left
		float wisps = fbm(p * 4.5 + r * 2.0 - t * 0.05);
		mist *= mix(1.0, smoothstep(0.3, 0.7, wisps), smoothstep(0.3, 1.0, d));
		vec2 edge = smoothstep(0.0, 0.07, vUv) * smoothstep(0.0, 0.07, 1.0 - vUv);
		mist *= edge.x * edge.y;
		if (open > 0.0) mist = max(mist, edge.x * smoothstep(1.0 - open - 0.05, 1.0 - open + 0.1, vUv.y));
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

// A 2D canvas, as it is
const PICTURE = /* glsl */ `
	uniform sampler2D picture;
	varying vec2 vUv;
	void main() {
		gl_FragColor = texture2D(picture, vUv);
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
		uniforms: { time: { value: 0 }, aspect: { value: 1 }, open: { value: 0 } },
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
		/** For a canvas `width` by `height` CSS pixels, the top `open` of it left clear */
		resize(width: number, height: number, open = 0) {
			mist.uniforms.aspect!.value = width / height;
			mist.uniforms.open!.value = open;
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

/**
 * The sky and the sea, on a canvas of their own beneath the bridge's: the sky's colours, the
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
			horizon: { value: new THREE.Vector3() },
			reach: { value: 1 }
		},
		depthTest: false,
		depthWrite: false
	});
	const skyScene = quad(sky);

	// The sea's own canvas, drawn in as a picture over the foot of this one
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
		/** `width` by `height` CSS pixels, at `ratio` pixels to each, the sea `below` of them high */
		resize(width: number, height: number, below: number, ratio: number) {
			renderer.setPixelRatio(ratio);
			renderer.setSize(width, height);
			mask.resize(width, height);
			sky.uniforms.reach!.value = window.innerHeight / height;
			const share = below / height;
			seaQuad.scale.y = share;
			seaQuad.position.y = share - 1;
			seaQuad.updateMatrixWorld();
			// The sea's canvas has changed size, so it's uploaded afresh
			water.dispose();
		},

		/** The sky's colours, top and horizon, from 0 to 255, and the exposure the scene's lit at */
		light(top: number[], horizon: number[], exposure: number) {
			sky.uniforms.top!.value.set(top[0]! / 255, top[1]! / 255, top[2]! / 255);
			sky.uniforms.horizon!.value.set(horizon[0]! / 255, horizon[1]! / 255, horizon[2]! / 255);
			renderer.toneMappingExposure = exposure;
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
