# Find nx-surface, nx-spotlight, nx-border-flow, nx-meter definitions in globals.css
$file = "c:\Users\DELL\Desktop\NomosX-master\app\globals.css"
$lines = [System.IO.File]::ReadAllLines($file)
$targets = @('nx-surface', 'nx-spotlight', 'nx-border-flow', 'nx-meter-track', 'nx-meter-fill', 'nx-eyebrow', 'nx-section-divide', 'nx-section-index', 'nx-manifesto-line', 'nx-divider', 'nx-glow-dot', 'nx-scan-sweep')
foreach ($target in $targets) {
    for ($i = 0; $i -lt $lines.Length; $i++) {
        if ($lines[$i] -match "\.$target\b") {
            $start = $i
            $end = [Math]::Min($lines.Length - 1, $i + 10)
            for ($j = $start; $j -le $end; $j++) {
                Write-Output "$($j+1): $($lines[$j])"
            }
            Write-Output "---"
            break
        }
    }
}
