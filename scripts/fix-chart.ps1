# Fix ScenarioChart.tsx: replace all rgba(255,255,255,...) with rgba(10,10,15,...) 
# and rgba(15,15,15,0.95) tooltip bg with rgba(255,255,255,0.95)
$file = "c:\Users\DELL\Desktop\NomosX-master\components\foresight\ScenarioChart.tsx"
$content = [System.IO.File]::ReadAllText($file)

# Replace white rgba with dark rgba for chart elements
$content = $content -replace 'rgba\(255,\s*255,\s*255,\s*0\.05\)', 'rgba(10,10,15,0.05)'
$content = $content -replace 'rgba\(255,\s*255,\s*255,\s*0\.1\)', 'rgba(10,10,15,0.1)'
$content = $content -replace 'rgba\(255,\s*255,\s*255,\s*0\.4\)', 'rgba(10,10,15,0.4)'
$content = $content -replace 'rgba\(255,\s*255,\s*255,\s*0\.5\)', 'rgba(10,10,15,0.5)'
$content = $content -replace 'rgba\(255,\s*255,\s*255,\s*0\.6\)', 'rgba(10,10,15,0.6)'
$content = $content -replace 'rgba\(255,\s*255,\s*255,\s*0\.8\)', 'rgba(10,10,15,0.8)'

# Fix tooltip background: dark bg -> light bg
$content = $content -replace 'rgba\(15,\s*15,\s*15,\s*0\.95\)', 'rgba(255,255,255,0.95)'

[System.IO.File]::WriteAllText($file, $content)
Write-Output "ScenarioChart.tsx fixed"
