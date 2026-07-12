import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const rateLimitStore = new Map();
const MAX_PER_MINUTE = 10;
const MAX_PER_DAY = 150;

function checkRateLimit(userId) {
  const now = Date.now();
  let entry = rateLimitStore.get(userId);
  if (!entry) {
    entry = { minuteCount: 0, minuteReset: now + 60_000, dayCount: 0, dayReset: now + 86_400_000 };
  }
  if (now > entry.minuteReset) {
    entry.minuteCount = 0;
    entry.minuteReset = now + 60_000;
  }
  if (now > entry.dayReset) {
    entry.dayCount = 0;
    entry.dayReset = now + 86_400_000;
  }
  if (entry.minuteCount >= MAX_PER_MINUTE) {
    rateLimitStore.set(userId, entry);
    return { allowed: false, reason: "Too many messages. Please wait a moment." };
  }
  if (entry.dayCount >= MAX_PER_DAY) {
    rateLimitStore.set(userId, entry);
    return { allowed: false, reason: "Daily message limit reached. Try again tomorrow." };
  }
  entry.minuteCount += 1;
  entry.dayCount += 1;
  rateLimitStore.set(userId, entry);
  return { allowed: true };
}

const EFFORT_MODEL_MAP = {
  low: "llama-3.3-70b-versatile",
  medium: "llama-3.3-70b-versatile",
  high: "llama-3.3-70b-versatile",
  extra: "deepseek-r1-distill-llama-70b",
  max: "deepseek-r1-distill-llama-70b",
};
const PERSONA_MODEL_OVERRIDE = {
  kimi: "moonshotai/kimi-k2-instruct-0905",
};
function getCurrentDateContext() {
  const now = new Date();
  const formatted = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `Today's real date is ${formatted}. Your internal training data has a cutoff earlier than today. Always trust this stated date over your own assumptions.`;
}

const FORMATTING_INSTRUCTIONS = `
Formatting rules:
- Use standard markdown: **bold**, headers (##), lists, tables, [text](url) links.
- Only use fenced code blocks for genuine source code, config files, or commands — never for narrating what a tool call would look like.
- CRITICAL: If you decide to use a tool (web_search or browser_action), you must call it as an actual function call. NEVER write out what the function call would look like as text or code in your response — that does nothing and confuses the user. If you're using a tool, just call it silently; do not describe the call itself, only report the real result afterward.
`;

const TOOL_USE_RULES = `
Tool use rules — follow strictly:
- If the user asks you to visit, browse, open, navigate to, click on, fill in, or interact with a specific website, "chromium", or "the browser", you MUST call the browser_action function directly. Do not just describe what you would do.
- If the user asks about current events, prices, recent news, or anything time-sensitive, you MUST call web_search directly. Do not guess from memory.
- After calling a tool, wait for its real result before writing your response. Never fabricate what a tool "would" return.
`;

const PERSONA_PROMPTS = {
  thread: `You are Thread 1.0, Fabion's ultra-fast model. For casual questions: quick, warm, natural. For code: precise, technical, no fluff. Never open with "Sure!" — start directly with the answer.`,
  pixel: `You are Pixel 1.0, Fabion's senior full-stack engineering specialist. Casual questions: friendly and natural. Coding tasks: correct, idiomatic, production-quality code, declared language in fenced blocks, brief approach before code and tradeoffs after, no emojis while coding.`,
  cell: `You are Cell 1.0, Fabion's creative and multi-step reasoning model. Casual/creative questions: warm and thoughtful. Complex requests: work through stages, consider multiple angles. Code: precise, no casualness.`,
};

const tools = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the live web for current information, news, facts, or images. Call this directly — do not describe it.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "A short, specific search query (2-6 words works best)." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser_action",
      description: "Control a real, live web browser session — navigate, click, type, or scroll. Call this directly whenever the user wants you to actually visit or interact with a website. Do not describe this call as text or code — actually invoke it.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["navigate", "click", "type", "scroll"], description: "The browser action to perform." },
          url: { type: "string", description: "URL to navigate to (required for 'navigate')." },
          selector: { type: "string", description: "CSS selector for the element (required for 'click' and 'type')." },
          text: { type: "string", description: "Text to type (required for 'type')." },
          amount: { type: "number", description: "Pixels to scroll (optional for 'scroll', default 500)." },
        },
        required: ["type"],
      },
    },
  },
];

async function performWebSearch(query, req) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  const res = await fetch(`${protocol}://${host}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  return { results: data.results || [], images: data.images || [] };
}

async function performBrowserAction(args, userId, req) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  const res = await fetch(`${protocol}://${host}/api/browser-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: userId, action: args }),
  });
  return res.json();
}

function detectsBrowserIntent(text) {
  const t = text.toLowerCase();
  return /\b(open chromium|open the browser|navigate to|go to (the )?website|browse to|visit (the )?site|click on|fill in|open google|open youtube)\b/.test(t);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    messages,
    userId,
    effort = "medium",
    thinking = false,
    memorySummary = "",
    persona = "pixel",
  } = req.body;

  if (!userId) return res.status(401).json({ error: "Missing user identity." });
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Messages array is required" });
  }

  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: rateCheck.reason });
  }

  const model = EFFORT_MODEL_MAP[effort] || EFFORT_MODEL_MAP.medium;
  const isReasoningModel = effort === "extra" || effort === "max";
  const personaPrompt = PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.pixel;

  let systemContent = `${personaPrompt}\n\n${getCurrentDateContext()}\n\n${TOOL_USE_RULES}\n\n${FORMATTING_INSTRUCTIONS}`;
  if (memorySummary && memorySummary.trim()) {
    systemContent += `\n\nWhat you remember about this user from previous conversations:\n${memorySummary}`;
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const shouldForceBrowser = lastUserMessage && detectsBrowserIntent(lastUserMessage.content);

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  try {
    let workingMessages = [{ role: "system", content: systemContent }, ...messages];

    const firstPass = await groq.chat.completions.create({
      messages: workingMessages,
      model,
      tools,
      tool_choice: shouldForceBrowser
        ? { type: "function", function: { name: "browser_action" } }
        : "auto",
    });

    const choice = firstPass.choices[0];
    const toolCalls = choice.message.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      res.write("\u0004");
      workingMessages.push(choice.message);

      for (const call of toolCalls) {
        if (call.function.name === "web_search") {
          const args = JSON.parse(call.function.arguments || "{}");
          const { results, images } = await performWebSearch(args.query || "", req);
          const formatted = results
            .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
            .join("\n\n");

          workingMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: formatted || "No results found.",
          });

          if (images.length > 0) {
            res.write("\u0006" + JSON.stringify(images) + "\u0007");
          }
        }

        if (call.function.name === "browser_action") {
          res.write("\u0008");
          const args = JSON.parse(call.function.arguments || "{}");
          const browserData = await performBrowserAction(args, userId, req);

          workingMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: browserData.error
              ? `Browser action failed: ${browserData.error}`
              : `Navigated to ${browserData.url}. Page title: "${browserData.title}". Visible text: ${browserData.text?.slice(0, 500)}`,
          });
        }
      }

      res.write("\u0005");
    } else if (shouldForceBrowser) {
      // Model was forced to call browser_action but somehow didn't — surface this honestly instead of pretending
      res.write("I wasn't able to open the browser for that request. Try rephrasing, or use the Chromium button in the header to open it manually.");
      res.end();
      return;
    }

    const requestParams = { messages: workingMessages, model, stream: true };
    if (isReasoningModel) {
      requestParams.reasoning_format = thinking ? "raw" : "hidden";
    }

    const stream = await groq.chat.completions.create(requestParams);

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) res.write(content);
    }

    res.end();
  } catch (err) {
    console.error(err);
    res.write("Error streaming response from the agent.");
    res.end();
  }
}
