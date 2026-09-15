param([string]$Path, [string]$Pattern, [int]$Max = 60)
$hits = Select-String -Path $Path -Pattern $Pattern
$hits | Select-Object -First $Max | ForEach-Object { "{0}:{1}: {2}" -f (Split-Path $_.Path -Leaf), $_.LineNumber, $_.Line.Trim() }
"--- total: $($hits.Count)"
