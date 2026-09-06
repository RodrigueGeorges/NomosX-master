# Fix remaining white/ opacity classes that should be black/ for light theme
# These were originally black/XX (dark overlays on dark bg) that got double-swapped back to white/XX
# In light theme, overlays should be dark (black/XX) on light backgrounds

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

        # bg-white/XX -> bg-black/XX (transparent white overlays -> transparent dark overlays)
        $content = $content -replace 'bg-white/', 'bg-black/'

        # via-white/XX -> via-black/XX
        $content = $content -replace 'via-white/', 'via-black/'

        # focus:ring-white/XX -> focus:ring-black/XX
        $content = $content -replace 'ring-white/', 'ring-black/'

        # from-white/XX -> from-black/XX (if any remain)
        $content = $content -replace 'from-white/', 'from-black/'

        # to-white/XX -> to-black/XX (if any remain)
        $content = $content -replace 'to-white/', 'to-black/'

        if ($content -ne $original) {
            [System.IO.File]::WriteAllText($f.FullName, $content)
            $changedFiles += $f.FullName
        }
    }
}

Write-Output "Fixed $($changedFiles.Count) files:"
foreach ($cf in $changedFiles) { Write-Output "  $cf" }
