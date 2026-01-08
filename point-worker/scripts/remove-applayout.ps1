# Script to remove AppLayout imports and wrappers from pages
$files = @(
    "app\(app)\activity\purchases\page.tsx",
    "app\(app)\admin\page.tsx",
    "app\(app)\admin\analytics\page.tsx",
    "app\(app)\admin\payouts\page.tsx",
    "app\(app)\admin\promo-codes\page.tsx",
    "app\(app)\admin\purchases\page.tsx",
    "app\(app)\admin\raffles\page.tsx",
    "app\(app)\admin\raffles\create\page.tsx",
    "app\(app)\admin\raffles\edit\[id]\page.tsx",
    "app\(app)\admin\streams\page.tsx",
    "app\(app)\admin\users\page.tsx",
    "app\(app)\admin\wheel\page.tsx",
    "app\(app)\analytics\page.tsx",
    "app\(app)\chat\page.tsx",
    "app\(app)\referrals\page.tsx",
    "app\(app)\streams\page.tsx",
    "app\(app)\streams\[sessionId]\page.tsx"
)

foreach ($file in $files) {
    $fullPath = Join-Path $PSScriptRoot ".." $file
    if (Test-Path $fullPath) {
        Write-Host "Processing $file"
        $content = Get-Content $fullPath -Raw

        # Remove import statements
        $content = $content -replace "(?m)^import\s+AppLayout\s+from\s+['""].*?['""]\s*\r?\n", ""
        $content = $content -replace "(?m)^import\s+.*?AppLayout.*?\r?\n", ""

        # Remove <AppLayout> opening tags
        $content = $content -replace "<AppLayout>", ""
        $content = $content -replace "<AppLayout\s*>", ""

        # Remove </AppLayout> closing tags
        $content = $content -replace "</AppLayout>", ""

        Set-Content -Path $fullPath -Value $content -NoNewline
    }
}

Write-Host "Done!"
