
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const createTopicSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  query: z.string().min(1, 'Query is required').max(1000),
  tags: z.array(z.string()).optional(),
  description: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/topics - List all topics
export async function GET() {
  try {
    const topics = await prisma.topic.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            briefs: true,
            subscriptions: true,
            digests: true,
          },
        },
      },
    });
    
    return NextResponse.json({ topics });
  } catch (error: any) {
    console.error("[Topics GET] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/topics - Create new topic
export async function POST(req: Request) {
  const admin = req.headers.get("x-admin-key") || "";
  const required = process.env.ADMIN_KEY || "";
  if (!required || admin !== required) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validation = createTopicSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }
    const { name, query, tags, description, isActive } = validation.data;

    const topic = await prisma.topic.create({
      data: {
        name,
        query,
        tags: tags || [],
        description: description || null,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    return NextResponse.json({ topic }, { status: 201 });
  } catch (error: any) {
    console.error("[Topics POST] Error:", error);
    
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "A topic with this name already exists" },
        { status: 409 }
      );
    }
    
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
