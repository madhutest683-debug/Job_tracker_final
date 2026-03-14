#!/bin/bash

echo ""
echo "╔════════════════════════════════════════╗"
echo "║     Job Tracker — Setup & Deploy       ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Check Node
if ! command -v node &> /dev/null; then
  echo "❌  Node.js not found."
  echo "    Download from: https://nodejs.org (choose LTS)"
  echo "    Then run this script again."
  exit 1
fi

echo "✓  Node.js $(node -v) found"

# Install dependencies
echo ""
echo "📦  Installing dependencies..."
npm install

# Check Vercel CLI
if ! command -v vercel &> /dev/null; then
  echo ""
  echo "📡  Installing Vercel CLI..."
  npm install -g vercel
fi

echo ""
echo "🚀  Deploying to Vercel..."
echo "    (Sign up / log in when prompted)"
echo ""
vercel --prod

echo ""
echo "════════════════════════════════════════"
echo "✅  DONE! Your app is live."
echo ""
echo "📱  TO INSTALL ON ANDROID:"
echo "    1. Open the URL above in Chrome on your phone"
echo "    2. Tap ⋮ menu → 'Add to Home Screen'"
echo "    3. Tap Add"
echo "════════════════════════════════════════"
echo ""
