import createModule from '../build/mensa-core.cjs';
export async function createEngine(){
 const wasm=await createModule();
 const call=q=>JSON.parse(wasm.ccall('mensa_call','string',['string'],[JSON.stringify(q)]));
 return {call,command:(command,now)=>call({op:'command',command,now}),status:now=>call({op:'status',now}),snapshot:()=>call({op:'snapshot'}),restore:(state,preserveUndo=false)=>call({op:'restore',state,preserveUndo}),reset:()=>call({op:'reset'})};
}
