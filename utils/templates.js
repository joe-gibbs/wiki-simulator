import fs from "fs";
import path from "path";

// Template loading functions
export function loadTemplate(templateName) {
  try {
    return fs.readFileSync(
      path.join(process.cwd(), "views", `${templateName}.html`),
      "utf8"
    );
  } catch (error) {
    console.error(`Error loading template ${templateName}:`, error);
    return "";
  }
}

export function renderTemplate(templateName, variables = {}) {
  let template;
  if (templateName === "page") {
    const layout = loadTemplate("layout");
    const content = loadTemplate("article");
    template = layout.replace("{{CONTENT}}", content);
  } else if (templateName === "home") {
    const layout = loadTemplate("layout");
    const homeContent = loadTemplate("home");
    template = layout.replace("{{CONTENT}}", homeContent);
  } else {
    template = loadTemplate(templateName);
  }

  // Replace variables
  Object.keys(variables).forEach((key) => {
    const regex = new RegExp(`{{${key}}}`, "g");
    template = template.replace(regex, variables[key] || "");
  });

  return template;
}

// Function to extract linkable pages from infobox data
export function extractInfoboxLinkedPages(infoboxData) {
  const linkedPages = new Set();

  if (!infoboxData || typeof infoboxData !== "object") {
    return [];
  }

  Object.values(infoboxData).forEach((value) => {
    if (!value || typeof value !== "string") {
      return;
    }

    // Check if value contains commas (potential list)
    if (value.includes(",")) {
      const items = value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      // If we have multiple items, add each as a linked page
      if (items.length > 1) {
        items.forEach((item) => {
          linkedPages.add(item);
        });
        return;
      }
    }

    // Check if it looks like a single linkable item (proper noun or specific term)
    if (
      /^[A-Z][a-z\s-]+$/.test(value) ||
      /\b(Empire|Kingdom|Republic|State|Sea|Desert|Ocean|River|Mountain)\b/i.test(
        value
      )
    ) {
      linkedPages.add(value);
    }
  });

  return Array.from(linkedPages);
}

// Function to convert comma-separated values to links
function formatInfoboxValue(value) {
  if (!value || typeof value !== "string") {
    return value;
  }

  // Check if value contains commas (potential list)
  if (value.includes(",")) {
    const items = value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    // If we have multiple items, convert each to a link
    if (items.length > 1) {
      const links = items.map((item, index) => {
        // Convert item to slug format for wiki links
        const slug = item.replace(/\s+/g, "_");
        const comma = index < items.length - 1 ? ", " : "";
        return `<span class="comma-item"><a href="/wiki/${slug}">${item}</a>${comma}</span>`;
      });

      return `<span class="comma-list">${links.join("")}</span>`;
    }
  }

  // Check if it looks like a single linkable item (proper noun or specific term)
  if (
    /^[A-Z][a-z\s-]+$/.test(value) ||
    /\b(Empire|Kingdom|Republic|State|Sea|Desert|Ocean|River|Mountain)\b/i.test(
      value
    )
  ) {
    const slug = value.replace(/\s+/g, "_");
    return `<a href="/wiki/${slug}">${value}</a>`;
  }

  return value;
}

// Function to render infobox HTML from JSON data
export function renderInfobox(title, infoboxData) {
  if (!infoboxData || Object.keys(infoboxData).length === 0) {
    return "";
  }

  let infoboxHtml = `<div class="infobox">
    <div class="infobox-title">${title}</div>`;

  // Handle image field first (if present)
  if (infoboxData.image) {
    const imageFilename = infoboxData.image;
    // Extract the filename without extension to use as slug
    const nameWithoutExt = imageFilename.replace(/\.[^/.]+$/, "");
    const slug = nameWithoutExt.replace(/\s+/g, "_");
    // Preserve the original extension from filename
    const extension = imageFilename.split(".").pop() || "webp";

    infoboxHtml += `
      <div class="infobox-image">
        <img src="/images/${slug}.${extension}" alt="${title}" title="${title}">
      </div>`;
  }

  // Render each field in the infobox
  Object.entries(infoboxData).forEach(([key, value]) => {
    if (key !== "name" && key !== "image" && value) {
      // Format the key for display (convert underscores to spaces and capitalize)
      const displayKey = key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());

      // Format the value (convert lists to links where appropriate)
      const formattedValue = formatInfoboxValue(value);

      infoboxHtml += `
        <div class="infobox-row">
          <div class="infobox-label">${displayKey}</div>
          <div class="infobox-data">${formattedValue}</div>
        </div>`;
    }
  });

  infoboxHtml += "</div>";
  return infoboxHtml;
}
