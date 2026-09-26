#pragma once
#include <LittleFS.h>
#include "../../core/engine.hpp"
#include <vector>
// Two alternating records. A torn/corrupt slot never silently rolls the count
// back: load reports a fault and requires explicit reconciliation.
class BookStorage {
 uint32_t generation=0;
 static uint32_t crc(const uint8_t* p,size_t n){uint32_t c=0xffffffff;for(size_t i=0;i<n;i++){c^=p[i];for(int k=0;k<8;k++)c=(c>>1)^(0xedb88320u&-(c&1));}return ~c;}
 struct Header{uint32_t magic,version,generation,length,checksum;};
 bool read(const char* path,mensa::Engine& into,uint32_t& gen){
  auto f=LittleFS.open(path,"r");if(!f)return false;Header h{};if(f.read((uint8_t*)&h,sizeof(h))!=sizeof(h)||h.magic!=0x4d454e53||h.version!=1||h.length>60000||f.size()!=sizeof(h)+h.length)return false;
  std::vector<uint8_t> bytes(h.length);if(f.read(bytes.data(),bytes.size())!=bytes.size()||crc(bytes.data(),bytes.size())!=h.checksum)return false;
  try{auto j=mensa::Json::from_cbor(bytes);into.restore(j);gen=h.generation;return true;}catch(...){return false;}
 }
public:
 bool mounted=false;std::string error;
 bool load(mensa::Engine& engine){
  mounted=LittleFS.begin(false);if(!mounted){error="Gerätespeicher nicht lesbar. Keine automatische Formatierung.";return false;}
  bool a=LittleFS.exists("/book0.bin"),b=LittleFS.exists("/book1.bin"),pending=LittleFS.exists("/book.tmp");if(!a&&!b){engine.reset();engine.prepareHardware();if(pending){uint32_t recovered=0;read("/book.tmp",engine,recovered);generation=recovered;error="Unterbrochene Speicherung. Bestand manuell abgleichen.";return false;}return save(engine);}
  mensa::Engine candidate;uint32_t ga=0,gb=0;bool va=a&&read("/book0.bin",engine,ga),vb=b&&read("/book1.bin",candidate,gb);
  if(vb&&(!va||gb>ga))engine=std::move(candidate);generation=std::max(ga,gb);
  if(pending||(a&&!va)||(b&&!vb)||(!va&&!vb)){error="Bestandsdatei beschädigt oder Speicherung unterbrochen. Angezeigten Bestand manuell abgleichen und ausdrücklich übernehmen.";return false;}
  return true;
 }
 bool save(const mensa::Engine& engine){
  if(!mounted){error="Gerätespeicher nicht verfügbar.";return false;}
  try{
   std::vector<uint8_t> bytes;{auto j=engine.snapshot();j["undo"]=nullptr;j["held"]="";bytes=mensa::Json::to_cbor(j);}
   Header h{0x4d454e53,1,generation+1,uint32_t(bytes.size()),crc(bytes.data(),bytes.size())};
   const char* target=(h.generation%2)?"/book1.bin":"/book0.bin";
   auto f=LittleFS.open("/book.tmp","w");if(!f){error="Speichern nicht möglich.";return false;}
   bool ok=f.write((uint8_t*)&h,sizeof(h))==sizeof(h)&&f.write(bytes.data(),bytes.size())==bytes.size();f.flush();f.close();
   if(!ok){error="Speichern unvollständig.";return false;}
   // Validate the written file before it replaces the inactive slot.
   mensa::Engine verify;uint32_t vg=0;if(!read("/book.tmp",verify,vg)||vg!=h.generation){error="Speicherprüfung fehlgeschlagen.";return false;}
   if(!LittleFS.rename("/book.tmp",target)){error="Speicherabschluss fehlgeschlagen.";return false;}
   generation=h.generation;error.clear();return true;
  }catch(...){error="Speicherfehler. Buchung nicht bestätigt.";return false;}
 }
 bool reconcile(const mensa::Engine& engine){
  if(!mounted)return false;
  // Keep evidence before explicitly accepting a reconciled registry.
  for(int i=0;i<2;i++){String path="/book"+String(i)+".bin";if(LittleFS.exists(path)){String backup="/review"+String(i)+".bin";if(LittleFS.exists(backup)){error="Alte Prüfsicherung vorhanden. Technische Speicherprüfung erforderlich.";return false;}if(!LittleFS.rename(path,backup)){error="Prüfsicherung fehlgeschlagen.";return false;}}}
  return save(engine);
 }
};
