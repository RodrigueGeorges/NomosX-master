import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { z } from 'zod';
import { withAuth, withRateLimit, rateLimitConfigs, commonSchemas } from '@/lib/validation';

// GET /api/briefs/[id] - Get a specific brief
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

          const brief = await prisma.brief.findUnique({
            where: { id: idValidation.data.id },
            select: {
              id: true,
              publicId: true,
              question: true,
              kind: true,
              html: true,
              sources: true,
              createdAt: true,
              updatedAt: true,
            },
          });

          if (!brief) {
            return NextResponse.json(
              { error: 'Brief not found' },
              { status: 404 }
            );
          }

          return NextResponse.json({ brief });
        } catch (error: any) {
          console.error('[API /briefs/[id] GET] Error:', error);
          return NextResponse.json(
            { error: 'Failed to fetch brief' },
            { status: 500 }
          );
        }
      }
    )
  )(req);
}

// DELETE /api/briefs/[id] - Delete a specific brief
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(
    withRateLimit(
      rateLimitConfigs.auth,
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

          // Check if brief exists
          const existingBrief = await prisma.brief.findUnique({
            where: { id: idValidation.data.id },
          });

          if (!existingBrief) {
            return NextResponse.json(
              { error: 'Brief not found' },
              { status: 404 }
            );
          }

          // Delete the brief
          await prisma.brief.delete({
            where: { id: idValidation.data.id },
          });

          return NextResponse.json({
            success: true,
            message: 'Brief deleted successfully',
          });
        } catch (error: any) {
          console.error('[API /briefs/[id] DELETE] Error:', error);
          return NextResponse.json(
            { error: 'Failed to delete brief' },
            { status: 500 }
          );
        }
      }
    )
  )(req);
}
