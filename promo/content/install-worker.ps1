param(
  [string]$Server = 'root@185.11.247.137',
  [string]$StateDirectory = (Join-Path $env:USERPROFILE '.codex\content-worker')
)
$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node = (Get-Command node).Source
$codex = (Get-Command codex).Source
$ssh = (Get-Command ssh).Source
New-Item -ItemType Directory -Force -Path $StateDirectory | Out-Null
icacls $StateDirectory /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
$settingsPath = Join-Path $StateDirectory 'settings.json'
@{ repository = $repository; host = $Server; codex = $codex; ssh = $ssh; pollSeconds = 15; worker = $env:COMPUTERNAME } |
  ConvertTo-Json | Set-Content -LiteralPath $settingsPath -Encoding utf8
# WScript waits for Node, keeps the task running, and hides the console window.
$launchPath = Join-Path $StateDirectory 'launch.vbs'
$commandLine = '"' + $node + '" "' + (Join-Path $PSScriptRoot 'worker.mjs') + '" "' + $settingsPath + '"'
$vbs = 'CreateObject("WScript.Shell").Run "' + $commandLine.Replace('"', '""') + '", 0, True'
[IO.File]::WriteAllText($launchPath, $vbs, [Text.Encoding]::Unicode)
$action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\wscript.exe') -Argument ('"' + $launchPath + '"')
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $principal.UserId
Register-ScheduledTask -TaskName 'Nikitenok Content Worker' -Action $action -Principal $principal -Trigger $trigger -Settings $settings -Description 'Prepare Telegram content using local ChatGPT Codex login; render in GitHub Actions.' -Force | Out-Null
Start-ScheduledTask -TaskName 'Nikitenok Content Worker'
Write-Output "Content worker installed. Settings and logs: $StateDirectory"
