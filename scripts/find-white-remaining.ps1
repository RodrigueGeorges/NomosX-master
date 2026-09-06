# Find remaining white/ opacity classes that should be black/
$dirs = @(
    "c:\Users\DELL\Desktop\NomosX-master\components",
    "c:\Users\DELL\Desktop\NomosX-master\app"
)

$pattern = '(via-white|from-white|to-white|ring-white|border-white|text-white|bg-white)/'

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) { continue }
    $files = Get-ChildItem -Path $dir -Recurse -Include "*.tsx","*.ts" -File
    foreach ($f in $files) {
        $lines = [System.IO.File]::ReadAllLines($f.FullName)
        for ($i = 0; $i -lt $lines.Length; $i++) {
            if ($lines[$i] -match $pattern) {
                $rel = $f.FullName.Replace("c:\Users\DELL\Desktop\NomosX-master\", "")
                Write-Output "${rel}:$($i+1): $($lines[$i].Trim())"
            }
        }
    }
}
