$env:Path = $env:Path + ';C:\Program Files\nodejs'
Write-Host "Node version: $(node -v)"
# Install dependencies
npm ci
# Build Windows installer
npm run desktop:build:win
