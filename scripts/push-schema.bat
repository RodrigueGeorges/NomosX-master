@echo off
set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nomosx_local?schema=public
npx prisma db push --skip-generate --accept-data-loss > scripts\db-push-log.txt 2>&1
echo EXIT_CODE=%ERRORLEVEL% >> scripts\db-push-log.txt
