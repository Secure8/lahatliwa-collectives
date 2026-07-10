param([string]$ProjectRef)
$ErrorActionPreference = 'Stop'
$refFile = Join-Path $PSScriptRoot '..\supabase\.temp\project-ref'
$cacheFile = Join-Path $PSScriptRoot '..\supabase\.temp\storage-cleanup-worker-secret'
if (-not $ProjectRef -and (Test-Path $refFile)) { $ProjectRef = (Get-Content -Raw $refFile).Trim() }
if (-not $ProjectRef) { throw 'Supabase project reference is required.' }
if (-not (Test-Path $cacheFile)) { throw 'No encrypted worker-secret cache was found. Run npm.cmd run worker:setup first.' }
try { $secret = [System.Net.NetworkCredential]::new('', (ConvertTo-SecureString (Get-Content -Raw $cacheFile))).Password } catch { throw 'The encrypted worker-secret cache cannot be read by this Windows user. Run worker:setup again.' }
npx.cmd supabase functions list --project-ref $ProjectRef | Out-Host
$url = "https://$ProjectRef.supabase.co/functions/v1/process-storage-cleanup"
try { $response = Invoke-WebRequest -UseBasicParsing -Uri $url -Method Post -Headers @{ 'x-cleanup-worker-secret'=$secret } -ContentType 'application/json' -Body '{"action":"status"}' } catch [System.Net.WebException] { $r=$_.Exception.Response; if ($r) { $reader=New-Object IO.StreamReader($r.GetResponseStream()); try{$body=$reader.ReadToEnd()}finally{$reader.Dispose()}; throw "Worker status request failed with HTTP $([int]$r.StatusCode): $body" }; throw }
$status = $response.Content | ConvertFrom-Json
if (-not $status.ok) { throw 'Worker status RPC failed.' }
Write-Host "Worker health: healthy"; Write-Host "Authorized status: $($response.StatusCode)"; Write-Host "Cron job: $($status.cron.jobName)"; Write-Host "Schedule: $($status.cron.schedule)"; Write-Host "Cron active: $($status.cron.active)"; Write-Host "Schedule count: $($status.cron.count)"; Write-Host "Last run: $($status.cron.lastRunStatus) $($status.cron.lastRunAt)"; Write-Host "Vault synchronization: $($status.vault.projectUrlExists -and $status.vault.workerSecretExists)"; Write-Host "Pending jobs: $($status.queue.pending)"; Write-Host "Failed jobs: $($status.queue.failed)"; Write-Host "Manual-review jobs: $($status.queue.manualReview)"
if ($status.cron.count -ne 1 -or -not $status.cron.active -or -not $status.vault.projectUrlExists -or -not $status.vault.workerSecretExists) { throw 'Worker status is unhealthy: Cron or Vault configuration is incomplete.' }
if (-not $status.cron.lastRunAt) { Write-Warning 'Cron exists but has not run yet.' }
$secret=$null
