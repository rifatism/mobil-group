// ===== SMOOTH SCROLL (lerp) =====
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
  window.addEventListener('wheel', e => {
    e.preventDefault();
    target = clamp(target + e.deltaY, 0, maxScroll());
    start();
  }, { passive: false });
  window.addEventListener('keydown', e => {
    const map = { ArrowDown: 80, ArrowUp: -80, PageDown: window.innerHeight * 0.88, PageUp: -window.innerHeight * 0.88 };
    const delta = map[e.key];
    if (delta !== undefined) { e.preventDefault(); target = clamp(target + delta, 0, maxScroll()); start(); }
  });
  window.addEventListener('scroll', () => { if (!running) { target = window.scrollY; current = window.scrollY; } });
})();

// ===== SCROLL REVEAL =====
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in-view');
      revealObs.unobserve(e.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.ab-tl-item, .ab-client-card').forEach(el => revealObs.observe(el));