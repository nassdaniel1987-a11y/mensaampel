#include <Arduino.h>
#include <M5Dial.h>
#include <WiFi.h>
#include <WebServer.h>
#include <esp_timer.h>
#include "../../core/engine.hpp"
#include "storage.hpp"
#include "config.hpp"
#include "card_reader.hpp"
#include "web_assets.hpp"

using mensa::Json;
mensa::Engine engine;BookStorage storage;DeviceConfig config;CardReader reader;WebServer web(80);
bool configValid=false,needsReview=false;std::string session,loginNonce,captureTarget,capturedUid,feedback="Bereit zur Einrichtung.";
uint64_t sessionUntil=0,loginAfter=0,captureUntil=0,restartAt=0,showCredentialsUntil=0,resetConfirmUntil=0;unsigned loginFailures=0;
bool feedbackOk=true;uint64_t feedbackAt=0,drawAt=0;
uint64_t nowMs(){return uint64_t(esp_timer_get_time()/1000);}
void note(const std::string& text,bool ok){feedback=text;feedbackOk=ok;feedbackAt=nowMs();M5.Speaker.tone(ok?1800:400,ok?90:220);}
bool blocked(){return !configValid||!config.configured||!storage.error.empty()||needsReview||!reader.healthy||!captureTarget.empty();}
void reply(int code,const Json& value){auto body=value.dump();web.sendHeader("Cache-Control","no-store");web.sendHeader("X-Content-Type-Options","nosniff");web.send(code,"application/json; charset=utf-8",body.c_str());}
bool localOrigin(){String host=web.hostHeader();if(host!="192.168.4.1"&&host!="192.168.4.1:80")return false;String origin=web.header("Origin");return origin.isEmpty()||origin==String("http://")+host;}
bool authorized(){return localOrigin()&&!session.empty()&&nowMs()<sessionUntil&&constantEqual(web.header("X-Mensa-Token").c_str(),session);}
Json publicSignal(){
 auto signal=engine.signal();if(blocked())signal={{"green",false},{"reason","device"},{"free",0}};
 return {{"signal",signal},{"storageError",blocked()?"System nicht bereit.":""},{"now",nowMs()}};
}
Json state(){auto s=engine.status(nowMs());
 s["storageError"]=storage.error;s["recoveryRequired"]=false;s["sim"]={{"offset",0},{"offline",false},{"forceWriteFailure",false}};
 s["device"]={{"version","0.5.0-preview"},{"configured",config.configured},{"reader",config.reader},{"readerHealthy",reader.healthy},{"readerError",reader.error},{"ssid",config.ssid},{"captureTarget",captureTarget},{"capturedUid",capturedUid},{"captureUntil",captureUntil},{"feedback",feedback},{"feedbackOk",feedbackOk},{"needsReview",needsReview},{"freeHeap",ESP.getFreeHeap()},{"minimumHeap",ESP.getMinFreeHeap()},{"clients",WiFi.softAPgetStationNum()},{"uptime",nowMs()}};
 if(blocked())s["signal"]={{"green",false},{"reason","device"},{"free",0}};return s;
}
Json result(bool ok,const std::string& message){return {{"ok",ok},{"message",message}};}
Json transact(const Json& command){
 auto previous=engine;auto r=engine.command(command,nowMs());if(!r.value("ok",false))return r;
 if(!storage.save(engine)){engine=std::move(previous);return result(false,storage.error);}return r;
}
void clearCapture(){captureTarget.clear();capturedUid.clear();captureUntil=0;reader.latch.reset();engine.command({{"type","remove"}},nowMs());}
Json command(const Json& j){
 const auto type=j.at("type").get<std::string>();
 if(needsReview&&type!="correct"&&type!="reconcile"&&type!="deviceSetup"&&type!="deviceSettings"&&type!="captureCancel")return result(false,"Bestand zuerst manuell abgleichen. Keine automatische Überschreibung.");
 if(type=="deviceSetup"||type=="deviceSettings"){
  auto next=config;std::string password=j.value("adminPassword",std::string()),wifi=j.value("wifiPassword",std::string()),ssid=j.value("ssid",config.ssid);
  if(ssid.empty()||ssid.size()>32)return result(false,"WLAN-Name: 1 bis 32 Zeichen.");
  if((!wifi.empty()&&(wifi.size()<8||wifi.size()>63))||(!password.empty()&&(password.size()<10||password.size()>64)))return result(false,"WLAN-Kennwort: 8 bis 63 Zeichen; Betreuungskennwort: 10 bis 64 Zeichen.");
  if(!config.configured&&password.empty())return result(false,"Bitte ein eigenes Betreuungskennwort festlegen.");
  next.ssid=ssid;if(!wifi.empty())next.wifiPassword=wifi;if(!password.empty()){next.salt=randomKey();next.adminHash=passwordHash(password,next.salt);}
  next.configured=true;next.setupCode.clear();if(!next.save())return result(false,"Geräteeinstellungen konnten nicht gespeichert werden.");
  bool wifiChanged=next.ssid!=config.ssid||next.wifiPassword!=config.wifiPassword;config=next;
  if(wifiChanged){engine.command({{"type","restart"}},nowMs());restartAt=nowMs()+2500;return result(true,"Gespeichert. Gerät startet neu. Tablet anschließend mit dem neuen WLAN verbinden.");}
  return result(true,"Gerät eingerichtet. Jetzt Leser prüfen und echte Karten zuordnen.");
 }
 if(type=="reader"){
  std::string selected=j.at("reader");if(selected!="internal"&&selected!="external")return result(false,"Ungültige Leserauswahl.");
  auto r=transact({{"type","restart"}});if(!r["ok"].get<bool>())return r;clearCapture();auto next=config;next.reader=selected;
  if(!next.save())return result(false,"Leserauswahl konnte nicht gespeichert werden.");config=next;bool ok=reader.begin(selected);
  return result(ok,ok?"Leser umgestellt und erreichbar. Karte entfernen und Bestand erneut bestätigen.":reader.error);
 }
 if(type=="captureStart"){
  if(blocked()&&(!captureTarget.empty()||needsReview||!storage.error.empty()||!config.configured||!reader.healthy))return result(false,"Gerät zuerst betriebsbereit machen.");
  const auto target=j.at("uid").get<std::string>();auto snapshot=engine.snapshot();bool found=false;for(auto& c:snapshot["cards"])if(c["uid"]==target&&!c["out"].get<bool>())found=true;if(!found)return result(false,"Karte fehlt oder ist noch ausgegeben.");
  auto r=transact({{"type","pause"},{"paused",true}});if(!r["ok"].get<bool>())return r;clearCapture();captureTarget=target;captureUntil=nowMs()+60000;return result(true,"Einlernen aktiv. Leser zuerst freimachen, dann genau eine Karte vorhalten. Einlass bleibt pausiert.");
 }
 if(type=="captureCancel"){clearCapture();return result(true,"Einlernen beendet. Einlass bei Bedarf fortsetzen.");}
 if(type=="captureBind"){
  if(captureTarget.empty()||capturedUid.empty()||nowMs()>=captureUntil)return result(false,"Zuerst eine Karte im Einlernmodus vorhalten.");
  auto r=transact({{"type","bind"},{"uid",captureTarget},{"newUid",capturedUid}});if(r["ok"].get<bool>())clearCapture();return r;
 }
 if(type=="storageRetry"){if(needsReview)return result(false,"Beschädigten Bestand erst manuell abgleichen.");return storage.save(engine)?result(true,"Speicherung erfolgreich geprüft."):result(false,storage.error);}
 if(type=="reconcile"){
  if(!j.value("confirmed",false))return result(false,"Bestandsabgleich ausdrücklich bestätigen.");
  engine.command({{"type","restart"}},nowMs());if(!storage.reconcile(engine))return result(false,storage.error);needsReview=false;return result(true,"Abgeglichener Bestand gespeichert. Jetzt Bestand bestätigen.");
 }
 if(type=="deviceRestart"){auto r=transact({{"type","restart"}});if(r["ok"].get<bool>())restartAt=nowMs()+1000;return r;}
 if(type=="createSlot"){
  const auto label=j.at("label").get<std::string>();auto previous=engine;auto r=engine.command({{"type","enroll"},{"uid","sim:"+label},{"label",label},{"room",j.at("room")}},nowMs());if(!r.value("ok",false))return r;
  engine.command({{"type","correct"},{"uid","sim:"+label},{"out",false},{"lost",true}},nowMs());if(!storage.save(engine)){engine=previous;return result(false,storage.error);}return result(true,"Kartennummer angelegt. Nun eine echte Karte zuordnen.");
 }
 if(needsReview){if(type=="correct"){auto r=engine.command(j,nowMs());if(r.value("ok",false))r["message"]="Korrektur vorgemerkt. Nach vollständiger Prüfung den Bestand ausdrücklich übernehmen.";return r;}return result(false,"Bestand zuerst manuell abgleichen.");}
 if(type=="trialFeedback"&&blocked())return result(false,"Gerät zuerst betriebsbereit machen.");
 if(type=="confirm"&&blocked())return result(false,"Einrichtung, Leser und Speicherung zuerst prüfen.");
 if(type=="correct"&&j.at("uid").get<std::string>().rfind("sim:",0)==0)return result(false,"Dieser Nummer zuerst eine echte Karte zuordnen.");
 if(type=="trialSettings"||type=="trialFeedback"||type=="relief"||type=="confirm"||type=="pause"||type=="correct"||type=="room"||type=="settings"||type=="undo"||type=="newDay"||type=="flowSettings"||type=="measurementContext"||type=="queueState"||type=="measurementArm"||type=="measurementFinish"||type=="measurementCancel"||type=="measurementDeleteLast")return transact(j);
 return result(false,"Diese Aktion ist am Gerät nicht verfügbar.");
}
void configureWeb(){
 const char* headers[]={"Origin","X-Mensa-Token"};web.collectHeaders(headers,2);
 web.on("/api/info",HTTP_GET,[]{if(!localOrigin())return reply(403,result(false,"Fremder Zugriff."));reply(200,{{"mode","device"},{"configured",config.configured},{"nonce",loginNonce},{"version","0.5.0-preview"}});});
 web.on("/api/signal",HTTP_GET,[]{reply(200,publicSignal());});
 web.on("/api/login",HTTP_POST,[]{
  if(!localOrigin())return reply(403,result(false,"Fremder Zugriff."));if(nowMs()<loginAfter)return reply(429,result(false,"Zu viele Versuche. Bitte 30 Sekunden warten."));
  try{if(web.arg("plain").length()>512)throw std::runtime_error("Anfrage zu groß.");auto j=Json::parse(web.arg("plain").c_str());auto password=j.at("password").get<std::string>();if(j.value("nonce",std::string())!=loginNonce||password.size()>64||!configValid||!config.authenticate(password)){if(++loginFailures>=5){loginAfter=nowMs()+30000;loginFailures=0;}return reply(401,result(false,"Kennwort oder Einrichtungscode stimmt nicht."));}
   session=randomKey(40);sessionUntil=nowMs()+8*60*60*1000ULL;loginFailures=0;reply(200,{{"ok",true},{"token",session}});
  }catch(...){reply(400,result(false,"Ungültige Anmeldung."));}
 });
 web.on("/api/state",HTTP_GET,[]{if(!authorized())return reply(401,result(false,"Bitte anmelden."));try{reply(200,state());}catch(...){reply(503,result(false,"Status konnte nicht erstellt werden."));}});
 web.on("/api/logout",HTTP_POST,[]{if(!authorized())return reply(401,result(false,"Bitte anmelden."));session.clear();reply(200,result(true,"Abgemeldet."));});
 web.on("/api/command",HTTP_POST,[]{
  if(!authorized())return reply(401,result(false,"Bitte anmelden."));try{
   if(web.arg("plain").length()>2048)throw std::runtime_error("Anfrage zu groß.");auto j=Json::parse(web.arg("plain").c_str());auto r=command(j);note(r.value("message",std::string()),r.value("ok",false));r["state"]=state();reply(200,r);
  }catch(const std::exception& e){reply(400,result(false,e.what()));}
 });
 web.on("/api/backup",HTTP_GET,[]{if(!authorized())return reply(401,result(false,"Bitte anmelden."));web.sendHeader("Content-Disposition","attachment; filename=mensa-bestand.json");reply(200,{{"format","mensa-device-backup-1"},{"state",engine.snapshot()},{"reader",config.reader}});});
 web.onNotFound([]{
  if(web.method()!=HTTP_GET)return reply(405,result(false,"Methode nicht erlaubt."));String path=web.uri();if(path=="/"||path=="/ampel"||path=="/geraet")path="/index.html";
  for(auto& a:webAssets)if(path==a.path){web.sendHeader("Content-Encoding","gzip");web.sendHeader("Cache-Control","no-cache");web.sendHeader("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");web.send_P(200,a.mime,(const char*)a.bytes,a.length);return;}
  reply(404,result(false,"Nicht gefunden."));
 });web.begin();
}
void draw(){
 uint64_t now=nowMs();if(now-drawAt<500)return;drawAt=now;auto& d=M5.Display;
 bool credentials=!config.configured||now<showCredentialsUntil;d.fillScreen(TFT_BLACK);d.setTextColor(TFT_WHITE);d.setTextSize(1);d.setTextDatum(middle_center);
 if(resetConfirmUntil>now){d.drawString("Zugang zuruecksetzen?",120,85);d.drawString("Kurz druecken: JA",120,120);d.drawString("Bestand bleibt erhalten",120,145);return;}
 if(!configValid){d.drawString("Konfiguration defekt",120,85);d.drawString("Taste 10 s halten",120,120);return;}
 if(credentials){d.drawString(config.ssid.c_str(),120,55);d.drawString(("WLAN: "+config.wifiPassword).c_str(),120,80);d.drawString("http://192.168.4.1",120,108);if(!config.configured){d.drawString("Einrichtungscode:",120,137);d.drawString(config.setupCode.c_str(),120,158);}else d.drawString("Kennwort im Browser eingeben",120,146);return;}
 bool green=!blocked()&&engine.isGreen(),yellow=!blocked()&&engine.isYellow();d.fillCircle(120,38,13,green?TFT_GREEN:yellow?TFT_YELLOW:TFT_RED);d.setTextSize(2);d.drawString(green?"Platz frei":yellow?"Wenig Platz":"Einlass zu",120,76);d.setTextSize(1);
 d.drawString(("Kueche: "+std::to_string(engine.available(0))+"  Mensa: "+std::to_string(engine.available(1))).c_str(),120,107);
 d.drawString(engine.isRelieving()?"Pause: Ausgabe entlasten":engine.isPaused()?"Einlass pausiert":engine.groupRemaining()>=0?("Noch "+std::to_string(engine.groupRemaining())+" in dieser Gruppe").c_str():"Ohne Gruppenbegrenzung",120,128);
 d.fillRoundRect(30,142,180,35,8,engine.isRelieving()?TFT_DARKGREY:TFT_ORANGE);d.setTextColor(TFT_BLACK);d.drawString(engine.isRelieving()?"Taste: fortsetzen":"Ausgabe entlasten",120,159);d.setTextColor(TFT_WHITE);
 if(!reader.healthy)d.drawString("Leser pruefen!",120,188);else if(!storage.error.empty())d.drawString("Speicher pruefen!",120,188);else if(!engine.isReady())d.drawString("Bestand am Tablet bestaetigen",120,188);else if(!captureTarget.empty())d.drawString("Karte einlernen am Tablet",120,188);
 if(feedbackAt&&now-feedbackAt<3500){d.setTextColor(feedbackOk?TFT_GREEN:TFT_ORANGE);d.drawString(feedback.substr(0,32).c_str(),120,204);d.setTextColor(TFT_WHITE);}
 d.drawString("Taste: Pause / weiter",120,222);
}
void setup(){
 Serial.begin(115200);auto cfg=M5.config();cfg.fallback_board=m5::board_t::board_M5Dial;M5Dial.begin(cfg,false,false);pinMode(46,OUTPUT);digitalWrite(46,HIGH);M5.Display.setRotation(0);M5.Speaker.setVolume(90);
 configValid=config.load();needsReview=!storage.load(engine);engine.rebootClock(nowMs());
 loginNonce=randomKey();if(configValid){reader.begin(config.reader);WiFi.mode(WIFI_AP);WiFi.setSleep(false);WiFi.softAPConfig(IPAddress(192,168,4,1),IPAddress(192,168,4,1),IPAddress(255,255,255,0));if(!WiFi.softAP(config.ssid.c_str(),config.wifiPassword.c_str(),1,false,4)){configValid=false;feedback="WLAN konnte nicht gestartet werden.";}else configureWeb();}
 draw();
}
void loop(){
 const auto now=nowMs();M5Dial.update();if(configValid)web.handleClient();
 if(restartAt&&now>=restartAt)ESP.restart();if(captureUntil&&now>=captureUntil){clearCapture();note("Einlernen abgelaufen. Einlass bleibt pausiert.",false);}
 auto touch=M5.Touch.getDetail();
 if(touch.wasPressed()&&touch.x>=30&&touch.x<=210&&touch.y>=142&&touch.y<=177&&configValid&&config.configured&&!needsReview&&now>=showCredentialsUntil&&now>=resetConfirmUntil&&!engine.isRelieving()){
  auto r=transact({{"type","relief"}});note(r.value("message",std::string()),r.value("ok",false));
 }
 if(M5.BtnA.wasReleaseFor(10000)){resetConfirmUntil=now+15000;}
 else if(M5.BtnA.wasReleaseFor(3000)){showCredentialsUntil=now+30000;}
 else if(M5.BtnA.wasClicked()){
  if(resetConfirmUntil>now){auto next=config;if(!configValid)next.fresh();else{next.configured=false;next.setupCode=randomKey(10);next.salt=randomKey();next.adminHash=passwordHash(next.setupCode,next.salt);}if(next.save()){engine.command({{"type","restart"}},now);restartAt=now+500;}resetConfirmUntil=0;}
  else if(configValid&&config.configured&&!needsReview){auto r=transact({{"type","pause"},{"paused",!engine.isPaused()}});note(r.value("message",std::string()),r.value("ok",false));}
 }
 if(configValid){mensa::Edge edge;if(reader.poll(now,edge)&&edge.kind){
  if(edge.kind<0)engine.command({{"type","remove"}},now);
  else if(!captureTarget.empty()){capturedUid=edge.uid;note("Karte erkannt. Zuordnung am Tablet speichern.",true);}
  else if(!config.configured||needsReview||!storage.error.empty()){note("Einrichtung oder Speicher zuerst pruefen.",false);}
  else{auto r=transact({{"type","scan"},{"uid",edge.uid}});note(r.value("message",std::string()),r.value("ok",false));}
 }}draw();delay(2);
}
