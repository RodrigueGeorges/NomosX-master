# Search for color values in AgenticCore.tsx
$file = "c:\Users\DELL\Desktop\NomosX-master\components\signature\AgenticCore.tsx"
$lines = [System.IO.File]::ReadAllLines($file)
for ($i = 0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match 'rgba\(|fillStyle|strokeStyle|#[0-9a-fA-F]{3,6}') {
        Write-Output "$($i+1): $($lines[$i].Trim())"
    }
}
