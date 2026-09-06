# Invert Tailwind dark/light classes across all tsx/ts files in components/ and app/
# text-white -> text-black
# bg-black -> bg-white
# border-white -> border-black
# bg-white -> bg-black (swap)
# text-black -> text-white (swap)
# Also handle opacity variants: text-white/50 -> text-black/50, etc.

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
        $content = Get-Content $f.FullName -Raw
        $original = $content

        # Swap text-white <-> text-black (with optional opacity /XX)
        $content = $content -replace 'text-white(?![\w-])', '__TW_SWAP_1__'
        $content = $content -replace 'text-black(?![\w-])', 'text-white'
        $content = $content -replace '__TW_SWAP_1__', 'text-black'

        # Handle text-white/XX opacity variants
        $content = $content -replace 'text-white/', '__TW_SWAP_2__'
        $content = $content -replace 'text-black/', 'text-white/'
        $content = $content -replace '__TW_SWAP_2__', 'text-black/'

        # Swap bg-black <-> bg-white
        $content = $content -replace 'bg-black(?![\w-])', '__TW_SWAP_3__'
        $content = $content -replace 'bg-white(?![\w-])', 'bg-black'
        $content = $content -replace '__TW_SWAP_3__', 'bg-white'

        # Handle bg-black/XX and bg-white/XX
        $content = $content -replace 'bg-black/', '__TW_SWAP_4__'
        $content = $content -replace 'bg-white/', 'bg-black/'
        $content = $content -replace '__TW_SWAP_4__', 'bg-white/'

        # Swap border-white <-> border-black
        $content = $content -replace 'border-white(?![\w-])', '__TW_SWAP_5__'
        $content = $content -replace 'border-black(?![\w-])', 'border-white'
        $content = $content -replace '__TW_SWAP_5__', 'border-black'

        # Handle border-white/XX and border-black/XX
        $content = $content -replace 'border-white/', '__TW_SWAP_6__'
        $content = $content -replace 'border-black/', 'border-white/'
        $content = $content -replace '__TW_SWAP_6__', 'border-black/'

        # from-white, to-white, via-white -> dark equivalents
        $content = $content -replace 'from-white(?![\w-])', '__TW_SWAP_7__'
        $content = $content -replace 'from-black(?![\w-])', 'from-white'
        $content = $content -replace '__TW_SWAP_7__', 'from-black'

        $content = $content -replace 'to-white(?![\w-])', '__TW_SWAP_8__'
        $content = $content -replace 'to-black(?![\w-])', 'to-white'
        $content = $content -replace '__TW_SWAP_8__', 'to-black'

        $content = $content -replace 'via-white(?![\w-])', '__TW_SWAP_9__'
        $content = $content -replace 'via-black(?![\w-])', 'via-white'
        $content = $content -replace '__TW_SWAP_9__', 'via-black'

        # ring-white -> ring-black, etc.
        $content = $content -replace 'ring-white(?![\w-])', '__TW_SWAP_10__'
        $content = $content -replace 'ring-black(?![\w-])', 'ring-white'
        $content = $content -replace '__TW_SWAP_10__', 'ring-black'

        # focus:bg-white -> focus:bg-black, focus:text-white -> focus:text-black
        # (already handled by the text-white/bg-white swaps above since they match anywhere in the string)

        # placeholder-white -> placeholder-black
        $content = $content -replace 'placeholder-white(?![\w-])', '__TW_SWAP_11__'
        $content = $content -replace 'placeholder-black(?![\w-])', 'placeholder-white'
        $content = $content -replace '__TW_SWAP_11__', 'placeholder-black'

        # divide-white -> divide-black
        $content = $content -replace 'divide-white(?![\w-])', '__TW_SWAP_12__'
        $content = $content -replace 'divide-black(?![\w-])', 'divide-white'
        $content = $content -replace '__TW_SWAP_12__', 'divide-black'

        if ($content -ne $original) {
            Set-Content $f.FullName -Value $content -NoNewline
            $changedFiles += $f.FullName
        }
    }
}

Write-Output "Changed $($changedFiles.Count) files:"
foreach ($cf in $changedFiles) { Write-Output "  $cf" }
