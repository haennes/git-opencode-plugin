# Install opencode-git-tools as a global OpenCode plugin
# Usage: powershell -ExecutionPolicy Bypass -File .\install-global.ps1

Write-Host "Installing opencode-git-tools globally..." -ForegroundColor Cyan

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "Node.js is required. Install Node.js or use: bun run scripts/install-global.mjs" -ForegroundColor Red
    exit 1
}

& node "$PSScriptRoot\scripts\install-global.mjs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nRestart OpenCode to activate the plugin." -ForegroundColor Green