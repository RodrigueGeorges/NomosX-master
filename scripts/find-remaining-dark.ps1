# Find remaining text-white and bg-black (non-opacity) in tsx files
$dirs = @(
    "c:\Users\DELL\Desktop\NomosX-master\components",
    "c:\Users\DELL\Desktop\NomosX-master\app"
)

# Patterns that are problematic for light theme
$patterns = @(
    'text-white(?![/\w])',
    'bg-black(?![/\w])',
    'hover:text-white(?![/\w])'
)

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) { continue }
    $files = Get-ChildItem -Path $dir -Recurse -Include "*.tsx","*.ts" -File
    foreach ($f in $files) {
        $lines = [System.IO.File]::ReadAllLines($f.FullName)
        for ($i = 0; $i -lt $lines.Length; $i++) {
            foreach ($pat in $patterns) {
                if ($lines[$i] -match $pat) {
                    $rel = $f.FullName.Replace("c:\Users\DELL\Desktop\NomosX-master\", "")
                    Write-Output "${rel}:$($i+1): $($lines[$i].Trim())"
                    break
                }
            }
        }
    }
}
