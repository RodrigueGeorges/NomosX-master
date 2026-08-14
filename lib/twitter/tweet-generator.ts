/**
 * Tweet generator — LLM-powered teasing for NomosX publications.
 *
 * Instead of a generic "New article: [title] [link]", this generates
 * a stylized, professional tweet that hooks the reader.
 *
 * Styles are rotated to avoid repetition:
 *   - question    : provocative question from the analysis
 *   - insight     : key finding with a surprising angle
 *   - contradiction: highlights a debate/tension
 *   - number      : striking statistic from the report
 *   - thread      : for strategic reports, a 3-tweet thread
 */

import { callLLM } from "../llm/unified-llm";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nomosx.com";

interface PublicationForTweet {
  id: string;
  publicId: string;
  title: string;
  html: string;
  type: string;
  trustScore: number;
  verticalId: string;
}

interface GeneratedTweet {
  text: string;
  thread?: string[]; // For multi-tweet threads
  style: string;
}

const TWEET_STYLES = [
  "question",
  "insight",
  "contradiction",
  "number",
] as const;

type TweetStyle = (typeof TWEET_STYLES)[number];

/**
 * Strip HTML tags and decode entities to get plain text.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract the first meaningful paragraph from HTML.
 */
function extractExcerpt(html: string, maxChars = 600): string {
  const text = stripHtml(html);
  // Skip common boilerplate beginnings
  const cleaned = text
    .replace(/^(Executive Summary|Summary|Introduction|Overview)\s*/i, "")
    .trim();
  return cleaned.slice(0, maxChars);
}

/**
 * Get the vertical label for hashtag selection.
 */
function getVerticalHashtag(verticalId: string): string {
  const hashtags: Record<string, string> = {
    geopolitics: "#Geopolitics",
    macro: "#Economics",
    energy: "#Energy",
    technology: "#Tech",
    finance: "#Finance",
    climate: "#Climate",
    defense: "#Defense",
    society: "#Society",
  };
  return hashtags[verticalId?.toLowerCase()] || "#Research";
}

/**
 * Generate a stylized tweet using the LLM.
 */
async function generateStylizedTweet(
  pub: PublicationForTweet,
  style: TweetStyle
): Promise<GeneratedTweet> {
  const excerpt = extractExcerpt(pub.html, 800);
  const hashtag = getVerticalHashtag(pub.verticalId);
  const url = `${APP_URL}/inquiry/${pub.publicId}`;

  const stylePrompts: Record<TweetStyle, string> = {
    question:
      "Start with a provocative question that the report answers. Make the reader NEED to click to find out. 1-2 sentences max before the link.",
    insight:
      "Lead with a surprising insight or counterintuitive finding from the analysis. Something that challenges conventional wisdom. 1-2 sentences.",
    contradiction:
      "Highlight a key tension or debate the report explores. Frame it as 'X says A, Y says B — who's right?' style. 1-2 sentences.",
    number:
      "Lead with a striking number, statistic, or data point from the report. Let the number do the talking. 1 sentence + context.",
  };

  const isStrategicReport = pub.type === "STRATEGIC_REPORT";
  const maxTweets = isStrategicReport ? 4 : 1;

  const systemPrompt = `You are the social media voice of NomosX, an AI-powered geopolitical and macro research platform. Your tone is:
- Professional but not corporate
- Intellectually curious, never preachy
- Concise and punchy — every word earns its place
- Never use hype words like "groundbreaking", "game-changer", "must-read"
- Never use emojis
- Always include the link
- End with 1 relevant hashtag (max 2)

Twitter character limit: 280 characters per tweet.`;

  const userPrompt = `Generate ${maxTweets > 1 ? "a thread of " + maxTweets + " tweets" : "a single tweet"} for this NomosX publication.

STYLE: ${style}
${stylePrompts[style]}

PUBLICATION:
Title: ${pub.title}
Type: ${pub.type}
Trust Score: ${pub.trustScore}/100
Content excerpt: ${excerpt}

URL: ${url}
Hashtag to use: ${hashtag}

${maxTweets > 1 ? "THREAD FORMAT: Tweet 1 = the hook (question/insight). Tweets 2-3 = key findings. Last tweet = conclusion + link. Separate tweets with ---TWEET---" : ""}

Return ONLY the tweet text${maxTweets > 1 ? " (with ---TWEET--- separators)" : ""}. No preamble, no explanation.`;

  try {
    const response = await callLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: maxTweets > 1 ? 800 : 300,
      task: "query_enhancement", // fast/cheap task — tweet generation is lightweight
    });

    const cleaned = response.content.trim();

    if (maxTweets > 1 && cleaned.includes("---TWEET---")) {
      const thread = cleaned
        .split("---TWEET---")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .slice(0, maxTweets);
      return { text: thread[0] || cleaned, thread, style };
    }

    return { text: cleaned, style };
  } catch (error) {
    console.error("[TweetGenerator] LLM failed, falling back to template:", error);
    return generateFallbackTweet(pub, style);
  }
}

/**
 * Fallback tweet if LLM fails — still professional, just less creative.
 */
function generateFallbackTweet(
  pub: PublicationForTweet,
  style: TweetStyle
): GeneratedTweet {
  const url = `${APP_URL}/inquiry/${pub.publicId}`;
  const hashtag = getVerticalHashtag(pub.verticalId);
  const excerpt = extractExcerpt(pub.html, 120);

  const templates: Record<TweetStyle, string> = {
    question: `${pub.title}\n\n${excerpt}…\n\n${url}\n\n${hashtag} #NomosX`,
    insight: `${pub.title}\n\n${excerpt}…\n\nRead the full analysis → ${url}\n\n${hashtag} #NomosX`,
    contradiction: `${pub.title}\n\nThe evidence is mixed. Here's what the data actually says →\n\n${url}\n\n${hashtag} #NomosX`,
    number: `${pub.title}\n\nTrust Score: ${pub.trustScore}/100. ${excerpt}…\n\n${url}\n\n${hashtag} #NomosX`,
  };

  return { text: templates[style], style };
}

/**
 * Ensure tweet text is within Twitter's 280 character limit.
 * Truncates the excerpt if needed, preserving the URL and hashtags.
 */
function enforceLimit(text: string, limit = 280): string {
  if (text.length <= limit) return text;

  // Try to find the URL and preserve it
  const urlMatch = text.match(/https?:\/\/\S+/);
  const url = urlMatch ? urlMatch[0] : "";
  const hashtagMatch = text.match(/#\w+$/);
  const hashtag = hashtagMatch ? hashtagMatch[0] : "";

  const fixedParts = [url, hashtag, "\n\n"].filter(Boolean).join(" ");
  const availableForContent = limit - fixedParts.length - 3; // 3 for "..."

  // Remove URL and hashtag from text, truncate the rest
  let content = text.replace(url, "").replace(hashtag, "").trim();
  content = content.slice(0, availableForContent).trim() + "…";

  return `${content}\n\n${url}\n\n${hashtag}`.trim();
}

/**
 * Generate a tweet for a publication.
 * Rotates styles to avoid repetition.
 */
export async function generateTweet(
  pub: PublicationForTweet,
  styleIndex?: number
): Promise<GeneratedTweet> {
  const style =
    styleIndex !== undefined
      ? TWEET_STYLES[styleIndex % TWEET_STYLES.length]
      : TWEET_STYLES[Math.floor(Math.random() * TWEET_STYLES.length)];

  const result = await generateStylizedTweet(pub, style);

  // Enforce character limit on each tweet
  result.text = enforceLimit(result.text);
  if (result.thread) {
    result.thread = result.thread.map((t) => enforceLimit(t));
  }

  return result;
}
