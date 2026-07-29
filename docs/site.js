var revealObserver = new IntersectionObserver(function (entries) {
	entries.forEach(function (entry) {
		if (entry.isIntersecting) {
			entry.target.classList.add('is-visible');
			revealObserver.unobserve(entry.target);
		}
	});
}, { threshold: 0.12, rootMargin: '0px 0px -40px' });

document.querySelectorAll('.reveal').forEach(function (element) {
	revealObserver.observe(element);
});

var lightbox = document.getElementById('lightbox');
var lightboxImage = document.getElementById('lightbox-image');
var lightboxCaption = document.getElementById('lightbox-caption');

document.querySelectorAll('[data-lightbox]').forEach(function (button) {
	button.addEventListener('click', function () {
		if (!lightbox || !lightboxImage || !lightboxCaption) return;
		var image = button.querySelector('img');
		lightboxImage.src = image.src;
		lightboxImage.alt = image.alt;
		lightboxCaption.textContent = button.dataset.caption || '';
		lightbox.showModal();
	});
});

if (lightbox) {
	lightbox.addEventListener('click', function (event) {
		if (event.target === lightbox || event.target.closest('.lightbox-close')) {
			lightbox.close();
		}
	});
}

/* Star count for every GitHub badge on the page. Thousands are shortened the
   way GitHub does it: 26700 becomes 26.7k, 26000 becomes 26k. If the request
   fails the markup keeps its "GitHub" fallback label. */
function formatStarCount(value) {
	if (value < 1000) return String(value);
	var thousands = (value / 1000).toFixed(1);
	if (thousands.slice(-2) === '.0') thousands = thousands.slice(0, -2);
	return thousands + 'k';
}

fetch('https://api.github.com/repos/JosipFX/splitemu')
	.then(function (response) { return response.json(); })
	.then(function (data) {
		if (typeof data.stargazers_count !== 'number') return;
		var label = formatStarCount(data.stargazers_count);
		document.querySelectorAll('[data-star-count]').forEach(function (slot) {
			slot.textContent = label;
		});
	})
	.catch(function () {});

var demoVideo = document.querySelector('.demo-video');
if (demoVideo && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
	demoVideo.autoplay = false;
	demoVideo.loop = false;
	demoVideo.controls = true;
	demoVideo.pause();
}

var heroVisual = document.querySelector('.hero-visual');
if (heroVisual && window.matchMedia('(pointer: fine)').matches &&
	!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
	heroVisual.addEventListener('pointermove', function (event) {
		var bounds = heroVisual.getBoundingClientRect();
		var x = (event.clientX - bounds.left) / bounds.width - 0.5;
		var y = (event.clientY - bounds.top) / bounds.height - 0.5;
		heroVisual.style.setProperty('--tilt-x', (y * -2.2).toFixed(2) + 'deg');
		heroVisual.style.setProperty('--tilt-y', (x * 2.8).toFixed(2) + 'deg');
	});
	heroVisual.addEventListener('pointerleave', function () {
		heroVisual.style.setProperty('--tilt-x', '0deg');
		heroVisual.style.setProperty('--tilt-y', '0deg');
	});
}

var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

document.querySelectorAll('.feature-card').forEach(function (card) {
	if (!window.matchMedia('(pointer: fine)').matches || prefersReducedMotion) return;
	card.addEventListener('pointermove', function (event) {
		var bounds = card.getBoundingClientRect();
		var x = ((event.clientX - bounds.left) / bounds.width - .5) * 8;
		var y = ((event.clientY - bounds.top) / bounds.height - .5) * 8;
		card.style.setProperty('--visual-x', x.toFixed(1) + 'px');
		card.style.setProperty('--visual-y', y.toFixed(1) + 'px');
	});
	card.addEventListener('pointerleave', function () {
		card.style.setProperty('--visual-x', '0px');
		card.style.setProperty('--visual-y', '0px');
	});
});

document.querySelectorAll('[data-copy-command]').forEach(function (button) {
	button.addEventListener('click', function () {
		var command = button.dataset.copyCommand || '';
		function showCopied() {
			var original = button.textContent;
			button.textContent = document.documentElement.lang === 'de' ? 'Kopiert' : 'Copied';
			button.classList.add('is-copied');
			window.setTimeout(function () {
				button.textContent = original;
				button.classList.remove('is-copied');
			}, 1800);
		}
		function fallbackCopy() {
			var field = document.createElement('textarea');
			field.value = command;
			field.setAttribute('readonly', '');
			field.style.position = 'fixed';
			field.style.opacity = '0';
			document.body.appendChild(field);
			field.select();
			var copied = document.execCommand('copy');
			field.remove();
			if (copied) showCopied();
		}
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(command).then(showCopied).catch(fallbackCopy);
		} else {
			fallbackCopy();
		}
	});
});

var visualCanvases = document.querySelectorAll('[data-shader], #mini-consoles, #link-scene');
if (visualCanvases.length) {
	import('https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.min.js')
		.then(function (THREE) {
			document.querySelectorAll('[data-shader]').forEach(function (canvas) {
				runVisual(function () { initShaderGradient(THREE, canvas); });
			});
			runVisual(function () { initMiniConsoles(THREE); });
			runVisual(function () { initLinkScene(THREE); });
		})
		.catch(function () {});
}

/* Every canvas scene is optional decoration. A context that cannot be created,
   or a driver that rejects one of the shaders, must never take the remaining
   scenes down with it, so each scene starts inside its own guard. */
function runVisual(start) {
	try {
		start();
	} catch (error) {}
}

/* ShaderGradient-style flowing noise gradients.
   One shared implementation, one palette preset per canvas. The fragment shader
   samples 3D simplex noise on a plane that is mapped as if seen at a shallow
   angle, warps its own domain for the silky flow and shades the resulting height
   field, which is what gives the soft, fabric-like bands. */
var SHADER_PRESETS = {
	hero: {
		colors: ['#04070e', '#0d2b3f', '#54b1cf'],
		density: 1.7, strength: .44, speed: .07, tilt: .95,
		grain: .045, alpha: 1, seed: 0, scale: .6
	},
	build: {
		colors: ['#04090c', '#0d3129', '#7cb44e'],
		density: 2.2, strength: .42, speed: .062, tilt: .8,
		grain: .05, alpha: 1, seed: 13.4, scale: .6
	},
	systems: {
		colors: ['#05080f', '#0d2a3c', '#4d99b6'],
		density: 1.6, strength: .4, speed: .05, tilt: .85,
		grain: .045, alpha: 1, seed: 4.7, scale: .55
	},
	link: {
		colors: ['#05090b', '#102f22', '#74b04f'],
		density: 1.8, strength: .42, speed: .055, tilt: .85,
		grain: .045, alpha: 1, seed: 21.3, scale: .55
	},
	race: {
		colors: ['#090705', '#332411', '#c1954a'],
		density: 1.8, strength: .44, speed: .058, tilt: .85,
		grain: .045, alpha: 1, seed: 37.1, scale: .55
	},
	/* The tempo tile carries the cyan-to-lime accent gradient in its slider,
	   so its backdrop stays in the same teal family instead of fighting it. */
	tempo: {
		colors: ['#05090e', '#0e2d33', '#63b39a'],
		density: 1.5, strength: .4, speed: .048, tilt: .85,
		grain: .045, alpha: 1, seed: 52.8, scale: .55
	}
};

var SHADER_NOISE = [
	'vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }',
	'vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }',
	'vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }',
	'vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }',
	'float snoise(vec3 v){',
	'  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);',
	'  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);',
	'  vec3 i  = floor(v + dot(v, C.yyy));',
	'  vec3 x0 = v - i + dot(i, C.xxx);',
	'  vec3 g = step(x0.yzx, x0.xyz);',
	'  vec3 l = 1.0 - g;',
	'  vec3 i1 = min(g.xyz, l.zxy);',
	'  vec3 i2 = max(g.xyz, l.zxy);',
	'  vec3 x1 = x0 - i1 + C.xxx;',
	'  vec3 x2 = x0 - i2 + C.yyy;',
	'  vec3 x3 = x0 - D.yyy;',
	'  i = mod289(i);',
	'  vec4 p = permute(permute(permute(',
	'      i.z + vec4(0.0, i1.z, i2.z, 1.0))',
	'    + i.y + vec4(0.0, i1.y, i2.y, 1.0))',
	'    + i.x + vec4(0.0, i1.x, i2.x, 1.0));',
	'  float n_ = 0.142857142857;',
	'  vec3 ns = n_ * D.wyz - D.xzx;',
	'  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);',
	'  vec4 x_ = floor(j * ns.z);',
	'  vec4 y_ = floor(j - 7.0 * x_);',
	'  vec4 x = x_ * ns.x + ns.yyyy;',
	'  vec4 y = y_ * ns.x + ns.yyyy;',
	'  vec4 h = 1.0 - abs(x) - abs(y);',
	'  vec4 b0 = vec4(x.xy, y.xy);',
	'  vec4 b1 = vec4(x.zw, y.zw);',
	'  vec4 s0 = floor(b0) * 2.0 + 1.0;',
	'  vec4 s1 = floor(b1) * 2.0 + 1.0;',
	'  vec4 sh = -step(h, vec4(0.0));',
	'  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;',
	'  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;',
	'  vec3 p0 = vec3(a0.xy, h.x);',
	'  vec3 p1 = vec3(a0.zw, h.y);',
	'  vec3 p2 = vec3(a1.xy, h.z);',
	'  vec3 p3 = vec3(a1.zw, h.w);',
	'  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));',
	'  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;',
	'  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);',
	'  m = m * m;',
	'  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));',
	'}'
].join('\n');

var SHADER_FRAGMENT = [
	'precision highp float;',
	'varying vec2 vUv;',
	'uniform float uTime;',
	'uniform vec2 uSize;',
	'uniform vec3 uColorA;',
	'uniform vec3 uColorB;',
	'uniform vec3 uColorC;',
	'uniform float uDensity;',
	'uniform float uStrength;',
	'uniform float uTilt;',
	'uniform float uGrain;',
	'uniform float uAlpha;',
	SHADER_NOISE,
	'void main(){',
	'  float aspect = uSize.x / max(uSize.y, 1.0);',
	'  vec2 sp = vUv - 0.5;',
	'  sp.x *= aspect;',
	/* plane seen at a shallow angle: bands compress towards the top */
	'  float k = 1.0 + uTilt * (0.5 - vUv.y);',
	'  vec2 plane = vec2(sp.x / k, sp.y / (k * k)) * uDensity;',
	'  float t = uTime;',
	'  float w1 = snoise(vec3(plane * 0.55 + vec2(0.0, t * 0.22), t * 0.20));',
	'  float w2 = snoise(vec3(plane * 0.74 + vec2(3.7, -1.9), t * 0.17 + 5.2));',
	'  vec2 q = plane + vec2(w1, w2) * uStrength;',
	'  float n = snoise(vec3(q, t * 0.26));',
	'  float e = 0.17;',
	'  float nx = snoise(vec3(q + vec2(e, 0.0), t * 0.26));',
	'  float ny = snoise(vec3(q + vec2(0.0, e), t * 0.26));',
	'  vec3 nrm = normalize(vec3(n - nx, n - ny, e * 1.6));',
	'  float lambert = clamp(dot(nrm, normalize(vec3(-0.42, 0.6, 0.68))), 0.0, 1.0);',
	'  float h = n * 0.5 + 0.5;',
	'  vec3 color = mix(uColorA, uColorB, smoothstep(0.02, 0.98, h));',
	'  float sheen = smoothstep(0.52, 1.0, lambert) * smoothstep(0.34, 0.92, h);',
	'  color = mix(color, uColorC, sheen * 0.5);',
	'  color += uColorC * pow(lambert, 7.0) * 0.09;',
	'  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);',
	'  color += (grain - 0.5) * uGrain;',
	'  float alpha = uAlpha * clamp(0.42 + h * 0.7, 0.0, 1.0);',
	'  gl_FragColor = vec4(color, alpha);',
	'}'
].join('\n');

function initShaderGradient(THREE, canvas) {
	var preset = SHADER_PRESETS[canvas.dataset.shader] || SHADER_PRESETS.hero;
	var renderer = new THREE.WebGLRenderer({
		canvas: canvas,
		alpha: true,
		antialias: false,
		powerPreference: 'low-power'
	});
	renderer.setPixelRatio(1);
	var scene = new THREE.Scene();
	var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	var uniforms = {
		uTime: { value: preset.seed },
		uSize: { value: new THREE.Vector2(1, 1) },
		uColorA: { value: new THREE.Color(preset.colors[0]) },
		uColorB: { value: new THREE.Color(preset.colors[1]) },
		uColorC: { value: new THREE.Color(preset.colors[2]) },
		uDensity: { value: preset.density },
		uStrength: { value: preset.strength },
		uTilt: { value: preset.tilt },
		uGrain: { value: preset.grain },
		uAlpha: { value: preset.alpha }
	};
	var material = new THREE.ShaderMaterial({
		uniforms: uniforms,
		transparent: true,
		depthWrite: false,
		vertexShader: [
			'varying vec2 vUv;',
			'void main(){',
			'  vUv = uv;',
			'  gl_Position = vec4(position, 1.0);',
			'}'
		].join('\n'),
		fragmentShader: SHADER_FRAGMENT
	});
	scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

	var ratio = Math.min(window.devicePixelRatio || 1, 1.5) * preset.scale;
	function resize() {
		var width = Math.max(1, Math.round(canvas.clientWidth * ratio));
		var height = Math.max(1, Math.round(canvas.clientHeight * ratio));
		uniforms.uSize.value.set(width, height);
		renderer.setSize(width, height, false);
		if (prefersReducedMotion) renderer.render(scene, camera);
	}
	resize();
	new ResizeObserver(resize).observe(canvas);

	var visible = true;
	new IntersectionObserver(function (entries) {
		visible = entries[0].isIntersecting;
	}).observe(canvas);

	function render(time) {
		if (visible) {
			uniforms.uTime.value = preset.seed + (prefersReducedMotion ? 0 : time * .001 * preset.speed);
			renderer.render(scene, camera);
		}
		if (!prefersReducedMotion) window.requestAnimationFrame(render);
	}
	render(0);
}

/* Hero strip: three miniature consoles floating side by side above a soft pool
   of their own system colour. The canvas is very wide and only about 90px tall,
   so the scene uses an orthographic camera: every console is then read from the
   exact same slightly elevated angle instead of being smeared by perspective
   towards the edges of the strip. */
var MINI_VIEW_HEIGHT = 1.92;
var MINI_STATIC_TIME = 1.1;

function initMiniConsoles(THREE) {
	var canvas = document.getElementById('mini-consoles');
	if (!canvas) return;
	var stage = canvas.closest('.hero-minis');
	var renderer = new THREE.WebGLRenderer({
		canvas: canvas,
		alpha: true,
		antialias: true,
		powerPreference: 'low-power'
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
	renderer.setClearColor(0x000000, 0);
	renderer.setClearAlpha(0);

	var scene = new THREE.Scene();
	var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 40);
	camera.position.set(0, 2.5, 5.8);
	camera.lookAt(0, 0, 0);

	scene.add(new THREE.AmbientLight(0xc3d9f2, 1.15));
	var keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
	keyLight.position.set(-2.6, 4.4, 4.2);
	scene.add(keyLight);
	var fillLight = new THREE.DirectionalLight(0x86b4dc, 1.05);
	fillLight.position.set(3.4, 1.2, 2.6);
	scene.add(fillLight);
	var backLight = new THREE.DirectionalLight(0x9fe3ff, .5);
	backLight.position.set(.4, 1.8, -4);
	scene.add(backLight);

	/* The three shapes have nothing in common, so the layout is measured from the
	   models themselves rather than from hand-tuned constants: each one is dropped
	   until its visual middle sits on the line the camera is aimed at, and the
	   largest of the three decides how big all of them may be. */
	var cell = { width: 0, height: 0 };
	var models = [
		{ build: createMiniGba, accent: 0x75e7ff },
		{ build: createMiniNes, accent: 0xff7781 },
		{ build: createMiniSnes, accent: 0xb7f56a }
	].map(function (blueprint, index) {
		var pivot = new THREE.Group();
		var bob = new THREE.Group();
		bob.add(blueprint.build(THREE));
		pivot.add(bob);
		scene.add(pivot);

		var frame = measureOnScreen(THREE, bob, camera);
		var rest = -frame.centreY / frame.upY;
		bob.position.y = rest;
		cell.width = Math.max(cell.width, frame.width);
		cell.height = Math.max(cell.height, frame.height);

		var pool = new THREE.Mesh(
			new THREE.PlaneGeometry(3.2, 2.5),
			glowMaterial(THREE, { color: blueprint.accent, opacity: .3, falloff: 3.6 })
		);
		pool.rotation.x = -Math.PI / 2;
		pool.position.y = rest + .012;
		pivot.add(pool);
		return { pivot: pivot, bob: bob, pool: pool, rest: rest, phase: index * 2.1 };
	});

	function resize() {
		var width = Math.max(1, canvas.clientWidth);
		var height = Math.max(1, canvas.clientHeight);
		renderer.setSize(width, height, false);
		var viewWidth = MINI_VIEW_HEIGHT * (width / height);
		camera.left = -viewWidth / 2;
		camera.right = viewWidth / 2;
		camera.top = MINI_VIEW_HEIGHT / 2;
		camera.bottom = -MINI_VIEW_HEIGHT / 2;
		camera.updateProjectionMatrix();
		/* Fit by height first, then shrink further if three consoles plus their
		   gaps would not fit the width, which is what happens on phones. */
		var scale = Math.min(
			MINI_VIEW_HEIGHT * .87 / cell.height,
			viewWidth * .94 / (3 * cell.width * 1.16)
		);
		var step = scale * cell.width * 1.16;
		models.forEach(function (item, index) {
			item.pivot.scale.setScalar(scale);
			item.pivot.position.x = (index - 1) * step;
		});
	}
	resize();
	new ResizeObserver(resize).observe(canvas);

	var visible = true;
	new IntersectionObserver(function (entries) {
		visible = entries[0].isIntersecting;
	}).observe(canvas);

	function render(time) {
		if (visible) {
			var t = prefersReducedMotion ? MINI_STATIC_TIME : time * .001;
			models.forEach(function (item) {
				item.bob.position.y = item.rest + Math.sin(t * .85 + item.phase) * .042;
				item.bob.rotation.y = Math.sin(t * .5 + item.phase * .7) * .1;
				item.bob.rotation.z = Math.sin(t * .68 + item.phase) * .017;
				item.pool.material.uniforms.uOpacity.value = .28 + Math.sin(t * .9 + item.phase) * .05;
			});
			renderer.render(scene, camera);
			if (stage) stage.classList.add('is-live');
		}
		if (!prefersReducedMotion) window.requestAnimationFrame(render);
	}
	render(0);
}

/* Four Game Boy Advance SP clamshells in the classic Pokemon edition colours,
   angled towards a glowing hub in the middle. Packets leave one system, pass
   through the hub and arrive at another one, which is how a local link session
   actually behaves: everything goes through the parent device. */
var SP_EDITIONS = [
	{ shell: 0x2c7a58, shade: 0x1d5540, accent: 0x62d9a2, screen: 0x74cba7 },
	{ shell: 0xa8433a, shade: 0x7b2f29, accent: 0xff8a7f, screen: 0xd08d85 },
	{ shell: 0x2f4f8c, shade: 0x213868, accent: 0x7ea9ff, screen: 0x89a6dd },
	{ shell: 0xc79c2f, shade: 0x957321, accent: 0xffd166, screen: 0xd8bd74 }
];

/* x/y place the system in its quadrant, yaw turns it towards the middle and to
   is the system its packets are addressed to, so the four routes form one ring. */
var LINK_SLOTS = [
	{ x: -1.54, y: 1.02, yaw: .38, to: 1 },
	{ x: 1.54, y: 1.02, yaw: -.38, to: 3 },
	{ x: -1.54, y: -1.04, yaw: .38, to: 0 },
	{ x: 1.54, y: -1.04, yaw: -.38, to: 2 }
];

var LINK_STATIC_TIME = 2.6;

function initLinkScene(THREE) {
	var canvas = document.getElementById('link-scene');
	if (!canvas) return;
	var stage = canvas.closest('.link-stage');
	var renderer = new THREE.WebGLRenderer({
		canvas: canvas,
		alpha: true,
		antialias: true,
		powerPreference: 'low-power'
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
	renderer.setClearColor(0x000000, 0);
	if (stage) stage.classList.add('three-ready');

	var scene = new THREE.Scene();
	var camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
	camera.position.set(0, .2, 7.6);
	var rig = new THREE.Group();
	scene.add(rig);

	scene.add(new THREE.AmbientLight(0xc4e3ff, 1.25));
	var keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
	keyLight.position.set(-2.4, 3.6, 4.4);
	scene.add(keyLight);
	var fillLight = new THREE.DirectionalLight(0x8fc4ff, .95);
	fillLight.position.set(3.2, -1.6, 3);
	scene.add(fillLight);
	var hubLight = new THREE.PointLight(0xa8f0ff, 7, 4.6);
	hubLight.position.set(0, 0, .8);
	scene.add(hubLight);

	var parts = createSpParts(THREE);
	var anchors = [];
	var devices = [];

	LINK_SLOTS.forEach(function (slot, index) {
		var edition = SP_EDITIONS[index];
		var device = createGbaSp(THREE, parts, edition);
		device.position.set(slot.x, slot.y, 0);
		device.rotation.y = slot.yaw;
		device.scale.setScalar(.98);
		rig.add(device);
		devices.push(device);
		anchors.push(new THREE.Vector3(slot.x * .58, slot.y * .5, .2));
	});

	var hub = new THREE.Group();
	hub.position.z = .3;
	rig.add(hub);

	var core = new THREE.Mesh(
		new THREE.SphereGeometry(.1, 18, 12),
		new THREE.MeshBasicMaterial({ color: 0x7fdcf2 })
	);
	hub.add(core);
	var coreGlow = new THREE.Mesh(
		new THREE.PlaneGeometry(1.35, 1.35),
		glowMaterial(THREE, { color: 0x9beeff, opacity: .4, falloff: 3.6 })
	);
	hub.add(coreGlow);
	var hubDisc = new THREE.Mesh(
		new THREE.CircleGeometry(.24, 28),
		new THREE.MeshBasicMaterial({ color: 0x0b1a22, transparent: true, opacity: .8 })
	);
	hubDisc.position.z = -.02;
	hub.add(hubDisc);

	/* Rings leave the hub on a shared clock, offset by a third of a cycle each,
	   so the middle keeps breathing without a single heavy pulse. */
	var ringGeometry = new THREE.PlaneGeometry(1, 1);
	var rings = [0, 1, 2].map(function (index) {
		var ring = new THREE.Mesh(ringGeometry, glowMaterial(THREE, {
			color: 0x9beeff, opacity: .5, ring: true, ringWidth: .3
		}));
		hub.add(ring);
		return { mesh: ring, offset: index / 3 };
	});

	var packetGeometry = new THREE.SphereGeometry(.066, 10, 8);
	var packetGlowGeometry = new THREE.PlaneGeometry(.72, .72);
	var packets = LINK_SLOTS.map(function (slot, index) {
		var edition = SP_EDITIONS[index];
		var from = anchors[index];
		var to = anchors[slot.to];
		var middle = new THREE.Vector3(0, 0, .3);
		var curve = new THREE.CatmullRomCurve3([
			from.clone(),
			from.clone().lerp(middle, .5).setZ(.34),
			middle.clone(),
			middle.clone().lerp(to, .5).setZ(.34),
			to.clone()
		]);
		var line = new THREE.Line(
			new THREE.BufferGeometry().setFromPoints(
				new THREE.CatmullRomCurve3([from.clone(), from.clone().lerp(middle, .5).setZ(.34), middle.clone()]).getPoints(20)
			),
			new THREE.LineBasicMaterial({ color: edition.accent, transparent: true, opacity: .3 })
		);
		rig.add(line);

		var mesh = new THREE.Mesh(packetGeometry, new THREE.MeshBasicMaterial({
			color: edition.accent, transparent: true, opacity: .95
		}));
		rig.add(mesh);
		var glow = new THREE.Mesh(packetGlowGeometry, glowMaterial(THREE, {
			color: edition.accent, opacity: .6, falloff: 2.4
		}));
		rig.add(glow);
		return { mesh: mesh, glow: glow, curve: curve, offset: index * .25 };
	});

	var pointerTarget = { x: 0, y: 0 };
	if (stage && window.matchMedia('(pointer: fine)').matches && !prefersReducedMotion) {
		stage.addEventListener('pointermove', function (event) {
			var bounds = stage.getBoundingClientRect();
			pointerTarget.x = ((event.clientX - bounds.left) / bounds.width - .5) * .22;
			pointerTarget.y = ((event.clientY - bounds.top) / bounds.height - .5) * .14;
		});
		stage.addEventListener('pointerleave', function () {
			pointerTarget.x = 0;
			pointerTarget.y = 0;
		});
	}

	function resize() {
		var width = Math.max(1, canvas.clientWidth);
		var height = Math.max(1, canvas.clientHeight);
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		/* Tall, narrow stages would push the outer systems off frame. */
		rig.scale.setScalar(Math.min(1, camera.aspect / 1.16));
	}
	resize();
	new ResizeObserver(resize).observe(canvas);

	var visible = true;
	new IntersectionObserver(function (entries) {
		visible = entries[0].isIntersecting;
	}).observe(canvas);

	function render(time) {
		if (visible) {
			var t = prefersReducedMotion ? LINK_STATIC_TIME : time * .001;
			rig.rotation.y += (pointerTarget.x - rig.rotation.y) * .045;
			rig.rotation.x += (-pointerTarget.y - rig.rotation.x) * .045;

			devices.forEach(function (device, index) {
				device.position.z = Math.sin(t * .7 + index * 1.5) * .07;
				device.position.y = LINK_SLOTS[index].y + Math.sin(t * .55 + index * 1.9) * .035;
			});

			/* One trip is: ease out of the sending system, hold in the hub long
			   enough for the arrival to register, then ease on to the receiving
			   system and idle for a beat before the next packet leaves. */
			var arrival = 0;
			packets.forEach(function (packet) {
				var cycle = (t * .19 + packet.offset) % 1;
				var eased = 1;
				var lit = 0;
				if (cycle < .42) {
					var toHub = cycle / .42;
					eased = .5 * toHub * toHub * (3 - 2 * toHub);
					lit = Math.min(1, toHub * 5);
				} else if (cycle < .5) {
					eased = .5;
					lit = 1;
					arrival = Math.max(arrival, 1 - Math.abs(cycle - .46) / .04);
				} else if (cycle < .92) {
					var fromHub = (cycle - .5) / .42;
					eased = .5 + .5 * fromHub * fromHub * (3 - 2 * fromHub);
					lit = Math.min(1, (1 - fromHub) * 5);
				}
				packet.curve.getPoint(eased, packet.mesh.position);
				packet.glow.position.copy(packet.mesh.position);
				packet.mesh.material.opacity = lit * .95;
				packet.mesh.visible = lit > .02;
				packet.glow.visible = packet.mesh.visible;
				packet.glow.material.uniforms.uOpacity.value = lit * .6;
			});

			core.scale.setScalar(1 + arrival * .3 + Math.sin(t * 1.6) * .04);
			coreGlow.material.uniforms.uOpacity.value = .34 + arrival * .26;
			hubLight.intensity = 7 + arrival * 6;

			rings.forEach(function (ring) {
				var phase = (t * .38 + ring.offset) % 1;
				var size = .5 + phase * 2.4;
				ring.mesh.scale.set(size, size, 1);
				ring.mesh.material.uniforms.uOpacity.value = Math.max(0, .5 * (1 - phase) * Math.min(1, phase * 6));
			});

			renderer.render(scene, camera);
		}
		if (!prefersReducedMotion) window.requestAnimationFrame(render);
	}
	render(0);
}

function roundedRectShape(THREE, width, height, radius) {
	var shape = new THREE.Shape();
	var x = -width / 2;
	var y = -height / 2;
	shape.moveTo(x + radius, y);
	shape.lineTo(x + width - radius, y);
	shape.quadraticCurveTo(x + width, y, x + width, y + radius);
	shape.lineTo(x + width, y + height - radius);
	shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
	shape.lineTo(x + radius, y + height);
	shape.quadraticCurveTo(x, y + height, x, y + height - radius);
	shape.lineTo(x, y + radius);
	shape.quadraticCurveTo(x, y, x + radius, y);
	return shape;
}

/* Geometry for the four SP shells is built once and shared: only the materials
   differ per edition, so the scene stays at a couple of thousand triangles. */
function createSpParts(THREE) {
	return {
		base: roundedSlabGeometry(THREE, 1.02, .94, .13, .16),
		lid: roundedSlabGeometry(THREE, 1.02, .94, .1, .16),
		seam: roundedSlabGeometry(THREE, 1.035, .955, .014, .16, 0),
		bezel: frameGeometry(THREE, .9, .78, .07, .7, .55, .036),
		screen: new THREE.PlaneGeometry(.7, .55),
		screenGlow: new THREE.PlaneGeometry(1.1, .95),
		hinge: new THREE.CylinderGeometry(.052, .052, .32, 10),
		padWell: new THREE.CylinderGeometry(.145, .15, .028, 16),
		padArmX: new THREE.BoxGeometry(.21, .042, .072),
		padArmZ: new THREE.BoxGeometry(.072, .042, .21),
		button: new THREE.CylinderGeometry(.058, .058, .034, 14),
		pill: new THREE.BoxGeometry(.095, .026, .034),
		led: new THREE.CylinderGeometry(.017, .017, .014, 8),
		halo: new THREE.PlaneGeometry(1.9, 1.9)
	};
}

/* An open Game Boy Advance SP. The lower half lies flat with the D-pad, A/B and
   the Start/Select dashes on top, the lid pivots on the hinge cylinders to just
   past a right angle, and the whole clamshell is tipped towards the camera so
   both halves stay readable at postage-stamp size. */
function createGbaSp(THREE, parts, edition) {
	var device = new THREE.Group();
	var tilt = new THREE.Group();
	tilt.rotation.x = .6;
	tilt.position.y = -.52;
	device.add(tilt);

	var shell = new THREE.MeshStandardMaterial({ color: edition.shell, metalness: .44, roughness: .32 });
	var shellShade = new THREE.MeshStandardMaterial({ color: edition.shade, metalness: .4, roughness: .38 });
	var trim = new THREE.MeshStandardMaterial({ color: 0x1b1f28, metalness: .25, roughness: .55 });
	var bezelMaterial = new THREE.MeshStandardMaterial({ color: 0x30343d, metalness: .3, roughness: .5 });

	var halo = new THREE.Mesh(parts.halo, glowMaterial(THREE, {
		color: edition.accent, opacity: .26, falloff: 3.2
	}));
	halo.position.set(0, -.12, -.5);
	device.add(halo);

	var base = new THREE.Mesh(parts.base, shell);
	base.rotation.x = -Math.PI / 2;
	base.position.y = .065;
	tilt.add(base);

	var seam = new THREE.Mesh(parts.seam, trim);
	seam.rotation.x = -Math.PI / 2;
	seam.position.y = .036;
	tilt.add(seam);

	var padWell = new THREE.Mesh(parts.padWell, shellShade);
	padWell.position.set(-.3, .132, .08);
	tilt.add(padWell);
	[parts.padArmX, parts.padArmZ].forEach(function (geometry) {
		var arm = new THREE.Mesh(geometry, trim);
		arm.position.set(-.3, .154, .08);
		tilt.add(arm);
	});

	[[.28, .13], [.42, -.01]].forEach(function (spot) {
		var button = new THREE.Mesh(parts.button, trim);
		button.position.set(spot[0], .152, spot[1]);
		tilt.add(button);
	});

	[[-.04, .33], [.11, .35]].forEach(function (spot) {
		var pill = new THREE.Mesh(parts.pill, trim);
		pill.position.set(spot[0], .142, spot[1]);
		pill.rotation.y = .28;
		tilt.add(pill);
	});

	var led = new THREE.Mesh(parts.led, new THREE.MeshBasicMaterial({ color: edition.accent }));
	led.position.set(-.42, .138, -.3);
	tilt.add(led);

	[-.31, .31].forEach(function (offsetX) {
		var barrel = new THREE.Mesh(parts.hinge, shellShade);
		barrel.rotation.z = Math.PI / 2;
		barrel.position.set(offsetX, .14, -.44);
		tilt.add(barrel);
	});

	/* rotation.x of PI minus the opening angle: the lid starts folded out flat
	   and swings back up to roughly 105 degrees away from the lower half. */
	var lidPivot = new THREE.Group();
	lidPivot.position.set(0, .13, -.44);
	lidPivot.rotation.x = Math.PI - 1.83;
	tilt.add(lidPivot);

	var lid = new THREE.Mesh(parts.lid, shell);
	lid.rotation.x = -Math.PI / 2;
	lid.position.set(0, .05, -.47);
	lidPivot.add(lid);

	var bezel = new THREE.Mesh(parts.bezel, bezelMaterial);
	bezel.rotation.x = -Math.PI / 2;
	bezel.position.set(0, .118, -.47);
	lidPivot.add(bezel);

	var screen = new THREE.Mesh(parts.screen, new THREE.MeshBasicMaterial({ color: edition.screen }));
	screen.rotation.x = -Math.PI / 2;
	screen.position.set(0, .104, -.47);
	lidPivot.add(screen);

	var screenGlow = new THREE.Mesh(parts.screenGlow, glowMaterial(THREE, {
		color: edition.screen, opacity: .16, falloff: 1.7
	}));
	screenGlow.rotation.x = -Math.PI / 2;
	screenGlow.position.set(0, .142, -.47);
	lidPivot.add(screenGlow);

	return device;
}

/* Miniature landscape Game Boy Advance, leaning back a touch so the key light
   catches the front face and the cartridge slot on the top edge stays visible. */
function createMiniGba(THREE) {
	var console3d = new THREE.Group();
	var tilt = new THREE.Group();
	tilt.rotation.x = -.24;
	tilt.position.y = .48;
	console3d.add(tilt);

	var shell = new THREE.MeshStandardMaterial({ color: 0x574b9e, metalness: .26, roughness: .44 });
	var shellShade = new THREE.MeshStandardMaterial({ color: 0x3d3576, metalness: .24, roughness: .5 });
	var trim = new THREE.MeshStandardMaterial({ color: 0x2c2e4a, metalness: .2, roughness: .58 });
	var bezelMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2e3d, metalness: .3, roughness: .5 });

	var body = new THREE.ExtrudeGeometry(gbaBodyShape(THREE, 1.78, .87, .19, .38), {
		depth: .15, bevelEnabled: true, bevelThickness: .035, bevelSize: .035, bevelSegments: 2, curveSegments: 8
	});
	body.center();
	tilt.add(new THREE.Mesh(body, shell));

	var cartridge = new THREE.Mesh(new THREE.BoxGeometry(.62, .06, .12), trim);
	cartridge.position.set(0, .43, -.05);
	tilt.add(cartridge);

	[-.74, .74].forEach(function (offsetX) {
		var shoulder = new THREE.Mesh(new THREE.BoxGeometry(.28, .08, .17), shellShade);
		shoulder.position.set(offsetX, .42, -.02);
		tilt.add(shoulder);
	});

	var bezel = new THREE.Mesh(frameGeometry(THREE, .94, .64, .06, .76, .48, .034), bezelMaterial);
	bezel.position.set(0, .05, .128);
	tilt.add(bezel);

	var screen = new THREE.Mesh(
		new THREE.PlaneGeometry(.76, .48),
		new THREE.MeshBasicMaterial({ color: 0x1d6577 })
	);
	screen.position.set(0, .05, .114);
	tilt.add(screen);

	var screenGlow = new THREE.Mesh(
		new THREE.PlaneGeometry(1.16, .84),
		glowMaterial(THREE, { color: 0x75e7ff, opacity: .22, falloff: 1.8 })
	);
	screenGlow.position.set(0, .05, .132);
	tilt.add(screenGlow);

	var padWell = new THREE.Mesh(new THREE.CylinderGeometry(.16, .165, .03, 16), shellShade);
	padWell.rotation.x = Math.PI / 2;
	padWell.position.set(-.6, -.03, .115);
	tilt.add(padWell);
	[new THREE.BoxGeometry(.23, .08, .05), new THREE.BoxGeometry(.08, .23, .05)].forEach(function (geometry) {
		var arm = new THREE.Mesh(geometry, trim);
		arm.position.set(-.6, -.03, .13);
		tilt.add(arm);
	});

	[[.66, .04], [.51, -.09]].forEach(function (spot) {
		var button = new THREE.Mesh(new THREE.CylinderGeometry(.065, .065, .036, 14), trim);
		button.rotation.x = Math.PI / 2;
		button.position.set(spot[0], spot[1], .128);
		tilt.add(button);
	});

	[[-.03, -.31], [.12, -.34]].forEach(function (spot) {
		var pill = new THREE.Mesh(new THREE.BoxGeometry(.11, .034, .03), trim);
		pill.position.set(spot[0], spot[1], .122);
		pill.rotation.z = -.26;
		tilt.add(pill);
	});

	var speaker = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .02, 12), shellShade);
	speaker.rotation.x = Math.PI / 2;
	speaker.position.set(.72, -.26, .118);
	tilt.add(speaker);

	return console3d;
}

/* Miniature front-loading NES: light grey body, darker front section with the
   cartridge flap seam, the thin red stripes above it and four small feet. */
function createMiniNes(THREE) {
	var console3d = new THREE.Group();
	var shell = new THREE.MeshStandardMaterial({ color: 0xcac7bc, metalness: .05, roughness: .62 });
	var shellShade = new THREE.MeshStandardMaterial({ color: 0x7d7a71, metalness: .05, roughness: .66 });
	var trim = new THREE.MeshStandardMaterial({ color: 0x26272b, metalness: .1, roughness: .68 });
	var accent = new THREE.MeshStandardMaterial({ color: 0xb04a44, metalness: .12, roughness: .46 });

	var body = new THREE.Mesh(roundedSlabGeometry(THREE, 1.86, 1.26, .5, .09), shell);
	body.rotation.x = -Math.PI / 2;
	body.position.y = .28;
	console3d.add(body);

	var front = new THREE.Mesh(roundedSlabGeometry(THREE, 1.66, .33, .06, .04), shellShade);
	front.position.set(0, .23, .645);
	console3d.add(front);

	var flapSeam = new THREE.Mesh(new THREE.BoxGeometry(1.48, .014, .015), trim);
	flapSeam.position.set(0, .335, .682);
	console3d.add(flapSeam);

	var flapGrip = new THREE.Mesh(new THREE.BoxGeometry(.34, .05, .022), trim);
	flapGrip.position.set(0, .17, .682);
	console3d.add(flapGrip);

	[.435, .475].forEach(function (offsetY, index) {
		var stripe = new THREE.Mesh(new THREE.BoxGeometry(1.7, index ? .012 : .022, .022), accent);
		stripe.position.set(0, offsetY, .638);
		console3d.add(stripe);
	});

	[-.34, .34].forEach(function (offsetX) {
		var port = new THREE.Mesh(roundedSlabGeometry(THREE, .27, .12, .04, .04), trim);
		port.position.set(offsetX, .09, .655);
		console3d.add(port);
	});

	var power = new THREE.Mesh(new THREE.BoxGeometry(.12, .06, .04), accent);
	power.position.set(-.74, .09, .655);
	console3d.add(power);
	var reset = new THREE.Mesh(new THREE.BoxGeometry(.12, .06, .04), shellShade);
	reset.position.set(-.56, .09, .655);
	console3d.add(reset);

	var lidSeam = new THREE.Mesh(new THREE.BoxGeometry(1.7, .012, .01), shellShade);
	lidSeam.position.set(0, .531, .1);
	console3d.add(lidSeam);

	[-.72, .72].forEach(function (offsetX) {
		[-.48, .48].forEach(function (offsetZ) {
			var foot = new THREE.Mesh(new THREE.BoxGeometry(.18, .035, .16), trim);
			foot.position.set(offsetX, .018, offsetZ);
			console3d.add(foot);
		});
	});

	return console3d;
}

/* Miniature Super Nintendo in the rounded European shape: raised centre with the
   cartridge slot, vent grooves on the back half of the lid and the four coloured
   face buttons as the accent detail. */
function createMiniSnes(THREE) {
	var console3d = new THREE.Group();
	var shell = new THREE.MeshStandardMaterial({ color: 0xc6c2b9, metalness: .05, roughness: .6 });
	var shellShade = new THREE.MeshStandardMaterial({ color: 0xa5a19a, metalness: .05, roughness: .64 });
	var vent = new THREE.MeshStandardMaterial({ color: 0x6f6c66, metalness: .06, roughness: .7 });
	var trim = new THREE.MeshStandardMaterial({ color: 0x2a2b30, metalness: .1, roughness: .68 });
	var switchMaterial = new THREE.MeshStandardMaterial({ color: 0x7d7b95, metalness: .12, roughness: .5 });

	var body = new THREE.Mesh(roundedSlabGeometry(THREE, 1.74, 1.2, .4, .2), shell);
	body.rotation.x = -Math.PI / 2;
	body.position.y = .25;
	console3d.add(body);

	var hump = new THREE.Mesh(roundedSlabGeometry(THREE, 1, .92, .13, .17), shellShade);
	hump.rotation.x = -Math.PI / 2;
	hump.position.y = .5;
	console3d.add(hump);

	var slot = new THREE.Mesh(roundedSlabGeometry(THREE, .62, .5, .05, .05), trim);
	slot.rotation.x = -Math.PI / 2;
	slot.position.y = .555;
	console3d.add(slot);

	[-.76, -.65, -.54, .54, .65, .76].forEach(function (offsetX) {
		var groove = new THREE.Mesh(new THREE.BoxGeometry(.055, .02, .42), vent);
		groove.position.set(offsetX, .448, -.28);
		console3d.add(groove);
	});

	/* The four face buttons of the system's controller, kept small and used as
	   the only splash of colour on an otherwise grey shell. */
	[[0, -.11, 0x63b3e8], [.11, 0, 0xd7534f], [0, .11, 0xd8b544], [-.11, 0, 0x62b06a]].forEach(function (spot) {
		var button = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .022, 12),
			new THREE.MeshStandardMaterial({ color: spot[2], metalness: .1, roughness: .45 }));
		button.position.set(.65 + spot[0], .458, .3 + spot[1]);
		console3d.add(button);
	});

	var power = new THREE.Mesh(new THREE.BoxGeometry(.16, .022, .09), switchMaterial);
	power.position.set(-.7, .458, .28);
	console3d.add(power);
	var eject = new THREE.Mesh(new THREE.BoxGeometry(.16, .022, .09), shellShade);
	eject.position.set(-.5, .458, .28);
	console3d.add(eject);

	[-.42, .42].forEach(function (offsetX) {
		var port = new THREE.Mesh(roundedSlabGeometry(THREE, .26, .13, .04, .05), trim);
		port.position.set(offsetX, .16, .605);
		console3d.add(port);
	});

	[-.66, .66].forEach(function (offsetX) {
		[-.44, .44].forEach(function (offsetZ) {
			var foot = new THREE.Mesh(new THREE.BoxGeometry(.17, .035, .15), trim);
			foot.position.set(offsetX, .018, offsetZ);
			console3d.add(foot);
		});
	});

	return console3d;
}

/* How large an object actually lands on screen, and how far its middle sits off
   the centre line, both expressed in the units the camera is framing with. Used
   to lay out the hero strip from the models instead of from magic numbers. */
function measureOnScreen(THREE, object, camera) {
	object.updateMatrixWorld(true);
	camera.updateMatrixWorld();
	var box = new THREE.Box3().setFromObject(object);
	var corner = new THREE.Vector3();
	var minX = Infinity;
	var maxX = -Infinity;
	var minY = Infinity;
	var maxY = -Infinity;
	for (var index = 0; index < 8; index++) {
		corner.set(
			index & 1 ? box.max.x : box.min.x,
			index & 2 ? box.max.y : box.min.y,
			index & 4 ? box.max.z : box.min.z
		);
		camera.worldToLocal(corner);
		minX = Math.min(minX, corner.x);
		maxX = Math.max(maxX, corner.x);
		minY = Math.min(minY, corner.y);
		maxY = Math.max(maxY, corner.y);
	}
	return {
		width: maxX - minX,
		height: maxY - minY,
		centreY: (minY + maxY) / 2,
		/* how much of a world-space lift the camera reads as vertical movement */
		upY: new THREE.Vector3(0, 1, 0).transformDirection(camera.matrixWorldInverse).y || 1
	};
}

/* Extruded rounded rectangle centred on the origin, with a small bevel so the
   edges catch a highlight instead of reading as a flat cardboard box. The
   footprint lives in XY and the extrusion runs along Z, so a mesh rotated by
   minus a quarter turn around X lies flat like a console on a shelf. */
function roundedSlabGeometry(THREE, width, height, depth, radius, bevel) {
	var edge = bevel === undefined ? Math.min(depth * .28, .022) : bevel;
	edge = Math.min(edge, radius * .5, width * .2, height * .2, depth * .4);
	var geometry = new THREE.ExtrudeGeometry(
		roundedRectShape(THREE, width - edge * 2, height - edge * 2, Math.max(radius - edge, .002)),
		{
			depth: Math.max(depth - edge * 2, .002),
			bevelEnabled: edge > 0,
			bevelThickness: edge,
			bevelSize: edge,
			bevelSegments: 1,
			curveSegments: 6
		}
	);
	geometry.center();
	return geometry;
}

/* A rectangular frame with a real opening, used for the screen bezels: the
   display can then sit recessed behind it instead of being painted onto the
   shell, which is what sells the depth at these sizes. */
function frameGeometry(THREE, width, height, radius, innerWidth, innerHeight, depth) {
	var shape = roundedRectShape(THREE, width, height, radius);
	shape.holes.push(roundedRectShape(THREE, innerWidth, innerHeight, Math.min(radius * .6, .045)));
	var geometry = new THREE.ExtrudeGeometry(shape, {
		depth: depth,
		bevelEnabled: false,
		curveSegments: 6
	});
	geometry.center();
	return geometry;
}

/* Soft additive halo on a single quad: a radial falloff for under-glows and
   screen bloom, or a ring for the pulses leaving the link hub. Two triangles
   each, so the scenes can afford one per console without a texture. */
function glowMaterial(THREE, options) {
	return new THREE.ShaderMaterial({
		uniforms: {
			uColor: { value: new THREE.Color(options.color) },
			uOpacity: { value: options.opacity === undefined ? .5 : options.opacity },
			uFalloff: { value: options.falloff || 2.6 },
			uRing: { value: options.ring ? 1 : 0 },
			uRingWidth: { value: options.ringWidth || .3 }
		},
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		vertexShader: [
			'varying vec2 vUv;',
			'void main(){',
			'  vUv = uv;',
			'  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
			'}'
		].join('\n'),
		fragmentShader: [
			'precision mediump float;',
			'varying vec2 vUv;',
			'uniform vec3 uColor;',
			'uniform float uOpacity;',
			'uniform float uFalloff;',
			'uniform float uRing;',
			'uniform float uRingWidth;',
			'void main(){',
			'  float d = length(vUv - 0.5) * 2.0;',
			'  float disc = pow(clamp(1.0 - d, 0.0, 1.0), uFalloff);',
			'  float ring = pow(clamp(1.0 - abs(d - 0.72) / uRingWidth, 0.0, 1.0), 1.8);',
			'  float alpha = mix(disc, ring, uRing) * uOpacity;',
			'  alpha *= 1.0 - smoothstep(0.92, 1.0, d);',
			'  if (alpha <= 0.002) discard;',
			'  gl_FragColor = vec4(uColor, alpha);',
			'}'
		].join('\n')
	});
}

/* Front outline of a GBA: flatter top edge, rounder wing grips at the bottom. */
function gbaBodyShape(THREE, width, height, topRadius, bottomRadius) {
	var shape = new THREE.Shape();
	var x0 = -width / 2;
	var x1 = width / 2;
	var y0 = -height / 2;
	var y1 = height / 2;
	shape.moveTo(x0 + bottomRadius, y0);
	shape.lineTo(x1 - bottomRadius, y0);
	shape.quadraticCurveTo(x1, y0, x1, y0 + bottomRadius);
	shape.lineTo(x1, y1 - topRadius);
	shape.quadraticCurveTo(x1, y1, x1 - topRadius, y1);
	shape.lineTo(x0 + topRadius, y1);
	shape.quadraticCurveTo(x0, y1, x0, y1 - topRadius);
	shape.lineTo(x0, y0 + bottomRadius);
	shape.quadraticCurveTo(x0, y0, x0 + bottomRadius, y0);
	return shape;
}
