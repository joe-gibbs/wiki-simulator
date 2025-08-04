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
function getCacheFilePath(key, isBinary = false) {
  const extension = isBinary ? ".bin" : ".json";
  return path.join(CACHE_DIR, `${key}${extension}`);
}

// Check if cache file exists and is not expired
export function isCached(key, maxAgeHours = 24, isBinary = false) {
  ensureCacheDir();
  const filePath = getCacheFilePath(key, isBinary);

  if (!fs.existsSync(filePath)) {
    return false;
  }

  const stats = fs.statSync(filePath);
  const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);

  return ageHours < maxAgeHours;
}

// Get cached content
export function getCache(key, isBinary = false) {
  ensureCacheDir();
  const filePath = getCacheFilePath(key, isBinary);

  try {
    if (fs.existsSync(filePath)) {
      if (isBinary) {
        // For binary files, read the raw buffer and extract metadata separately
        const buffer = fs.readFileSync(filePath);
        const metadataPath = getCacheFilePath(key + "_meta", false);
        let metadata = {};

        if (fs.existsSync(metadataPath)) {
          const metaData = fs.readFileSync(metadataPath, "utf8");
          metadata = JSON.parse(metaData);
        }

        return { buffer, metadata };
      } else {
        // Text content (JSON)
        const data = fs.readFileSync(filePath, "utf8");
        const cached = JSON.parse(data);
        return cached.content;
      }
    }
  } catch (error) {
    console.error(`Error reading cache file ${key}:`, error);
  }

  return null;
}

// Set cache content
export function setCache(key, content, metadata = {}, isBinary = false) {
  ensureCacheDir();
  const filePath = getCacheFilePath(key, isBinary);

  try {
    if (isBinary) {
      // For binary content (like images), save the buffer directly
      fs.writeFileSync(filePath, content);

      // Save metadata separately
      const metadataPath = getCacheFilePath(key + "_meta", false);
      const metaCacheData = {
        key,
        metadata,
        timestamp: Date.now(),
        created: new Date().toISOString(),
      };
      fs.writeFileSync(
        metadataPath,
        JSON.stringify(metaCacheData, null, 2),
        "utf8"
      );
    } else {
      // Text content (JSON)
      const cacheData = {
        key,
        content,
        timestamp: Date.now(),
        created: new Date().toISOString(),
      };
      fs.writeFileSync(filePath, JSON.stringify(cacheData, null, 2), "utf8");
    }

    console.log(
      `Cached ${isBinary ? "binary" : "text"} content for key: ${key}`
    );
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
      if (file.endsWith(".json") || file.endsWith(".bin")) {
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
    const cacheFiles = files.filter(
      (file) => file.endsWith(".json") || file.endsWith(".bin")
    );
    const jsonFiles = files.filter((file) => file.endsWith(".json"));
    const binaryFiles = files.filter((file) => file.endsWith(".bin"));

    let totalSize = 0;
    cacheFiles.forEach((file) => {
      const filePath = path.join(CACHE_DIR, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;
    });

    return {
      fileCount: cacheFiles.length,
      textFiles: jsonFiles.length,
      binaryFiles: binaryFiles.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
    };
  } catch (error) {
    console.error("Error getting cache stats:", error);
    return {
      fileCount: 0,
      textFiles: 0,
      binaryFiles: 0,
      totalSize: 0,
      totalSizeMB: "0.00",
    };
  }
}
