import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;

// Gemini model
const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

// ========================================
// GEMINI API SETUP
// ========================================

if (!process.env.GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not configured.");
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// ========================================
// EXPRESS SETUP
// ========================================

app.use(express.json({ limit: "100kb" }));

// IMPORTANT:
// Tumhara index.html root folder me hai,
// public folder ke andar nahi.
app.use(express.static(__dirname));

// ========================================
// AI SYSTEM INSTRUCTION
// ========================================

const systemInstruction = `
You are Rajasthan Smart Shiksha AI.

You are an education-focused multilingual AI assistant.

Project:
Rajasthan Smart Shiksha AI
SIH25104
Smart Education Project
2026

Developer:
Shivkant Bhambi

Help students with:

- Education
- Courses
- Admissions
- Scholarships
- Exams
- Study planning
- Career guidance
- College information
- General student services
- Learning questions

Language support:

- Hindi
- English
- Hinglish
- Rajasthani
- Bengali
- Marathi
- Other languages when possible

IMPORTANT RULES:

1. Always be helpful and student-friendly.

2. Understand the language used by the student.

3. If the student asks in Hindi, reply in Hindi.

4. If the student asks in Hinglish, reply in Hinglish.

5. Use simple language.

6. Never invent government rules.

7. Never invent scholarship amounts.

8. Never invent scholarship eligibility.

9. Never invent admission dates.

10. Never invent exam dates.

11. Never invent fees or deadlines.

12. If information is current or official and you are not sure,
tell the student that it should be verified from the relevant
official government, university or college portal.

13. Do not create fake sources.

14. Do not create fake page numbers.

15. Do not claim that you have an official Rajasthan government
knowledge base.

16. This project currently does not have an official RAG/document
knowledge base.

17. Keep normal answers concise.

18. Give detailed explanations when the student asks for detail.

19. Be polite, supportive and encouraging.

20. Never reveal API keys, environment variables or server secrets.

You are Rajasthan Smart Shiksha AI.
`;

// ========================================
// HEALTH CHECK
// ========================================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    aiConfigured: Boolean(process.env.GEMINI_API_KEY)
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

    // Check message
    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: "Message is required."
      });
    }

    // Check API key
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Gemini API key is not configured."
      });
    }

    // ========================================
    // SAFE HISTORY
    // ========================================

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

    // ========================================
    // GEMINI CONTENT
    // ========================================

    const contents = safeHistory.map((item) => ({
      role: item.role,
      parts: [
        {
          text: item.text.slice(0, 5000)
        }
      ]
    }));

    // Avoid duplicate current message
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

    // ========================================
    // CALL GEMINI
    // ========================================

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: contents,
      config: {
        systemInstruction:
          `${systemInstruction}

Preferred response language:
${language}`,

        maxOutputTokens: 800
      }
    });

    // ========================================
    // GET RESPONSE
    // ========================================

    const reply = response.text?.trim();

    if (!reply) {
      return res.status(502).json({
        error: "AI returned an empty response."
      });
    }

    // ========================================
    // SEND RESPONSE
    // ========================================

    return res.json({
      reply: reply,
      model: MODEL
    });

  } catch (error) {

    console.error("Gemini error:", error);

    const status =
      Number(error?.status) || 500;

    // Rate limit
    if (status === 429) {
      return res.status(429).json({
        error:
          "AI rate limit reached. Please wait a little and try again."
      });
    }

    // API key problem
    if (status === 401 || status === 403) {
      return res.status(status).json({
        error:
          "Gemini API key is invalid or does not have access."
      });
    }

    // Model problem
    if (status === 404) {
      return res.status(404).json({
        error:
          `Gemini model "${MODEL}" is not available for this API key.`
      });
    }

    return res.status(500).json({
      error:
        "AI service error. Please check the Render environment variables and Gemini API configuration."
    });
  }
});

// ========================================
// HOMEPAGE
// ========================================

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {
  console.log(
    `Rajasthan Smart Shiksha AI running on port ${PORT}`
  );

  console.log(
    `Gemini model: ${MODEL}`
  );

  console.log(
    `AI configured: ${Boolean(process.env.GEMINI_API_KEY)}`
  );
});
