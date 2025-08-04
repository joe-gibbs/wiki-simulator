// Lazy loading implementation for images
class LazyImageLoader {
  constructor() {
    this.imageObserver = null;
    this.init();
  }

  init() {
    // Check if Intersection Observer is supported
    if ("IntersectionObserver" in window) {
      this.imageObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const img = entry.target;
              this.loadImage(img);
              observer.unobserve(img);
            }
          });
        },
        {
          // Start loading when image is 100px away from viewport
          rootMargin: "100px",
          threshold: 0.01,
        }
      );

      this.observeImages();
    } else {
      // Fallback for browsers without Intersection Observer
      this.loadAllImages();
    }
  }

  observeImages() {
    const lazyImages = document.querySelectorAll(".lazy-load");
    lazyImages.forEach((img) => {
      this.imageObserver.observe(img);
    });
  }

  loadImage(img) {
    const src = img.dataset.src;
    if (!src) return;

    // Create a new image to preload
    const imageLoader = new Image();

    imageLoader.onload = () => {
      // Image loaded successfully
      img.src = src;
      img.classList.remove("lazy-load");
      img.classList.add("loaded");

      // Update aspect ratio handler if needed
      if (window.updateImageAspectRatio) {
        window.updateImageAspectRatio(img);
      }
    };

    imageLoader.onerror = () => {
      // Image failed to load - just hide it
      img.style.display = "none";
      img.classList.remove("lazy-load");
      img.classList.add("error");
    };

    // Start loading
    imageLoader.src = src;
  }

  loadAllImages() {
    // Fallback: load all images immediately
    const lazyImages = document.querySelectorAll(".lazy-load");
    lazyImages.forEach((img) => {
      this.loadImage(img);
    });
  }

  // Method to observe new images (for dynamically added content)
  observeNewImages() {
    if (this.imageObserver) {
      const newLazyImages = document.querySelectorAll(
        ".lazy-load:not(.loading):not(.loaded)"
      );
      newLazyImages.forEach((img) => {
        this.imageObserver.observe(img);
      });
    }
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.lazyImageLoader = new LazyImageLoader();
});

// Export for use in other scripts
window.LazyImageLoader = LazyImageLoader;
