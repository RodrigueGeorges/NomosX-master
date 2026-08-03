# Quick smoke test for the 5 new open-access APIs
$ProgressPreference = 'SilentlyContinue'

try { $r = Invoke-RestMethod 'https://api.plos.org/search?q=everything:climate&wt=json&rows=2' -TimeoutSec 15; Write-Host "PLOS: OK ($($r.response.numFound) results)" } catch { Write-Host "PLOS: FAIL - $($_.Exception.Message)" }

try { $r = Invoke-RestMethod 'https://www.federalregister.gov/api/v1/documents.json?conditions[term]=artificial%20intelligence&per_page=2' -TimeoutSec 15; Write-Host "FederalRegister: OK ($($r.count) results)" } catch { Write-Host "FederalRegister: FAIL - $($_.Exception.Message)" }

try { $r = Invoke-RestMethod 'https://search.worldbank.org/api/v3/wds?format=json&qterm=climate&rows=2' -TimeoutSec 20; Write-Host "WorldBankDocs: OK ($($r.total) results)" } catch { Write-Host "WorldBankDocs: FAIL - $($_.Exception.Message)" }

try { $r = Invoke-RestMethod -Uri 'https://efts.sec.gov/LATEST/search-index?q=%22climate%20risk%22' -TimeoutSec 15 -Headers @{ 'User-Agent' = 'NomosX Research contact@nomosx.com' }; Write-Host "SECEdgar: OK ($($r.hits.total.value) results)" } catch { Write-Host "SECEdgar: FAIL - $($_.Exception.Message)" }

try { $r = Invoke-RestMethod "https://cordis.europa.eu/search/api?q='climate'&format=json&num=2&p=1" -TimeoutSec 20; $n = if ($r.payload) { $r.payload.total } else { $r.total }; Write-Host "CORDIS: OK ($n results)" } catch { Write-Host "CORDIS: FAIL - $($_.Exception.Message)" }

try { $r = Invoke-RestMethod "https://cordis.europa.eu/search?q='climate'&format=json&num=2&p=1" -TimeoutSec 20; $n = if ($r.payload) { $r.payload.total } else { $r.total }; Write-Host "CORDIS-v2: OK ($n results)" } catch { Write-Host "CORDIS-v2: FAIL - $($_.Exception.Message)" }

try { $r = Invoke-RestMethod "https://cordis.europa.eu/api/search/results?q='climate'&format=json&num=2&p=1" -TimeoutSec 20; $n = if ($r.payload) { $r.payload.total } else { $r.total }; Write-Host "CORDIS-v3: OK ($n results)" } catch { Write-Host "CORDIS-v3: FAIL - $($_.Exception.Message)" }
