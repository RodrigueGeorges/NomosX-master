$file = "c:\Users\DELL\Desktop\NomosX-master\app\globals.css"
$c = Get-Content $file -Raw

# 1. rgba(255,255,255, -> rgba(0,0,0, (white overlays -> dark overlays)
$c = $c -replace 'rgba\(255,\s*255,\s*255,\s*', 'rgba(0, 0, 0, '

# 2. rgba(240,240,250, -> rgba(10,10,15, (light text -> dark text)
$c = $c -replace 'rgba\(240,\s*240,\s*250,\s*', 'rgba(10, 10, 15, '

# 3. Hex swap #ffffff <-> #000000 using placeholder
$c = $c -replace '#ffffff', '__HEX_SWAP__'
$c = $c -replace '#000000', '#ffffff'
$c = $c -replace '__HEX_SWAP__', '#000000'

# 4. Short hex swap #fff <-> #000 (standalone only)
$c = $c -replace '#fff(?![0-9a-fA-F])', '__HEX_FFF__'
$c = $c -replace '#000(?![0-9a-fA-F])', '#fff'
$c = $c -replace '__HEX_FFF__', '#000'

# 5. Dark hex backgrounds -> light equivalents
$c = $c -replace '#0a0a0a', '#f5f5f7'
$c = $c -replace '#080808', '#f0f0f0'
$c = $c -replace '#0f0f0f', '#f8f8f8'
$c = $c -replace '#09090b', '#f5f5f7'
$c = $c -replace '#0a0a0b', '#f5f5f7'
$c = $c -replace '#111111', '#fafafa'
$c = $c -replace '#111114', '#ededf0'
$c = $c -replace '#141414', '#f0f0f0'

# 6. Old text primary hex -> dark
$c = $c -replace '#f0f0fa', '#0a0a0f'

# 7. Brief article text colors -> dark equivalents
$c = $c -replace '#e4e4e7', '#18181b'
$c = $c -replace '#a1a1aa', '#52525b'

# 8. Mesh bg v2 dark blue overlays -> light blue overlays
$c = $c -replace 'rgba\(20,\s*30,\s*55,\s*', 'rgba(200, 215, 240, '
$c = $c -replace 'rgba\(12,\s*20,\s*42,\s*', 'rgba(210, 225, 245, '
$c = $c -replace 'rgba\(15,\s*22,\s*45,\s*', 'rgba(220, 230, 250, '
$c = $c -replace 'rgba\(22,\s*32,\s*58,\s*', 'rgba(205, 220, 245, '

# 9. nx-ancient-topbar dark bg -> light
$c = $c -replace 'rgba\(0,\s*0,\s*0,\s*0\.96\)', 'rgba(255, 255, 255, 0.96)'

# 10. nx-cta dark bg -> light
$c = $c -replace 'rgba\(10,\s*10,\s*12,\s*0\.6\)', 'rgba(245, 245, 247, 0.8)'
$c = $c -replace 'rgba\(15,\s*18,\s*20,\s*0\.8\)', 'rgba(235, 238, 240, 0.9)'
$c = $c -replace 'rgba\(20,\s*20,\s*25,\s*0\.8\)', 'rgba(240, 240, 245, 0.9)'

# 11. article-content dark mode overrides -> light mode
$c = $c -replace 'rgba\(255,\s*255,\s*255,\s*0\.80\)', 'rgba(0, 0, 0, 0.80)'
$c = $c -replace 'rgba\(255,\s*255,\s*255,\s*0\.90\)', 'rgba(0, 0, 0, 0.90)'
$c = $c -replace 'rgba\(255,\s*255,\s*255,\s*0\.75\)', 'rgba(0, 0, 0, 0.75)'
$c = $c -replace 'rgba\(255,\s*255,\s*255,\s*0\.70\)', 'rgba(0, 0, 0, 0.70)'
$c = $c -replace 'rgba\(255,\s*255,\s*255,\s*0\.65\)', 'rgba(0, 0, 0, 0.65)'

# 12. Selection color
$c = $c -replace 'rgba\(10,\s*10,\s*15,\s*0\.18\)', 'rgba(10, 10, 15, 0.12)'

Set-Content $file -Value $c -NoNewline
Write-Output "Theme inversion complete"
