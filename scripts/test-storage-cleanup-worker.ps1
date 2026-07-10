param([string]$ProjectRef, [securestring]$WorkerSecret)
$ErrorActionPreference = 'Stop'

if (-not $ProjectRef) {
  $refFile = Join-Path $PSScriptRoot '..\supabase\.temp\project-ref'
  if (Test-Path $refFile) { $ProjectRef = (Get-Content -Raw $refFile).Trim() }
}
if (-not $ProjectRef) { $ProjectRef = (Read-Host 'Supabase project reference').Trim() }
if (-not $ProjectRef) { throw 'Supabase project reference is required.' }
if (-not $WorkerSecret) { $WorkerSecret = Read-Host 'Worker secret' -AsSecureString }

$secret = [System.Net.NetworkCredential]::new('', $WorkerSecret).Password
$functionUrl = "https://$ProjectRef.supabase.co/functions/v1/process-storage-cleanup"
function Invoke-WorkerRequest([hashtable]$Headers) {
  try {
    $response = Invoke-WebRequest -Uri $functionUrl -Method Post -Headers $Headers -ContentType 'application/json' -Body '{}'
    return @{ Status = [int]$response.StatusCode; Body = $response.Content }
  } catch [System.Net.WebException] {
    $response = $_.Exception.Response
    if (-not $response) { throw "Network failure while invoking the hosted worker: $($_.Exception.Message)" }
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    try { $body = $reader.ReadToEnd() } finally { $reader.Dispose() }
    return @{ Status = [int]$response.StatusCode; Body = $body }
  } catch { throw "Network failure while invoking the hosted worker: $($_.Exception.Message)" }
}

$authorized = Invoke-WorkerRequest @{ 'x-cleanup-worker-secret' = $secret }
Write-Host "Authorized status: $($authorized.Status)"; Write-Host $authorized.Body
if ($authorized.Status -lt 200 -or $authorized.Status -ge 300) { throw 'Authorized worker invocation failed. Cron must not be configured.' }

$unauthorized = Invoke-WorkerRequest @{}
Write-Host "Unauthorized status: $($unauthorized.Status)"; Write-Host $unauthorized.Body
if ($unauthorized.Status -notin 401, 403) { throw 'Unauthorized worker invocation unexpectedly succeeded. Cron must not be configured.' }
$secret = $null
