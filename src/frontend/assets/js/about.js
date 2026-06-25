// ===== SMOOTH SCROLL =====
(function () {
  if ('ontouchstart' in window) return;
  let target = window.scrollY, current = window.scrollY, running = false;
  const EASE = 0.042;
  function lerp(a, b, t) { return a + (b - a) * t; }
  function maxScroll() { return document.documentElement.scrollHeight - window.innerHeight; }
  function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
  function tick() {
    current = lerp(current, target, EASE);
    window.scrollTo(0, current);
    if (Math.abs(target - current) > 0.5) { requestAnimationFrame(tick); }
    else { current = target; window.scrollTo(0, current); running = false; }
  }
  function start() { if (!running) { running = true; requestAnimationFrame(tick); } }
  window.addEventListener('wheel', e => { e.preventDefault(); target = clamp(target + e.deltaY, 0, maxScroll()); start(); }, { passive: false });
  window.addEventListener('keydown', e => {
    const map = { ArrowDown: 80, ArrowUp: -80, PageDown: window.innerHeight * 0.88, PageUp: -window.innerHeight * 0.88 };
    const delta = map[e.key];
    if (delta !== undefined) { e.preventDefault(); target = clamp(target + delta, 0, maxScroll()); start(); }
  });
  window.addEventListener('scroll', () => { if (!running) { target = window.scrollY; current = window.scrollY; } });
})();

// ===== SCROLL REVEAL =====
const revealObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in-view'); revealObs.unobserve(e.target); }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal, .ab-tl-item, .ab-client-card').forEach(el => revealObs.observe(el));

// ===== ANIMATED COUNTERS + RINGS =====
const CIRCUMFERENCE_RING = 2 * Math.PI * 52;   // r=52
const CIRCUMFERENCE_DONUT = 2 * Math.PI * 88;  // r=88

function animateCounter(el) {
  const target = +el.dataset.target;
  const dur = 1600;
  const step = target / (dur / 16);
  let cur = 0;
  const timer = setInterval(() => {
    cur = Math.min(cur + step, target);
    el.textContent = Math.floor(cur).toLocaleString('ru-RU');
    if (cur >= target) clearInterval(timer);
  }, 16);
}

function animateRing(el) {
  const pct = +el.dataset.pct / 100;
  const offset = CIRCUMFERENCE_RING * (1 - pct);
  el.style.strokeDasharray = CIRCUMFERENCE_RING;
  setTimeout(() => { el.style.strokeDashoffset = offset; }, 50);
}

// Кольца счётчиков
const statObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    // счётчик
    const counter = e.target.querySelector('.ab-counter');
    if (counter) animateCounter(counter);
    // кольцо
    const ring = e.target.querySelector('.ab-ring-fill');
    if (ring) animateRing(ring);
    statObs.unobserve(e.target);
  });
}, { threshold: 0.4 });
document.querySelectorAll('.ab-stat-item').forEach(el => statObs.observe(el));

// ===== DONUT CHART =====
(function() {
  const segs = document.querySelectorAll('.ab-donut-seg');
  if (!segs.length) return;

  let offset = 0;
  const circ = CIRCUMFERENCE_DONUT;

  segs.forEach(seg => {
    const pct = +seg.dataset.pct / 100;
    const dash = circ * pct;
    seg.style.strokeDasharray = `${dash} ${circ - dash}`;
    seg.style.strokeDashoffset = -offset;
    offset += dash;
  });

  // Анимация при появлении в области видимости
  const donutObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      // Показываем сегменты поочерёдно
      segs.forEach((seg, i) => {
        seg.style.opacity = '0';
        seg.style.transition = `opacity 0.5s ease ${i * 0.15}s`;
        setTimeout(() => { seg.style.opacity = '1'; }, 50);
      });
      donutObs.unobserve(e.target);
    });
  }, { threshold: 0.3 });
  const donutWrap = document.querySelector('.ab-donut-wrap');
  if (donutWrap) donutObs.observe(donutWrap);
})();

// ===== BAR CHART (горизонтальные полосы) =====
const barObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const fill = e.target.querySelector('.ab-bar-fill');
    if (fill) {
      setTimeout(() => { fill.style.width = fill.dataset.w + '%'; }, 100);
    }
    barObs.unobserve(e.target);
  });
}, { threshold: 0.3 });
document.querySelectorAll('.ab-bar-row').forEach(el => barObs.observe(el));

// ===== ANCHOR SCROLL =====
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const id = link.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const y = el.getBoundingClientRect().top + window.scrollY;
    if (window.smoothScrollTo) window.smoothScrollTo(y);
    else window.scrollTo({ top: y, behavior: 'smooth' });
  });
});
