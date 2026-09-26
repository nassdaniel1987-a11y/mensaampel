#pragma once
#include <M5Dial.h>
#include "reader/MensaRFID.h"
#include "../../core/reader_latch.hpp"
class CardReader {
 MensaRFID internal{0x28},external{0x28};MensaRFID* active=&internal;uint64_t previous=0;
public:
 mensa::ReaderLatch latch;bool healthy=false;std::string mode="internal",error;
 bool begin(const std::string& selected){
  internal.setBus(&M5.In_I2C);external.setBus(&M5.Ex_I2C);M5.Ex_I2C.begin();
  internal.ioOk=true;internal.PCD_AntennaOff();
  external.ioOk=true;external.PCD_AntennaOff();
  mode=selected;active=mode=="external"?&external:&internal;latch.reset();active->ioOk=true;active->begin();
  uint8_t version=active->PCD_ReadRegister(MensaRFID::VersionReg);
  healthy=active->ioOk&&version!=0&&version!=0xff;error=healthy?"":"Kartenleser nicht erreichbar. Anschluss und Auswahl prüfen.";return healthy;
 }
 bool poll(uint64_t now,mensa::Edge& edge){
  if(now-previous<100)return false;previous=now;active->ioOk=true;
  if(mode=="external"){internal.ioOk=true;auto internalField=internal.PCD_ReadRegister(MensaRFID::TxControlReg);if(!internal.ioOk||(internalField&3)!=0){healthy=false;error="Interner Leser konnte nicht sicher abgeschaltet werden. Leser erneut prüfen.";edge=latch.sample(mensa::Sample::Fault,"",now);return true;}}
  auto version=active->PCD_ReadRegister(MensaRFID::VersionReg);auto field=active->PCD_ReadRegister(MensaRFID::TxControlReg);
  if(!active->ioOk||version==0||version==0xff||(field&3)!=3){healthy=false;error="Kartenleser gestört. Bitte Anschluss prüfen und Leser erneut prüfen.";edge=latch.sample(mensa::Sample::Fault,"",now);return true;}
  uint8_t atqa[2]={},length=2;auto result=active->PICC_WakeupA(atqa,&length);
  if(!active->ioOk){healthy=false;error="Leserkommunikation gestört.";edge=latch.sample(mensa::Sample::Fault,"",now);return true;}
  if(result==MensaRFID::STATUS_TIMEOUT){healthy=true;error.clear();edge=latch.sample(mensa::Sample::Absent,"",now);return true;}
  if(result!=MensaRFID::STATUS_OK&&result!=MensaRFID::STATUS_COLLISION){healthy=false;error="Karte nicht eindeutig lesbar. Bitte nur eine Karte vorhalten.";edge=latch.sample(mensa::Sample::Fault,"",now);return true;}
  if(!active->PICC_ReadCardSerial()||!active->ioOk){healthy=false;error="Karte nicht eindeutig lesbar. Karte entfernen und erneut vorhalten.";edge=latch.sample(mensa::Sample::Fault,"",now);return true;}
  std::string uid;char hex[4];for(uint8_t i=0;i<active->uid.size;i++){snprintf(hex,sizeof(hex),"%02X",active->uid.uidByte[i]);if(i)uid+=':';uid+=hex;}
  active->PICC_HaltA();if(!active->ioOk){healthy=false;error="Leserkommunikation gestört.";edge=latch.sample(mensa::Sample::Fault,"",now);return true;}
  healthy=true;error.clear();edge=latch.sample(mensa::Sample::Present,uid,now);return true;
 }
};
