#!/bin/bash

# QUICK FINALIZATION SCRIPT
echo "🚀 Finalizing 3-Tier Implementation..."

# 1. Database Migration
echo "📊 Running database migration..."
npx prisma migrate dev --name 3-tier-pricing
npx prisma generate

# 2. Build Check
echo "🔨 Checking build..."
npm run build

# 3. Test New Routes
echo "🧪 Testing API routes..."
curl -X GET http://localhost:3000/api/subscription/status
curl -X GET http://localhost:3000/api/public/briefs

echo "✅ Implementation complete!"
echo "🎯 Ready for testing: http://localhost:3000"
