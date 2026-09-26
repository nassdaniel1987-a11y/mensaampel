import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {mkdirSync} from 'node:fs';
mkdirSync('build',{recursive:true});
const sdk=resolve(process.env.EMSDK || '../work/toolchains/emsdk-main');
const python=process.env.EMSDK_PYTHON || join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const result=spawnSync(python,[resolve(sdk,'upstream/emscripten/em++.py'),'core/wasm.cpp','-std=c++17','-O2','-fexceptions','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sENVIRONMENT=node','-sALLOW_MEMORY_GROWTH=1','-sEXPORTED_FUNCTIONS=["_mensa_call"]','-sEXPORTED_RUNTIME_METHODS=["ccall"]','-o','build/mensa-core.cjs'],{stdio:'inherit',env:{...process.env,EMSDK:sdk}});
process.exit(result.status??1);
