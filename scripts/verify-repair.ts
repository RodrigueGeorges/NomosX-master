import { config } from 'dotenv';
config({ path: '.env.local' });
async function main() {
  const { prisma } = await import('../lib/db');
  const pub = await prisma.thinkTankPublication.findUnique({ where: { id: 'cmubiqrwu01a02mshykc4358i' } });
  const h = pub!.html;
  console.log('len:', h.length);
  console.log('<style>:', (h.match(/<style/g) || []).length, '| </style>:', (h.match(/<\/style>/g) || []).length);
  console.log('</head>:', h.includes('</head>'), '| <body>:', h.includes('<body'), '| <article:', h.includes('<article'), '| </article>:', h.includes('</article>'));
  console.log('h1:', /<h1[^>]*>/.test(h));
  console.log('non établie count:', (h.match(/non établie/g) || []).length);
  console.log('#111111 back:', h.includes('#111111'));
  // numerical gate re-check
  const { runNumericalGate } = await import('../lib/agent/style-gates');
  const r = runNumericalGate(h, 36);
  console.log('numgate violations:', r.violations.length, r.violations.slice(0,8).map(v=>v.match));
  await prisma.$disconnect();
}
main();
