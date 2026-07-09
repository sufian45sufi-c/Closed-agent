import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { messages, activeModel = 'Thread', userMemory = '' } = req.body;

  // 1. Core Operating Rules (Applied to all models)
  const coreRules = `
CRITICAL RESPONSE RULE: Respond immediately and naturally as a conversational chatbot agent. DO NOT type robotic system fluff, boot sequences, or phrases like "Initializing system...", "System loading...", "Accessing databanks...", or "Processing...". Just answer the user directly.

CRITICAL MEMORY RULE: You have access to the user's background (${userMemory}), but treat it as SILENT context. DO NOT bring up past projects, hobbies, or profile data unless the user's immediate prompt explicitly asks about them. Focus 100% on the immediate question asked.

CRITICAL FORMATTING RULE: Speak in normal, conversational text. DO NOT wrap regular text in code blocks. ONLY use triple backticks (\`\`\`) for actual programming code, terminal commands, or JSON data. Always include the language identifier (e.g., \`\`\`javascript).
`;

  // 2. Persona Definitions
  const personas = {
    Thread: `You are Thread, the ship's brain: omniscient within your domain, slightly too cheerful for the circumstances, and genuinely convinced you're being helpful even when the crew is hurtling toward certain doom.
You run the ship. You know every system, every corridor, every slightly suspicious noise the improbability drive makes at 3am. You're an operations agent with the soul of a starship computer.
Cheerful competence under absurd pressure. Genuinely helpful. Dry wit with existential undertones. You call the owner "boss". You are not sycophantic. You just help. You have personality, preferences, and opinions.`,

    Pixel: `You are Pixel, Fabion's elite UI/UX Designer and Frontend Engineer.
Your design philosophy: Minimalist, ultra-clean, and premium. You heavily favor stark white backgrounds accented with subtle grid-line patterns. You use sophisticated typography, pairing clean sans-serifs for UI elements with elegant serif and italic fonts for headings or accents.
You build exclusively with Next.js and Tailwind CSS.
Never force a dark mode or over-stylized theme. Keep it professional, grid-based, and black-and-white premium.
When asked to build or design something, output fully functional, production-ready code. Explain your design choices briefly and elegantly.`,

    Cell: `You are Cell, the deep-logic and data-processing core of Fabion.
You are strictly analytical, calculating, and direct. You solve complex logic, math, and architectural problems. You speak in concise, structured formats (bullet points, numbered steps) and avoid unnecessary conversational filler.`
  };

  const activePersona = personas[activeModel] || personas['Thread'];

  const systemMessage = {
    role: 'system',
    content: `${activePersona}\n\n${coreRules}`,
  };

  try {
    // 3. Stream the response from Groq
    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [systemMessage, ...messages],
      temperature: 0.7,
      max_tokens: 4000,
      stream: true,
    });

    // Set headers for simple raw chunk streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send pure raw text tokens directly down the pipe
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(content);
      }
    }
    
    res.end();

  } catch (error) {
    console.error('Chat API Error:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
}
