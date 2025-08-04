// Wikipedia slug utility functions

// Function to convert title to Wikipedia-style slug
export function titleToWikipediaSlug(title) {
  return title
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w_]/g, "");
}

// Function to convert Wikipedia slug back to title
export function wikipediaSlugToTitle(slug) {
  return slug
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
