# Kill all local Discord/Letta listeners
# Run this in PowerShell before Railway goes live

Write-Host "Killing PM2..." -ForegroundColor Yellow
pm2 stop all 2>$null
pm2 delete all 2>$null
pm2 kill 2>$null

Write-Host "Killing channel server processes..." -ForegroundColor Yellow
Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -match "server --channels|pm2|ProcessContainerFork|letta"
  } |
  ForEach-Object {
    Write-Host "Killing PID $($_.ProcessId): $($_.CommandLine)" -ForegroundColor Red
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

Write-Host "Done. Railway is now the only listener." -ForegroundColor Green
