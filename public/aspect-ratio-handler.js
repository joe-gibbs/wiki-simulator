// Client-side script to handle aspect ratio requests for images
function updateImageAspectRatio(img) {
  const figure = img.closest("figure");
  if (figure && figure.dataset.aspectRatio) {
    const currentSrc = img.dataset.src || img.src;
    if (currentSrc) {
      const url = new URL(currentSrc, window.location.origin);
      url.searchParams.set("aspect", figure.dataset.aspectRatio);
      if (img.dataset.src) {
        img.dataset.src = url.toString();
      } else {
        img.src = url.toString();
      }
    }
  }
}

document.addEventListener("DOMContentLoaded", function () {
  // Find all wiki images and update their data-src to include aspect ratio
  const images = document.querySelectorAll(".wiki-image");

  images.forEach((img) => {
    updateImageAspectRatio(img);
  });
});

// Export for use by lazy loader
window.updateImageAspectRatio = updateImageAspectRatio;
