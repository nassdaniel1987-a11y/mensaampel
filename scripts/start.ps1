$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$appUrl = 'http://127.0.0.1:4317'
try {
    $health = $null
    try { $health = Invoke-RestMethod "$appUrl/api/health" -TimeoutSec 2 } catch {}
    if ($health.app -ne 'mensaampel') {
        $runtime = Join-Path $appRoot 'runtime/node.exe'
        if (!(Test-Path -LiteralPath $runtime)) { throw 'Die Laufzeit fehlt. Bitte das gesamte ZIP entpacken.' }
        $dataPath = Join-Path $appRoot 'data'
        New-Item -ItemType Directory -Force -Path $dataPath | Out-Null
        $entry = Join-Path $appRoot 'server/main.mjs'
        $env:PORT = '4317'
        $env:MENSA_DATA_DIR = $dataPath
        $child = Start-Process -FilePath $runtime -ArgumentList ('"' + $entry + '"') -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataPath 'start.log') -RedirectStandardError (Join-Path $dataPath 'fehler.log')
        Set-Content -LiteralPath (Join-Path $dataPath 'dienst.pid') -Value $child.Id
        for ($attempt=0; $attempt -lt 30; $attempt++) {
            try { $health=Invoke-RestMethod "$appUrl/api/health" -TimeoutSec 1; if ($health.app -eq 'mensaampel') { break } } catch {}
            if ($child.HasExited) { throw 'Start fehlgeschlagen. Einzelheiten stehen in data/fehler.log.' }
            Start-Sleep -Milliseconds 300
        }
        if ($health.app -ne 'mensaampel') { throw 'Die Mensaampel antwortet nicht. Bitte data/fehler.log pruefen.' }
    }
    Start-Process $appUrl
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
