# Run driver integration tests via WSL
# Usage:
#   .\test.ps1          # run tests, leave containers up
#   .\test.ps1 --down   # run tests, stop containers after
$drive = ($PSScriptRoot -replace '^([A-Za-z]):.*', '$1').ToLower()
$rest  = ($PSScriptRoot -replace '^[A-Za-z]:', '') -replace '\\', '/'
wsl bash -c "/mnt/$drive$rest/test.sh" @args
