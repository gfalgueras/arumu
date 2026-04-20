# Start all test servers via WSL
$drive = ($PSScriptRoot -replace '^([A-Za-z]):.*', '$1').ToLower()
$rest  = ($PSScriptRoot -replace '^[A-Za-z]:', '') -replace '\\', '/'
wsl bash -c "/mnt/$drive$rest/start.sh"
