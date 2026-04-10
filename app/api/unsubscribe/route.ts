import { NextRequest,NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/unsubscribe?email=xxx
 * 
 * Unsubscribe user from weekly email briefs
 * Called from email unsubscribe link
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "Email parameter required" },
        { status: 400 }
      );
    }

    // Update user email preferences
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailEnabled: false,
        emailFrequency: "NEVER",
      },
    });

    // Return HTML page
    return new NextResponse(
      `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribed - NomosX</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0B0B0D 0%, #1A1A28 100%);
      color: #ffffff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      max-width: 500px;
      padding: 40px;
      text-align: center;
    }
    .icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 30px;
      background: rgba(99, 102, 241, 0.1);
      border: 2px solid rgba(99, 102, 241, 0.3);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
    }
    h1 {
      font-size: 28px;
      font-weight: 300;
      margin-bottom: 20px;
      color: #6366F1;
    }
    p {
      font-size: 16px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 30px;
    }
    .button {
      display: inline-block;
      padding: 12px 30px;
      background: linear-gradient(135deg, #6366F1 0%, #7C3AED 100%);
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
      transition: opacity 0.2s;
    }
    .button:hover {
      opacity: 0.9;
    }
    .footer {
      margin-top: 40px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.4);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✓</div>
    <h1>You've Been Unsubscribed</h1>
    <p>
      You will no longer receive weekly intelligence briefs from NomosX.<br>
      We're sorry to see you go.
    </p>
    <p style="font-size: 14px;">
      You can re-enable email notifications anytime from your dashboard preferences.
    </p>
    <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/preferences" class="button">
      Manage Preferences
    </a>
    <div class="footer">
      NomosX · The Autonomous Think Tank
    </div>
  </div>
</body>
</html>
      `,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html",
        },
      }
    );
  } catch (error: any) {
    console.error("[Unsubscribe API] Error:", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe" },
      { status: 500 }
    );
  }
}
