import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

// Import our custom modules
import {
  renderTemplate,
  renderInfobox,
  extractInfoboxLinkedPages,
} from "./utils/templates.js";
import {
  generateSearchSuggestions,
  generatePageContent,
  generateInfobox,
  validateContent,
  rewriteSlugToTitle,
} from "./services/groq.js";
import { generateWikiImage } from "./services/replicate.js";
import { wikipediaSlugToTitle, titleToWikipediaSlug } from "./utils/slugs.js";
import { getImagePrompt, isImagePromptReady } from "./utils/imageContext.js";
import {
  isValidPage,
  addValidPage,
  addSuggestionsToValid,
} from "./utils/validPages.js";
import {
  isCached,
  getCache,
  setCache,
  getCacheStats,
} from "./utils/fileCache.js";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:", "https://replicate.delivery"],
      },
    },
  })
);
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Route for images - matches any image file extension
app.get("/images/:filename.:ext", async (req, res) => {
  try {
    const { filename, ext } = req.params;

    // Only handle common image extensions
    const allowedExtensions = [
      "png",
      "jpg",
      "jpeg",
      "webp",
      "svg",
      "gif",
      "bmp",
      "tiff",
      "ico",
    ];
    if (!allowedExtensions.includes(ext.toLowerCase())) {
      return res.status(404).send("Unsupported image format");
    }

    const cacheKey = `image_${filename}`;

    // Check if image is cached
    if (isCached(cacheKey, 168, true)) {
      // Cache images for 7 days (168 hours)
      const cached = getCache(cacheKey, true);
      if (cached && cached.buffer) {
        console.log(`Serving cached image: ${filename}.${ext}`);
        res.set({
          "Content-Type": `image/${ext === "jpg" ? "jpeg" : ext}`,
          "Cache-Control": "public, max-age=604800", // Cache for 7 days
        });
        return res.send(cached.buffer);
      }
    }

    // Convert filename to a readable title for image generation
    const title = wikipediaSlugToTitle(filename);
    console.log(`🖼️ Image request: ${filename} -> "${title}"`);

    // Check if prompt is ready
    const promptData = getImagePrompt(filename);

    if (!promptData) {
      console.log(`❌ No prompt data found for image: ${filename}`);
      return res.status(404).send("Image not found - no prompt data available");
    }

    if (!promptData.ready) {
      console.log(
        `⏳ Prompt still generating for image: ${filename}, polling...`
      );

      // Return a loading response that will trigger client-side polling
      return res.status(202).json({
        message: "Image prompt still generating, please try again in a moment",
        status: "generating",
        filename: filename,
      });
    }

    console.log(
      `✅ Using ready prompt for ${filename}: "${promptData.prompt}"`
    );

    // Extract aspect ratio from URL if provided, default to 4:3
    const aspectRatio = req.query.aspect || "4:3";

    // Generate image using the pre-generated prompt
    const imageBuffer = await generateWikiImage(
      title,
      promptData.prompt,
      aspectRatio
    );

    // Cache the image
    setCache(
      cacheKey,
      imageBuffer,
      {
        originalFilename: `${filename}.${ext}`,
        title: title,
        format: ext,
        generatedAt: new Date().toISOString(),
      },
      true
    );

    // Set appropriate headers and send image
    res.set({
      "Content-Type": `image/${ext === "jpg" ? "jpeg" : ext}`,
      "Cache-Control": "public, max-age=604800", // Cache for 7 days
    });
    res.send(imageBuffer);
  } catch (error) {
    console.error("Error generating image:", error);

    // Send a simple 404 response for image errors
    res.status(500).send("Error generating image");
  }
});

// API route for search autocomplete
app.get("/api/search", async (req, res) => {
  const { q } = req.query;

  if (!q || typeof q !== "string" || q.trim().length < 2) {
    return res.json([]);
  }

  const query = q.trim();

  try {
    const suggestions = await generateSearchSuggestions(query);

    // Add suggested pages to valid cache
    addSuggestionsToValid(suggestions);

    res.json(suggestions);
  } catch (error) {
    console.error("Search API error:", error);
    res.status(500).json({ error: "Failed to generate suggestions" });
  }
});

// Route for wiki pages - stream blank page then complete content
app.get("/wiki/:page", async (req, res) => {
  try {
    const { page } = req.params;
    const decodedPage = decodeURIComponent(page);
    const cacheKey = `wiki_${decodedPage}`;

    // Check file cache first
    if (isCached(cacheKey)) {
      const cachedPage = getCache(cacheKey);
      if (cachedPage) {
        console.log(`Serving cached page: ${decodedPage}`);
        return res.send(cachedPage);
      }
    }

    // Check if page is in valid cache
    if (!isValidPage(decodedPage)) {
      console.log(`Validating new page: ${decodedPage}`);

      // Convert slug to readable title for validation
      const candidateTitle = wikipediaSlugToTitle(decodedPage);

      // Validate content appropriateness
      const isValidContent = await validateContent(candidateTitle);

      if (!isValidContent) {
        console.log(`Content rejected as inappropriate: ${candidateTitle}`);
        return res.status(404).send(
          renderTemplate("page", {
            TITLE: "Page Not Found - Wiki",
            INFOBOX: "",
            CONTENT: `<div style="text-align: center; padding: 60px;">
            <h1>404 - Page Not Found</h1>
            <p>The requested page could not be found or is not available.</p>
            <a href="/" style="color: #0645ad;">Return to home page</a>
          </div>`,
          })
        );
      }

      // Content is valid, rewrite slug to proper format
      const properTitle = await rewriteSlugToTitle(decodedPage);
      const properSlug = titleToWikipediaSlug(properTitle);

      // If the proper slug is different, redirect to the corrected version
      if (properSlug !== decodedPage) {
        console.log(
          `Redirecting ${decodedPage} -> ${properSlug} (${properTitle})`
        );
        addValidPage(properTitle); // Add to valid cache
        return res.redirect(301, `/wiki/${encodeURIComponent(properSlug)}`);
      }

      // Add to valid cache for future requests
      addValidPage(properTitle);
    }

    // Convert Wikipedia slug back to readable title
    const title = wikipediaSlugToTitle(decodedPage);

    console.log(`Generating new page: ${title}`);

    // Set headers for streaming HTML
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    // Send just the DOCTYPE and opening HTML to start the stream (makes browser think it's loading)
    res.write("<!DOCTYPE html>\n");

    // Generate content and infobox using Groq in parallel
    const [pageResult, infoboxData] = await Promise.all([
      generatePageContent(title),
      generateInfobox(title),
    ]);

    const { content, linkedPages } = pageResult;

    // Add all linked pages to valid cache (they don't need validation)
    if (linkedPages && linkedPages.length > 0) {
      linkedPages.forEach((pageTitle) => {
        addValidPage(pageTitle);
      });
      console.log(
        `Added ${linkedPages.length} linked pages from content to valid cache`
      );
    }

    // Extract and add linked pages from infobox data to valid cache
    const infoboxLinkedPages = extractInfoboxLinkedPages(infoboxData);
    if (infoboxLinkedPages.length > 0) {
      infoboxLinkedPages.forEach((pageTitle) => {
        addValidPage(pageTitle);
      });
      console.log(
        `Added ${infoboxLinkedPages.length} linked pages from infobox to valid cache`
      );
    }

    // Render the infobox HTML
    const infoboxHtml = renderInfobox(title, infoboxData);

    // Now send the complete page
    const completePage = renderTemplate("page", {
      TITLE: `${title} - Wiki`,
      INFOBOX: infoboxHtml,
      CONTENT: content,
    });

    // Remove the DOCTYPE from the complete page since we already sent it
    const pageWithoutDoctype = completePage.replace("<!DOCTYPE html>\n", "");

    res.write(pageWithoutDoctype);
    res.end();

    // Cache the complete page for future requests
    setCache(cacheKey, completePage);

    // Add to valid pages cache since it was successfully generated
    addValidPage(title);
  } catch (error) {
    console.error("Error generating page:", error);

    // If we haven't sent headers yet, send error page normally
    if (!res.headersSent) {
      const errorPage = renderTemplate("page", {
        TITLE: "Error - Wiki",
        INFOBOX: "",
        CONTENT:
          '<h2>Error</h2><p>Sorry, there was an error generating this page.</p><p><a href="/">Back to Home</a></p>',
      });
      return res.status(500).send(errorPage);
    }

    // If headers are already sent, send error page without DOCTYPE
    const errorPage = renderTemplate("page", {
      TITLE: "Error - Wiki",
      INFOBOX: "",
      CONTENT:
        '<h2>Error</h2><p>Sorry, there was an error generating this page.</p><p><a href="/">Back to Home</a></p>',
    });
    const errorWithoutDoctype = errorPage.replace("<!DOCTYPE html>\n", "");
    res.write(errorWithoutDoctype);
    res.end();
  }
});

// Home page route
app.get("/", (req, res) => {
  const homePage = renderTemplate("home", {
    TITLE: "Wiki - The Free Encyclopedia",
  });
  res.send(homePage);
});

// Cache stats endpoint (optional - for monitoring)
app.get("/api/cache-stats", (req, res) => {
  const stats = getCacheStats();
  res.json(stats);
});

// Start server
app.listen(port, () => {
  console.log(`Wiki server running at http://localhost:${port}`);
  console.log("Make sure to set your GROQ_API_KEY environment variable");

  // Log cache stats on startup
  const stats = getCacheStats();
  console.log(
    `Cache: ${stats.fileCount} files (${stats.textFiles} text, ${stats.binaryFiles} binary), ${stats.totalSizeMB}MB`
  );
});
