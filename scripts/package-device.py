"""Assemble the tested local firmware build and USB installer; never flashes hardware."""
from pathlib import Path
import hashlib, json, shutil, subprocess, sys
from zipfile import ZipFile, ZIP_DEFLATED

root=Path(__file__).resolve().parent.parent
workspace=root.parent
output=workspace/'outputs'/'Mensaampel_Dial_Vorbereitung'
build=root/'firmware/.pio/build/mensa-dial'
tools=workspace/'work/toolchains'
for folder in ('firmware','tools','scripts','licenses','source'):
    (output/folder).mkdir(parents=True,exist_ok=True)
for name in ('firmware.bin','partitions.bin','bootloader.bin','littlefs.bin'):
    shutil.copy2(build/name,output/'firmware'/name)
shutil.copy2(tools/'platformio-home/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin',output/'firmware/boot_app0.bin')
shutil.copy2(workspace/'work/flash-dist/mensa-flash.exe',output/'tools/mensa-flash.exe')
shutil.copy2(root/'scripts/installer.ps1',output/'scripts/installer.ps1')
for name in ('Dial-Installieren.cmd','ANLEITUNG-DIAL.md','ENTWICKLUNG.md','DRITTANBIETER.md','EINLASS-UND-MESSUNGEN.md','PRUEFUNG-AM-PC.md','Etiketten-Tool.html'):
    shutil.copy2(root/name,output/name)
args=[str(output/'tools/mensa-flash.exe'),'--chip','esp32s3','merge_bin','--flash_mode','dio','--flash_freq','80m','--flash_size','8MB','-o',str(output/'firmware/first-install.bin')]
for offset,name in [('0x0','bootloader.bin'),('0x8000','partitions.bin'),('0xe000','boot_app0.bin'),('0x10000','firmware.bin'),('0x610000','littlefs.bin')]:
    args += [offset,str(output/'firmware'/name)]
subprocess.run(args,check=True)

sys.path.insert(0,str(tools/'document-tools'))
import markdown
body=markdown.markdown((root/'ANLEITUNG-DIAL.md').read_text(encoding='utf-8'),extensions=['tables','fenced_code'])
css='''*{box-sizing:border-box}body{margin:0;background:#edf3f2;color:#243a42;font:17px/1.65 "Segoe UI",Arial,sans-serif}main{max-width:940px;margin:36px auto;background:white;border-radius:22px;padding:50px 64px;box-shadow:0 12px 40px #183c4810}h1{font-size:42px;line-height:1.15;letter-spacing:-1.3px;color:#174e55;margin:0 0 22px}h2{font-size:25px;line-height:1.3;margin-top:42px;border-top:2px solid #dceae7;padding-top:24px;color:#245d62}a{color:#196d75;text-underline-offset:3px}li{margin:9px 0}code{background:#edf3f2;padding:2px 5px;border-radius:4px;font-size:.88em;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:15px;margin:24px 0}th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #dce4e4}th{background:#eaf3f1}tr:nth-child(even){background:#f7fafa}.eyebrow{font-size:12px;font-weight:700;letter-spacing:2px;color:#477b7e;margin-bottom:24px}.print{border:0;border-radius:8px;background:#326d72;color:white;padding:12px 20px;font:inherit;float:right;cursor:pointer}@media(max-width:700px){main{margin:0;border-radius:0;padding:26px 20px}h1{font-size:32px}.print{float:none;margin-bottom:20px}table{font-size:13px}th,td{padding:7px}}@media print{body{background:white;font-size:10.5pt}main{box-shadow:none;margin:0;padding:0;max-width:none}.print{display:none}h1{font-size:27pt}h2{font-size:16pt;break-after:avoid}table{font-size:9pt}tr{break-inside:avoid}a{color:inherit}p,li{orphans:3;widows:3}@page{size:A4;margin:18mm}}'''
page='<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mensaampel · Dial einrichten</title><style>'+css+'</style><main><button class="print" onclick="window.print()">Drucken / als PDF speichern</button><div class="eyebrow">MENSAAMPEL · GERÄTEVORBEREITUNG</div>'+body+'</main></html>'
(output/'ANLEITUNG-DIAL.html').write_text(page,encoding='utf-8')
shutil.copy2(output/'ANLEITUNG-DIAL.html',workspace/'outputs/ANLEITUNG-DIAL.html')
measure_body=markdown.markdown((root/'EINLASS-UND-MESSUNGEN.md').read_text(encoding='utf-8'),extensions=['tables'])
measure_page='<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Einlass und Messungen</title><style>'+css+'</style><main>'+measure_body+'</main></html>'
(output/'EINLASS-UND-MESSUNGEN.html').write_text(measure_page,encoding='utf-8')
shutil.copy2(output/'EINLASS-UND-MESSUNGEN.html',workspace/'outputs/EINLASS-UND-MESSUNGEN.html')
for guide in [output/'ANLEITUNG-DIAL.html',workspace/'outputs/ANLEITUNG-DIAL.html']:
    guide.write_text(guide.read_text(encoding='utf-8').replace('href="EINLASS-UND-MESSUNGEN.md"','href="EINLASS-UND-MESSUNGEN.html"'),encoding='utf-8')

shutil.copytree(root/'licenses',output/'licenses',dirs_exist_ok=True)
for dist in (tools/'flash-tools').glob('*.dist-info'):
    for f in dist.rglob('*'):
        if f.is_file() and ('license' in str(f.relative_to(dist)).lower() or f.name in ('COPYING','METADATA')):
            dest=output/'licenses'/dist.name/f.relative_to(dist);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,dest)
for lib in (root/'firmware/.pio/libdeps/mensa-dial').iterdir():
    if lib.is_dir():
        for f in lib.glob('*'):
            if f.is_file() and f.name.lower().startswith(('license','copying')):shutil.copy2(f,output/'licenses'/(lib.name+'-'+f.name))
pythonlicense=Path(sys.executable).parent/'LICENSE.txt'
if pythonlicense.exists():shutil.copy2(pythonlicense,output/'licenses/Python.txt')
for f in (workspace/'work/source-archives').glob('*'):
    if f.is_file():shutil.copy2(f,output/'source'/f.name)
with ZipFile(output/'source/Mensaampel-Quellcode.zip','w',ZIP_DEFLATED) as archive:
    for f in root.rglob('*'):
        rel=f.relative_to(root)
        if f.is_file() and rel.parts[0] not in ('data','runtime') and not {'node_modules','.pio','.git','__pycache__'}.intersection(rel.parts):archive.write(f,Path('Mensaampel')/rel)
    for lib in (root/'firmware/.pio/libdeps/mensa-dial').iterdir():
        if lib.is_dir():
            for f in lib.rglob('*'):
                if f.is_file() and '.git' not in f.parts:archive.write(f,Path('vendor')/lib.name/f.relative_to(lib))
manifest={'version':__import__('re').search(r'MENSA_VERSION\s+"([^"]+)"',(root/'firmware/src/version.hpp').read_text(encoding='utf-8')).group(1),'board':'M5Stack Dial v1.1 / ESP32-S3 / 8MB','hardwareTested':False,'files':[]}
for f in sorted((output/'firmware').glob('*.bin')):
    manifest['files'].append({'path':f.relative_to(output).as_posix(),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
manifest['files'].append({'path':'tools/mensa-flash.exe','sha256':hashlib.sha256((output/'tools/mensa-flash.exe').read_bytes()).hexdigest()})
(output/'firmware/manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
subprocess.run(['powershell.exe','-NoProfile','-File',str(output/'scripts/installer.ps1'),'-CheckOnly'],check=True)
target=workspace/'outputs/Mensaampel_Dial_Vorbereitung.zip'
with ZipFile(target,'w',ZIP_DEFLATED,compresslevel=6) as archive:
    for f in output.rglob('*'):
        if f.is_file():archive.write(f,Path(output.name)/f.relative_to(output))
with ZipFile(target) as archive:assert archive.testzip() is None
print(f'{target}: {target.stat().st_size/1024**2:.1f} MB; checksums and ZIP verified')
