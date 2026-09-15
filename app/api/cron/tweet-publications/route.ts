import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { postTweet, isTwitterConfigured } from "@/lib/twitter/client";
import { generateTweet } from "@/lib/twitter/tweet-generator";
import { verifyBearerToken } from "@/lib/security/timing-safe";

/**
 * POST /api/cron/tweet-publications
 * Cron-triggered: finds newly published articles that haven't been tweeted yet,
 * generates a stylized tweet, and posts it to Twitter.
 *
 * Security: requires CRON_SECRET header.
 *
 * Logic:
 *   1. Find publications where status=PUBLISHED, publicId IS NOT NULL,
 *      tweetedAt IS NULL, publishedAt > 10 minutes ago (grace period)
 *   2. For each (max 3 per run to avoid rate limits):
 *      a. Generate tweet via LLM
 *      b. Post to Twitter
 *      c. Update tweetedAt + tweetId
 *   3. Failures are logged but don't block other publications
 */

const GRACE_PERIOD_MINUTES = 10;
const MAX_TWEETS_PER_RUN = 3;

export async function POST(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (!verifyBearerToken(authHeader, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if Twitter is configured
  if (!isTwitterConfigured()) {
    console.log("[Auto-Tweet] Twitter credentials not configured, skipping");
    return NextResponse.json({
      success: true,
      message: "Twitter not configured — skipped",
      tweeted: 0,
    });
  }

  try {
    // Find publications that need tweeting
    const gracePeriodAgo = new Date(
      Date.now() - GRACE_PERIOD_MINUTES * 60 * 1000
    );

    const publications = await prisma.thinkTankPublication.findMany({
      where: {
        status: "PUBLISHED",
        publicId: { not: null },
        tweetedAt: null,
        publishedAt: { lt: gracePeriodAgo },
      },
      select: {
        id: true,
        publicId: true,
        title: true,
        html: true,
        type: true,
        trustScore: true,
        verticalId: true,
      },
      orderBy: { publishedAt: "asc" },
      take: MAX_TWEETS_PER_RUN,
    });

    if (publications.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No publications pending tweet",
        tweeted: 0,
      });
    }

    const results: Array<{
      id: string;
      title: string;
      success: boolean;
      tweetId?: string;
      error?: string;
    }> = [];

    for (const pub of publications) {
      try {
        // Generate the tweet
        const tweet = await generateTweet({
          id: pub.id,
          publicId: pub.publicId!,
          title: pub.title,
          html: pub.html,
          type: pub.type,
          trustScore: pub.trustScore,
          verticalId: pub.verticalId,
        });

        // Post the main tweet
        const result = await postTweet(tweet.text);
        let finalTweetId = result.id;

        // If it's a thread, post replies
        if (tweet.thread && tweet.thread.length > 1) {
          let replyToId = result.id;
          for (let i = 1; i < tweet.thread.length; i++) {
            try {
              // Note: Twitter API v2 thread posting requires in_reply_to_tweet_id
              // For simplicity, we post the first tweet only in this version.
              // Thread support can be added later with the reply endpoint.
              break;
            } catch (err) {
              console.error(`[Auto-Tweet] Thread reply ${i} failed:`, err);
              break;
            }
          }
        }

        // Update the publication
        await prisma.thinkTankPublication.update({
          where: { id: pub.id },
          data: {
            tweetedAt: new Date(),
            tweetId: finalTweetId,
          },
        });

        console.log(
          `[Auto-Tweet] Posted tweet ${finalTweetId} for "${pub.title}"`
        );

        results.push({
          id: pub.id,
          title: pub.title,
          success: true,
          tweetId: finalTweetId,
        });

        // Rate limit: wait 2 seconds between tweets
        if (publications.indexOf(pub) < publications.length - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[Auto-Tweet] Failed for "${pub.title}":`,
          errorMsg
        );

        // Mark as attempted to avoid retrying indefinitely
        // We set tweetedAt even on failure to prevent retry loops
        // (change this if you want retry logic)
        await prisma.thinkTankPublication.update({
          where: { id: pub.id },
          data: { tweetedAt: new Date() },
        });

        results.push({
          id: pub.id,
          title: pub.title,
          success: false,
          error: errorMsg,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    return NextResponse.json({
      success: true,
      tweeted: successCount,
      failed: failCount,
      results,
    });
  } catch (error) {
    console.error("[Auto-Tweet] Cron error:", error);
    return NextResponse.json(
      { error: "Auto-tweet cron failed" },
      { status: 500 }
    );
  }
}
