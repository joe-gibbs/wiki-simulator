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
const SEARCH_SYSTEM_PROMPT = `You are a Wikipedia search assistant. When given a search query, suggest 5 related topics that would make good Wikipedia-style articles.

REQUIREMENTS:
- Return only topic titles, one per line
- No numbering, bullet points, or formatting
- Focus on educational, informative topics
- Include the exact search term if it's a valid topic
- Suggest related and broader/narrower concepts
- Use proper capitalization for topic names`;

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

// Function to process markdown and convert **bold** to wiki links
function processMarkdownForWikiLinks(markdownContent) {
  // Convert **text** to [text](/wiki/Text_With_Underscores)
  return markdownContent.replace(/\*\*([^*]+)\*\*/g, (match, text) => {
    const slug = titleToWikipediaSlug(text);
    return `[${text}](/wiki/${slug})`;
  });
}

// Static system prompt for Wikipedia article generation (cacheable)
const WIKIPEDIA_SYSTEM_PROMPT = `You are a professional Wikipedia editor writing comprehensive, encyclopedic articles in the exact style of Wikipedia. You must follow these exact requirements:

WRITING STYLE:
- Write in encyclopedic, neutral tone with formal, academic language
- Start with a clear definition paragraph that contextualizes the topic (no heading)
- Write in flowing narrative prose, NOT lists or bullet points
- Use detailed, factual content with specific examples, dates, names, statistics, and scholarly context
- Write substantial paragraphs (5-8 sentences each) that develop ideas thoroughly
- Include specific details like founding dates, key figures, technical specifications, historical context
- Connect ideas between paragraphs with smooth transitions
- Cite specific examples, case studies, and real-world applications within the narrative

CONTENT STRUCTURE:
Write comprehensive sections with descriptive prose. Choose from these section types based on topic relevance:
- Opening definition paragraph establishing context and significance (no heading)
- ## History / ## Background / ## Origins - chronological development with key events and figures
- ## Description / ## Characteristics / ## Nature - detailed explanation of fundamental properties
- ## Types / ## Classifications / ## Categories - different varieties explained in prose with examples
- ## Methodology / ## Process / ## Implementation - how it works or is applied, with specific procedures
- ## Applications / ## Uses / ## Role - real-world usage with concrete examples and case studies
- ## Development / ## Research / ## Current status - ongoing work, recent advances, scholarly activity
- ## Impact / ## Significance / ## Influence - effects on society, field, or related areas
- ## Reception / ## Criticism / ## Debates - scholarly discourse, different perspectives, controversies
- ## Future directions / ## Prospects - anticipated developments and trends

PROSE REQUIREMENTS:
- Write exclusively in paragraph form - NO bullet points, numbered lists, or simple enumerations
- Instead of lists, write: "Several key characteristics define this concept, including..." then explain each in flowing sentences
- Embed examples naturally within explanatory text rather than listing them separately
- Use transitional phrases to connect ideas: "Furthermore," "Additionally," "In contrast," "Subsequently"
- Develop each point with supporting details, explanations, and context
- Integrate multiple related concepts within single, well-developed paragraphs

FORMAT REQUIREMENTS:
- Use Markdown syntax throughout
- NO main title (# heading) - article title is added separately
- Start immediately with definition paragraph
- Include 15-25 internal links: [Related Topic](/wiki/related-topic)
- Use **bold** for first mention of article title and key terms (auto-converted to links)
- Use *italics* for emphasis, foreign terms, and publication titles
- Write 1000-1500 words minimum
- Include multiple substantial sections with ## headings
- Include subsections with ### headings where topic complexity warrants it
- End with a "See also" section containing relevant wiki links

CRITICAL: Avoid simple lists at all costs. Write comprehensive, flowing prose that thoroughly explains concepts in full sentences and well-developed paragraphs, exactly like genuine Wikipedia articles.`;

// Static system prompt for infobox generation (cacheable)
const INFOBOX_SYSTEM_PROMPT = `You are a Wikipedia infobox specialist. Generate structured infobox data in JSON format for Wikipedia articles.

REQUIREMENTS:
- Return ONLY valid JSON, no markdown or explanations
- Include 8-15 key facts relevant to the topic
- Use appropriate field names for the topic type
- Include dates, locations, numbers, key figures, classifications
- Format dates as readable text (e.g., "March 15, 1995", "1969-present")
- Keep values concise but informative
- Include both factual data and contextual information

COMMON INFOBOX FIELDS BY TYPE:
Person: name, born, died, nationality, occupation, education, known_for, awards
Place: name, country, region, population, area, founded, coordinates
Technology: name, type, developer, first_release, latest_release, programming_language, license
Organization: name, type, founded, founder, headquarters, industry, employees, revenue
Concept: name, field, first_described, key_figures, applications, related_concepts

Return as JSON object with field-value pairs.`;

// Function to generate page content using Groq
export async function generatePageContent(topic) {
  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: WIKIPEDIA_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `Write a comprehensive Wikipedia article about "${topic}".`,
      },
    ],
    model: "llama-3.1-8b-instant",
    temperature: 0.6,
    max_completion_tokens: 4096,
    top_p: 0.95,
    stream: false,
  });

  let markdownContent = chatCompletion.choices[0]?.message?.content || "";

  // Remove <think></think> tokens from the response
  markdownContent = markdownContent
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();

  // Process markdown to convert **bold** to wiki links
  markdownContent = processMarkdownForWikiLinks(markdownContent);

  // Convert markdown to HTML
  return marked.parse(markdownContent);
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
      temperature: 0.3,
      max_completion_tokens: 800,
      top_p: 0.9,
      stream: false,
    });

    let response = chatCompletion.choices[0]?.message?.content || "{}";

    // Remove <think></think> tokens from the response
    response = response.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    // Clean up response - remove any markdown code blocks
    response = response
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    // Ensure the JSON is properly closed if it was truncated
    if (response && !response.endsWith("}")) {
      // Find the last complete key-value pair and close the JSON
      const lastCommaIndex = response.lastIndexOf(",");
      const lastCloseBraceIndex = response.lastIndexOf("}");

      if (lastCommaIndex > lastCloseBraceIndex) {
        // Remove incomplete last entry and close JSON
        response = response.substring(0, lastCommaIndex) + "\n}";
      } else if (!response.endsWith("}")) {
        response += "\n}";
      }
    }

    try {
      const infoboxData = JSON.parse(response);
      return infoboxData;
    } catch (parseError) {
      console.error("Error parsing infobox JSON:", parseError);
      console.error("Raw response:", response.substring(0, 300) + "...");

      // Try to extract any valid JSON data using regex as fallback
      try {
        const keyValuePairs = {};
        const matches = response.match(/"([^"]+)":\s*"([^"]*?)"/g);
        if (matches) {
          matches.forEach((match) => {
            const [, key, value] = match.match(/"([^"]+)":\s*"([^"]*)"/);
            if (key && value) {
              keyValuePairs[key] = value;
            }
          });
          console.log("Recovered partial infobox data using regex");
          return keyValuePairs;
        }
      } catch (regexError) {
        console.error("Regex fallback also failed:", regexError);
      }

      return {};
    }
  } catch (error) {
    console.error("Error generating infobox:", error);
    return {};
  }
}
