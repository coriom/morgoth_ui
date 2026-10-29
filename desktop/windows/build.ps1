param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference = 'Stop'
$source = Join-Path $Root 'desktop\windows\TestTarget.cs'
$targetDir = Join-Path $Root 'desktop\windows\target'
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
$target = Join-Path $targetDir 'morgoth-d13-test-target.exe'
if (Test-Path $target) { Remove-Item -LiteralPath $target -Force }
Add-Type -Path $source -OutputAssembly $target -OutputType WindowsApplication -ReferencedAssemblies @('System.Windows.Forms', 'System.Drawing')
if (-not (Test-Path $target)) { throw 'TARGET_BUILD_FAILED' }
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant()
$companionSource = Join-Path $Root 'desktop\windows\Companion.cs'
$companion = Join-Path $targetDir 'morgoth-d13-companion.exe'
$definition = [IO.File]::ReadAllText($companionSource, [Text.Encoding]::UTF8).Replace('__TARGET_SHA256__', $hash)
if (Test-Path $companion) { Remove-Item -LiteralPath $companion -Force }
Add-Type -TypeDefinition $definition -OutputAssembly $companion -OutputType ConsoleApplication -ReferencedAssemblies @('System.Web.Extensions', 'UIAutomationClient', 'UIAutomationTypes', 'System.Windows.Forms', 'System.Drawing')
if (-not (Test-Path $companion)) { throw 'COMPANION_BUILD_FAILED' }
Write-Output 'D13_WINDOWS_BUILD_OK'
