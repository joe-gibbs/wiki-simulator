import { Groq } from "groq-sdk";
import { marked } from "marked";
import { titleToWikipediaSlug } from "../utils/slugs.js";
import dotenv from "dotenv";

dotenv.config();

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Configure marked options
marked.setOptions({
  breaks: false,
  gfm: true,
});

// Static system prompt for search suggestions (cacheable)
const SEARCH_SYSTEM_PROMPT = `Suggest 5 Wikipedia article topics related to the search query.

Return only topic titles, one per line:
- No numbering or formatting
- Include the search term if valid
- Suggest related concepts
- Use proper capitalization`;

// Function to generate search suggestions using Groq
export async function generateSearchSuggestions(query) {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: SEARCH_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Search query: "${query}"`,
        },
      ],
      model: "gemma2-9b-it",
      temperature: 0.7,
      max_completion_tokens: 200,
      top_p: 0.9,
      stream: false,
    });

    const response = chatCompletion.choices[0]?.message?.content || "";
    const suggestions = response
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .slice(0, 5)
      .map((suggestion) => ({
        title: suggestion.trim(),
        slug: titleToWikipediaSlug(suggestion.trim()),
      }));

    return suggestions;
  } catch (error) {
    console.error("Error generating search suggestions:", error);
    return [];
  }
}

// Function to process markdown and convert **bold** and [[links]] to wiki links
function processMarkdownForWikiLinks(markdownContent) {
  // First convert [[link|display text]] to [display text](/wiki/link)
  markdownContent = markdownContent.replace(
    /\[\[([^|\]]+)\|([^\]]+)\]\]/g,
    (match, link, displayText) => {
      const slug = titleToWikipediaSlug(link);
      return `[${displayText}](/wiki/${slug})`;
    }
  );

  // Then convert [[link]] to [link](/wiki/link)
  markdownContent = markdownContent.replace(
    /\[\[([^\]]+)\]\]/g,
    (match, text) => {
      const slug = titleToWikipediaSlug(text);
      return `[${text}](/wiki/${slug})`;
    }
  );

  // Finally convert **text** to [text](/wiki/Text_With_Underscores)
  return markdownContent.replace(/\*\*([^*]+)\*\*/g, (match, text) => {
    const slug = titleToWikipediaSlug(text);
    return `[${text}](/wiki/${slug})`;
  });
}

// Function to generate table of contents from markdown headers
function generateTableOfContents(markdownContent) {
  const lines = markdownContent.split("\n");
  const tocItems = [];
  let tocCounter = 1;

  for (const line of lines) {
    // Match ## headers (main sections)
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      const title = h2Match[1].trim();
      const id = `toc-${tocCounter++}`;
      tocItems.push({
        level: 2,
        title: title,
        id: id,
        children: [],
      });
      continue;
    }

    // Match ### headers (subsections)
    const h3Match = line.match(/^### (.+)$/);
    if (h3Match) {
      const title = h3Match[1].trim();
      const id = `toc-${tocCounter++}`;
      const subsection = {
        level: 3,
        title: title,
        id: id,
      };

      // Add to the last main section if it exists
      if (tocItems.length > 0) {
        tocItems[tocItems.length - 1].children.push(subsection);
      }
    }
  }

  // Generate HTML for table of contents
  if (tocItems.length === 0) return "";

  let tocHtml = `
    <div class="toc-container">
      <div class="toc-header">
        <span class="toc-icon">≡</span>
        <h2>Contents</h2>
        <button class="toc-toggle">⌄</button>
      </div>
      <div class="toc-content">
  `;

  tocItems.forEach((item, index) => {
    const number = index + 1;
    tocHtml += `        <div class="toc-item toc-level-2">
          <a href="#${item.id}">${number} ${item.title}</a>
        </div>\n`;

    // Add subsections
    item.children.forEach((child, childIndex) => {
      const subNumber = `${number}.${childIndex + 1}`;
      tocHtml += `        <div class="toc-item toc-level-3">
          <a href="#${child.id}">${subNumber} ${child.title}</a>
        </div>\n`;
    });
  });

  tocHtml += `      </div>
    </div>\n`;

  return tocHtml;
}

// Function to add IDs to headers in HTML for table of contents linking
function addHeaderIds(htmlContent) {
  let tocCounter = 1;

  // Add IDs to h2 elements
  htmlContent = htmlContent.replace(/<h2>/g, () => {
    return `<h2 id="toc-${tocCounter++}">`;
  });

  // Add IDs to h3 elements
  htmlContent = htmlContent.replace(/<h3>/g, () => {
    return `<h3 id="toc-${tocCounter++}">`;
  });

  return htmlContent;
}

// Static system prompt for article outline generation (cacheable)
const OUTLINE_SYSTEM_PROMPT = `Generate a Wikipedia article outline in JSON format.

Return ONLY valid JSON:
{
  "summary": "Brief factual summary for planning purposes",
  "sections": [
    {"title": "History", "description": "Historical background"},
    {"title": "Description", "description": "Key characteristics"}
  ]
}

Choose 4-6 relevant sections from: History, Description, Characteristics, Types, Applications, Development, Impact, Reception, Legacy.`;

// Static system prompt for article opening generation (cacheable)
const OPENING_SYSTEM_PROMPT = `Write a Wikipedia opening paragraph in neutral, encyclopedic tone.

Requirements:
- Write 2-3 sentences that define and contextualize the topic
- Bold the main topic: **Topic Name**
- Link key terms using [[Name]] or [[Target|Display Name]] syntax
- Include essential facts (dates, location, significance)
- Use formal, academic language
- Make it comprehensive but concise`;

// Static system prompt for individual section generation (cacheable)
const SECTION_SYSTEM_PROMPT = `Write a Wikipedia section in neutral, encyclopedic tone.

Requirements:
- 200-400 words of factual, detailed content
- Assume the concept has already been introduced earlier
- Use wikipedia style prose, not lists or bullet points
- Link all proper nouns using [[Name]] or [[Target|Display Name]] syntax
- Include specific dates, names, and examples
- NEVER start with the section title
- Start directly with substantive information
- Avoid promotional language like "offers," "provides," "ideal," "perfect"
- Use academic language: "contains," "demonstrates," "comprises"
- Avoid weasel words
- Avoid "In conclusion" or other essay-type language

FORBIDDEN: Do not write phrases like "The history of...", "The development of...", "The characteristics include...", or any reference to the section name.`;

// Static system prompt for infobox generation (cacheable)
const INFOBOX_SYSTEM_PROMPT = `You are a Wikipedia infobox data generator. Return ONLY valid JSON, no explanations or other text.

CRITICAL: Your response must contain ONLY a single JSON object, nothing else.

Requirements:
- Include 8-12 key facts relevant to the topic
- Use appropriate field names (name, type, founded, location, capital, area, population, etc.)
- Include dates, locations, numbers, key figures, classifications
- Format dates as readable text (e.g., "March 15, 1995", "1969-present")
- Keep values concise but informative
- Use proper JSON syntax with double quotes
- Do not include trailing commas
- Do not add any text before or after the JSON

Example format:
{
  "name": "Example Name",
  "type": "Historical Empire",
  "founded": "395 AD",
  "capital": "Constantinople",
  "area": "1,400,000 km²",
  "population": "12 million (peak)"
}`;

// Function to generate article outline using Groq
async function generateArticleOutline(topic) {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: OUTLINE_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Generate an article outline for: "${topic}"`,
        },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_completion_tokens: 1024,
      top_p: 0.9,
      stream: false,
    });

    let response = chatCompletion.choices[0]?.message?.content || "{}";
    response = response.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    // Clean up response - remove any markdown code blocks
    response = response
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    return JSON.parse(response);
  } catch (error) {
    console.error("Error generating outline:", error);
    throw error;
  }
}

// Function to generate opening paragraph using Groq
async function generateOpeningParagraph(topic, outline) {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: OPENING_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Topic: "${topic}"
Context: ${outline.summary}

Write a comprehensive Wikipedia opening paragraph that defines and contextualizes this topic.`,
        },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.5,
      max_completion_tokens: 512,
      top_p: 0.9,
      stream: false,
    });

    let content = chatCompletion.choices[0]?.message?.content || "";
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    return content;
  } catch (error) {
    console.error("Error generating opening paragraph:", error);
    throw error;
  }
}

// Function to generate individual section content using Groq
async function generateSectionContent(topic, sectionTitle, sectionDescription) {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: SECTION_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Topic: "${topic}"
Section: "${sectionTitle}"
Section focus: ${sectionDescription}

Write the content for this section. Remember to write 200-400 words of detailed, encyclopedic prose with extensive linking.`,
        },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.6,
      max_completion_tokens: 2048,
      top_p: 0.95,
      stream: false,
    });

    let content = chatCompletion.choices[0]?.message?.content || "";
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    return content;
  } catch (error) {
    console.error(`Error generating section "${sectionTitle}":`, error);
    throw error;
  }
}

// Function to generate page content using structured approach
export async function generatePageContent(topic) {
  try {
    console.log(`Generating structured article for: ${topic}`);

    // Step 1: Generate outline and infobox in parallel
    console.log("Step 1: Generating outline and infobox...");
    const [outline, infoboxData] = await Promise.all([
      generateArticleOutline(topic),
      generateInfobox(topic),
    ]);

    console.log(`Generated outline with ${outline.sections.length} sections`);

    // Step 2: Generate opening paragraph and all sections in parallel
    console.log("Step 2: Generating opening and all sections in parallel...");
    const sectionPromises = outline.sections.map((section) =>
      generateSectionContent(topic, section.title, section.description)
    );

    const [openingParagraph, ...sectionContents] = await Promise.all([
      generateOpeningParagraph(topic, outline),
      ...sectionPromises,
    ]);
    console.log("Opening and all sections generated successfully");

    // Step 3: Assemble the complete article
    console.log("Step 3: Assembling article...");

    // Start with the generated opening paragraph
    let markdownContent = openingParagraph + "\n\n";

    // Add each section with its content
    outline.sections.forEach((section, index) => {
      markdownContent += `## ${section.title}\n\n`;
      markdownContent += sectionContents[index] + "\n\n";
    });

    // Add See also section
    markdownContent += "## See also\n\n";
    markdownContent += `* [${topic} (disambiguation)](/wiki/${titleToWikipediaSlug(
      topic
    )}_disambiguation)\n`;
    markdownContent += "* [Related topics](/wiki/Related_Topics)\n";

    // Generate table of contents from markdown headers
    const tableOfContents = generateTableOfContents(markdownContent);

    // Process markdown to convert **bold** to wiki links
    markdownContent = processMarkdownForWikiLinks(markdownContent);

    // Convert markdown to HTML
    let htmlContent = marked.parse(markdownContent);

    // Add IDs to headers for table of contents linking
    htmlContent = addHeaderIds(htmlContent);

    // Insert table of contents after the first paragraph (opening definition)
    if (tableOfContents) {
      const firstParagraphEnd = htmlContent.indexOf("</p>");
      if (firstParagraphEnd !== -1) {
        const beforeFirstP = htmlContent.substring(0, firstParagraphEnd + 4);
        const afterFirstP = htmlContent.substring(firstParagraphEnd + 4);
        htmlContent =
          beforeFirstP + "\n" + tableOfContents + "\n" + afterFirstP;
      }
    }

    console.log("Article generation completed successfully");
    return htmlContent;
  } catch (error) {
    console.error("Error in structured article generation:", error);
    throw error;
  }
}

// Function to generate infobox data using Groq
export async function generateInfobox(topic) {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: INFOBOX_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Generate infobox data for: "${topic}"`,
        },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      max_completion_tokens: 600,
      top_p: 0.8,
      stream: false,
      stop: ["\n\n", "```", "Note:", "Explanation:"],
    });

    let response = chatCompletion.choices[0]?.message?.content || "{}";

    // Remove <think></think> tokens from the response
    response = response.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    // Clean up response - remove any markdown code blocks and extra text
    response = response
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    // Extract just the JSON object - find the first { and last }
    const firstBrace = response.indexOf("{");
    const lastBrace = response.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      response = response.substring(firstBrace, lastBrace + 1);
    }

    // Additional cleanup for common issues
    response = response
      .replace(/,\s*}/g, "}") // Remove trailing commas
      .replace(/,\s*,/g, ",") // Remove double commas
      .replace(/^\s*{\s*/, "{") // Clean opening
      .replace(/\s*}\s*$/, "}") // Clean closing
      .trim();

    // Ensure the JSON is properly closed if it was truncated
    if (response && !response.endsWith("}")) {
      // Find the last complete key-value pair and close the JSON
      const lastCommaIndex = response.lastIndexOf(",");
      const lastCloseBraceIndex = response.lastIndexOf("}");

      if (lastCommaIndex > lastCloseBraceIndex) {
        // Remove incomplete last entry and close JSON
        response = response.substring(0, lastCommaIndex) + "}";
      } else if (!response.endsWith("}")) {
        response += "}";
      }
    }

    // Validate that we have a proper JSON structure before parsing
    if (!response.startsWith("{") || !response.endsWith("}")) {
      throw new Error("Invalid JSON structure: missing braces");
    }

    return JSON.parse(response);
  } catch (error) {
    console.error("Error generating infobox:", error);
    throw error;
  }
}
