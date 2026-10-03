param([switch]$CheckOnly,[switch]$CheckUiOnly)
$ErrorActionPreference='Stop'
$bundleRoot=Split-Path -Parent $PSScriptRoot
$flasher=Join-Path $bundleRoot 'tools/mensa-flash.exe'
$manifestPath=Join-Path $bundleRoot 'firmware/manifest.json'
function File-Sha256([string]$Path){
    $stream=[IO.File]::OpenRead($Path);$algorithm=[Security.Cryptography.SHA256]::Create()
    try{return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','')}finally{$stream.Dispose();$algorithm.Dispose()}
}
function Test-Bundle {
    $manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    # A missing or changed USB tool is usually removed or blocked by antivirus software on managed PCs.
    $blocked='Das USB-Werkzeug tools\mensa-flash.exe fehlt oder wurde veraendert - vermutlich vom Virenschutz blockiert oder entfernt. ZIP erneut vollstaendig entpacken; auf Schul-PCs die IT bitten, den Ordner freizugeben.'
    if(!(Test-Path -LiteralPath $flasher)){throw $blocked}
    foreach($entry in $manifest.files){
        $path=Join-Path $bundleRoot $entry.path
        $isTool=$entry.path -eq 'tools/mensa-flash.exe'
        if(!(Test-Path -LiteralPath $path)){if($isTool){throw $blocked};throw "Datei fehlt: $($entry.path). Bitte das gesamte ZIP entpacken."}
        if((File-Sha256 $path) -ne $entry.sha256){if($isTool){throw $blocked};throw "Datei beschaedigt: $($entry.path). ZIP erneut herunterladen und vollstaendig entpacken."}
    }
}
try{Test-Bundle}catch{Write-Error $_;exit 1}
if($CheckOnly){Write-Output 'Installationspaket vollstaendig; Pruefsummen stimmen.';exit 0}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form=New-Object Windows.Forms.Form
$form.Text='Mensaampel auf dem Dial installieren'
$form.Size=New-Object Drawing.Size(760,650)
$form.StartPosition='CenterScreen'
$form.Font=New-Object Drawing.Font('Segoe UI',10)
$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
function Label($text,$x,$y,$w,$h){$l=New-Object Windows.Forms.Label;$l.Text=$text;$l.Location=New-Object Drawing.Point($x,$y);$l.Size=New-Object Drawing.Size($w,$h);$form.Controls.Add($l);return $l}
$null=Label 'M5Stack Dial v1.1 - vorbereitete Geraeteversion' 24 20 690 28
$null=Label "Noch nicht auf echter Hardware abgenommen. Zuerst mit wenigen Testkarten pruefen.`r`nG0-Taste hinten halten, USB-Datenkabel einstecken, Taste loslassen." 24 58 690 54
$null=Label 'USB-Anschluss' 24 123 160 25
$ports=New-Object Windows.Forms.ComboBox;$ports.Location=New-Object Drawing.Point(190,119);$ports.Size=New-Object Drawing.Size(345,30);$ports.DropDownStyle='DropDownList';$form.Controls.Add($ports)
$refresh=New-Object Windows.Forms.Button;$refresh.Text='Aktualisieren';$refresh.Location=New-Object Drawing.Point(550,117);$refresh.Size=New-Object Drawing.Size(160,32);$form.Controls.Add($refresh)
$null=Label 'Vorgang' 24 168 150 25
$mode=New-Object Windows.Forms.ComboBox;$mode.Location=New-Object Drawing.Point(190,164);$mode.Size=New-Object Drawing.Size(520,30);$mode.DropDownStyle='DropDownList';[void]$mode.Items.Add('Update - Karten und Einstellungen behalten');[void]$mode.Items.Add('Erstinstallation - vorhandenen Geraeteinhalt ersetzen');$mode.SelectedIndex=0;$form.Controls.Add($mode)
$notice=Label 'Update nur fuer eine bereits installierte Mensaampel mit diesem Speicherlayout.' 24 211 690 44
$confirm=New-Object Windows.Forms.CheckBox;$confirm.Text='Ich verwende einen M5Stack Dial v1.1 und habe den Vorgang oben geprueft.';$confirm.Location=New-Object Drawing.Point(24,260);$confirm.Size=New-Object Drawing.Size(690,30);$form.Controls.Add($confirm)
$start=New-Object Windows.Forms.Button;$start.Text='Software uebertragen';$start.Location=New-Object Drawing.Point(24,305);$start.Size=New-Object Drawing.Size(230,40);$form.Controls.Add($start)
$log=New-Object Windows.Forms.TextBox;$log.Location=New-Object Drawing.Point(24,366);$log.Size=New-Object Drawing.Size(686,225);$log.Multiline=$true;$log.ReadOnly=$true;$log.ScrollBars='Vertical';$log.Font=New-Object Drawing.Font('Consolas',9);$form.Controls.Add($log)
$script:portRecords=@();$script:running=$false;$script:done=''
$updatePorts={try{$script:portRecords=@((& $flasher ports | ConvertFrom-Json));$ports.Items.Clear();$dial=-1;for($i=0;$i -lt $script:portRecords.Count;$i++){$p=$script:portRecords[$i];$espressif=$p.vid -eq 0x303A;if($espressif -and $dial -lt 0){$dial=$i};[void]$ports.Items.Add("$($p.port) - $($p.description)"+$(if($espressif){' (ESP32-S3, vermutlich das Dial)'}else{''}))};if($ports.Items.Count){$ports.SelectedIndex=[Math]::Max(0,$dial)}else{$log.Text='Kein USB-Geraet erkannt. Datenkabel und G0-Modus pruefen, dann aktualisieren.'}}catch{$log.Text=$_.Exception.Message}}
$refresh.Add_Click($updatePorts)
$mode.Add_SelectedIndexChanged({$confirm.Checked=$false;if($mode.SelectedIndex -eq 1){$notice.Text='Erstinstallation loescht vorhandene Software, Zugangsdaten und Karten auf dem Dial. Vorher sichern.'}else{$notice.Text='Update nur fuer eine bereits installierte Mensaampel mit diesem Speicherlayout.'}})
function Run-Flash([string[]]$Arguments){
    $out=Join-Path $bundleRoot 'installation.log';$err=Join-Path $bundleRoot 'installation-fehler.log'
    # Each argument is a fixed token, validated COM name, or a quoted local path.
    $quoted=($Arguments | ForEach-Object {'"'+$_+'"'}) -join ' '
    $process=Start-Process -FilePath $flasher -ArgumentList $quoted -WorkingDirectory $bundleRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
    # Windows PowerShell only reports ExitCode reliably when the handle was fetched right after the start.
    $null=$process.Handle
    while(!$process.HasExited){Start-Sleep -Milliseconds 200;$text='';if(Test-Path $out){$text=Get-Content $out -Raw};if(Test-Path $err){$text+="`r`n"+(Get-Content $err -Raw)};$log.Text=$script:done+$text;$log.SelectionStart=$log.Text.Length;$log.ScrollToCaret();[Windows.Forms.Application]::DoEvents();$process.Refresh()}
    $process.WaitForExit();$text=[string](Get-Content $out -Raw)+"`r`n"+[string](Get-Content $err -Raw)
    $log.Text=$script:done+$text;$script:done=$log.Text+"`r`n"
    # Success: exit code 0, or (if Windows still reports none) the tool's own success message.
    $code=$process.ExitCode
    $ok=($code -eq 0) -or (($null -eq $code) -and ($text -match 'Hash of data verified|Chip erase completed successfully|Read \d+ bytes'))
    if(!$ok){throw 'Uebertragung fehlgeschlagen. Meldung unten pruefen; G0-Modus erneut starten und wiederholen.'}
}
$start.Add_Click({
 if(!$confirm.Checked -or $ports.SelectedIndex -lt 0){[void][Windows.Forms.MessageBox]::Show('Bitte USB-Anschluss auswaehlen und das Kaestchen bestaetigen.');return}
 $port=$script:portRecords[$ports.SelectedIndex].port;if($port -notmatch '^COM\d+$'){return}
 if($mode.SelectedIndex -eq 1){$answer=[Windows.Forms.MessageBox]::Show('Erstinstallation: Der gesamte Speicher dieses Dial wird geloescht. Wirklich fortfahren?','Erstinstallation bestaetigen','YesNo','Warning');if($answer -ne 'Yes'){return}}
 $script:running=$true;$start.Enabled=$false;$refresh.Enabled=$false;$mode.Enabled=$false;$ports.Enabled=$false
 try{
  Test-Bundle
  $script:done=''
  $base=@('--chip','esp32s3','--port',$port,'--baud','460800')
  if($mode.SelectedIndex -eq 1){Run-Flash ($base+@('--after','no_reset','erase_flash'));Run-Flash ($base+@('--before','no_reset','write_flash','--flash_size','8MB','0x0',(Join-Path $bundleRoot 'firmware/first-install.bin')))}
  else{
   $layoutPath=Join-Path $bundleRoot 'layout-vom-geraet.bin'
   $expectedPath=Join-Path $bundleRoot 'firmware/partitions.bin'
   $layoutLength=(Get-Item -LiteralPath $expectedPath).Length.ToString()
   Run-Flash ($base+@('--after','no_reset','read_flash','0x8000',$layoutLength,$layoutPath))
   if((File-Sha256 $layoutPath) -ne (File-Sha256 $expectedPath)){throw 'Speicherlayout passt nicht. Update abgebrochen; nichts geschrieben. Erstinstallation nur nach Sicherung waehlen.'}
   # 0xe000 (ota data) zuruecksetzen: nach einem Update ueber das Tablet startet das Dial sonst weiter aus dem zweiten
   # Programmbereich und die per USB geschriebene Version waere unsichtbar. Karten und Einstellungen bleiben.
   Run-Flash ($base+@('--before','no_reset','write_flash','--flash_size','8MB','0xe000',(Join-Path $bundleRoot 'firmware/boot_app0.bin'),'0x10000',(Join-Path $bundleRoot 'firmware/firmware.bin')))
  }
  $log.AppendText("`r`nFertig. Falls noetig RST druecken oder USB neu verbinden. WLAN und Einrichtungscode stehen auf dem Dial. Dann ANLEITUNG-DIAL.html oeffnen.")
 }catch{$log.AppendText("`r`n"+$_.Exception.Message)}finally{$script:running=$false;$start.Enabled=$true;$refresh.Enabled=$true;$mode.Enabled=$true;$ports.Enabled=$true}
})
$form.Add_FormClosing({param($sender,$eventArgs)if($script:running){$eventArgs.Cancel=$true;[void][Windows.Forms.MessageBox]::Show('Bitte warten, bis die Uebertragung beendet ist.')}})
if($CheckUiOnly){Write-Output 'Installationsdialog erfolgreich aufgebaut (ohne Anzeige und ohne Uebertragung).';$form.Dispose();exit 0}
& $updatePorts
[void]$form.ShowDialog()
