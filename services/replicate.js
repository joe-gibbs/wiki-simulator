import Replicate from "replicate";
import fs from "node:fs";
import { promisify } from "util";
import { Groq } from "groq-sdk";
import dotenv from "dotenv";
import { storeImagePrompt } from "../utils/imageContext.js";

dotenv.config();

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Initialize Groq client for prompt generation
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// System prompt for generating image prompts (simplified for speed)
const IMAGE_PROMPT_SYSTEM = `Generate a concise prompt for a Wikipedia-style educational image.

Style: Documentary photography, professional, neutral, well-lit, clean background, encyclopedia quality.

Return only the image prompt in 1-2 sentences.`;

// System prompt for batch generating multiple image prompts
const BATCH_IMAGE_PROMPT_SYSTEM = `Generate concise prompts for Wikipedia-style educational images. 

For each image, return ONLY the prompt (max 100 characters), one per line, in the same order as the input.

Style: Documentary photography, professional, neutral, well-lit, clean background, encyclopedia quality.`;

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
            context ? `\nContext: ${context.substring(0, 200)}` : ""
          }`,
        },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_completion_tokens: 150,
      top_p: 0.8,
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
 * Generate multiple image prompts in a single batch call
 * @param {Array} imageReferences - Array of image objects with caption/alt text
 * @param {string} articleTitle - The article title for context
 * @returns {Promise<Array>} - Array of generated prompts
 */
export async function generateBatchImagePrompts(imageReferences, articleTitle) {
  if (!imageReferences || imageReferences.length === 0) {
    return [];
  }

  try {
    console.log(
      `🎨 Generating ${imageReferences.length} image prompts for article: ${articleTitle}`
    );

    // Build the batch request
    const imageList = imageReferences
      .map(
        (img, index) =>
          `${index + 1}. ${
            img.caption || img.alt || img.slug.replace(/_/g, " ")
          }`
      )
      .join("\n");

    const userPrompt = `Article: "${articleTitle}"

Images to generate prompts for:
${imageList}

Generate a concise prompt (max 100 chars) for each image:`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: BATCH_IMAGE_PROMPT_SYSTEM,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_completion_tokens: 500,
      top_p: 0.8,
      stream: false,
    });

    const response = chatCompletion.choices[0]?.message?.content?.trim() || "";
    if (!response) {
      throw new Error("Failed to generate batch image prompts");
    }

    // Parse the response - split by lines and clean up
    const prompts = response
      .split("\n")
      .map((line) => line.replace(/^\d+\.\s*/, "").trim()) // Remove "1. " prefixes
      .filter((line) => line.length > 0)
      .slice(0, imageReferences.length); // Ensure we don't get more than requested

    console.log(`✅ Generated ${prompts.length} prompts successfully`);

    // Store each prompt with its corresponding image
    imageReferences.forEach((img, index) => {
      if (prompts[index]) {
        storeImagePrompt(img.slug, prompts[index], articleTitle);
      }
    });

    return prompts;
  } catch (error) {
    console.error("Error generating batch image prompts:", error);

    // Fallback: generate basic prompts for each image
    const fallbackPrompts = imageReferences.map((img) => {
      const prompt = `Educational photo of ${
        img.caption || img.alt || img.slug.replace(/_/g, " ")
      }, documentary style`;
      storeImagePrompt(img.slug, prompt, articleTitle);
      return prompt;
    });

    return fallbackPrompts;
  }
}

/**
 * Generate a Wikipedia-style educational image using a pre-generated prompt
 * @param {string} subject - The subject to generate an image for
 * @param {string} prompt - Pre-generated image prompt
 * @param {string} aspectRatio - Aspect ratio for the image
 * @returns {Promise<Buffer>} - Image buffer
 */
export async function generateWikiImage(subject, prompt, aspectRatio = "4:3") {
  const startTime = Date.now();
  console.log(
    `🎨 Starting image generation for: "${subject}" (${aspectRatio})`
  );
  console.log(
    `📋 Using pre-generated prompt: "${prompt.substring(0, 100)}..."`
  );

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
      `✅ Total image generation time: ${totalDuration}ms (API: ${replicateDuration}ms, Download: ${downloadDuration}ms)`
    );
    console.log(`📊 Image size: ${(imageBuffer.length / 1024).toFixed(1)}KB`);

    return imageBuffer;
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
}

/**
 * Generate a Wikipedia-style educational image using Replicate's FLUX model (legacy function)
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
