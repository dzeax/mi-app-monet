# ============================================
# export.ps1 — Exporta archivos del repo a /z_reposummary
# ============================================

# Carpeta de salida
$exportDir = "z_reposummary"

# Crear la carpeta si no existe
if (-not (Test-Path $exportDir)) {
  New-Item -ItemType Directory -Path $exportDir | Out-Null
  Write-Host "Carpeta creada: $exportDir"
}

# Extensiones de texto que exportamos
$textExts = @(".tsx",".ts",".js",".jsx",".css",".scss",".md",".json",".mjs",".cjs",".html",".svg",".yml",".yaml",".txt")

function Append-File {
  param([string]$OutFile, [string]$Path)
  "===== $Path =====" | Out-File -FilePath $OutFile -Append -Encoding utf8
  Get-Content -LiteralPath $Path | Out-File -FilePath $OutFile -Append -Encoding utf8
  "" | Out-File -FilePath $OutFile -Append -Encoding utf8
}

function Export-Block {
  param([string[]]$Paths, [string]$OutFile, [string]$Label)
  if (Test-Path $OutFile) { Remove-Item $OutFile }
  $existing = @()
  foreach ($p in $Paths) {
    if (Test-Path -LiteralPath $p) { $existing += (Resolve-Path -LiteralPath $p).Path }
  }
  foreach ($file in $existing) { Append-File -OutFile $OutFile -Path $file }
  Write-Host "Generado: $OutFile (`"$($existing.Count) archivos incluidos`")"
}

function Get-TextFilesRec {
  param([string]$BasePath)
  if (-not (Test-Path $BasePath)) { return @() }
  return Get-ChildItem -Path $BasePath -Recurse -File |
    Where-Object {
      ($textExts -contains [IO.Path]::GetExtension($_.FullName).ToLower()) -and
      ($_.FullName -notmatch "\\node_modules\\") -and
      ($_.FullName -notmatch "\\\.next\\") -and
      ($_.FullName -notmatch "\\\.git\\") -and
      ($_.FullName -notmatch "\\coverage\\") -and
      ($_.FullName -notmatch "\\dist\\") -and
      ($_.FullName -notmatch "\\build\\")
    } |
    Select-Object -ExpandProperty FullName
}

# -------------------------
# 1) Un TXT por cada carpeta raíz (excepto node_modules/.next/.git etc.)
# -------------------------
$rootDirs = Get-ChildItem -Path . -Directory | Where-Object {
  $_.Name -notin @("node_modules",".next",".git","dist","build","coverage","z_reposummary")
} | Select-Object -ExpandProperty Name

foreach ($dir in $rootDirs) {
  $paths = Get-TextFilesRec -BasePath $dir
  $outfile = Join-Path $exportDir ("root_$($dir).txt")
  Export-Block -Paths $paths -OutFile $outfile -Label "ROOT/$dir"
}

# -------------------------
# 2) root_all.txt — todo el repo (texto)
# -------------------------
$rootAll = Get-TextFilesRec -BasePath .
$outAll = Join-Path $exportDir "root_all.txt"
Export-Block -Paths $rootAll -OutFile $outAll -Label "ROOT_ALL"

Write-Host "Listo. Archivos generados en carpeta: $exportDir"
