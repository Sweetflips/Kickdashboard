#!/bin/bash
# Script to update Railway point-worker service configuration

echo "🚀 Updating Railway point-worker service configuration..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Login (will open browser)
echo "🔐 Please login to Railway..."
railway login

# Link to project (if not already linked)
echo "🔗 Linking to Railway project..."
railway link

# List services to find point-worker
echo "📋 Finding point-worker service..."
railway service list

# Update service configuration
echo "⚙️  Updating point-worker service configuration..."
railway service --service point-worker

# Set build configuration via variables (Railway CLI doesn't directly support config-as-code updates)
# So we'll need to use the dashboard or Railway API
echo ""
echo "✅ Configuration file updated: railway-worker.json"
echo ""
echo "📝 Next steps:"
echo "1. Go to Railway Dashboard → point-worker service"
echo "2. Scroll to 'Config-as-code' section"
echo "3. Click 'Add File Path' and enter: railway-worker.json"
echo "4. Click 'Update'"
echo ""
echo "Or manually update in dashboard:"
echo "- Builder: Change from 'Nixpacks' to 'Dockerfile'"
echo "- Healthcheck Path: Change from '/' to '/health'"
echo "- Healthcheck Timeout: Set to 5000"










