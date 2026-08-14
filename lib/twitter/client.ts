/**
 * Twitter/X API v2 client — OAuth 1.0a for posting tweets.
 *
 * Uses the Twitter API v2 POST /2/tweets endpoint with OAuth 1.0a User Context.
 * Required env vars:
 *   TWITTER_API_KEY
 *   TWITTER_API_SECRET
 *   TWITTER_ACCESS_TOKEN
 *   TWITTER_ACCESS_TOKEN_SECRET
 *
 * The Basic tier ($100/mo) allows 3,000 tweets/month via this endpoint.
 * Free tier does NOT allow posting — only read.
 */

import crypto from "crypto";

interface TwitterEnv {
  TWITTER_API_KEY: string;
  TWITTER_API_SECRET: string;
  TWITTER_ACCESS_TOKEN: string;
  TWITTER_ACCESS_TOKEN_SECRET: string;
}

function getTwitterEnv(): TwitterEnv | null {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return null;
  }

  return {
    TWITTER_API_KEY: apiKey,
    TWITTER_API_SECRET: apiSecret,
    TWITTER_ACCESS_TOKEN: accessToken,
    TWITTER_ACCESS_TOKEN_SECRET: accessSecret,
  };
}

/**
 * Generate OAuth 1.0a authorization header for Twitter API v2.
 */
function generateOAuthHeader(
  method: string,
  url: string,
  params: Record<string, string>,
  env: TwitterEnv
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: env.TWITTER_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: env.TWITTER_ACCESS_TOKEN,
    oauth_version: "1.0",
  };

  // Combine oauth params with query/body params for signature base
  const allParams = { ...oauthParams, ...params };
  const sortedParams = Object.keys(allParams)
    .sort()
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(allParams[key])}`
    )
    .join("&");

  const signatureBase = `${method.toUpperCase()}&${encodeURIComponent(
    url
  )}&${encodeURIComponent(sortedParams)}`;

  const signingKey = `${encodeURIComponent(
    env.TWITTER_API_SECRET
  )}&${encodeURIComponent(env.TWITTER_ACCESS_TOKEN_SECRET)}`;

  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(signatureBase)
    .digest("base64");

  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
  return (
    "OAuth " +
    Object.keys(headerParams)
      .map(
        (key) =>
          `${encodeURIComponent(key)}="${encodeURIComponent(
            headerParams[key]
          )}"`
      )
      .join(", ")
  );
}

export interface TweetResult {
  id: string;
  text: string;
}

/**
 * Post a tweet using Twitter API v2.
 * Returns the tweet ID on success, throws on failure.
 */
export async function postTweet(text: string): Promise<TweetResult> {
  const env = getTwitterEnv();
  if (!env) {
    throw new Error(
      "Twitter API credentials not configured. Set TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET."
    );
  }

  // Twitter API v2 — POST /2/tweets
  const url = "https://api.twitter.com/2/tweets";
  const body = JSON.stringify({ text });

  // For POST with JSON body, OAuth signature uses no body params
  const authHeader = generateOAuthHeader("POST", url, {}, env);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg = `Twitter API error (${response.status})`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMsg = `Twitter API error: ${
        errorJson.title || errorJson.detail || errorText
      }`;
    } catch {
      errorMsg = `Twitter API error (${response.status}): ${errorText}`;
    }
    throw new Error(errorMsg);
  }

  const data = await response.json();
  return {
    id: data.data?.id || "",
    text: data.data?.text || text,
  };
}

/**
 * Check if Twitter credentials are configured.
 */
export function isTwitterConfigured(): boolean {
  return getTwitterEnv() !== null;
}
