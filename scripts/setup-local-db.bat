@echo off
set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nomosx_local?schema=public
echo Pushing Prisma schema to local DB...
call npx prisma db push --skip-generate --accept-data-loss
echo Done. Exit code: %ERRORLEVEL%
