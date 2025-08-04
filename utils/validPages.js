// Valid pages cache management with JSON file persistence
import fs from "fs";
import path from "path";
import { titleToWikipediaSlug } from "./slugs.js";

const VALID_PAGES_FILE = path.join(process.cwd(), "cache", "validPages.json");

// In-memory store for valid pages backed by JSON file
let validPages = new Set();

// Ensure cache directory exists
function ensureCacheDir() {
  const cacheDir = path.dirname(VALID_PAGES_FILE);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
}

// Load valid pages from JSON file
function loadValidPages() {
  try {
    ensureCacheDir();
    if (fs.existsSync(VALID_PAGES_FILE)) {
      const data = fs.readFileSync(VALID_PAGES_FILE, "utf8");
      const pages = JSON.parse(data);
      validPages = new Set(pages);
      console.log(`Loaded ${validPages.size} valid pages from cache`);
    } else {
      console.log("No existing valid pages cache found, starting fresh");
    }
  } catch (error) {
    console.error("Error loading valid pages cache:", error);
    validPages = new Set();
  }
}

// Save valid pages to JSON file
function saveValidPages() {
  try {
    ensureCacheDir();
    const pages = Array.from(validPages);
    fs.writeFileSync(VALID_PAGES_FILE, JSON.stringify(pages, null, 2));
  } catch (error) {
    console.error("Error saving valid pages cache:", error);
  }
}

// Add page to valid cache
export function addValidPage(title) {
  const slug = titleToWikipediaSlug(title);
  if (!validPages.has(slug)) {
    validPages.add(slug);
    console.log(`Added valid page: ${slug} (${title})`);
    saveValidPages();
  }
}

// Check if page is in valid cache
export function isValidPage(slug) {
  return validPages.has(slug);
}

// Get all valid pages (for debugging)
export function getAllValidPages() {
  return Array.from(validPages);
}

// Add pages from search suggestions to valid cache
export function addSuggestionsToValid(suggestions) {
  let added = 0;
  suggestions.forEach((suggestion) => {
    const slug = titleToWikipediaSlug(suggestion.title);
    if (!validPages.has(slug)) {
      validPages.add(slug);
      added++;
    }
  });
  if (added > 0) {
    console.log(`Added ${added} new valid pages from suggestions`);
    saveValidPages();
  }
}

// Initialize cache on startup
loadValidPages();

console.log(`Valid pages cache ready with ${validPages.size} pages`);
