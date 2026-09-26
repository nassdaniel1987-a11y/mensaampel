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
uint64_t sessionUntil=0,loginAfter=0,captureUntil=0,restartAt=0,showCredentialsUntil=0,resetConfirmUntil=0,clockCheckAt=0,ampelSeenAt=0;unsigned loginFailures=0;bool ampelWarned=false;long encoderBase=0;
bool feedbackOk=true;uint64_t feedbackAt=0,drawAt=0;
uint64_t nowMs(){return uint64_t(esp_timer_get_time()/1000);}
void note(const std::string& text,bool ok){feedback=text;feedbackOk=ok;feedbackAt=nowMs();M5.Speaker.tone(ok?1800:400,ok?90:220);}
bool blocked(){return !configValid||!config.configured||!storage.error.empty()||needsReview||!reader.healthy||!captureTarget.empty();}
void reply(int code,const Json& value){auto body=value.dump();web.sendHeader("Cache-Control","no-store");web.sendHeader("X-Content-Type-Options","nosniff");web.send(code,"application/json; charset=utf-8",body.c_str());}
bool localOrigin(){String host=web.hostHeader();if(host!="192.168.4.1"&&host!="192.168.4.1:80")return false;String origin=web.header("Origin");return origin.isEmpty()||origin==String("http://")+host;}
bool authorized(){return localOrigin()&&!session.empty()&&nowMs()<sessionUntil&&constantEqual(web.header("X-Mensa-Token").c_str(),session);}
Json publicSignal(){
 ampelSeenAt=nowMs();auto signal=engine.signal(nowMs());if(blocked())signal={{"green",false},{"reason","device"},{"free",0}};
 return {{"signal",signal},{"storageError",blocked()?"System nicht bereit.":""},{"now",nowMs()}};
}
Json state(){auto s=engine.status(nowMs());
 s["storageError"]=storage.error;s["recoveryRequired"]=false;s["sim"]={{"offset",0},{"offline",false},{"forceWriteFailure",false}};
 s["device"]={{"version","0.7.0-preview"},{"configured",config.configured},{"reader",config.reader},{"readerHealthy",reader.healthy},{"readerError",reader.error},{"ssid",config.ssid},{"captureTarget",captureTarget},{"capturedUid",capturedUid},{"captureUntil",captureUntil},{"feedback",feedback},{"feedbackOk",feedbackOk},{"needsReview",needsReview},{"freeHeap",ESP.getFreeHeap()},{"minimumHeap",ESP.getMinFreeHeap()},{"clients",WiFi.softAPgetStationNum()},{"uptime",nowMs()}};
 if(blocked())s["signal"]={{"green",false},{"reason","device"},{"free",0}};return s;
}
// Built-in RTC: plausible once it was set from the tablet; supplies weekday and time for the learned half-hour values.
bool rtcTime(m5::rtc_datetime_t& t){return M5.Rtc.isEnabled()&&M5.Rtc.getDateTime(&t)&&t.date.year>=2025&&t.date.year<2100&&t.time.hours>=0&&t.time.hours<24&&t.time.minutes>=0&&t.time.minutes<60&&t.date.weekDay>=0&&t.date.weekDay<7;}
void setRtc(const Json& d){
 if(!M5.Rtc.isEnabled()||!d.is_array()||d.size()!=6)return;for(auto& v:d)if(!v.is_number_integer())return;
 int y=d[0],mo=d[1],day=d[2],h=d[3],mi=d[4],se=d[5];if(y<2025||y>2099||mo<1||mo>12||day<1||day>31||h<0||h>23||mi<0||mi>59||se<0||se>59)return;
 tm t{};t.tm_year=y-1900;t.tm_mon=mo-1;t.tm_mday=day;t.tm_hour=h;t.tm_min=mi;t.tm_sec=se;mktime(&t);M5.Rtc.setDateTime(&t);
}
// Signal display outside: once it has polled, more than 10 s without a poll is shown inside on the Dial.
bool ampelLost(){return ampelSeenAt&&nowMs()-ampelSeenAt>10000;}
Json result(bool ok,const std::string& message){return {{"ok",ok},{"message",message}};}
Json transact(const Json& command){
 auto previous=engine;auto r=engine.command(command,nowMs());if(!r.value("ok",false)||!r.value("changed",true))return r;
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
  auto r=transact({{"type","restart"}});if(!r["ok"].get<bool>())return r;clearCapture();clockCheckAt=0;auto next=config;next.reader=selected;
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
 if(type=="measurementContext"&&j.contains("date"))setRtc(j["date"]);
 if(type=="autoSettings"||type=="trialSettings"||type=="trialFeedback"||type=="relief"||type=="confirm"||type=="pause"||type=="correct"||type=="room"||type=="settings"||type=="undo"||type=="newDay"||type=="flowSettings"||type=="measurementContext"||type=="queueState"||type=="measurementArm"||type=="measurementFinish"||type=="measurementCancel"||type=="measurementDeleteLast")return transact(j);
 return result(false,"Diese Aktion ist am Gerät nicht verfügbar.");
}
void configureWeb(){
 const char* headers[]={"Origin","X-Mensa-Token"};web.collectHeaders(headers,2);
 web.on("/api/info",HTTP_GET,[]{if(!localOrigin())return reply(403,result(false,"Fremder Zugriff."));reply(200,{{"mode","device"},{"configured",config.configured},{"nonce",loginNonce},{"version","0.7.0-preview"}});});
 web.on("/api/signal",HTTP_GET,[]{reply(200,publicSignal());});
 web.on("/api/login",HTTP_POST,[]{
  if(!localOrigin())return reply(403,result(false,"Fremder Zugriff."));if(nowMs()<loginAfter)return reply(429,result(false,"Zu viele Versuche. Bitte 30 Sekunden warten."));
  try{if(web.arg("plain").length()>512)throw std::runtime_error("Anfrage zu groß.");auto j=Json::parse(web.arg("plain").c_str());auto password=j.at("password").get<std::string>();if(j.value("nonce",std::string())!=loginNonce||password.size()>64||!configValid||!config.authenticate(password)){if(++loginFailures>=5){loginAfter=nowMs()+30000;loginFailures=0;}return reply(401,result(false,"Kennwort oder Einrichtungscode stimmt nicht."));}
   session=randomKey(40);sessionUntil=nowMs()+8*60*60*1000ULL;loginFailures=0;reply(200,{{"ok",true},{"token",session}});
  }catch(...){reply(400,result(false,"Ungültige Anmeldung."));}
 });
 web.on("/api/state",HTTP_GET,[]{if(!authorized())return reply(401,result(false,"Bitte anmelden."));try{reply(200,state());}catch(...){reply(503,result(false,"Status konnte nicht erstellt werden."));}});
 // Restore a downloaded backup; larger than the 2 KB command limit. Stock must be confirmed again afterwards.
 web.on("/api/restore",HTTP_POST,[]{
  if(!authorized())return reply(401,result(false,"Bitte anmelden."));
  try{if(web.arg("plain").length()>65536)throw std::runtime_error("Sicherung zu groß.");auto j=Json::parse(web.arg("plain").c_str());
   if(!j.value("confirmed",false))return reply(200,result(false,"Einspielen ausdrücklich bestätigen."));
   auto& b=j.at("backup");if(b.value("format",std::string())!="mensa-device-backup-1"&&b.value("format",std::string())!="mensa-pc-backup-1")return reply(200,result(false,"Keine gültige Mensaampel-Sicherung."));
   auto previous=engine;try{engine.restore(b.at("state"));}catch(const std::exception& e){engine=std::move(previous);return reply(200,result(false,std::string("Sicherung ungültig: ")+e.what()));}
   engine.rebootClock(nowMs());if(!storage.save(engine)){engine=std::move(previous);return reply(200,result(false,storage.error));}
   auto r=result(true,"Sicherung eingespielt. Bestand prüfen und bestätigen.");note(r["message"],true);r["state"]=state();reply(200,r);
  }catch(const std::exception& e){reply(400,result(false,e.what()));}
 });
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
 // Main screen: same draw list as the PC simulation (core/dial.hpp).
 mensa::DialExtras x;x.blocked=blocked();x.hint=!reader.healthy?"Leser pruefen!":!storage.error.empty()?"Speicher pruefen!":!captureTarget.empty()?"Karte einlernen am Tablet":ampelLost()?"Ampel draussen getrennt!":"";
 if(feedbackAt&&now-feedbackAt<3500){x.feedback=feedback;x.feedbackOk=feedbackOk;}
 for(auto& i:engine.dialScreen(now,x)){const std::string kind=i[0];
  if(kind=="c")d.fillCircle(i[1].get<int>(),i[2].get<int>(),i[3].get<int>(),uint16_t(i[4].get<int>()));
  else if(kind=="r")d.fillRoundRect(i[1].get<int>(),i[2].get<int>(),i[3].get<int>(),i[4].get<int>(),i[5].get<int>(),uint16_t(i[6].get<int>()));
  else{d.setTextSize(i[3].get<int>());d.setTextColor(uint16_t(i[4].get<int>()));d.drawString(i[5].get<std::string>().c_str(),i[1].get<int>(),i[2].get<int>());}
 }
 d.setTextSize(1);d.setTextColor(TFT_WHITE);
}
void setup(){
 Serial.begin(115200);auto cfg=M5.config();cfg.fallback_board=m5::board_t::board_M5Dial;M5Dial.begin(cfg,true,false);encoderBase=M5Dial.Encoder.read();pinMode(46,OUTPUT);digitalWrite(46,HIGH);M5.Display.setRotation(0);M5.Speaker.setVolume(90);
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
 else if(M5.BtnA.wasReleaseFor(3000)){
  // Holding 3 s confirms an unconfirmed stock; otherwise it shows the WLAN credentials as before.
  bool handled=false;if(configValid&&config.configured&&!needsReview&&!engine.isReady()){if(blocked())note("Leser und Speicher zuerst pruefen.",false);else{auto r=transact({{"type","dialHold"}});handled=r.value("handled",true);if(handled)note(r.value("message",std::string()),r.value("ok",false));}handled=true;}
  if(!handled)showCredentialsUntil=now+30000;}
 else if(M5.BtnA.wasClicked()){
  if(resetConfirmUntil>now){auto next=config;if(!configValid)next.fresh();else{next.configured=false;next.setupCode=randomKey(10);next.salt=randomKey();next.adminHash=passwordHash(next.setupCode,next.salt);}if(next.save()){engine.command({{"type","restart"}},now);restartAt=now+500;}resetConfirmUntil=0;}
  else if(configValid&&config.configured&&!needsReview){auto r=transact({{"type","dialPress"}});note(r.value("message",std::string()),r.value("ok",false));}
 }
 // Automatic group release: only transact (and write flash) when a release or its scheduling is due.
 // Rotary ring: Mensa seats (one step per detent; 4 counts per detent to be verified on the device).
 {long position=M5Dial.Encoder.read();long steps=(position-encoderBase)/4;if(steps){encoderBase+=steps*4;if(configValid&&config.configured&&!needsReview&&now>=showCredentialsUntil)engine.command({{"type","dialTurn"},{"steps",int(steps)}},now);}}
 {bool lost=ampelLost();if(lost&&!ampelWarned)note("Ampel draussen getrennt!",false);ampelWarned=lost;}
 if(configValid&&config.configured&&!needsReview&&storage.error.empty()&&!blocked()&&(engine.autoDue(now)||engine.dayDue(now))){auto r=transact({{"type","tick"}});if(r.value("ok",false)&&!r.value("message",std::string()).empty())note(r["message"],true);}
 if(configValid&&config.configured&&!needsReview&&now>=clockCheckAt){clockCheckAt=now+5000;const auto& f=engine.flowState();m5::rtc_datetime_t t;
  if(!f.clockReady(now)&&!f.armed&&f.started<0&&f.issued==0&&rtcTime(t))transact({{"type","measurementContext"},{"weekday",t.date.weekDay},{"minute",t.time.hours*60+t.time.minutes},{"queue",f.queue}});}
 if(configValid){mensa::Edge edge;if(reader.poll(now,edge)&&edge.kind){
  if(edge.kind<0)engine.command({{"type","remove"}},now);
  else if(!captureTarget.empty()){capturedUid=edge.uid;note("Karte erkannt. Zuordnung am Tablet speichern.",true);}
  else if(!config.configured||needsReview||!storage.error.empty()){note("Einrichtung oder Speicher zuerst pruefen.",false);}
  else{auto r=transact({{"type","scan"},{"uid",edge.uid}});note(r.value("message",std::string()),r.value("ok",false));}
 }}draw();delay(2);
}
