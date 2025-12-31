# Windows Firewall Configuration Script for Office Management System
# Run this script as Administrator

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Office Management System - Firewall Fix" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "Adding firewall rule for port 8002..." -ForegroundColor Yellow

# Remove existing rule if it exists
$existingRule = Get-NetFirewallRule -DisplayName "Office Management Backend" -ErrorAction SilentlyContinue
if ($existingRule) {
    Write-Host "Removing existing rule..." -ForegroundColor Yellow
    Remove-NetFirewallRule -DisplayName "Office Management Backend" -ErrorAction SilentlyContinue
}

# Add new firewall rule for inbound connections
try {
    New-NetFirewallRule -DisplayName "Office Management Backend" `
        -Direction Inbound `
        -LocalPort 8002 `
        -Protocol TCP `
        -Action Allow `
        -Profile Domain,Private,Public `
        -Description "Allows incoming connections to Office Management System backend on port 8002"
    
    Write-Host "✅ Firewall rule added successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Error adding firewall rule: $_" -ForegroundColor Red
    pause
    exit 1
}

# Verify the rule was added
Write-Host ""
Write-Host "Verifying firewall rule..." -ForegroundColor Yellow
$rule = Get-NetFirewallRule -DisplayName "Office Management Backend" -ErrorAction SilentlyContinue
if ($rule) {
    Write-Host "✅ Firewall rule verified!" -ForegroundColor Green
    Write-Host "   Rule Name: $($rule.DisplayName)" -ForegroundColor Gray
    Write-Host "   Direction: $($rule.Direction)" -ForegroundColor Gray
    Write-Host "   Enabled: $($rule.Enabled)" -ForegroundColor Gray
} else {
    Write-Host "❌ Could not verify firewall rule" -ForegroundColor Red
}

Write-Host ""
Write-Host "Checking if port 8002 is listening..." -ForegroundColor Yellow
$listening = netstat -ano | findstr ":8002" | findstr "LISTENING"
if ($listening) {
    Write-Host "✅ Port 8002 is listening!" -ForegroundColor Green
    Write-Host "   $listening" -ForegroundColor Gray
    
    # Check if it's listening on 0.0.0.0 or 127.0.0.1
    if ($listening -match "0\.0\.0\.0:8002") {
        Write-Host "✅ Backend is listening on all interfaces (0.0.0.0) - Good!" -ForegroundColor Green
    } elseif ($listening -match "127\.0\.0\.1:8002") {
        Write-Host "⚠️  WARNING: Backend is only listening on localhost (127.0.0.1)" -ForegroundColor Yellow
        Write-Host "   Other devices won't be able to connect!" -ForegroundColor Yellow
        Write-Host "   Make sure to start backend with: --host 0.0.0.0" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  Port 8002 is not listening" -ForegroundColor Yellow
    Write-Host "   Make sure the backend is running!" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Firewall configuration complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Make sure backend is running with: --host 0.0.0.0 --port 8002" -ForegroundColor White
Write-Host "2. Test from another PC: http://192.168.1.4:8002/health" -ForegroundColor White
Write-Host "3. If still not working, check antivirus settings" -ForegroundColor White
Write-Host ""
pause

