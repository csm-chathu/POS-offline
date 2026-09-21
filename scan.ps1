$ip = '192.168.50.150'
1..9999 | ForEach-Object {
    try {
        $t = New-Object System.Net.Sockets.TcpClient
        $r = $t.BeginConnect($ip, $_, $null, $null)
        if ($r.AsyncWaitHandle.WaitOne(50) -and $t.Connected) {
            Write-Host "OPEN: $_"
        }
        $t.Close()
    } catch {}
}
Write-Host "Scan complete"
