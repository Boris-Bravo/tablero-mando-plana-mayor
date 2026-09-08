# servidor.ps1 — Mini-servidor local para el Tablero de Mando y Control de la Plana Mayor.
# Sirve los archivos de la app en http://localhost:PUERTO y abre Edge en modo aplicacion.
#
# Parametros opcionales:
#   -Puerto <n>       Fuerza un puerto concreto (por defecto 8750, con autoincremento).
#   -SinNavegador     No abre Edge (util para pruebas / vista previa).

param(
  [int]$Puerto = 8750,
  [switch]$SinNavegador
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$puerto = $Puerto

function Test-Puerto($p) {
  try {
    $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p)
    $l.Start(); $l.Stop(); return $true
  } catch { return $false }
}
while (-not (Test-Puerto $puerto)) { $puerto++ ; if ($puerto -gt 8780) { break } }

$prefijo = "http://localhost:$puerto/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefijo)
try {
  $listener.Start()
} catch {
  Write-Host "No se pudo iniciar el servidor: $_" -ForegroundColor Red
  Read-Host "Presione ENTER para cerrar"
  exit 1
}

$mime = @{
  ".html"="text/html; charset=utf-8"; ".htm"="text/html; charset=utf-8";
  ".js"="text/javascript; charset=utf-8"; ".mjs"="text/javascript; charset=utf-8";
  ".css"="text/css; charset=utf-8"; ".json"="application/json; charset=utf-8";
  ".webmanifest"="application/manifest+json; charset=utf-8";
  ".svg"="image/svg+xml"; ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg";
  ".ico"="image/x-icon"; ".woff2"="font/woff2"; ".txt"="text/plain; charset=utf-8"
}

Write-Host ""
Write-Host "  TABLERO DE MANDO Y CONTROL DE LA PLANA MAYOR" -ForegroundColor Yellow
Write-Host "  Servidor activo en: $prefijo" -ForegroundColor Green
Write-Host "  (No cierre esta ventana mientras use la aplicacion)" -ForegroundColor DarkGray
Write-Host ""

if (-not $SinNavegador) {
  $edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  if (Test-Path $edge) {
    Start-Process $edge -ArgumentList "--app=$prefijo`index.html"
  } else {
    Start-Process "$prefijo`index.html"
  }
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $ruta = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart("/")
    if ([string]::IsNullOrWhiteSpace($ruta)) { $ruta = "index.html" }
    $archivo = Join-Path $raiz $ruta

    if ((Test-Path $archivo) -and -not (Get-Item $archivo).PSIsContainer) {
      $ext = [System.IO.Path]::GetExtension($archivo).ToLower()
      $tipo = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($archivo)
      $res.ContentType = $tipo
      $res.Headers.Add("Cache-Control", "no-cache")
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - No encontrado: $ruta")
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
    $res.OutputStream.Close()
  } catch {
    # Continuar sirviendo aunque una peticion falle.
  }
}
