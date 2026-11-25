$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath '.env')) { throw 'Подготовьте .env по инструкции запуска.' }
    $settings = @(Get-Content -LiteralPath '.env')
    $secrets = @{}
    foreach ($key in 'CROC_DEMO_EDITOR_PASSWORD', 'CROC_DB_WRITER_PASSWORD') {
        $line = $settings | Where-Object { $_.StartsWith("$key=") } | Select-Object -Last 1
        $value = if ($line) { ($line -split '=', 2)[1].Trim() } else { '' }
        if (-not $value) {
            $value = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
            $settings = @($settings | Where-Object { -not $_.StartsWith("$key=") }) + "$key=$value"
        }
        $secrets[$key] = $value
    }

    $previous = [Environment]::GetEnvironmentVariable('CROC_DB_WRITER_PASSWORD')
    try {
        $env:CROC_DB_WRITER_PASSWORD = $secrets['CROC_DB_WRITER_PASSWORD']
        Get-Content -Raw -LiteralPath 'docker/postgres/provision-writer.sql' |
            docker compose exec -T -e CROC_DB_WRITER_PASSWORD postgres psql -X -q -v ON_ERROR_STOP=1 -U postgres -d croc_insight
        if ($LASTEXITCODE -ne 0) { throw 'Не удалось настроить роль. Проверьте, что бэкенд успел применить миграцию V4.' }
    } finally {
        $env:CROC_DB_WRITER_PASSWORD = $previous
    }
    $settings | Set-Content -LiteralPath '.env' -Encoding utf8NoBOM
    Write-Output 'Роль редактора готова. Перезапустите бэкенд и Vite.'
} finally {
    Pop-Location
}
