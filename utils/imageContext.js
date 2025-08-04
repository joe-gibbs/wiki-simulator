// Image context storage for better image generation
import { setCache, getCache, isCached } from "./fileCache.js";

/**
 * Extract all image references from generated HTML content
 * @param {string} htmlContent - The generated HTML content
 * @returns {Array} - Array of image objects with filename, caption, etc.
 */
export function extractImageReferences(htmlContent) {
  const images = [];

  // Extract from <figure> tags with images
  const figureRegex =
    /<figure[^>]*>[\s\S]*?<img[^>]+data-src="\/images\/([^"]+)"[^>]*alt="([^"]*)"[^>]*>[\s\S]*?<figcaption[^>]*>([^<]*)<\/figcaption>[\s\S]*?<\/figure>/g;
  let match;

  while ((match = figureRegex.exec(htmlContent)) !== null) {
    const [, filename, alt, caption] = match;
    images.push({
      filename: filename,
      slug: filename.replace(/\.[^/.]+$/, ""), // Remove extension
      alt: alt || caption,
      caption: caption,
      type: "figure",
    });
  }

  // Extract from standalone <img> tags
  const imgRegex =
    /<img[^>]+(?:data-src|src)="\/images\/([^"]+)"[^>]*alt="([^"]*)"[^>]*>/g;

  while ((match = imgRegex.exec(htmlContent)) !== null) {
    const [, filename, alt] = match;
    const slug = filename.replace(/\.[^/.]+$/, "");

    // Skip if already found in figures
    if (!images.some((img) => img.slug === slug)) {
      images.push({
        filename: filename,
        slug: slug,
        alt: alt,
        caption: alt,
        type: "standalone",
      });
    }
  }

  return images;
}

/**
 * Store image prompt for fast generation
 * @param {string} imageSlug - The image slug/filename
 * @param {string} prompt - The generated image prompt
 * @param {string} articleTitle - The article title where the image appears
 */
export function storeImagePrompt(imageSlug, prompt, articleTitle) {
  const promptKey = `img_prompt_${imageSlug}`;
  const promptData = {
    imageSlug,
    prompt,
    articleTitle,
    ready: true,
    createdAt: new Date().toISOString(),
  };

  setCache(promptKey, promptData, {}, false, 168); // Cache for 7 days
  console.log(`💾 Stored prompt for image: ${imageSlug}`);
}

/**
 * Mark image prompts as being generated (not ready yet)
 * @param {Array} imageReferences - Array of image objects
 * @param {string} articleTitle - The article title
 */
export function markPromptsGenerating(imageReferences, articleTitle) {
  imageReferences.forEach((image) => {
    const promptKey = `img_prompt_${image.slug}`;
    const promptData = {
      imageSlug: image.slug,
      prompt: null,
      articleTitle,
      ready: false,
      generatingAt: new Date().toISOString(),
    };
    setCache(promptKey, promptData, {}, false, 168);
  });
  console.log(
    `⏳ Marked ${imageReferences.length} image prompts as generating`
  );
}

/**
 * Check if image prompt is ready
 * @param {string} imageSlug - The image slug/filename
 * @returns {Object|null} - Prompt data or null if not found/ready
 */
export function getImagePrompt(imageSlug) {
  const promptKey = `img_prompt_${imageSlug}`;

  if (isCached(promptKey, 168)) {
    // 7 days cache
    const promptData = getCache(promptKey);
    if (promptData?.ready && promptData?.prompt) {
      console.log(`✅ Retrieved ready prompt for image: ${imageSlug}`);
      return promptData;
    } else if (promptData && !promptData.ready) {
      console.log(`⏳ Prompt still generating for image: ${imageSlug}`);
      return { ready: false, generating: true };
    }
  }

  console.log(`⚠️ No prompt found for image: ${imageSlug}`);
  return null;
}

/**
 * Check if image prompt is ready (simple boolean check)
 * @param {string} imageSlug - The image slug/filename
 * @returns {boolean} - True if prompt is ready
 */
export function isImagePromptReady(imageSlug) {
  const promptData = getImagePrompt(imageSlug);
  return promptData?.ready === true;
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
    parts.push(`Article: "${contextData.articleTitle}"`);
  }

  if (contextData.caption) {
    parts.push(`Caption: "${contextData.caption}"`);
  }

  if (contextData.articleContext) {
    parts.push(`Context: ${contextData.articleContext.substring(0, 100)}`);
  }

  // Limit total context to 300 characters for faster prompt generation
  const contextString = parts.join(". ").substring(0, 300);
  console.log(`🔧 Built context: ${contextString.substring(0, 100)}...`);
  return contextString;
}

export function mergeInfoboxImageReferences(htmlContent, infoboxData) {
  const images = extractImageReferences(htmlContent);
  if (infoboxData && infoboxData.image) {
    const imageFilename = infoboxData.image;
    const nameWithoutExt = imageFilename.replace(/\.[^/.]+$/, "");
    const slug = nameWithoutExt.replace(/\s+/g, "_");
    // Only add if not already present
    if (!images.some((img) => img.slug === slug)) {
      images.unshift({
        filename: imageFilename,
        slug: slug,
        alt: infoboxData.name || infoboxData.title || slug,
        caption: infoboxData.name || infoboxData.title || slug,
        type: "infobox",
      });
    }
  }
  // Deduplicate by slug, keep first occurrence
  const seen = new Set();
  const deduped = images.filter((img) => {
    if (seen.has(img.slug)) return false;
    seen.add(img.slug);
    return true;
  });
  return deduped;
}
