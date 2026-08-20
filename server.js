import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "WARNING: GEMINI_API_KEY is not set. Add it to your Render environment variables."
  );
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

app.use(express.json({ limit: "100kb" }));

// Serve website files from public folder
app.use(express.static(path.join(__dirname, "public")));

const systemInstruction = `
You are Rajasthan Smart Shiksha AI, an education-focused multilingual assistant for a Smart Education prototype.

Project: SIH25104
Organization: Government of Rajasthan
Project: Smart Education
Year: 2026
Developer: Shivkant Bhambi

Rules:

1. Help students with education, courses, admissions, scholarships, exams,
   study planning and general student services.

2. Understand and respond in the user's requested language.
   Hindi, English and Hinglish are especially important.

3. Use simple, student-friendly language.

4. Never claim that information is an official Rajasthan Government rule
   unless it is provided from an official source.

5. If you do not know a current or official fact, clearly say that it needs
   verification from the relevant official notice or portal.

6. Do not invent scholarship amounts, eligibility rules, dates, fees,
   deadlines or government policies.

7. This phase does not have an official document/RAG knowledge base yet.
   Do not pretend that a source or page number exists.

8. Keep answers useful and concise unless the student asks for detail.

9. Be polite, helpful and educational.

10. If the student asks something unrelated to education, answer briefly
    and guide them back toward useful educational assistance when appropriate.
`;

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    aiConfigured: Boolean(process.env.GEMINI_API_KEY)
  });
});

// AI Chat API
app.post("/api/chat", async (req, res) => {
  try {
    const {
      message,
      language = "Hindi",
      history = []
    } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Message is required."
      });
    }

    // Keep only safe conversation history
    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (x) =>
              x &&
              (x.role === "user" || x.role === "model") &&
              typeof x.text === "string"
          )
          .slice(-12)
      : [];

    const contents = safeHistory.map((x) => ({
      role: x.role,
      parts: [
        {
          text: x.text.slice(0, 5000)
        }
      ]
    }));

    // Avoid duplicate current message
    const last = contents[contents.length - 1];

    if (
      !last ||
      last.role !== "user" ||
      last.parts[0].text !== message
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

    const response = await ai.models.generateContent({
      model: MODEL,

      contents,

      config: {
        systemInstruction:
          `${systemInstruction}\n\nPreferred response language: ${language}.`,

        temperature: 0.4,

        maxOutputTokens: 800
      }
    });

    const reply = response.text?.trim();

    if (!reply) {
      return res.status(502).json({
        error: "AI returned an empty response."
      });
    }

    res.json({
      reply,
      model: MODEL
    });

  } catch (error) {
    console.error("Gemini error:", error);

    const status = Number(error?.status) || 500;

    if (status === 429) {
      return res.status(429).json({
        error:
          "AI free-tier rate limit reached. Please wait a little and try again."
      });
    }

    res.status(500).json({
      error:
        "AI service error. Check the server configuration and API key."
    });
  }
});

// Frontend fallback
// Express 5 compatible wildcard route
app.get("/{*splat}", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

// Start server
// 0.0.0.0 is required for Render
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Rajasthan Smart Shiksha AI running on port ${PORT}`
  );
});
