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

// Check API key
if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "WARNING: GEMINI_API_KEY is not set. Add it to Render Environment Variables."
  );
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Middleware
app.use(express.json({ limit: "100kb" }));

// Serve files from ROOT directory
app.use(express.static(__dirname));

// AI instructions
const systemInstruction = `
You are Rajasthan Smart Shiksha AI, an education-focused multilingual assistant.

Project: SIH25104
Organization: Government of Rajasthan
Project: Smart Education
Year: 2026
Developer: Shivkant Bhambi

Your purpose is to help students with:

- Education
- Scholarships
- Admissions
- Courses
- Exams
- Study planning
- College information
- General student services

Rules:

1. Understand and respond in the user's requested language.

2. Hindi, English and Hinglish are especially important.

3. Use simple and student-friendly language.

4. Never claim that something is an official Rajasthan Government rule
   unless it has been verified from an official source.

5. If you do not know a current or official fact, clearly say that
   the information needs verification from the relevant official
   notice or portal.

6. Do not invent scholarship amounts, eligibility rules, dates,
   fees, deadlines or government policies.

7. Do not pretend that an official document, source or page number
   exists when it has not been provided.

8. Keep answers useful and concise unless the student asks for detail.

9. Be polite, helpful and educational.

10. For scholarship, admission or government-related information,
    remind students to verify important details from the official
    portal or latest official notice.
`;

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    aiConfigured: Boolean(process.env.GEMINI_API_KEY)
  });
});

// AI Chat
app.post("/api/chat", async (req, res) => {
  try {
    const {
      message,
      language = "Hindi",
      history = []
    } = req.body || {};

    // Validate message
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Message is required."
      });
    }

    // Safe conversation history
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

    // Add current message if it isn't already there
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

    // Generate AI response
    const response = await ai.models.generateContent({
      model: MODEL,

      contents: contents,

      config: {
        systemInstruction:
          `${systemInstruction}

Preferred response language: ${language}.`,

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
      reply: reply,
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
// index.html is in the ROOT folder
app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Rajasthan Smart Shiksha AI running on port ${PORT}`
  );
});
