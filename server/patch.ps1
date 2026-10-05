# Run on the VPS from httpdocs AFTER every new web-build upload:
#   cd C:\inetpub\vhosts\tracker.encalmhospitality.com\httpdocs
#   powershell -File patch.ps1
#
# Redirects icon-font requests from the long .pnpm path to /fonts/.

$root = if (Test-Path "$PSScriptRoot\_expo\static\js\web") {
    $PSScriptRoot
} elseif (Test-Path ".\_expo\static\js\web") {
    (Get-Location).Path
} else {
    "C:\inetpub\vhosts\tracker.encalmhospitality.com\httpdocs"
}

$jsFiles = Get-ChildItem "$root\_expo\static\js\web\" -Filter "*.js"
if (-not $jsFiles -or $jsFiles.Count -eq 0) {
    Write-Host "ERROR: no JS bundle found in $root\_expo\static\js\web\"
    exit 1
}

$count = 0
foreach ($file in $jsFiles) {
    $c = Get-Content $file.FullName -Raw
    $hasFont = $c -match 'assets/__node_modules[^"]*(Feather|MaterialIcons|Ionicons|FontAwesome)\.[^"]*\.ttf'
    if ($hasFont) {
        $c = $c -replace 'assets/__node_modules[^"]*Feather\.[^"]*\.ttf',       'fonts/Feather.ca4b48e04dc1ce10bfbddb262c8b835f.ttf'
        $c = $c -replace 'assets/__node_modules[^"]*MaterialIcons\.[^"]*\.ttf', 'fonts/MaterialIcons.4e85bc9ebe07e0340c9c4fc2f6c38908.ttf'
        $c = $c -replace 'assets/__node_modules[^"]*Ionicons\.[^"]*\.ttf',      'fonts/Ionicons.b4eb097d35f44ed943676fd56f6bdc51.ttf'
        $c = $c -replace 'assets/__node_modules[^"]*FontAwesome\.[^"]*\.ttf',   'fonts/FontAwesome.b06871f281fee6b241d60582ae9369b9.ttf'
        Set-Content $file.FullName $c -NoNewline
        Write-Host "Patched font paths in: $($file.Name)"
        $count++
    }
}

if ($count -eq 0) {
    Write-Host "Checked $($jsFiles.Count) JS bundle(s). No unpatched font references found."
} else {
    Write-Host "Successfully patched $count JS bundle(s)."
}
