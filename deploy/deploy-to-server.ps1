param(
  [string]$ServerHost = '147.93.122.6',
  [string]$User = 'root',
  [string]$Password = $env:DEPLOY_SSH_PASSWORD,
  [string]$RemoteDir = '/opt/fleetflow',
  [int]$AppPort = 8080
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot

if (-not $Password) {
  throw 'Set DEPLOY_SSH_PASSWORD or pass -Password'
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

function Invoke-Remote([string]$cmd) {
  $r = Invoke-SSHCommand -SessionId $session.SessionId -Command $cmd -TimeOut 600
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
Invoke-Remote "echo $setupB64 | base64 -d | bash"

Write-Host 'Packaging application...'
$archive = Join-Path $env:TEMP "fleetflow-deploy.tar.gz"
if (Test-Path $archive) { Remove-Item $archive -Force }
Push-Location $ProjectRoot
tar -czf $archive `
  --exclude=node_modules --exclude=dist --exclude=.git `
  --exclude='*.bat' --exclude=data `
  .
if (-not (Test-Path $archive)) {
  Pop-Location
  throw 'Failed to create archive (tar required on Windows 10+)'
}
Pop-Location

Write-Host 'Uploading to server...'
Set-SCPItem -ComputerName $ServerHost -Credential $cred -Path $archive -Destination '/tmp/fleetflow-deploy.tar.gz' -AcceptKey -Force
Invoke-Remote "mkdir -p $RemoteDir && tar -xzf /tmp/fleetflow-deploy.tar.gz -C $RemoteDir && rm -f /tmp/fleetflow-deploy.tar.gz"

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

Write-Host 'Building and starting containers (may take several minutes)...'
Invoke-Remote "cd $RemoteDir && docker compose -f docker-compose.prod.yml up -d --build"

$health = Invoke-Remote "curl -sf http://127.0.0.1/api/health || curl -sf http://127.0.0.1:${AppPort}/api/health"
Write-Host "Health: $health"
Write-Host ''
Write-Host "Deployed: http://${ServerHost}/"
Write-Host "PostgreSQL password saved in ${RemoteDir}/.env on the server."
Write-Host "DB volume: fleetflow_pgdata"

Remove-SSHSession -SessionId $session.SessionId | Out-Null
