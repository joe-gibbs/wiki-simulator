// Image context storage for better image generation
import { setCache, getCache, isCached } from "./fileCache.js";

/**
 * Store context information for an image
 * @param {string} imageSlug - The image slug/filename
 * @param {string} articleTitle - The article title where the image appears
 * @param {string} sectionTitle - The section where the image appears
 * @param {string} caption - The image caption
 * @param {string} articleContext - Relevant context from the article
 */
export function storeImageContext(
  imageSlug,
  articleTitle,
  sectionTitle,
  caption,
  articleContext = ""
) {
  const contextKey = `img_context_${imageSlug}`;
  const contextData = {
    imageSlug,
    articleTitle,
    sectionTitle,
    caption,
    articleContext,
    createdAt: new Date().toISOString(),
  };

  setCache(contextKey, contextData);
  console.log(
    `📝 Stored context for image: ${imageSlug} (Article: ${articleTitle}, Section: ${sectionTitle})`
  );
}

/**
 * Retrieve context information for an image
 * @param {string} imageSlug - The image slug/filename
 * @returns {Object|null} - Context data or null if not found
 */
export function getImageContext(imageSlug) {
  const contextKey = `img_context_${imageSlug}`;

  if (isCached(contextKey, 168)) {
    // 7 days cache
    const contextData = getCache(contextKey);
    console.log(
      `📋 Retrieved context for image: ${imageSlug} (Article: ${contextData?.articleTitle})`
    );
    return contextData;
  }

  console.log(`⚠️ No context found for image: ${imageSlug}`);
  return null;
}

/**
 * Build comprehensive context string for image generation
 * @param {string} imageSlug - The image slug/filename
 * @param {Object} contextData - Context data from cache
 * @returns {string} - Formatted context string
 */
export function buildImageGenerationContext(imageSlug, contextData) {
  if (!contextData) {
    return `Image for ${imageSlug.replace(/_/g, " ")}`;
  }

  const parts = [];

  if (contextData.articleTitle) {
    parts.push(`Wikipedia article about "${contextData.articleTitle}"`);
  }

  if (
    contextData.sectionTitle &&
    contextData.sectionTitle !== contextData.articleTitle
  ) {
    parts.push(`Section: "${contextData.sectionTitle}"`);
  }

  if (contextData.caption) {
    parts.push(`Caption: "${contextData.caption}"`);
  }

  if (contextData.articleContext) {
    parts.push(`Context: ${contextData.articleContext.substring(0, 200)}...`);
  }

  const contextString = parts.join(". ");
  console.log(`🔧 Built context: ${contextString.substring(0, 150)}...`);
  return contextString;
}
