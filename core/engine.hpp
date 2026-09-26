#pragma once
#include "vendor/json.hpp"
#include "flow.hpp"
#include "dial.hpp"
#include <string>
#include <set>
#include <vector>
#include <array>
#include <algorithm>
#include <stdexcept>
namespace mensa {
using Json=nlohmann::json;
// Compact copyable state. JSON is allocated only at the boundaries.
class Engine {
 struct Card {std::string uid,label;int room=0;bool out=false,lost=false;long long last=-1;};
 struct Room {int capacity=0,limit=0;bool open=false;};
 struct Event {long long at;std::string message;};
 Flow flow;
 std::vector<Card> cards;std::vector<Event> events;std::array<Room,2> rooms;
 bool ready=false,paused=false,hasUndo=false;int cooldown=10,day=1;std::string held;Card undo;
 static void require(bool b,const std::string& m){if(!b)throw std::runtime_error(m);}
 static int number(const Json& j,const char* k,int lo,int hi){require(j.contains(k)&&j[k].is_number_integer(),std::string(k)+": ganze Zahl erforderlich.");auto n=j[k].get<long long>();require(n>=lo&&n<=hi,std::string(k)+": Wert außerhalb des erlaubten Bereichs.");return int(n);}
 static int roomId(const std::string& r){require(r=="K"||r=="M","Unbekannter Raum.");return r=="K"?0:1;}
 static const char* roomName(int r){return r==0?"K":"M";}
 static Json asJson(const Card& c){return {{"uid",c.uid},{"label",c.label},{"room",roomName(c.room)},{"out",c.out},{"lost",c.lost},{"last",c.last}};}
 static Card fromJson(const Json& j){Card c;c.uid=j.at("uid").get<std::string>();c.label=j.at("label").get<std::string>();c.room=roomId(j.at("room"));require(!c.uid.empty()&&c.uid.size()<=80&&!c.label.empty()&&c.label.size()<=20,"Ungültige Kartenkennung.");require(j.at("out").is_boolean()&&j.at("lost").is_boolean()&&j.at("last").is_number_integer(),"Ungültiger Kartenstatus.");c.out=j["out"];c.lost=j["lost"];c.last=j["last"];require(c.last>=-1,"Ungültige Kartenzeit.");return c;}
 Card& card(const std::string& uid){for(auto& c:cards)if(c.uid==uid)return c;throw std::runtime_error("Unbekannte Karte. Bitte zuerst einlernen.");}
 void log(const std::string& m,long long now){if(events.size()>=80)events.erase(events.begin());events.push_back({now,m});}
public:
 Engine(){reset();}
 void reset(){flow=Flow{};cards.clear();events.clear();rooms={Room{48,48,true},Room{64,64,false}};ready=false;paused=false;hasUndo=false;cooldown=10;day=1;held.clear();for(int r=0;r<2;r++)for(int i=1;i<=rooms[r].capacity;i++){auto label=std::string(roomName(r))+(i<10?"0":"")+std::to_string(i);cards.push_back({"sim:"+label,label,r,false,false,-1});}}
 void prepareHardware(){for(auto& c:cards)if(c.uid.rfind("sim:",0)==0)c.lost=true;ready=false;hasUndo=false;held.clear();}
 void rebootClock(long long now){flow.restart();for(auto& c:cards)if(c.last>=0)c.last=now;ready=false;hasUndo=false;held.clear();}
 int occupied(int r)const{int n=0;for(const auto& c:cards)if(c.room==r&&c.out)n++;return n;}
 int available(int r)const{if(!rooms[r].open)return 0;int n=0;for(const auto& c:cards)if(c.room==r&&!c.out&&!c.lost)n++;return std::max(0,std::min(n,rooms[r].limit-occupied(r)));}
 bool isReady()const{return ready;}bool isPaused()const{return paused||flow.waiting||flow.relief;}bool isYellow()const{return ready&&!isPaused()&&available(0)+available(1)>0&&available(0)+available(1)<=flow.yellow;}bool isGreen()const{return ready&&!isPaused()&&!isYellow()&&(available(0)+available(1)>0);}const std::string& heldUid()const{return held;}
 bool isRelieving()const{return flow.relief;}
 int groupRemaining()const{return flow.batch?std::min(std::max(0,flow.batch-flow.issued),available(0)+available(1)):-1;}
 const Flow& flowState()const{return flow;}
 // Automatic release is only due while the group waits and nothing else holds the entrance closed.
 bool autoPending()const{return flow.autoOn&&flow.waiting&&ready&&!paused&&!flow.relief&&!(flow.started>=0&&flow.kind==1);}
 bool autoDue(long long now)const{return autoPending()&&(flow.releaseAt<0||now>=flow.releaseAt);}
 Json dialScreen(long long now,const DialExtras& x)const{
  using namespace dial;bool g=!x.blocked&&isGreen(),y=!x.blocked&&isYellow(),measuringGroup=flow.started>=0&&flow.kind==1;Json list=Json::array();
  list.push_back(Json::array({"c",120,38,13,g?green:y?yellow:red}));
  list.push_back(text(120,76,2,white,g?"Platz frei":y?"Wenig Platz":"Einlass zu"));
  list.push_back(text(120,107,1,white,"Küche: "+std::to_string(available(0))+"  Mensa: "+std::to_string(available(1))));
  std::string status;long long left=flow.releaseIn(now);
  if(flow.relief)status="Pause: Ausgabe entlasten";else if(paused)status="Einlass pausiert";
  else if(flow.waiting)status=measuringGroup?"Gruppe voll - Messung läuft":flow.autoOn&&left>=0?"Nächste Gruppe in "+std::to_string(left/60)+":"+(left%60<10?"0":"")+std::to_string(left%60):"Gruppe voll";
  else if(flow.batch)status="Noch "+std::to_string(groupRemaining())+" in dieser Gruppe"+(flow.autoOn?" (Auto)":"");else status="Ohne Gruppenbegrenzung";
  list.push_back(text(120,128,1,white,status));
  list.push_back(Json::array({"r",30,142,180,35,8,flow.relief?grey:orange}));list.push_back(text(120,159,1,black,flow.relief?"Taste: fortsetzen":"Ausgabe entlasten"));
  if(!x.feedback.empty()){auto lines=wrap(x.feedback,{188,204});for(size_t i=0;i<lines.size();i++)list.push_back(text(120,i?204:188,1,x.feedbackOk?green:orange,lines[i]));}
  else{std::string hint=!x.hint.empty()?x.hint:!ready?"Bestand am Tablet bestätigen":measuringGroup&&flow.waiting?"Tablet: Alle haben Essen":"";auto lines=wrap(hint,{188});if(!lines.empty())list.push_back(text(120,188,1,white,lines[0]));}
  list.push_back(text(120,222,1,white,flow.relief||paused?"Taste: weiter":flow.waiting?"Taste: freigeben":"Taste: Pause"));
  return list;
 }
 Json snapshot()const{
  Json v={{"schema",1},{"ready",ready},{"paused",paused},{"cooldown",cooldown},{"held",held},{"day",day},{"undo",nullptr},{"rooms",Json::object()},{"cards",Json::array()},{"events",Json::array()}};
  for(int r=0;r<2;r++)v["rooms"][roomName(r)]={{"capacity",rooms[r].capacity},{"limit",rooms[r].limit},{"open",rooms[r].open}};
  for(const auto& c:cards)v["cards"].push_back(asJson(c));for(const auto& e:events)v["events"].push_back({{"at",e.at},{"message",e.message}});
  v["flow"]=flow.snapshot();if(hasUndo)v["undo"]={{"uid",undo.uid},{"before",asJson(undo)}};return v;
 }
 void restore(const Json& v,bool preserveUndo=false){
  require(v.is_object()&&v.at("schema")==1,"Unbekanntes Speicherformat.");Engine next;
  require(v.at("ready").is_boolean()&&v.at("paused").is_boolean(),"Ungültiger Betriebszustand.");next.ready=v["ready"];next.paused=v["paused"];next.cooldown=number(v,"cooldown",1,600);next.day=number(v,"day",1,1000000);next.held=v.at("held").get<std::string>();require(next.held.size()<=80,"Ungültiger Leserzustand.");
  require(v.at("events").is_array()&&v["events"].size()<=80,"Ungültiges Protokoll.");next.events.clear();for(auto& e:v["events"]){require(e.at("at").is_number_integer()&&e.at("message").is_string()&&e["message"].get<std::string>().size()<500,"Ungültiger Protokolleintrag.");next.events.push_back({e["at"],e["message"]});}
  for(int r=0;r<2;r++){auto& x=v.at("rooms").at(roomName(r));int cap=number(x,"capacity",0,128),lim=number(x,"limit",0,cap);require(x.at("open").is_boolean(),"Ungültige Freigabe.");next.rooms[r]={cap,lim,x["open"]};}
  require(v.at("cards").is_array()&&v["cards"].size()<=256,"Ungültiger Kartenbestand.");next.cards.clear();std::set<std::string> ids,labels;for(const auto& j:v["cards"]){auto c=fromJson(j);require(ids.insert(c.uid).second&&labels.insert(c.label).second,"Doppelte Kartenkennung.");next.cards.push_back(c);}
  for(int r=0;r<2;r++)require(next.occupied(r)<=next.rooms[r].limit,"Belegung über der Kapazität.");
  if(v.contains("flow"))next.flow.restore(v["flow"]);
  if(preserveUndo&&v.contains("undo")&&!v["undo"].is_null()){next.undo=fromJson(v["undo"].at("before"));next.card(next.undo.uid);next.hasUndo=true;}*this=std::move(next);
 }
 Json signal()const{const char* reason=!ready?"confirm":flow.relief?"relief":paused?"paused":flow.waiting?"batch":available(0)+available(1)==0?"full":isYellow()?"low":"free";return {{"green",isGreen()},{"reason",reason},{"free",available(0)+available(1)}};}
 Json status(long long now)const{auto v=snapshot();for(int r=0;r<2;r++){v["rooms"][roomName(r)]["occupied"]=occupied(r);v["rooms"][roomName(r)]["free"]=available(r);}for(auto& c:v["cards"]){long long last=c["last"];c["remainingMs"]=last<0?0:std::max(0LL,cooldown*1000LL-(now-last));}v["signal"]=signal();v["paused"]=isPaused();v["manualPaused"]=paused;v["flow"]=flow.status(now);v["now"]=now;return v;}
 Json command(const Json& cmd,long long now){Engine before=*this;
  try{require(now>=0,"Ungültige Zeit.");auto action=cmd.at("type").get<std::string>();std::string message;bool booking=false;
   if(action=="remove"){held.clear();return {{"ok",true},{"message","Karte entfernt."}};}
   if(action=="scan"){auto uid=cmd.at("uid").get<std::string>();require(!uid.empty()&&uid.size()<=80,"Kartenkennung ungültig.");require(held!=uid,"Karte liegt noch auf. Erst entfernen.");require(held.empty(),"Bitte zuerst die aufliegende Karte entfernen.");held=uid;
    try{auto& c=card(uid);require(ready,"Bestand zuerst bestätigen.");require(!c.lost,"Karte ist als verloren gesperrt.");require(c.last<0||now-c.last>=cooldown*1000LL,"Sperrzeit aktiv. Bitte später erneut vorhalten.");if(!c.out){require(!isPaused(),"Einlass pausiert. Nur Rückgaben möglich.");require(rooms[c.room].open,"Raum gesperrt. Nur Rückgaben möglich.");require(available(c.room)>0,"Keine freien Plätze in diesem Raum.");}undo=c;hasUndo=true;c.out=!c.out;c.last=now;if(c.out){if(flow.armed&&!flow.clockReady(now))flow.cancel();flow.admission(uid,now);}else flow.returned(uid);message=c.label+(c.out?" ausgegeben. Ein Platz reserviert.":" zurückgenommen. Ein Platz frei.");booking=true;}catch(const std::exception& e){return {{"ok",false},{"message",e.what()}};}
   }else if(action=="trialFeedback"&&(!ready||paused||flow.relief)){throw std::runtime_error("Rückmeldung nur bei betriebsbereiter Gruppenpause möglich.");}
   else if(flow.command(cmd,now,isPaused(),message)){if(action=="flowSettings"&&before.flow.batch!=flow.batch)paused=true;}
   else if(action=="confirm"){ready=true;message="Bestand geprüft und bestätigt.";}
   else if(action=="tick"){if(!autoDue(now))return {{"ok",true},{"changed",false},{"message",""}};if(flow.releaseAt<0){flow.schedule(now);return {{"ok",true},{"changed",true},{"message",""}};}flow.autoRelease();message="Nächste Gruppe automatisch freigegeben.";}
   else if(action=="relief"){require(!flow.relief,"Ausgabe wird bereits entlastet.");flow.complaint(now);flow.relief=true;flow.reliefAt=now;message="Ausgabe entlasten gestartet. Rückgaben bleiben möglich.";}
   else if(action=="pause"){require(cmd.at("paused").is_boolean(),"Ungültige Pause.");bool requested=cmd["paused"];if(!requested&&isPaused()){require(!(flow.started>=0&&flow.kind==1),"Gruppenmessung zuerst beenden oder verwerfen.");if(flow.relief){log(flow.reliefAt>=0?"Ausgabe entlasten beendet: "+std::to_string((now-flow.reliefAt)/1000)+" Sekunden.":"Ausgabe entlasten beendet; Dauer nach Neustart unbekannt.",now);flow.relief=false;flow.reliefAt=-1;}flow.manualRelease(now);flow.next();}paused=requested;message=paused?"Einlass pausiert. Rückgaben bleiben möglich.":"Einlasspause beendet.";}
   else if(action=="room"){int r=roomId(cmd.at("room"));int cap=number(cmd,"capacity",0,128),lim=number(cmd,"limit",0,cap);require(lim>=occupied(r),"Freigabe darf nicht unter der aktuellen Belegung liegen. Zum Stoppen den Raum sperren.");require(cmd.at("open").is_boolean(),"Ungültige Freigabe.");rooms[r]={cap,lim,cmd["open"]};hasUndo=false;message=std::string(r==0?"Küche":"Mensa")+" aktualisiert.";}
   else if(action=="settings"){cooldown=number(cmd,"cooldown",1,600);hasUndo=false;message="Sperrzeit gespeichert.";}
   else if(action=="enroll"){auto uid=cmd.at("uid").get<std::string>(),label=cmd.at("label").get<std::string>();int r=roomId(cmd.at("room"));require(!uid.empty()&&uid.size()<=80&&!label.empty()&&label.size()<=20&&cards.size()<256,"Kartenkennung fehlt, ist zu lang oder Kartenbestand voll.");for(const auto& c:cards)require(c.uid!=uid&&c.label!=label,"Kennung oder Kartennummer bereits vorhanden.");cards.push_back({uid,label,r,false,false,-1});hasUndo=false;message=label+" eingelernt. Raumkapazität bleibt unverändert.";}
   else if(action=="bind"){auto old=cmd.at("uid").get<std::string>(),uid=cmd.at("newUid").get<std::string>();auto& c=card(old);require(!c.out,"Ausgegebene Karte zuerst manuell klären.");require(!uid.empty()&&uid.size()<=80&&uid.rfind("sim:",0)!=0,"Echte Kartenkennung erforderlich.");for(const auto& x:cards)require(x.uid!=uid||x.uid==old,"Karte ist bereits einer anderen Nummer zugeordnet.");c.uid=uid;c.lost=false;c.last=now;hasUndo=false;message=c.label+" mit echter Karte verknüpft.";}
   else if(action=="correct"){auto& c=card(cmd.at("uid"));require(cmd.at("out").is_boolean()&&cmd.at("lost").is_boolean(),"Ungültige Korrektur.");bool out=cmd["out"];require(!out||c.out||occupied(c.room)<rooms[c.room].limit,"Korrektur würde die Raumkapazität überschreiten.");flow.cancel();flow.clearTrial();c.out=out;c.lost=cmd["lost"];c.last=now;hasUndo=false;message=c.label+" manuell korrigiert.";}
   else if(action=="undo"){require(hasUndo,"Keine Buchung zum Rückgängigmachen vorhanden.");auto& c=card(undo.uid);require(!undo.out||c.out||occupied(c.room)<rooms[c.room].limit,"Rückgängig würde die Raumkapazität überschreiten.");flow.cancel();flow.clearTrial();c=undo;c.last=now;hasUndo=false;message="Letzte Buchung rückgängig gemacht.";}
   else if(action=="restart"){flow.restart();ready=false;held.clear();hasUndo=false;message="Gerät neu gestartet. Bestand bitte prüfen.";}
   else if(action=="newDay"){require(cmd.value("confirmed",false),"Neuen Essenstag ausdrücklich bestätigen.");require(day<1000000,"Maximale Essenstage erreicht.");if(flow.relief)log("Entlastung durch neuen Essenstag beendet.",now);flow.relief=false;flow.reliefAt=-1;flow.cancel();flow.next();flow.clockValid=false;flow.autoReleased=false;flow.autoComplaint=false;flow.autoFaster=0;flow.autoSlower=0;for(auto& c:cards){c.out=false;c.last=-1;}rooms[0].open=true;rooms[1].open=false;for(auto& r:rooms)r.limit=r.capacity;ready=true;paused=false;held.clear();day++;hasUndo=false;message="Neuer Essenstag nach Bestandsprüfung gestartet. Verlorene Karten bleiben gesperrt.";}
   else throw std::runtime_error("Unbekannte Aktion.");log(message,now);return {{"ok",true},{"message",message},{"booking",booking},{"changed",true}};
  }catch(const std::exception& e){*this=std::move(before);return {{"ok",false},{"message",e.what()}};}
 }
};
}
