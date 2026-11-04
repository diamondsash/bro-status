# BroStatus Setup fuer Windows - wird von BroStatus-Install.cmd gestartet
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host ''
Write-Host '  ◆ BroStatus' -ForegroundColor Cyan
Write-Host ''

function Find-Python {
    foreach ($cmd in @('py', 'python', 'python3')) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { continue }
        try {
            $out = & $cmd -c "import sys; print(sys.executable) if sys.version_info >= (3, 8) else None" 2>$null
            if ($LASTEXITCODE -eq 0 -and $out -and (Test-Path ($out | Select-Object -Last 1).Trim())) {
                return ($out | Select-Object -Last 1).Trim()
            }
        } catch { }
    }
    foreach ($v in @('Python313', 'Python312', 'Python311', 'Python310')) {
        $cand = Join-Path $env:LOCALAPPDATA "Programs\Python\$v\python.exe"
        if ($env:LOCALAPPDATA -and (Test-Path $cand)) { return $cand }
    }
    return $null
}

$py = Find-Python
if (-not $py) {
    Write-Host '  Python fehlt noch – wird jetzt installiert (dauert 1-2 Minuten) ...' -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements | Out-Host
        $py = Find-Python
    }
}
if (-not $py) {
    Write-Host ''
    Write-Host '  Python konnte nicht automatisch installiert werden.' -ForegroundColor Red
    Write-Host '  Bitte Python von https://www.python.org/downloads/ installieren'
    Write-Host '  (Haken bei "Add python.exe to PATH" setzen) und diese Datei nochmal starten.'
    exit 1
}

Write-Host "  Python: $py" -ForegroundColor DarkGray
Write-Host ''

$instArgs = @()
if ($args.Count -eq 0) {
    $current = (& $py install.py --zeige-ziel | Select-Object -Last 1)
    Write-Host "  Installationsordner: $current" -ForegroundColor Cyan
    $answer = Read-Host '  Enter = so lassen, oder anderen Ordner eingeben'
    if ($answer -and $answer.Trim()) { $instArgs = @('--ziel', $answer.Trim()) }
    Write-Host ''
}
& $py install.py @instArgs @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host ''
Write-Host '  ✓ Fertig! Claude Code neu starten – am besten im Windows Terminal.' -ForegroundColor Green
