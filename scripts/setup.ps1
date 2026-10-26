# Crea el archivo .env con secretos aleatorios (Windows PowerShell 5.1 o PowerShell 7).
#
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
#
# Pide usuario y contraseña para entrar a la app; AUTH_SECRET y POSTGRES_PASSWORD se generan solos.
# No sobrescribe un .env existente (usa -Force para reemplazarlo).

param([switch]$Force)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$example = Join-Path $root '.env.example'
$target = Join-Path $root '.env'

function New-Hex([int]$bytes) {
  $buffer = New-Object byte[] $bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($buffer)
  $rng.Dispose()
  return -join ($buffer | ForEach-Object { $_.ToString('x2') })
}

function Test-SafeValue([string]$value) {
  # Compose interpreta $ y # en .env; comillas y espacios también causan problemas.
  return -not ($value -match '[\s$#"''`\\]')
}

if (-not (Test-Path $example)) { throw "No se encontró .env.example en $root" }
if ((Test-Path $target) -and -not $Force) {
  Write-Host ".env ya existe; no se modificó. Usa -Force para reemplazarlo." -ForegroundColor Yellow
  exit 0
}

Write-Host "Configuración de Whole Platport Lite" -ForegroundColor Cyan

$user = Read-Host "Usuario para entrar a la app [alumno]"
if ([string]::IsNullOrWhiteSpace($user)) { $user = 'alumno' }
$user = $user.Trim()
if (-not (Test-SafeValue $user)) { throw "El usuario no puede tener espacios ni los caracteres `$ # "" ' `` \" }

$secure = Read-Host "Contraseña (mínimo 8 caracteres; Enter para generar una)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

$generated = $false
if ([string]::IsNullOrEmpty($password)) {
  $password = New-Hex 8
  $generated = $true
}
if ($password.Length -lt 8) { throw "La contraseña debe tener al menos 8 caracteres." }
if (-not (Test-SafeValue $password)) { throw "La contraseña no puede tener espacios ni los caracteres `$ # "" ' `` \" }

$values = @{
  'AUTH_USERNAME'     = $user
  'AUTH_PASSWORD'     = $password
  'AUTH_SECRET'       = (New-Hex 32)
  'POSTGRES_PASSWORD' = (New-Hex 16)
}

$utf8 = New-Object Text.UTF8Encoding $false
$lines = [IO.File]::ReadAllLines($example, $utf8) | ForEach-Object {
  $line = $_
  foreach ($key in $values.Keys) {
    if ($line -match "^$key=") { $line = "$key=$($values[$key])" }
  }
  $line
}
[IO.File]::WriteAllLines($target, [string[]]$lines, $utf8)

Write-Host ""
Write-Host ".env creado." -ForegroundColor Green
Write-Host "  Usuario:    $user"
if ($generated) {
  Write-Host "  Contraseña: $password   (generada; guárdala, no se vuelve a mostrar)" -ForegroundColor Yellow
} else {
  Write-Host "  Contraseña: la que escribiste"
}
Write-Host ""
Write-Host "Siguiente paso:  docker compose up -d --build   y abre http://localhost:3000"
