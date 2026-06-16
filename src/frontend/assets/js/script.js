const slides = document.querySelectorAll('.hero-slide');
  let currentSlide = 0;
  const slideInterval = 4000; // 4 секунды

  function nextSlide() {
    slides[currentSlide].classList.remove('active');
    currentSlide = (currentSlide + 1) % slides.length;
    slides[currentSlide].classList.add('active');
  }

  setInterval(nextSlide, slideInterval);