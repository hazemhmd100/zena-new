$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Start-Process -FilePath (Join-Path $root "index.html")
  return
}

Start-Process -WindowStyle Minimized -FilePath "node" -ArgumentList @("server.cjs") -WorkingDirectory $root
Start-Sleep -Seconds 2
Start-Process "http://localhost:5509/"
