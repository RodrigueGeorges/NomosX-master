
# Correction syntaxe PowerShell pour OpenClaw
# Remplacer les anciennes syntaxes par les nouvelles

function Fix-PowerShellSyntax {
    param([string]$ScriptPath)
    
    $content = Get-Content $ScriptPath -Raw
    
    # Corrections de syntaxe
    $content = $content -replace 'Continue=SilentlyContinue', '$ErrorActionPreference = "SilentlyContinue"'
    $content = $content -replace '.Exception.Message', '$_.Exception.Message'
    $content = $content -replace 'findstr.*>>', 'Select-String | Out-File -FilePath'
    
    Set-Content $ScriptPath -Value $content
    Write-Host "✅ Syntaxe PowerShell corrigée: $ScriptPath"
}
