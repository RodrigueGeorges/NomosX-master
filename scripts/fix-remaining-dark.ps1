# Global fix: replace remaining text-white, bg-black, hover:text-white in tsx/ts files
# These are non-opacity variants (text-white without /XX)

$dirs = @(
    "c:\Users\DELL\Desktop\NomosX-master\components",
    "c:\Users\DELL\Desktop\NomosX-master\app"
)

$changedFiles = @()

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) { continue }
    $files = Get-ChildItem -Path $dir -Recurse -Include "*.tsx","*.ts" -File
    foreach ($f in $files) {
        $content = [System.IO.File]::ReadAllText($f.FullName)
        $original = $content

        # text-white (non-opacity, not followed by /) -> text-black
        $content = $content -replace 'text-white(?![/\w])', 'text-black'
        
        # hover:text-white (non-opacity) -> hover:text-black
        $content = $content -replace 'hover:text-white(?![/\w])', 'hover:text-black'

        # bg-black (non-opacity, not followed by /) -> bg-white
        $content = $content -replace 'bg-black(?![/\w])', 'bg-white'

        # placeholder-white/XX -> placeholder-black/XX
        $content = $content -replace 'placeholder-white/', 'placeholder-black/'

        if ($content -ne $original) {
            [System.IO.File]::WriteAllText($f.FullName, $content)
            $changedFiles += $f.FullName
        }
    }
}

Write-Output "Fixed $($changedFiles.Count) files:"
foreach ($cf in $changedFiles) { Write-Output "  $cf" }
