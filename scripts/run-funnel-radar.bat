@echo off
cd /d C:\Users\DELL\Desktop\NomosX-master
set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nomosx_local?schema=public
echo === Full funnel with radar (breaking mode) ===
echo Started: %TIME%
node --import tsx scripts/test-funnel.ts breaking > scripts\funnel-radar-log.txt 2>&1
echo EXIT_CODE=%ERRORLEVEL% >> scripts\funnel-radar-log.txt
echo === Done: %TIME% ===
