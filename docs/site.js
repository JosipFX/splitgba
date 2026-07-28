var menuButton = document.querySelector('.menu-button');
var navLinks = document.querySelector('.navlinks');

if (menuButton && navLinks) {
	menuButton.addEventListener('click', function () {
		var isOpen = navLinks.classList.toggle('is-open');
		menuButton.setAttribute('aria-expanded', String(isOpen));
	});
	navLinks.querySelectorAll('a').forEach(function (link) {
		link.addEventListener('click', function () {
			navLinks.classList.remove('is-open');
			menuButton.setAttribute('aria-expanded', 'false');
		});
	});
}

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

fetch('https://api.github.com/repos/JosipFX/splitemu')
	.then(function (response) { return response.json(); })
	.then(function (data) {
		var starCount = document.getElementById('star-count');
		if (starCount && typeof data.stargazers_count === 'number') {
			starCount.textContent = String(data.stargazers_count);
			starCount.closest('.github-stars').hidden = false;
		}
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

var visualCanvases = document.querySelectorAll('[data-shader], #link-scene');
if (visualCanvases.length) {
	import('https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.min.js')
		.then(function (THREE) {
			document.querySelectorAll('[data-shader]').forEach(function (canvas) {
				initShaderGradient(THREE, canvas);
			});
			initLinkScene(THREE);
		})
		.catch(function () {});
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
	camera.position.set(0, .25, 7.6);
	var rig = new THREE.Group();
	scene.add(rig);

	scene.add(new THREE.AmbientLight(0xc4e3ff, 1.5));
	var keyLight = new THREE.PointLight(0x9fe3ff, 34, 14);
	keyLight.position.set(-3, 4, 5);
	scene.add(keyLight);
	var rimLight = new THREE.PointLight(0xb7f56a, 24, 12);
	rimLight.position.set(4, -2, 3);
	scene.add(rimLight);

	var accents = [0x75e7ff, 0xb7f56a, 0xffc96b, 0xff7781];
	var positions = [
		new THREE.Vector3(-1.55, .95, 0),
		new THREE.Vector3(1.55, .95, -.18),
		new THREE.Vector3(-1.55, -.95, -.18),
		new THREE.Vector3(1.55, -.95, 0)
	];
	var screenGroups = [];
	var packets = [];

	positions.forEach(function (position, index) {
		var curve = new THREE.CatmullRomCurve3([
			position.clone().multiplyScalar(.88),
			new THREE.Vector3(position.x * .38, position.y * .38, .14),
			new THREE.Vector3(0, 0, .2)
		]);
		var connection = new THREE.Line(
			new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)),
			new THREE.LineBasicMaterial({ color: accents[index], transparent: true, opacity: .34 })
		);
		rig.add(connection);

		var packet = new THREE.Mesh(
			new THREE.SphereGeometry(.045, 10, 8),
			new THREE.MeshBasicMaterial({ color: accents[index], transparent: true, opacity: .95 })
		);
		rig.add(packet);
		packets.push({ mesh: packet, curve: curve, offset: index * .27 });

		var device = createGbaDevice(THREE, accents[index]);
		device.position.copy(position);
		device.rotation.z = index % 2 ? -.055 : .055;
		rig.add(device);
		screenGroups.push(device);
	});

	var hub = new THREE.Group();
	hub.add(new THREE.Mesh(
		new THREE.TorusGeometry(.38, .022, 10, 64),
		new THREE.MeshBasicMaterial({ color: 0xb7f56a, transparent: true, opacity: .55 })
	));
	hub.add(new THREE.Mesh(
		new THREE.OctahedronGeometry(.16, 0),
		new THREE.MeshStandardMaterial({
			color: 0xe8ffe0,
			emissive: 0x4b7a36,
			emissiveIntensity: 1.4,
			metalness: .45,
			roughness: .2
		})
	));
	hub.position.z = .26;
	rig.add(hub);

	var pointerTarget = { x: 0, y: 0 };
	if (window.matchMedia('(pointer: fine)').matches && !prefersReducedMotion) {
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
	}
	resize();
	new ResizeObserver(resize).observe(canvas);

	var visible = true;
	new IntersectionObserver(function (entries) {
		visible = entries[0].isIntersecting;
	}).observe(canvas);

	function render(time) {
		if (visible) {
			var t = prefersReducedMotion ? 0 : time * .001;
			rig.rotation.y += (pointerTarget.x - rig.rotation.y) * .045;
			rig.rotation.x += (-pointerTarget.y - rig.rotation.x) * .045;
			hub.rotation.x = t * .28;
			hub.rotation.y = t * .36;
			screenGroups.forEach(function (device, index) {
				device.position.z = positions[index].z + Math.sin(t * .8 + index * 1.4) * .06;
			});
			packets.forEach(function (packet) {
				var progress = (t * .34 + packet.offset) % 1;
				packet.curve.getPoint(progress, packet.mesh.position);
				packet.mesh.material.opacity = Math.sin(progress * Math.PI) * .95;
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

/* A landscape Game Boy Advance: wide body with rounded wing grips, inset screen
   bezel, D-pad on the left, A/B diagonal on the right, Start/Select below the
   screen and L/R hints on the top edge. */
function createGbaDevice(THREE, accent) {
	var device = new THREE.Group();
	var shellMaterial = new THREE.MeshStandardMaterial({
		color: 0x362e6c,
		metalness: .28,
		roughness: .5
	});
	var buttonMaterial = new THREE.MeshStandardMaterial({
		color: 0x191b30,
		metalness: .2,
		roughness: .6
	});

	var halo = new THREE.Mesh(
		new THREE.ShapeGeometry(roundedRectShape(THREE, 1.62, .97, .36), 10),
		new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: .2 })
	);
	halo.position.z = -.1;
	device.add(halo);

	var shoulders = new THREE.Mesh(
		new THREE.BoxGeometry(1.44, .82, .1),
		shellMaterial
	);
	shoulders.position.y = .06;
	device.add(shoulders);

	var bodyGeometry = new THREE.ExtrudeGeometry(
		gbaBodyShape(THREE, 1.5, .85, .23, .35),
		{ depth: .1, bevelEnabled: true, bevelThickness: .03, bevelSize: .035, bevelSegments: 2, curveSegments: 10 }
	);
	bodyGeometry.center();
	device.add(new THREE.Mesh(bodyGeometry, shellMaterial));

	var bezel = new THREE.Mesh(
		new THREE.ShapeGeometry(roundedRectShape(THREE, .8, .58, .05), 6),
		new THREE.MeshBasicMaterial({ color: 0x07080f })
	);
	bezel.position.set(0, .015, .087);
	device.add(bezel);

	var screen = new THREE.Mesh(
		new THREE.PlaneGeometry(.63, .42),
		new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: .74 })
	);
	screen.position.set(0, .045, .091);
	device.add(screen);

	var padWell = new THREE.Mesh(
		new THREE.CircleGeometry(.15, 20),
		new THREE.MeshBasicMaterial({ color: 0x201c3e })
	);
	padWell.position.set(-.5, -.02, .086);
	device.add(padWell);

	[[.2, .07], [.07, .2]].forEach(function (size) {
		var arm = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], .04), buttonMaterial);
		arm.position.set(-.5, -.02, .095);
		device.add(arm);
	});

	[[.52, .05], [.375, -.055]].forEach(function (spot) {
		var button = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .03, 14), buttonMaterial);
		button.rotation.x = Math.PI / 2;
		button.position.set(spot[0], spot[1], .095);
		device.add(button);
	});

	[-.06, .08].forEach(function (offsetX) {
		var pill = new THREE.Mesh(new THREE.BoxGeometry(.11, .038, .025), buttonMaterial);
		pill.position.set(offsetX, -.31 + offsetX * .16, .09);
		pill.rotation.z = -.3;
		device.add(pill);
	});

	var led = new THREE.Mesh(
		new THREE.CircleGeometry(.022, 10),
		new THREE.MeshBasicMaterial({ color: 0xb7f56a })
	);
	led.position.set(-.34, -.32, .088);
	device.add(led);

	return device;
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
