import 'dotenv/config';
import { PrismaClient } from '../generated/prisma-client';

const prisma = new PrismaClient();

async function main() {
  const brief = await prisma.brief.findFirst({
    where: { id: 'cmkzyvavl0000gk5bz60cdoho' },
  });
  
  if (!brief) {
    console.log('Brief not found');
    return;
  }
  
  console.log('=== BRIEF ===');
  console.log('ID:', brief.id);
  console.log('Question:', brief.question);
  console.log('Public ID:', brief.publicId);
  console.log('Sources:', brief.sources.length);
  console.log('\n=== HTML CONTENT ===\n');
  console.log(brief.html);
}

main().finally(() => prisma.$disconnect());
