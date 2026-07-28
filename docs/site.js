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

function initShaderGradient(THREE, canvas) {
	var palette = canvas.dataset.shader === 'build'
		? ['#07121d', '#15546a', '#8ccf62']
		: ['#06131d', '#19647a', '#85e7ee'];
	var renderer = new THREE.WebGLRenderer({
		canvas: canvas,
		alpha: true,
		antialias: false,
		powerPreference: 'low-power'
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
	var scene = new THREE.Scene();
	var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	var uniforms = {
		uTime: { value: 0 },
		uColorA: { value: new THREE.Color(palette[0]) },
		uColorB: { value: new THREE.Color(palette[1]) },
		uColorC: { value: new THREE.Color(palette[2]) }
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
		fragmentShader: [
			'precision highp float;',
			'varying vec2 vUv;',
			'uniform float uTime;',
			'uniform vec3 uColorA;',
			'uniform vec3 uColorB;',
			'uniform vec3 uColorC;',
			'float blob(vec2 uv, vec2 p, float s){',
			'  float d = length(uv - p);',
			'  return smoothstep(s, 0.0, d);',
			'}',
			'void main(){',
			'  vec2 uv = vUv;',
			'  float t = uTime * 0.11;',
			'  vec2 p1 = vec2(0.28 + sin(t) * 0.08, 0.62 + cos(t * 0.8) * 0.1);',
			'  vec2 p2 = vec2(0.70 + cos(t * 0.7) * 0.11, 0.44 + sin(t * 1.1) * 0.08);',
			'  vec2 p3 = vec2(0.52 + sin(t * 0.55) * 0.18, 0.18 + cos(t) * 0.06);',
			'  float a = blob(uv, p1, 0.48);',
			'  float b = blob(uv, p2, 0.42);',
			'  float c = blob(uv, p3, 0.36);',
			'  float bands = sin((uv.x * 1.6 + uv.y + t) * 5.0) * 0.035;',
			'  vec3 color = uColorA;',
			'  color = mix(color, uColorB, clamp(a + b * 0.62 + bands, 0.0, 1.0));',
			'  color = mix(color, uColorC, clamp(c * 0.72 + a * b * 0.25, 0.0, 1.0));',
			'  float alpha = clamp((a + b + c) * 0.62, 0.0, 0.92);',
			'  gl_FragColor = vec4(color, alpha);',
			'}'
		].join('\n')
	});
	scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

	function resize() {
		var width = Math.max(1, canvas.clientWidth);
		var height = Math.max(1, canvas.clientHeight);
		renderer.setSize(width, height, false);
	}
	resize();
	new ResizeObserver(resize).observe(canvas);

	var visible = true;
	new IntersectionObserver(function (entries) {
		visible = entries[0].isIntersecting;
	}).observe(canvas);

	function render(time) {
		if (visible) {
			uniforms.uTime.value = prefersReducedMotion ? 0 : time * .001;
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

	var scene = new THREE.Scene();
	var camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
	camera.position.set(0, .25, 7.6);
	var rig = new THREE.Group();
	scene.add(rig);

	scene.add(new THREE.AmbientLight(0xb9ddff, 1.8));
	var keyLight = new THREE.PointLight(0x75e7ff, 22, 12);
	keyLight.position.set(-3, 4, 5);
	scene.add(keyLight);
	var rimLight = new THREE.PointLight(0xb7f56a, 16, 10);
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

	positions.forEach(function (position, index) {
		var connectionGeometry = new THREE.BufferGeometry().setFromPoints([
			position.clone().multiplyScalar(.88),
			new THREE.Vector3(position.x * .38, position.y * .38, .14),
			new THREE.Vector3(0, 0, .2)
		]);
		var connection = new THREE.Line(
			connectionGeometry,
			new THREE.LineBasicMaterial({ color: accents[index], transparent: true, opacity: .44 })
		);
		rig.add(connection);

		var device = new THREE.Group();
		var body = new THREE.Mesh(
			new THREE.BoxGeometry(1.42, .87, .17),
			new THREE.MeshStandardMaterial({
				color: 0x111a26,
				metalness: .56,
				roughness: .34
			})
		);
		device.add(body);
		var screen = new THREE.Mesh(
			new THREE.PlaneGeometry(1.12, .57),
			new THREE.MeshBasicMaterial({ color: accents[index], transparent: true, opacity: .54 })
		);
		screen.position.z = .092;
		device.add(screen);
		var frame = new THREE.LineSegments(
			new THREE.EdgesGeometry(new THREE.BoxGeometry(1.44, .89, .18)),
			new THREE.LineBasicMaterial({ color: accents[index], transparent: true, opacity: .72 })
		);
		device.add(frame);
		device.position.copy(position);
		device.rotation.z = index % 2 ? -.055 : .055;
		rig.add(device);
		screenGroups.push(device);
	});

	var hub = new THREE.Group();
	hub.add(new THREE.Mesh(
		new THREE.TorusGeometry(.46, .035, 12, 72),
		new THREE.MeshBasicMaterial({ color: 0xb7f56a, transparent: true, opacity: .9 })
	));
	hub.add(new THREE.Mesh(
		new THREE.OctahedronGeometry(.22, 0),
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
			renderer.render(scene, camera);
			if (stage && !stage.classList.contains('three-ready')) stage.classList.add('three-ready');
		}
		if (!prefersReducedMotion) window.requestAnimationFrame(render);
	}
	render(0);
}
