@echo off
set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nomosx_local?schema=public
echo === Seeding verticals ===
npx tsx scripts/seed-verticals-local.ts > scripts\seed-log.txt 2>&1
echo EXIT_CODE=%ERRORLEVEL% >> scripts\seed-log.txt
echo === Done ===
