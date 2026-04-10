import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withValidation, withRateLimit, rateLimitConfigs, ContactSchema } from '@/lib/validation';
import { sendContactEmail } from '@/lib/email';

/**
 * POST /api/contact
 * 
 * Handle contact form submissions
 */
export async function POST(req: NextRequest) {
  return withRateLimit(
    rateLimitConfigs.api,
    withValidation(ContactSchema, async (data, req) => {
      try {
        // Send contact email
        await sendContactEmail(data.email, data.subject, `<p>${data.message}</p><p>From: ${data.name}</p>`);

        return NextResponse.json({
          success: true,
          message: 'Your message has been sent successfully. We\'ll get back to you soon!',
        });

      } catch (error: any) {
        console.error('[Contact API] Error:', error);
        
        // Handle specific email service errors
        if (error.message?.includes('Email service unavailable')) {
          return NextResponse.json(
            { error: 'Email service temporarily unavailable. Please try again later.' },
            { status: 503 }
          );
        }

        if (error.message?.includes('Invalid email address')) {
          return NextResponse.json(
            { error: 'Invalid email address provided' },
            { status: 400 }
          );
        }

        return NextResponse.json(
          { error: 'Failed to send message. Please try again later.' },
          { status: 500 }
        );
      }
    })
  )(req);
}
