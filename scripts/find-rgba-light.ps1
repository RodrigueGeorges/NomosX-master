# Find rgba(240,240,250 and rgba(255,255,255 in tsx files (excluding globals.css)
$dirs = @(
    "c:\Users\DELL\Desktop\NomosX-master\components",
    "c:\Users\DELL\Desktop\NomosX-master\app"
)

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) { continue }
    $files = Get-ChildItem -Path $dir -Recurse -Include "*.tsx","*.ts" -File
    foreach ($f in $files) {
        $lines = [System.IO.File]::ReadAllLines($f.FullName)
        for ($i = 0; $i -lt $lines.Length; $i++) {
            if ($lines[$i] -match 'rgba\(240,\s*240,\s*250' -or $lines[$i] -match 'rgba\(255,\s*255,\s*255') {
                $rel = $f.FullName.Replace("c:\Users\DELL\Desktop\NomosX-master\", "")
                Write-Output "${rel}:$($i+1): $($lines[$i].Trim())"
            }
        }
    }
}
