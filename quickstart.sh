#!/bin/bash

# Kode SDK v1.5.1 - Quick Start Script

echo "🚀 Kode SDK v1.5.1 Quick Start"
echo ""

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be 18 or higher. Current: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please check for errors above."
    exit 1
fi

echo "✅ Build successful!"
echo ""

# Check for API key
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  Warning: ANTHROPIC_API_KEY environment variable is not set."
    echo "   Please set it to run examples:"
    echo "   export ANTHROPIC_API_KEY=your_key_here"
    echo ""
fi

echo "📚 Available examples:"
echo "   npm run example:u1  - Next.js backend (send + subscribe)"
echo "   npm run example:u2  - Permission approval flow"
echo "   npm run example:u3  - Hook for path guard and result trimming"
echo "   npm run example:u4  - Scheduler with time and step triggers"
echo "   npm run example:u5  - Sub-agent task delegation"
echo "   npm run example:u6  - Room group chat"
echo "   npm run example:u7  - ChatDev team collaboration"
echo ""

echo "📖 Documentation: README.md"
echo "🔍 Implementation details: IMPLEMENTATION_SUMMARY.md"
echo ""

echo "✨ Kode SDK is ready! Happy coding! ✨"
