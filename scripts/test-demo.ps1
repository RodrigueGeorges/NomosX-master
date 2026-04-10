$body = [System.Text.Encoding]::UTF8.GetBytes('{"topic":"Carbon tax policy effectiveness","mode":"quick"}')
$req = [System.Net.HttpWebRequest]::Create("http://localhost:3000/api/demo/generate")
$req.Method = "POST"
$req.ContentType = "application/json"
$req.ContentLength = $body.Length
$req.Timeout = 300000
$req.Headers.Add("Origin", "http://localhost:3000")
$stream = $req.GetRequestStream()
$stream.Write($body, 0, $body.Length)
$stream.Close()
try {
    $resp = $req.GetResponse()
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $content = $reader.ReadToEnd()
    $reader.Close()
    Write-Host "STATUS: $($resp.StatusCode)"
    $content | ConvertFrom-Json | ConvertTo-Json -Depth 5
} catch [System.Net.WebException] {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $err = $reader.ReadToEnd()
    Write-Host "ERROR RESPONSE: $err"
}
