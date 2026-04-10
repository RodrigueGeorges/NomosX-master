
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendDigestEmail } from '@/lib/email';

// POST /api/digests/send - Send digest to subscribers
export async function POST(req: Request) {
  const admin = req.headers.get("x-admin-key") || "";
  const required = process.env.ADMIN_KEY || "";
  if (!required || admin !== required) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const { digestId } = await req.json();
    
    if (!digestId) {
      return NextResponse.json(
        { error: "digestId required" },
        { status: 400 }
      );
    }

    // Get digest with topic and subscriptions
    const digest = await prisma.digest.findUnique({
      where: { id: digestId },
      include: {
        topic: {
          include: {
            subscriptions: {
              where: { isActive: true },
            },
          },
        },
      },
    });

    if (!digest) {
      return NextResponse.json({ error: "Digest not found" }, { status: 404 });
    }

    if (digest.sentAt) {
      return NextResponse.json(
        { error: "Digest already sent" },
        { status: 409 }
      );
    }

    // Get subscriber emails
    const recipients = digest.topic.subscriptions.map(sub => sub.email);

    if (recipients.length === 0) {
      return NextResponse.json(
        { message: "No subscribers", sent: 0, failed: 0 },
        { status: 200 }
      );
    }

    // Send emails
    const result = await sendDigestEmail(
      recipients.join(','), // Convert array to comma-separated string for 'to' parameter
      digest.subject,
      digest.html
    );

    // Update digest
    await prisma.digest.update({
      where: { id: digestId },
      data: { sentAt: new Date() },
    });

    return NextResponse.json({
      success: result.success,
      sent: result.success ? recipients.length : 0,
      failed: result.success ? 0 : recipients.length,
      recipients: recipients.length,
      error: result.error,
    });
  } catch (error: any) {
    console.error("[Digest Send] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
