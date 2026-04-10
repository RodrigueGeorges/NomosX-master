
# Validation syntaxe PowerShell OpenClaw
function Test-OpenClawSyntax {
    param([string]$ScriptPath)
    
    Write-Host "🔍 Validation: $ScriptPath"
    
    try {
        $null = [System.Management.Automation.PSParser]::Tokenize((Get-Content $ScriptPath -Raw), [ref]$null)
        Write-Host "✅ Syntaxe valide" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "❌ Erreur syntaxe: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Valider tous les scripts PowerShell
Get-ChildItem -Path ".\scripts" -Filter "*.ps1" | ForEach-Object {
    Test-OpenClawSyntax -ScriptPath $_.FullName
}
