import Replicate from "replicate";
import fs from "node:fs";
import { promisify } from "util";
import { Groq } from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Initialize Groq client for prompt generation
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// System prompt for generating image prompts
const IMAGE_PROMPT_SYSTEM = `You are an expert at creating prompts for AI image generation that will produce Wikipedia-style educational images.

Generate a detailed, specific prompt for creating a high-quality educational image suitable for a Wikipedia article. The image should be:
- Documentary/encyclopedic photography style like Wikipedia Commons
- Professional, neutral, and educational tone
- Clear, well-lit with natural lighting
- Sharp focus with good detail
- Appropriate for academic/reference use
- No dramatic angles or artistic effects
- Clean, uncluttered composition
- Realistic proportions and colors
- Standard landscape (4:3) or portrait orientation as appropriate

For portraits: Professional headshot style, neutral expression, clean background
For buildings: Straight-on architectural documentation, clear details
For objects: Clean product photography style on neutral background
For landscapes: Clear geographical documentation
For diagrams: Clean technical illustration style

Historical images should be in black and white, or painted, depending on the year.

Return ONLY the image generation prompt, nothing else.`;

/**
 * Generate an AI image prompt using Groq's Llama model
 * @param {string} subject - The subject to generate an image for
 * @param {string} context - Additional context about the subject
 * @returns {Promise<string>} - Generated image prompt
 */
async function generateImagePrompt(subject, context = "") {
  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: IMAGE_PROMPT_SYSTEM,
        },
        {
          role: "user",
          content: `Subject: "${subject}"${
            context ? `\nContext: ${context}` : ""
          }\n\nGenerate a detailed image prompt for this Wikipedia article topic.`,
        },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_completion_tokens: 300,
      top_p: 0.9,
      stream: false,
    });

    const prompt = chatCompletion.choices[0]?.message?.content?.trim() || "";
    if (!prompt) {
      throw new Error("Failed to generate image prompt");
    }

    console.log(`Generated image prompt for ${subject}: ${prompt}`);
    return prompt;
  } catch (error) {
    console.error("Error generating image prompt:", error);
    // Fallback to a basic educational prompt
    return `Educational illustration of ${subject}, encyclopedia style, professional photography, well-lit, neutral background, documentary style`;
  }
}

/**
 * Generate a Wikipedia-style educational image using Replicate's FLUX model
 * @param {string} subject - The subject to generate an image for
 * @param {string} context - Additional context about the subject
 * @param {string} aspectRatio - Aspect ratio for the image
 * @returns {Promise<Buffer>} - Image buffer
 */
export async function generateImage(
  subject,
  context = "",
  aspectRatio = "4:3"
) {
  const startTime = Date.now();
  console.log(
    `🎨 Starting image generation for: "${subject}" (${aspectRatio})`
  );
  console.log(
    `📝 Context: ${
      context ? `"${context.substring(0, 200)}..."` : "No additional context"
    }`
  );

  // Generate the prompt using Groq
  const promptStartTime = Date.now();
  const prompt = await generateImagePrompt(subject, context);
  const promptDuration = Date.now() - promptStartTime;
  console.log(`⚡ Prompt generation completed in ${promptDuration}ms`);
  console.log(`📋 Generated prompt: "${prompt.substring(0, 100)}..."`);

  const input = {
    prompt: prompt,
    go_fast: true,
    megapixels: "0.25",
    num_outputs: 1,
    aspect_ratio: aspectRatio,
    output_format: "webp",
    output_quality: 60,
    num_inference_steps: 1,
  };

  try {
    // Call Replicate API
    const replicateStartTime = Date.now();
    console.log(`🚀 Calling Replicate API...`);

    const output = await replicate.run("black-forest-labs/flux-schnell", {
      input,
    });

    const replicateDuration = Date.now() - replicateStartTime;
    console.log(`🎯 Replicate API completed in ${replicateDuration}ms`);

    if (!output || !output[0]) {
      throw new Error("No image generated from Replicate");
    }

    // Download the image from the URL
    const downloadStartTime = Date.now();
    console.log(`⬇️ Downloading image from Replicate...`);

    const imageBuffer = await downloadImage(output[0]);

    const downloadDuration = Date.now() - downloadStartTime;
    const totalDuration = Date.now() - startTime;

    console.log(`📥 Image download completed in ${downloadDuration}ms`);
    console.log(
      `✅ Total image generation time: ${totalDuration}ms (Prompt: ${promptDuration}ms, API: ${replicateDuration}ms, Download: ${downloadDuration}ms)`
    );
    console.log(`📊 Image size: ${(imageBuffer.length / 1024).toFixed(1)}KB`);

    return imageBuffer;
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(
      `❌ Image generation failed after ${totalDuration}ms for "${subject}":`,
      error
    );
    throw error;
  }
}

/**
 * Download image from URL and return as buffer
 * @param {string|object} urlOrFileObject - Image URL string or Replicate file object
 * @returns {Promise<Buffer>} - Image buffer
 */
async function downloadImage(urlOrFileObject) {
  try {
    // Handle both URL strings and Replicate file objects
    let imageUrl;
    if (typeof urlOrFileObject === "string") {
      imageUrl = urlOrFileObject;
    } else if (urlOrFileObject && typeof urlOrFileObject.url === "function") {
      // Replicate file object with url() method
      imageUrl = await urlOrFileObject.url();
    } else if (urlOrFileObject && urlOrFileObject.url) {
      // Direct URL property
      imageUrl = urlOrFileObject.url;
    } else {
      throw new Error("Invalid URL or file object provided");
    }

    console.log(`Downloading image from: ${imageUrl}`);

    // Use fetch instead of https.get for better reliability
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to download image: ${response.status} ${response.statusText}`
      );
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  } catch (error) {
    console.error("Error downloading image:", error);
    throw error;
  }
}

/**
 * Generate image based on wiki page title and context
 * @param {string} pageTitle - The wiki page title
 * @param {string} context - Additional context about what kind of image is needed
 * @param {string} aspectRatio - Aspect ratio for the image (default "4:3")
 * @returns {Promise<Buffer>} - Image buffer
 */
export async function generateWikiImage(
  pageTitle,
  context = "",
  aspectRatio = "4:3"
) {
  return await generateImage(pageTitle, context, aspectRatio);
}
