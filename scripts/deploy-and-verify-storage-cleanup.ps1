param([string]$ProjectRef, [securestring]$WorkerSecret, [switch]$RotateSecret)
$ErrorActionPreference = 'Stop'
& "$PSScriptRoot\setup-storage-cleanup-worker.ps1" -ProjectRef $ProjectRef -WorkerSecret $WorkerSecret -RotateSecret:$RotateSecret
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host 'Hosted worker verification passed. The Cron SQL file is supabase/storage_cleanup_worker_cron.sql.'
