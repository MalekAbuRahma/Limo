param(
  [string]$ServerHost = '147.93.122.6',
  [string]$User = 'root',
  [string]$Password = $env:DEPLOY_SSH_PASSWORD,
  [string]$RemoteDir = '/opt/fleetflow',
  [int]$AppPort = 8080
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot

$deployEnvFile = Join-Path $PSScriptRoot '.env.deploy'
if (-not $Password -and (Test-Path $deployEnvFile)) {
  Get-Content $deployEnvFile | ForEach-Object {
    if ($_ -match '^\s*DEPLOY_SSH_PASSWORD\s*=\s*(.+)\s*$') {
      $Password = $matches[1].Trim().Trim('"').Trim("'")
    }
  }
}

if (-not $Password) {
  throw 'Set DEPLOY_SSH_PASSWORD, pass -Password, or add deploy/.env.deploy (see deploy/.env.deploy.example)'
}

if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
  Install-Module -Name Posh-SSH -Force -Scope CurrentUser -AllowClobber
}
Import-Module Posh-SSH

$sec = ConvertTo-SecureString $Password -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($User, $sec)

Write-Host "Connecting to ${User}@${ServerHost}..."
$session = New-SSHSession -ComputerName $ServerHost -Credential $cred -AcceptKey -Force
if (-not $session) { throw 'SSH connection failed' }

function Invoke-Remote([string]$cmd, [int]$TimeOutSec = 600) {
  $r = Invoke-SSHCommand -SessionId $session.SessionId -Command $cmd -TimeOut $TimeOutSec
  if ($r.ExitStatus -ne 0) {
    Write-Host $r.Output
    Write-Host $r.Error
    throw "Remote command failed ($($r.ExitStatus)): $cmd"
  }
  return $r.Output
}

Write-Host 'Installing Docker (if needed)...'
$setup = Get-Content (Join-Path $PSScriptRoot 'setup-server.sh') -Raw
$setupB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($setup))
Invoke-Remote "echo $setupB64 | base64 -d | tr -d '\r' | bash"

Write-Host 'Packaging application...'
$archive = Join-Path $env:TEMP 'fleetflow-deploy.tar.gz'
if (Test-Path $archive) { Remove-Item $archive -Force }
Push-Location $ProjectRoot
$tarOk = $false
foreach ($fmt in @(@('--format', 'gnu'), @('--format', 'ustar'), @())) {
  if (Test-Path $archive) { Remove-Item $archive -Force }
  $tarArgs = @('-czf', $archive) + $fmt + @(
    '--exclude=node_modules', '--exclude=dist', '--exclude=.git',
    '--exclude=data', '--exclude=.env', '--exclude=.env.local', '--exclude=.env.deploy',
    '--exclude=deploy/node_modules', '--exclude=.cursor', '--exclude=*.bat', '.'
  )
  & tar @tarArgs
  if ($LASTEXITCODE -eq 0 -and (Test-Path $archive)) { $tarOk = $true; break }
}
if (-not $tarOk) {
  Pop-Location
  throw 'Failed to create archive (tar required on Windows 10+)'
}
Pop-Location

Write-Host 'Uploading to server...'
Set-SCPItem -ComputerName $ServerHost -Credential $cred -Path $archive -Destination '/tmp/fleetflow-deploy.tar.gz' -AcceptKey -Force
Invoke-Remote "cp -f ${RemoteDir}/.env /tmp/fleetflow.env.bak 2>/dev/null || true"
Invoke-Remote "mkdir -p $RemoteDir && tar -xzf /tmp/fleetflow-deploy.tar.gz -C $RemoteDir && rm -f /tmp/fleetflow-deploy.tar.gz"
Invoke-Remote "test -f /tmp/fleetflow.env.bak && cp -f /tmp/fleetflow.env.bak ${RemoteDir}/.env && chmod 600 ${RemoteDir}/.env && rm -f /tmp/fleetflow.env.bak || true"

$hasEnv = (Invoke-Remote "test -f ${RemoteDir}/.env && grep -q '^POSTGRES_PASSWORD=.' ${RemoteDir}/.env && echo yes || echo no").Trim()
if ($hasEnv -ne 'yes') {
  Write-Host 'Creating new server .env (first deploy)...'
  $pgPass = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
  $envContent = @"
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$pgPass
POSTGRES_DB=vip_limousine_cars
APP_PORT=$AppPort
GEMINI_API_KEY=
"@
  $envPath = Join-Path $env:TEMP 'fleetflow.env'
  Set-Content -Path $envPath -Value $envContent -NoNewline
  Set-SCPItem -ComputerName $ServerHost -Credential $cred -Path $envPath -Destination "${RemoteDir}/.env" -AcceptKey -Force
} else {
  Write-Host 'Keeping existing server .env (database password unchanged).'
}

Write-Host 'Building and starting containers (may take several minutes)...'
Invoke-Remote "cd $RemoteDir && docker compose --env-file .env -f docker-compose.prod.yml up -d --build" -TimeOutSec 900

$health = Invoke-Remote "for i in 1 2 3 4 5 6; do curl -sf http://127.0.0.1:${AppPort}/api/health && exit 0; sleep 3; done; exit 1"
Write-Host "Health: $health"
Write-Host ''
Write-Host "Deployed: http://${ServerHost}:${AppPort}/"

Remove-SSHSession -SessionId $session.SessionId | Out-Null
