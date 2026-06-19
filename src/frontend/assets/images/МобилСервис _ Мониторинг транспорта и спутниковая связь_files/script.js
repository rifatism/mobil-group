// ===== SMOOTH SCROLL (lerp / инерционное скольжение) =====
(function () {
  // Пропускаем на тач-устройствах — там нативный скролл лучше
  if ('ontouchstart' in window) return;

  let target  = window.scrollY;
  let current = window.scrollY;
  let running = false;
  const EASE  = 0.042; // чем меньше — тем длиннее скольжение

  function lerp(a, b, t) { return a + (b - a) * t; }
  function maxScroll()    { return document.documentElement.scrollHeight - window.innerHeight; }
  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

  function tick() {
    current = lerp(current, target, EASE);
    window.scrollTo(0, current);

    if (Math.abs(target - current) > 0.5) {
      requestAnimationFrame(tick);
    } else {
      current = target;
      window.scrollTo(0, current);
      running = false;
    }
  }

  function start() {
    if (!running) { running = true; requestAnimationFrame(tick); }
  }

  // Колесо мыши
  window.addEventListener('wheel', e => {
    e.preventDefault();
    target = clamp(target + e.deltaY, 0, maxScroll());
    start();
  }, { passive: false });

  // Клавиатура
  window.addEventListener('keydown', e => {
    const map = {
      ArrowDown:  80, ArrowUp: -80,
      PageDown:   window.innerHeight * 0.88,
      PageUp:    -window.innerHeight * 0.88,
      End:        maxScroll(), Home: -maxScroll(),
      ' ':        window.innerHeight * 0.88,
    };
    const delta = e.shiftKey && e.key === ' ' ? -window.innerHeight * 0.88 : map[e.key];
    if (delta !== undefined) {
      e.preventDefault();
      target = clamp(target + delta, 0, maxScroll());
      start();
    }
  });

  // Синхронизация со скроллбаром браузера
  window.addEventListener('scroll', () => {
    if (!running) { target = window.scrollY; current = window.scrollY; }
  });
})();

// ===== HERO SLIDER =====
const slides = document.querySelectorAll('.hero-slide');
let currentSlide = 0;
function nextSlide() {
  slides[currentSlide].classList.remove('active');
  currentSlide = (currentSlide + 1) % slides.length;
  slides[currentSlide].classList.add('active');
}
setInterval(nextSlide, 4000);

// ===== NAVBAR SCROLL =====
const navbar = document.querySelector('.navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > window.innerHeight * 0.6);
});

// ===== SCROLL REVEAL (scale from center) =====
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in-view');
      revealObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.feat-card, .cat-item').forEach(el => revealObserver.observe(el));

// ===== 3D TILT HOVER — карточки преимуществ =====
document.querySelectorAll('.feat-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    card.style.transition = 'transform 0.08s ease, box-shadow 0.08s ease';
    card.style.transform = `perspective(700px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) scale(1.03)`;
  });

  card.addEventListener('mouseleave', () => {
    card.style.transition = 'transform 0.55s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.4s ease';
    card.style.transform = card.classList.contains('feat-dark')
      ? 'translateY(-30px) scale(1)'
      : 'scale(1)';
    setTimeout(() => { card.style.transform = ''; }, 560);
  });
});
