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

// Function to render page header for streaming
export function renderPageHeader(title, articleTitle) {
  const template = loadTemplate("page-header");
  return template
    .replace(/{{TITLE}}/g, title)
    .replace(/{{ARTICLE_TITLE}}/g, articleTitle);
}

// Function to render page footer for streaming
export function renderPageFooter() {
  return loadTemplate("page-footer");
}

// Function to render infobox HTML from JSON data
export function renderInfobox(title, infoboxData) {
  if (!infoboxData || Object.keys(infoboxData).length === 0) {
    return "";
  }

  let infoboxHtml = `<div class="infobox">
    <div class="infobox-title">${title}</div>`;

  // Render each field in the infobox
  Object.entries(infoboxData).forEach(([key, value]) => {
    if (key !== "name" && value) {
      // Format the key for display (convert underscores to spaces and capitalize)
      const displayKey = key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());

      infoboxHtml += `
        <div class="infobox-row">
          <div class="infobox-label">${displayKey}</div>
          <div class="infobox-data">${value}</div>
        </div>`;
    }
  });

  infoboxHtml += "</div>";
  return infoboxHtml;
}
