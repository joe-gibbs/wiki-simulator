// Wikipedia slug utility functions

// Function to convert title to Wikipedia-style slug (preserves Unicode)
export function titleToWikipediaSlug(title) {
  return title.trim().replace(/\s+/g, "_");
}

// Function to convert Wikipedia slug back to title (preserves existing casing)
export function wikipediaSlugToTitle(slug) {
  return slug.replace(/_/g, " ");
}
