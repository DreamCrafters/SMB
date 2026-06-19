param(
  [string]$TaskName = "SMB Monitor Remote Server",
  [ValidateSet("AtLogOn", "AtStartup")]
  [string]$Trigger = "AtLogOn"
)

# Registers SMB Monitor remote API as a Windows scheduled task.
$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$startScript = Resolve-Path (Join-Path $PSScriptRoot "start-remote-server.ps1")

if (-not (Test-Path $startScript)) {
  throw "Start script was not found: $startScript"
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$($startScript.Path)`""

if ($Trigger -eq "AtStartup") {
  $taskTrigger = New-ScheduledTaskTrigger -AtStartup
} else {
  $taskTrigger = New-ScheduledTaskTrigger -AtLogOn
}

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $taskTrigger `
  -Settings $settings `
  -Description "Starts SMB Monitor PostgreSQL and backend API from $projectRoot." `
  -Force | Out-Null

Write-Host "Registered scheduled task '$TaskName' with trigger '$Trigger'."
Write-Host "Logs: $(Join-Path $projectRoot 'logs\remote-api.log')"
