$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $appRoot 'data/dienst.pid'
try {
    if (!(Test-Path -LiteralPath $pidFile)) { Write-Host 'Kein gestarteter Dienst in diesem Ordner.'; exit 0 }
    $serviceId = [int](Get-Content -LiteralPath $pidFile)
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $serviceId"
    $expectedRuntime = Join-Path $appRoot 'runtime/node.exe'
    $expectedEntry = Join-Path $appRoot 'server/main.mjs'
    if ($processInfo -and $processInfo.ExecutablePath -eq $expectedRuntime -and $processInfo.CommandLine.Contains($expectedEntry)) {
        Stop-Process -Id $serviceId
    } elseif ($processInfo) { throw 'Die Prozesskennung gehoert nicht mehr zu dieser Mensaampel. Es wurde nichts beendet.' }
    Remove-Item -LiteralPath $pidFile
    Write-Host 'Mensaampel beendet. Der Bestand bleibt gespeichert.'
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
