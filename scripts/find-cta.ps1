# Find nx-cta definitions in globals.css
$file = "c:\Users\DELL\Desktop\NomosX-master\app\globals.css"
$lines = [System.IO.File]::ReadAllLines($file)
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '\.nx-cta') {
        $start = [Math]::Max(0, $i - 2)
        $end = [Math]::Min($lines.Length - 1, $i + 15)
        for ($j = $start; $j -le $end; $j++) {
            Write-Output "$($j+1): $($lines[$j])"
        }
        Write-Output "---"
    }
}
