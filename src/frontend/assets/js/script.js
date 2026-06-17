// Hero slider
const slides = document.querySelectorAll('.hero-slide');
let currentSlide = 0;

function nextSlide() {
  slides[currentSlide].classList.remove('active');
  currentSlide = (currentSlide + 1) % slides.length;
  slides[currentSlide].classList.add('active');
}

setInterval(nextSlide, 4000);

// Navbar: прозрачный на hero, белый при скролле
const navbar = document.querySelector('.navbar');
const heroHeight = window.innerHeight;

window.addEventListener('scroll', () => {
  if (window.scrollY > heroHeight * 0.6) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});