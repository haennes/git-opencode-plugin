# Install opencode-git-tools (global OpenCode plugin + optional git hooks)
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Hooks

[CmdletBinding()]
param(
    [switch]$Hooks
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Invoke-NodeScript {
    param([string]$ScriptPath)
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        & node $ScriptPath
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        return
    }
    $bun = Get-Command bun -ErrorAction SilentlyContinue
    if ($bun) {
        & bun run $ScriptPath
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        return
    }
    Write-Host "Node.js or Bun is required." -ForegroundColor Red
    exit 1
}

Write-Host "opencode-git-tools installer" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan

Write-Host "`n[1/2] Installing global OpenCode plugin..." -ForegroundColor Green
Invoke-NodeScript "$PSScriptRoot\scripts\install-global.mjs"

if ($Hooks) {
    Write-Host "`n[2/2] Installing git pre-commit hooks in current project..." -ForegroundColor Green
    Invoke-NodeScript "$PSScriptRoot\scripts\install-git-hooks.mjs"
} else {
    Write-Host "`n[2/2] Skipped git hooks (use -Hooks to install in current repo)." -ForegroundColor Yellow
}

Write-Host "`nDone! Restart OpenCode to activate the plugin." -ForegroundColor Green
Write-Host "Verify: opencode run `"call gitStatus and show the result`"" -ForegroundColor White