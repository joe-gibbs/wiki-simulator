import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

// Import our custom modules
import {
  renderTemplate,
  renderPageHeader,
  renderPageFooter,
  renderInfobox,
} from "./utils/templates.js";
import {
  generateSearchSuggestions,
  generatePageContent,
  generateInfobox,
} from "./services/groq.js";
import { wikipediaSlugToTitle } from "./utils/slugs.js";
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
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// API route for search autocomplete
app.get("/api/search", async (req, res) => {
  const { q } = req.query;

  if (!q || typeof q !== "string" || q.trim().length < 2) {
    return res.json([]);
  }

  const query = q.trim();

  try {
    const suggestions = await generateSearchSuggestions(query);
    res.json(suggestions);
  } catch (error) {
    console.error("Search API error:", error);
    res.status(500).json({ error: "Failed to generate suggestions" });
  }
});

// Route for generating wiki pages
app.get("/wiki/:page", async (req, res) => {
  try {
    const { page } = req.params;

    // Decode URL first
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

    // Convert Wikipedia slug back to readable title
    const title = wikipediaSlugToTitle(decodedPage);

    console.log(`Generating new page: ${title}`);

    // Set headers for streaming HTML
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    // Send page header immediately with loading spinner
    const pageHeader = renderPageHeader(`${title} - Wiki`, title);
    res.write(pageHeader);

    // Generate content and infobox using Groq in parallel
    const [content, infoboxData] = await Promise.all([
      generatePageContent(title),
      generateInfobox(title),
    ]);

    // Render the infobox HTML
    const infoboxHtml = renderInfobox(title, infoboxData);

    // Combine content with infobox for the complete article
    const completeContent = `${infoboxHtml}${content}`;

    // Send JavaScript to replace loading content with actual article
    const contentScript = `
      <script>
        // Replace the loading content with the actual article
        const articleContent = document.getElementById('articleContent');
        articleContent.innerHTML = \`${completeContent
          .replace(/`/g, "\\`")
          .replace(/\$/g, "\\$")}\`;
      </script>
    `;

    res.write(contentScript);

    // Send page footer to close HTML
    const pageFooter = renderPageFooter();
    res.write(pageFooter);
    res.end();

    // Cache the complete page for future requests
    const completeHtmlPage = renderTemplate("page", {
      TITLE: `${title} - Wiki`,
      INFOBOX: infoboxHtml,
      CONTENT: content,
    });
    setCache(cacheKey, completeHtmlPage);
  } catch (error) {
    console.error("Error generating page:", error);

    // If we haven't sent headers yet, send error page normally
    if (!res.headersSent) {
      const errorPage = renderTemplate("page", {
        TITLE: "Error - Wiki",
        CONTENT:
          '<h2>Error</h2><p>Sorry, there was an error generating this page.</p><p><a href="/">Back to Home</a></p>',
      });
      return res.status(500).send(errorPage);
    }

    // If headers are already sent, update content with JavaScript
    const errorScript = `
      <script>
        const articleContent = document.getElementById('articleContent');
        articleContent.innerHTML = '<h2>Error</h2><p>Sorry, there was an error generating this page.</p><p><a href="/">Back to Home</a></p>';
      </script>
    `;
    res.write(errorScript);
    res.write(renderPageFooter());
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
  console.log(`Cache: ${stats.fileCount} files, ${stats.totalSizeMB}MB`);
});
