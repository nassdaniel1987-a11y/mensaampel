# Linux/CI variant of scripts/package-device.py: refreshes the repository copy Mensaampel_Dial_Vorbereitung/ from the
# local PlatformIO build (firmware, LittleFS, boot_app0, merged first-install image, guide HTML, licenses, source ZIP,
# manifest with SHA-256). Reuses the unchanged tools/mensa-flash.exe. Needs: pio builds done, pip package "markdown".
# The release ZIP itself is built by .github/workflows/release.yml.
from pathlib import Path
import hashlib,json,re,shutil,subprocess,sys,markdown
from zipfile import ZipFile,ZIP_DEFLATED
root=Path(__file__).resolve().parent.parent;out=root/'Mensaampel_Dial_Vorbereitung';build=root/'firmware/.pio/build/mensa-dial'
version=re.search(r'MENSA_VERSION\s+"([^"]+)"',(root/'firmware/src/version.hpp').read_text()).group(1)
for n in ('firmware.bin','partitions.bin','bootloader.bin','littlefs.bin'):shutil.copy2(build/n,out/'firmware'/n)
shutil.copy2(Path.home()/'.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin',out/'firmware/boot_app0.bin')
shutil.copy2(root/'scripts/installer.ps1',out/'scripts/installer.ps1')
for n in ('Dial-Installieren.cmd','ANLEITUNG-DIAL.md','ENTWICKLUNG.md','DRITTANBIETER.md','EINLASS-UND-MESSUNGEN.md','PRUEFUNG-AM-PC.md','BEDIENUNG-DIAL.html','BEDIENUNG-DIAL.pdf','DIAL-KURZKARTE.html','DIAL-KURZKARTE.pdf','Etiketten-Tool.html'):shutil.copy2(root/n,out/n)
esptool=Path.home()/'.platformio/packages/tool-esptoolpy/esptool.py'
args=[sys.executable,str(esptool),'--chip','esp32s3','merge_bin','--flash_mode','dio','--flash_freq','80m','--flash_size','8MB','-o',str(out/'firmware/first-install.bin')]
for off,n in [('0x0','bootloader.bin'),('0x8000','partitions.bin'),('0xe000','boot_app0.bin'),('0x10000','firmware.bin'),('0x610000','littlefs.bin')]:args+=[off,str(out/'firmware'/n)]
subprocess.run(args,check=True,stdout=subprocess.DEVNULL)
css=re.search(r"css='''(.*?)'''",(root/'scripts/package-device.py').read_text(),re.S).group(1)
body=markdown.markdown((root/'ANLEITUNG-DIAL.md').read_text(encoding='utf-8'),extensions=['tables','fenced_code']).replace('href="EINLASS-UND-MESSUNGEN.md"','href="EINLASS-UND-MESSUNGEN.html"')
(out/'ANLEITUNG-DIAL.html').write_text('<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mensaampel · Dial einrichten</title><style>'+css+'</style><main><button class="print" onclick="window.print()">Drucken / als PDF speichern</button><div class="eyebrow">MENSAAMPEL · GERÄTEVORBEREITUNG</div>'+body+'</main></html>',encoding='utf-8')
mb=markdown.markdown((root/'EINLASS-UND-MESSUNGEN.md').read_text(encoding='utf-8'),extensions=['tables'])
(out/'EINLASS-UND-MESSUNGEN.html').write_text('<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Einlass und Messungen</title><style>'+css+'</style><main>'+mb+'</main></html>',encoding='utf-8')
shutil.copytree(root/'licenses',out/'licenses',dirs_exist_ok=True)
files=subprocess.run(['git','ls-files','-co','--exclude-standard'],cwd=root,capture_output=True,text=True,check=True).stdout.split('\n')
files=sorted(set(files+subprocess.run(['git','ls-files'],cwd=root,capture_output=True,text=True).stdout.split('\n')))
with ZipFile(out/'source/Mensaampel-Quellcode.zip','w',ZIP_DEFLATED) as z:
 for f in files:
  if not f or f.startswith(('vendor/','Mensaampel_Dial_Vorbereitung')):continue
  p=root/f
  if p.is_file():z.write(p,Path('Mensaampel')/f)
 for p in ('build','dist'):
  for f in (root/p).rglob('*'):
   if f.is_file() and str(f.relative_to(root)) not in files:z.write(f,Path('Mensaampel')/f.relative_to(root))
 for lib in (root/'firmware/.pio/libdeps/mensa-dial').iterdir():
  if lib.is_dir():
   for f in lib.rglob('*'):
    if f.is_file() and '.git' not in f.parts:z.write(f,Path('vendor')/lib.name/f.relative_to(lib))
m={'version':version,'board':'M5Stack Dial v1.1 / ESP32-S3 / 8MB','hardwareTested':False,'files':[]}
for f in sorted((out/'firmware').glob('*.bin')):m['files'].append({'path':f.relative_to(out).as_posix(),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
m['files'].append({'path':'tools/mensa-flash.exe','sha256':hashlib.sha256((out/'tools/mensa-flash.exe').read_bytes()).hexdigest()})
(out/'firmware/manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
print(version,'Paket aktualisiert (ZIP baut der Release-Workflow)')
