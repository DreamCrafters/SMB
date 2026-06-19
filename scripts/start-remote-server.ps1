# Starts the persistent Windows remote-server profile for SMB Monitor.
$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$logDir = Join-Path $projectRoot "logs"
$apiLog = Join-Path $logDir "remote-api.log"

function Assert-Command {
  param([Parameter(Mandatory = $true)][string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is not available in PATH. Install it, then open a new PowerShell window."
  }
}

function Write-LogLine {
  param([Parameter(Mandatory = $true)][string]$Message)

  "[$(Get-Date -Format o)] $Message" | Out-File -FilePath $apiLog -Append -Encoding utf8
}

function Wait-DockerEngine {
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    docker info *> $null

    if ($LASTEXITCODE -eq 0) {
      return
    }

    Start-Sleep -Seconds 5
  }

  throw "Docker engine is not running. Start Docker Desktop and try again."
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Assert-Command "docker"
Assert-Command "npm.cmd"

Push-Location $projectRoot
try {
  Write-LogLine "Waiting for Docker engine."
  Wait-DockerEngine

  Write-LogLine "Starting PostgreSQL container."
  docker compose up -d postgres *>> $apiLog

  Write-LogLine "Building backend API."
  npm.cmd --workspace server run build *>> $apiLog

  Write-LogLine "Starting backend API."
  npm.cmd --workspace server start *>> $apiLog
} finally {
  Pop-Location
}
