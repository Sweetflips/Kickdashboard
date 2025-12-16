# PowerShell script to update Railway point-worker service configuration

Write-Host "🚀 Updating Railway point-worker service configuration..." -ForegroundColor Cyan

# Check if Railway CLI is installed
try {
    $null = Get-Command railway -ErrorAction Stop
    Write-Host "✅ Railway CLI found" -ForegroundColor Green
} catch {
    Write-Host "❌ Railway CLI not found. Installing..." -ForegroundColor Yellow
    npm install -g @railway/cli
}

# Login (will open browser)
Write-Host "🔐 Please login to Railway..." -ForegroundColor Cyan
npx @railway/cli login

# Link to project (if not already linked)
Write-Host "🔗 Linking to Railway project..." -ForegroundColor Cyan
npx @railway/cli link

# List services to find point-worker
Write-Host "📋 Finding point-worker service..." -ForegroundColor Cyan
npx @railway/cli service list

Write-Host ""
Write-Host "✅ Configuration file updated: railway-worker.json" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next steps:" -ForegroundColor Yellow
Write-Host "1. Go to Railway Dashboard → point-worker service"
Write-Host "2. Scroll to 'Config-as-code' section"
Write-Host "3. Click 'Add File Path' and enter: railway-worker.json"
Write-Host "4. Click 'Update'"
Write-Host ""
Write-Host "Or manually update in dashboard:" -ForegroundColor Yellow
Write-Host "- Builder: Change from 'Nixpacks' to 'Dockerfile'"
Write-Host "- Healthcheck Path: Change from '/' to '/health'"
Write-Host "- Healthcheck Timeout: Set to 5000"










