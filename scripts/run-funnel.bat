@echo off
set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nomosx_local?schema=public
echo === Launching full funnel test (breaking mode) ===
echo This will take 25-40 minutes...
npx tsx scripts/test-funnel.ts breaking > scripts\funnel-log.txt 2>&1
echo EXIT_CODE=%ERRORLEVEL% >> scripts\funnel-log.txt
echo === Done ===
