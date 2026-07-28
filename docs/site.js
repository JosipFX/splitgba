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
