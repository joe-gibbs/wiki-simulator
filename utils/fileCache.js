import fs from "fs";
import path from "path";

const CACHE_DIR = path.join(process.cwd(), "cache");

// Ensure cache directory exists
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

// Get cache file path for a given key
function getCacheFilePath(key) {
  return path.join(CACHE_DIR, `${key}.json`);
}

// Check if cache file exists and is not expired
export function isCached(key, maxAgeHours = 24) {
  ensureCacheDir();
  const filePath = getCacheFilePath(key);

  if (!fs.existsSync(filePath)) {
    return false;
  }

  const stats = fs.statSync(filePath);
  const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);

  return ageHours < maxAgeHours;
}

// Get cached content
export function getCache(key) {
  ensureCacheDir();
  const filePath = getCacheFilePath(key);

  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      const cached = JSON.parse(data);
      return cached.content;
    }
  } catch (error) {
    console.error(`Error reading cache file ${key}:`, error);
  }

  return null;
}

// Set cache content
export function setCache(key, content) {
  ensureCacheDir();
  const filePath = getCacheFilePath(key);

  const cacheData = {
    key,
    content,
    timestamp: Date.now(),
    created: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(filePath, JSON.stringify(cacheData, null, 2), "utf8");
    console.log(`Cached content for key: ${key}`);
  } catch (error) {
    console.error(`Error writing cache file ${key}:`, error);
  }
}

// Clear expired cache files
export function clearExpiredCache(maxAgeHours = 24) {
  ensureCacheDir();

  try {
    const files = fs.readdirSync(CACHE_DIR);
    const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1000;

    files.forEach((file) => {
      if (file.endsWith(".json")) {
        const filePath = path.join(CACHE_DIR, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(filePath);
          console.log(`Removed expired cache file: ${file}`);
        }
      }
    });
  } catch (error) {
    console.error("Error clearing expired cache:", error);
  }
}

// Get cache statistics
export function getCacheStats() {
  ensureCacheDir();

  try {
    const files = fs.readdirSync(CACHE_DIR);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));

    let totalSize = 0;
    jsonFiles.forEach((file) => {
      const filePath = path.join(CACHE_DIR, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;
    });

    return {
      fileCount: jsonFiles.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
    };
  } catch (error) {
    console.error("Error getting cache stats:", error);
    return { fileCount: 0, totalSize: 0, totalSizeMB: "0.00" };
  }
}
