# Disable git pager
$env:GIT_PAGER = 'cat'

# Add files
git add scripts/start.js package-lock.json prisma/schema.prisma scripts/create-point-award-jobs-table.js

# Commit
git commit -m "Add point_award_jobs table safety check and creation script"

# Push
git push

Write-Host "✅ Changes pushed successfully"




