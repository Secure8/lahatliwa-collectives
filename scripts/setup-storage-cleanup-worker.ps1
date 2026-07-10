param([string]$ProjectRef, [securestring]$WorkerSecret, [switch]$RotateSecret)
$ErrorActionPreference = 'Stop'

function Resolve-ProjectRef([string]$Value) {
  if ($Value) { return $Value.Trim() }
  $refFile = Join-Path $PSScriptRoot '..\supabase\.temp\project-ref'
  if (Test-Path $refFile) {
    $detected = (Get-Content -Raw $refFile).Trim()
    if ($detected) { return $detected }
  }
  return (Read-Host 'Supabase project reference').Trim()
}
function Load-CachedSecret($Path) { if (Test-Path $Path) { try { return [System.Net.NetworkCredential]::new('', (ConvertTo-SecureString (Get-Content -Raw $Path))).Password } catch { return $null } } }
function Save-CachedSecret($Path, [string]$Value) { ConvertTo-SecureString $Value -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -NoNewline $Path }

Write-Host '[1/7] Checking repository'
if (-not (Test-Path 'supabase/functions/process-storage-cleanup/index.ts')) { throw 'Run this script from the repository root.' }

Write-Host '[2/7] Checking Supabase CLI'
npx.cmd supabase --version | Out-Host
$projectRef = Resolve-ProjectRef $ProjectRef
if (-not $projectRef) { throw 'Supabase project reference is required.' }
$cachePath = Join-Path $PSScriptRoot '..\supabase\.temp\storage-cleanup-worker-secret'

Write-Host '[3/7] Checking hosted project access'
npx.cmd supabase functions list --project-ref $projectRef | Out-Host
npx.cmd supabase secrets list --project-ref $projectRef | Out-Null

Write-Host '[4/7] Configuring worker secret'
if ($WorkerSecret -and -not $RotateSecret) {
  $secret = [System.Net.NetworkCredential]::new('', $WorkerSecret).Password
  Write-Host 'Using the secret supplied for this session.'
} else {
  $secret = if (-not $RotateSecret) { Load-CachedSecret $cachePath } else { $null }
  if (-not $secret) {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $secret = [Convert]::ToBase64String($bytes)
  if ($RotateSecret) { Write-Host 'Rotating worker secret.' } else { Write-Host 'Generating worker secret.' }
  } else { Write-Host 'Using encrypted local worker secret cache.' }
}
$bootstrapBytes = New-Object byte[] 32; $bootstrapRng=[Security.Cryptography.RandomNumberGenerator]::Create(); try { $bootstrapRng.GetBytes($bootstrapBytes) } finally { $bootstrapRng.Dispose() }; $bootstrap=[Convert]::ToBase64String($bootstrapBytes)
npx.cmd supabase secrets set "STORAGE_CLEANUP_WORKER_SECRET=$secret" "STORAGE_CLEANUP_BOOTSTRAP_SECRET=$bootstrap" --project-ref $projectRef

Write-Host '[5/7] Deploying Edge Function'
npx.cmd supabase functions deploy process-storage-cleanup --project-ref $projectRef --no-verify-jwt

Write-Host '[6/7] Testing authorized and unauthorized requests'
& "$PSScriptRoot\test-storage-cleanup-worker.ps1" -ProjectRef $projectRef -WorkerSecret (ConvertTo-SecureString $secret -AsPlainText -Force)

Write-Host '[7/10] Configuring Vault and Cron'
$functionUrl = "https://$projectRef.supabase.co/functions/v1/process-storage-cleanup"
try {
  $config = Invoke-WebRequest -UseBasicParsing -Uri $functionUrl -Method Post -Headers @{ 'x-cleanup-bootstrap-secret'=$bootstrap } -ContentType 'application/json' -Body '{"action":"configure_schedule"}'
  $configBody = $config.Content | ConvertFrom-Json
  if (-not $configBody.ok -or -not $configBody.active -or $configBody.scheduleCount -ne 1) { throw 'Vault or Cron configuration did not report one active schedule.' }
  Write-Host '[8/10] Verifying schedule'; Write-Host "Schedule: $($configBody.schedule), active: $($configBody.active), count: $($configBody.scheduleCount)"
  Save-CachedSecret $cachePath $secret
} finally {
  npx.cmd supabase secrets unset STORAGE_CLEANUP_BOOTSTRAP_SECRET --project-ref $projectRef | Out-Null
  $bootstrap = $null
}

Write-Host '[9/10] Verifying readiness'
npx.cmd supabase functions list --project-ref $projectRef | Out-Host
Write-Host '[10/10] Worker setup complete. Vault synchronization and one active Cron schedule verified.'
$secret = $null
