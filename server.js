import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

// ========================================
// GEMINI API
// ========================================

if (!process.env.GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not configured.");
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// ========================================
// EXPRESS
// ========================================

app.use(express.json({ limit: "100kb" }));

// index.html repository ke root me hai
app.use(express.static(__dirname));

// ========================================
// KNOWLEDGE BASE
// ========================================

const knowledgeBasePath = path.join(
  __dirname,
  "knowledge-base.json"
);

let knowledgeBase = {};

try {
  const data = fs.readFileSync(
    knowledgeBasePath,
    "utf8"
  );

  knowledgeBase = JSON.parse(data);

  console.log("Knowledge base loaded successfully.");
} catch (error) {
  console.warn(
    "Knowledge base could not be loaded:",
    error.message
  );
}

// Knowledge Base ko AI ke liye text me convert karna
function getKnowledgeBaseText() {
  return JSON.stringify(
    knowledgeBase,
    null,
    2
  ).slice(0, 20000);
}

// ========================================
// AI SYSTEM INSTRUCTION
// ========================================

const systemInstruction = `
You are Rajasthan Smart Shiksha AI.

You are an education-focused multilingual AI assistant.

PROJECT INFORMATION:

Project:
Rajasthan Smart Shiksha AI

Project ID:
SIH25104

Organization:
Government of Rajasthan

Category:
Smart Education

Year:
2026

Developer:
Shivkant Bhambi


YOUR PURPOSE:

Help students with:

- Education
- Courses
- Admissions
- Scholarships
- Exams
- Study planning
- Career guidance
- College information
- Student services
- Learning questions
- General educational guidance


LANGUAGES:

Support Hindi, English, Hinglish and other languages whenever possible.

If the student writes in Hindi, preferably reply in Hindi.

If the student writes in Hinglish, preferably reply in Hinglish.

If the student writes in English, reply in English.


IMPORTANT ACCURACY RULES:

1. Never invent government rules.

2. Never invent scholarship amounts.

3. Never invent eligibility criteria.

4. Never invent admission dates.

5. Never invent exam dates.

6. Never invent fees or deadlines.

7. Never create fake government notices.

8. Never create fake sources or page numbers.

9. Do not claim that information is officially verified unless it actually
comes from a reliable official source.

10. If the Knowledge Base does not contain enough information, clearly
tell the student that the information should be verified from the relevant
official portal, college, university or government notification.

11. Do not expose API keys, environment variables or server secrets.

12. Keep normal answers concise and student-friendly.

13. Give detailed answers when the student asks for detail.

14. Be polite, supportive and encouraging.


KNOWLEDGE BASE RULE:

The Knowledge Base below contains information provided for this project.

Use it when it is relevant to the student's question.

Do NOT assume information that is not present in the Knowledge Base.

If the Knowledge Base does not contain the required information,
say that verification from the relevant official source is required.
`;

// ========================================
// HEALTH CHECK
// ========================================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    aiConfigured: Boolean(
      process.env.GEMINI_API_KEY
    ),
    knowledgeBaseLoaded:
      Object.keys(knowledgeBase).length > 0
  });
});

// ========================================
// CHAT API
// ========================================

app.post("/api/chat", async (req, res) => {
  try {

    const {
      message,
      language = "Hindi",
      history = []
    } = req.body || {};

    // ----------------------------------------
    // Message validation
    // ----------------------------------------

    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: "Message is required."
      });
    }

    // ----------------------------------------
    // API key check
    // ----------------------------------------

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error:
          "Gemini API key is not configured on the server."
      });
    }

    // ----------------------------------------
    // Safe history
    // ----------------------------------------

    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (item) =>
              item &&
              (item.role === "user" ||
                item.role === "model") &&
              typeof item.text === "string"
          )
          .slice(-12)
      : [];

    // ----------------------------------------
    // Convert history
    // ----------------------------------------

    const contents = safeHistory.map(
      (item) => ({
        role: item.role,
        parts: [
          {
            text: item.text.slice(0, 5000)
          }
        ]
      })
    );

    // ----------------------------------------
    // Current message
    // ----------------------------------------

    const lastMessage =
      contents[contents.length - 1];

    if (
      !lastMessage ||
      lastMessage.role !== "user" ||
      lastMessage.parts?.[0]?.text !== message
    ) {
      contents.push({
        role: "user",
        parts: [
          {
            text: message.slice(0, 5000)
          }
        ]
      });
    }

    // ----------------------------------------
    // Knowledge Base
    // ----------------------------------------

    const knowledgeText =
      getKnowledgeBaseText();

    // ----------------------------------------
    // Gemini request
    // ----------------------------------------

    const response =
      await ai.models.generateContent({

        model: MODEL,

        contents: contents,

        config: {

          systemInstruction:
            `${systemInstruction}

--------------------------------
PROJECT KNOWLEDGE BASE
--------------------------------

${knowledgeText}

--------------------------------
END KNOWLEDGE BASE
--------------------------------

Preferred response language:
${language}`,

          maxOutputTokens: 800
        }
      });

    // ----------------------------------------
    // AI response
    // ----------------------------------------

    const reply =
      response.text?.trim();

    if (!reply) {
      return res.status(502).json({
        error:
          "AI returned an empty response."
      });
    }

    // ----------------------------------------
    // Send response
    // ----------------------------------------

    return res.json({
      reply,
      model: MODEL,
      knowledgeBaseUsed:
        Object.keys(knowledgeBase).length > 0
    });

  } catch (error) {

    console.error(
      "Gemini error:",
      error
    );

    const status =
      Number(error?.status) || 500;

    // Rate limit
    if (status === 429) {
      return res.status(429).json({
        error:
          "AI rate limit reached. Please wait and try again."
      });
    }

    // API key error
    if (
      status === 401 ||
      status === 403
    ) {
      return res.status(status).json({
        error:
          "Gemini API key is invalid or does not have access."
      });
    }

    // Model error
    if (status === 404) {
      return res.status(404).json({
        error:
          `Gemini model "${MODEL}" is not available for this API key.`
      });
    }

    // General error
    return res.status(500).json({
      error:
        "AI service error. Please check the Render configuration."
    });
  }
});

// ========================================
// HOMEPAGE
// ========================================

app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "index.html"
    )
  );
});

// ========================================
// START SERVER
// ========================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "================================"
    );

    console.log(
      "Rajasthan Smart Shiksha AI"
    );

    console.log(
      "Server started successfully"
    );

    console.log(
      `Port: ${PORT}`
    );

    console.log(
      `Gemini Model: ${MODEL}`
    );

    console.log(
      `AI Configured: ${Boolean(
        process.env.GEMINI_API_KEY
      )}`
    );

    console.log(
      `Knowledge Base Loaded: ${
        Object.keys(knowledgeBase).length > 0
      }`
    );

    console.log(
      "================================"
    );
  }
);
