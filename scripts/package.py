"""Create portable Windows bundle without private state or development dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
target = root.parent / 'outputs' / 'Mensaampel_PC_Simulation.zip'
target.parent.mkdir(exist_ok=True)
excluded = {'node_modules', '.pio', '.git', '__pycache__'}
with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for file in root.rglob('*'):
        relative = file.relative_to(root)
        if file.is_file() and relative.parts[0] != 'data' and file.name != 'Dial-Installieren.cmd' and not excluded.intersection(relative.parts):
            archive.write(file, Path('Mensaampel') / relative)
with ZipFile(target) as archive:
    assert archive.testzip() is None
    for required in ['runtime/node.exe', 'build/mensa-core.wasm', 'dist/index.html', 'Start-Mensaampel.cmd', 'ANLEITUNG.md']:
        assert 'Mensaampel/' + required in archive.namelist()
print(f'{target}: {target.stat().st_size / 1024**2:.1f} MB')
