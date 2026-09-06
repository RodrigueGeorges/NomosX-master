# Find nx-spx-hero, nx-aurora, nx-manifesto-cascade, nx-manifesto-signoff definitions
$file = "c:\Users\DELL\Desktop\NomosX-master\app\globals.css"
$lines = [System.IO.File]::ReadAllLines($file)
$targets = @('nx-spx-hero', 'nx-aurora', 'nx-manifesto-cascade', 'nx-manifesto-signoff', 'nx-pillar', 'nx-watermark')
foreach ($target in $targets) {
    for ($i = 0; $i -lt $lines.Length; $i++) {
        if ($lines[$i] -match "\.$target\b") {
            $end = [Math]::Min($lines.Length - 1, $i + 12)
            for ($j = $i; $j -le $end; $j++) {
                Write-Output "$($j+1): $($lines[$j])"
            }
            Write-Output "---"
            break
        }
    }
}
