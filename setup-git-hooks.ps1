# OpenCode Git Hooks Setup - Windows PowerShell
# Run with: powershell -ExecutionPolicy Bypass -File .\setup-git-hooks.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "Node.js is required." -ForegroundColor Red
    exit 1
}

& node "$PSScriptRoot\scripts\install-git-hooks.mjs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nGit hooks installed. For global plugin, run install.ps1 first." -ForegroundColor Cyan
