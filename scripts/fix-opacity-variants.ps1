# Fix opacity-variant Tailwind classes that weren't swapped by the first script
# These are: text-white/XX, text-black/XX, bg-black/XX, bg-white/XX, border-white/XX, border-black/XX
# The base classes (text-white, bg-black, etc.) were already swapped correctly.
# Only the /XX opacity variants need swapping now.

$dirs = @(
    "c:\Users\DELL\Desktop\NomosX-master\components",
    "c:\Users\DELL\Desktop\NomosX-master\app"
)

$extensions = @("*.tsx", "*.ts")
$changedFiles = @()

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) { continue }
    $files = Get-ChildItem -Path $dir -Recurse -Include $extensions -File
    foreach ($f in $files) {
        $content = [System.IO.File]::ReadAllText($f.FullName)
        $original = $content

        # Swap text-white/ <-> text-black/
        $content = $content -replace 'text-white/', '__SWAP_1__'
        $content = $content -replace 'text-black/', 'text-white/'
        $content = $content -replace '__SWAP_1__', 'text-black/'

        # Swap bg-black/ <-> bg-white/
        $content = $content -replace 'bg-black/', '__SWAP_2__'
        $content = $content -replace 'bg-white/', 'bg-black/'
        $content = $content -replace '__SWAP_2__', 'bg-white/'

        # Swap border-white/ <-> border-black/
        $content = $content -replace 'border-white/', '__SWAP_3__'
        $content = $content -replace 'border-black/', 'border-white/'
        $content = $content -replace '__SWAP_3__', 'border-black/'

        # Swap from-white/ <-> from-black/
        $content = $content -replace 'from-white/', '__SWAP_4__'
        $content = $content -replace 'from-black/', 'from-white/'
        $content = $content -replace '__SWAP_4__', 'from-black/'

        # Swap to-white/ <-> to-black/
        $content = $content -replace 'to-white/', '__SWAP_5__'
        $content = $content -replace 'to-black/', 'to-white/'
        $content = $content -replace '__SWAP_5__', 'to-black/'

        # Swap via-white/ <-> via-black/
        $content = $content -replace 'via-white/', '__SWAP_6__'
        $content = $content -replace 'via-black/', 'via-white/'
        $content = $content -replace '__SWAP_6__', 'via-black/'

        # Swap ring-white/ <-> ring-black/
        $content = $content -replace 'ring-white/', '__SWAP_7__'
        $content = $content -replace 'ring-black/', 'ring-white/'
        $content = $content -replace '__SWAP_7__', 'ring-black/'

        if ($content -ne $original) {
            [System.IO.File]::WriteAllText($f.FullName, $content)
            $changedFiles += $f.FullName
        }
    }
}

Write-Output "Fixed $($changedFiles.Count) files:"
foreach ($cf in $changedFiles) { Write-Output "  $cf" }
