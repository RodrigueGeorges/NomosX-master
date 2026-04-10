
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { withAuth, withRateLimit, rateLimitConfigs, commonSchemas } from '@/lib/validation';

// Share options schema
const ShareSchema = z.object({
  expiresIn: z.enum(['1h', '24h', '7d', 'never']).default('7d'),
  allowDownload: z.boolean().default(false),
  password: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    withRateLimit(
      rateLimitConfigs.api,
      async (req) => {
        try {
          const { id } = await params;
          
          // Validate ID format
          const idValidation = commonSchemas.id.safeParse({ id });
          if (!idValidation.success) {
            return NextResponse.json(
              { error: 'Invalid brief ID format' },
              { status: 400 }
            );
          }

          // Parse and validate request body
          let shareOptions;
          try {
            const body = await req.json().catch(() => ({}));
            const validation = ShareSchema.safeParse(body);
            if (!validation.success) {
              return NextResponse.json(
                { 
                  error: 'Invalid share options',
                  details: validation.error.errors 
                },
                { status: 400 }
              );
            }
            shareOptions = validation.data;
          } catch (error) {
            // If body parsing fails, use defaults
            shareOptions = { expiresIn: '7d', allowDownload: false };
          }

          // Check user authentication
          const session = await getSession();
          if (!session?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          }

          // Verify user owns the brief
          const user = await prisma.user.findUnique({
            where: { email: session.email },
          });

          if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
          }

          // Fetch brief
          const brief = await prisma.brief.findUnique({
            where: { id: idValidation.data.id },
          });

          if (!brief) {
            return NextResponse.json(
              { error: 'Brief not found' },
              { status: 404 }
            );
          }

          // Generate or retrieve public ID
          let publicId = brief.publicId;
          if (!publicId) {
            // Generate a unique public ID
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 8);
            publicId = `${timestamp}-${random}`;
            
            await prisma.brief.update({
              where: { id: idValidation.data.id },
              data: { publicId },
            });
          }

          // Calculate expiration date
          let expiresAt: Date | null = null;
          if (shareOptions.expiresIn !== 'never') {
            const now = new Date();
            switch (shareOptions.expiresIn) {
              case '1h':
                expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
                break;
              case '24h':
                expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                break;
              case '7d':
                expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                break;
            }
          }

          // Store share metadata (could be in a separate shares table for more features)
          const shareData = {
            publicId,
            briefId: idValidation.data.id,
            userId: user.id,
            allowDownload: shareOptions.allowDownload,
            password: shareOptions.password,
            expiresAt,
            createdAt: new Date(),
          };

          // For now, return the share link
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';
          const shareUrl = `${baseUrl}/shared/${publicId}`;

          return NextResponse.json({
            success: true,
            shareUrl,
            publicId,
            expiresAt,
            shareOptions: {
              expiresIn: shareOptions.expiresIn,
              allowDownload: shareOptions.allowDownload,
              hasPassword: !!shareOptions.password,
            },
          });

        } catch (error: any) {
          console.error('[API /briefs/[id]/share POST] Error:', error);
          
          // Handle specific database errors
          if (error.code === 'P2002') {
            return NextResponse.json(
              { error: 'Failed to generate unique share link' },
              { status: 500 }
            );
          }

          return NextResponse.json(
            { error: 'Failed to create share link' },
            { status: 500 }
          );
        }
      }
    )
  )(req);
}

// GET /api/briefs/[id]/share - Get share information
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    withRateLimit(
      rateLimitConfigs.api,
      async (req) => {
        try {
          const { id } = await params;
          
          // Validate ID format
          const idValidation = commonSchemas.id.safeParse({ id });
          if (!idValidation.success) {
            return NextResponse.json(
              { error: 'Invalid brief ID format' },
              { status: 400 }
            );
          }

          // Check user authentication
          const session = await getSession();
          if (!session?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          }

          // Verify user owns the brief
          const user = await prisma.user.findUnique({
            where: { email: session.email },
          });

          if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
          }

          // Fetch brief
          const brief = await prisma.brief.findUnique({
            where: { id: idValidation.data.id },
            select: {
              id: true,
              publicId: true,
              question: true,
              createdAt: true,
            },
          });

          if (!brief) {
            return NextResponse.json(
              { error: 'Brief not found' },
              { status: 404 }
            );
          }

          // Return share information
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nomosx.com';
          const shareUrl = brief.publicId ? `${baseUrl}/shared/${brief.publicId}` : null;

          return NextResponse.json({
            id: brief.id,
            publicId: brief.publicId,
            shareUrl,
            question: brief.question,
            createdAt: brief.createdAt,
            isShared: !!brief.publicId,
          });

        } catch (error: any) {
          console.error('[API /briefs/[id]/share GET] Error:', error);
          return NextResponse.json(
            { error: 'Failed to fetch share information' },
            { status: 500 }
          );
        }
      }
    )
  )(req);
}
