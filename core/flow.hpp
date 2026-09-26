#pragma once
#include "vendor/json.hpp"
#include <vector>
#include <array>
#include <string>
#include <algorithm>
#include <stdexcept>
namespace mensa {
// Bounded anonymous observations; no card identifier survives a completed measurement.
struct Flow {
 using J=nlohmann::json;
 struct Sample{int kind,queue,weekday,minute,size,seconds;};
 int yellow=5,batch=0,issued=0,queue=0,weekday=0,minute=0,kind=0,measureSize=0,measureMinute=0,measureWeekday=0,measureQueue=0;
 bool relief=false;long long reliefAt=-1;int groupQueue=0;
 bool waiting=false,clockValid=false,armed=false;long long clockAt=0,started=-1,groupAt=-1;std::string measuringUid;
 std::vector<Sample> samples;
 int trialBuffer=30,trialDelay=0,trialCount=0,trialLevel=0;bool trialReviewed=false;
 long long lastAdmission=-1;std::vector<std::array<int,9>> reviews;
 void clearTrial(){trialDelay=0;trialCount=0;trialLevel=0;trialReviewed=false;lastAdmission=-1;}

 static void check(bool yes,const char* text){if(!yes)throw std::runtime_error(text);}
 static int integer(const J& j,const char* key,int low,int high){check(j.contains(key)&&j[key].is_number_integer(),"Ganze Zahl erforderlich.");auto value=j[key].get<long long>();check(value>=low&&value<=high,"Mess- oder Einlasseinstellung außerhalb des Bereichs.");return int(value);}
 int currentMinute(long long now)const{return minute+int(std::max(0LL,now-clockAt)/60000);}
 bool clockReady(long long now)const{return clockValid&&now>=clockAt&&currentMinute(now)<1440;}
 void cancel(){armed=false;started=-1;measuringUid.clear();measureSize=0;}
 void restart(){clearTrial();reliefAt=-1;clockValid=false;cancel();groupAt=-1;}
 void next(){clearTrial();issued=0;waiting=false;groupAt=-1;}
 void admission(const std::string& uid,long long now){
  if(batch){if(issued==0){groupAt=now;groupQueue=queue;}issued++;lastAdmission=now;if(issued>=batch){waiting=true;auto e=status(now).at("estimate");if(clockReady(now)&&e.at("count").get<int>()>=3){trialCount=e["count"];trialLevel=e["level"]=="matched"?2:1;trialDelay=std::max(e.at("max").get<int>()+trialBuffer,int((now-groupAt+999)/1000)+trialBuffer);}}}
  if(armed){armed=false;started=now;measuringUid=kind==0?uid:"";measureSize=1;measureMinute=currentMinute(now);measureWeekday=weekday;measureQueue=queue;}
  else if(started>=0&&kind==1){if(measureSize>=256)cancel();else measureSize++;}
 }
 void returned(const std::string& uid){if(started>=0&&kind==0&&measuringUid==uid)cancel();}
 J snapshot()const{J list=J::array();for(auto& s:samples)list.push_back({s.kind,s.queue,s.weekday,s.minute,s.size,s.seconds});J feedback=J::array();for(auto& r:reviews)feedback.push_back(r);return {{"trialBuffer",trialBuffer},{"trialDelay",trialDelay},{"trialCount",trialCount},{"trialLevel",trialLevel},{"trialReviewed",trialReviewed},{"lastAdmission",lastAdmission},{"reviews",feedback},{"relief",relief},{"reliefAt",reliefAt},{"groupQueue",groupQueue},{"yellow",yellow},{"batch",batch},{"issued",issued},{"waiting",waiting},{"queue",queue},{"weekday",weekday},{"minute",minute},{"clockValid",clockValid},{"clockAt",clockAt},{"armed",armed},{"kind",kind},{"started",started},{"groupAt",groupAt},{"measuringUid",measuringUid},{"measureSize",measureSize},{"measureMinute",measureMinute},{"measureWeekday",measureWeekday},{"measureQueue",measureQueue},{"samples",list}};}
 void restore(const J& v){Flow n;
  if(v.contains("trialBuffer")){n.trialBuffer=integer(v,"trialBuffer",0,300);n.trialDelay=integer(v,"trialDelay",0,90000);n.trialCount=integer(v,"trialCount",0,120);n.trialLevel=integer(v,"trialLevel",0,2);check(v.at("trialReviewed").is_boolean(),"Ungültige Rückmeldung.");n.trialReviewed=v["trialReviewed"];check(v.at("lastAdmission").is_number_integer(),"Ungültige Scanzeit.");n.lastAdmission=v["lastAdmission"].get<long long>();check(n.lastAdmission>=-1&&n.lastAdmission<=9007199254740991LL,"Ungültige Scanzeit.");check(v.at("reviews").is_array()&&v["reviews"].size()<=120,"Zu viele Rückmeldungen.");for(auto& r:v["reviews"]){check(r.is_array()&&r.size()==9,"Ungültige Rückmeldung.");std::array<int,9> item;int highs[]={48,2,6,1439,90000,604800,1,120,2};for(int i=0;i<9;i++){check(r[i].is_number_integer(),"Ungültige Rückmeldung.");auto value=r[i].get<long long>();check(value>=0&&value<=highs[i],"Ungültige Rückmeldung.");item[i]=int(value);}check(item[0]>0&&item[7]>=3&&item[8]>0,"Ungültiger Vergleich.");n.reviews.push_back(item);}}

  if(v.contains("relief")){check(v.at("relief").is_boolean(),"Ungültige Entlastungspause.");n.relief=v["relief"];check(v.at("reliefAt").is_number_integer(),"Ungültige Pausenzeit.");n.reliefAt=v["reliefAt"].get<long long>();check(n.reliefAt>=-1&&n.reliefAt<=9007199254740991LL,"Ungültige Pausenzeit.");}
  n.groupQueue=v.contains("groupQueue")?integer(v,"groupQueue",0,2):integer(v,"queue",0,2);
n.yellow=integer(v,"yellow",0,256);n.batch=integer(v,"batch",0,48);n.issued=integer(v,"issued",0,48);n.queue=integer(v,"queue",0,2);n.weekday=integer(v,"weekday",0,6);n.minute=integer(v,"minute",0,1439);n.kind=integer(v,"kind",0,1);n.measureSize=integer(v,"measureSize",0,256);n.measureMinute=integer(v,"measureMinute",0,1439);n.measureWeekday=integer(v,"measureWeekday",0,6);n.measureQueue=integer(v,"measureQueue",0,2);
  for(auto key:{"waiting","clockValid","armed"})check(v.at(key).is_boolean(),"Ungültiger Messzustand.");n.waiting=v["waiting"];n.clockValid=v["clockValid"];n.armed=v["armed"];
  for(auto key:{"clockAt","started","groupAt"})check(v.at(key).is_number_integer()&&v[key].get<long long>()>=-1&&v[key].get<long long>()<=9007199254740991LL,"Ungültige Messzeit.");n.clockAt=v["clockAt"];n.started=v["started"];n.groupAt=v["groupAt"];check(n.clockAt>=0,"Ungültige Uhrzeit.");n.measuringUid=v.at("measuringUid").get<std::string>();check(n.measuringUid.size()<=80,"Ungültige Messkarte.");check(!(n.armed&&n.started>=0),"Ungültige aktive Messung.");check(n.started>=0?n.measureSize>=1:n.measureSize==0,"Ungültige Messgröße.");check(n.started<0||n.kind==1||!n.measuringUid.empty(),"Messkarte fehlt.");check(n.waiting==(n.batch>0&&n.issued==n.batch),"Ungültige Gruppensperre.");check(n.batch?n.issued<=n.batch:n.issued==0,"Ungültiger Gruppenzähler.");
  check(v.at("samples").is_array()&&v["samples"].size()<=120,"Zu viele Messungen.");for(auto& a:v["samples"]){check(a.is_array()&&a.size()==6,"Ungültige Messung.");for(auto& x:a)check(x.is_number_integer(),"Ungültiger Messwert.");J r={{"kind",a[0]},{"queue",a[1]},{"weekday",a[2]},{"minute",a[3]},{"size",a[4]},{"seconds",a[5]}};n.samples.push_back({integer(r,"kind",0,1),integer(r,"queue",0,2),integer(r,"weekday",0,6),integer(r,"minute",0,1439),integer(r,"size",1,256),integer(r,"seconds",1,3600)});}
  *this=std::move(n);
 }
 J status(long long now)const{auto v=snapshot();v["clockValid"]=clockReady(now);v["currentMinute"]=currentMinute(now)%1440;v["elapsedSeconds"]=started<0?0:std::max(0LL,(now-started)/1000);v["measuringUid"]=measuringUid;
  std::vector<const Sample*> broad,exact;
  if(groupAt>=0&&issued>0)for(auto& s:samples)if(s.kind==1&&s.queue==groupQueue&&s.size==issued){broad.push_back(&s);if(clockReady(now)&&s.weekday==weekday&&s.minute/15==currentMinute(groupAt)/15)exact.push_back(&s);}
  bool precise=exact.size()>=3;auto& chosen=precise?exact:broad;int n=chosen.size(),total=0,lo=3601,hi=0;
  for(auto s:chosen){total+=s->seconds;lo=std::min(lo,s->seconds);hi=std::max(hi,s->seconds);}
  v["trialDue"]=waiting&&trialDelay>0&&!trialReviewed&&groupAt>=0&&now-groupAt>=1000LL*trialDelay;v["trialRemaining"]=trialDelay>0&&groupAt>=0?std::max(0LL,(groupAt+1000LL*trialDelay-now+999)/1000):0;
  v["estimate"]={{"level",n<3?"insufficient":precise?"matched":"general"},{"count",n},{"seconds",n?total/n:0},{"min",n?lo:0},{"max",hi},{"checkDue",waiting&&n>=3&&now-groupAt>=1000LL*(total/n)}};return v;
 }
 bool command(const J& c,long long now,bool paused,std::string& message){auto type=c.at("type").get<std::string>();
  if(type=="trialSettings"){check(issued==0,"Puffer vor der nächsten Gruppe einstellen.");trialBuffer=integer(c,"buffer",0,300);message="Puffer für die Erprobung gespeichert.";}
  else if(type=="trialFeedback"){check(c.at("fits").is_boolean(),"Rückmeldung fehlt.");check(!relief&&status(now).at("trialDue").get<bool>(),"Noch kein offener Erprobungsvorschlag.");check(now-groupAt<=604800000LL,"Vorschlag abgelaufen.");if(reviews.size()==120)reviews.erase(reviews.begin());reviews.push_back({issued,groupQueue,weekday,currentMinute(groupAt)%1440,trialDelay,int((now-groupAt)/1000),c.at("fits").get<bool>()?1:0,trialCount,trialLevel});trialReviewed=true;message="Rückmeldung gespeichert. Einlass bleibt geschlossen.";}
  else if(type=="flowSettings"){yellow=integer(c,"yellow",0,256);int value=integer(c,"batch",0,48);check(value==batch||((paused||issued==0)&&started<0&&!armed),"Gruppengröße nur in einer Pause ohne laufende Messung ändern.");if(value!=batch){batch=value;next();}message="Gelbgrenze und Einlassgruppen gespeichert.";}
  else if(type=="measurementContext"){check(started<0&&!armed,"Laufende Messung zuerst beenden oder abbrechen.");weekday=integer(c,"weekday",0,6);minute=integer(c,"minute",0,1439);clockAt=now;clockValid=true;groupAt=-1;clearTrial();queue=integer(c,"queue",0,2);message="Uhrzeit und Schlangensituation übernommen.";}
  else if(type=="queueState"){check(started<0&&!armed,"Schlangensituation der laufenden Messung bleibt unverändert.");queue=integer(c,"queue",0,2);message="Schlangensituation aktualisiert.";}
  else if(type=="measurementArm"){check(clockReady(now),"Zuerst Uhrzeit vom Tablet übernehmen.");check(!armed&&started<0,"Es läuft bereits eine Messung.");kind=integer(c,"kind",0,1);check(kind==0||issued==0||waiting,"Gruppenmessung vor einer neuen Gruppe starten.");armed=true;message="Messung vorgemerkt. Start bei der nächsten erfolgreichen Kartenausgabe.";}
  else if(type=="measurementCancel"){cancel();message="Messung verworfen.";}
  else if(type=="measurementFinish"){check(started>=0,"Noch keine Kartenausgabe für diese Messung.");check(kind==0||paused||waiting,"Gruppeneinlass zuerst pausieren; dann das letzte versorgte Kind bestätigen.");auto seconds=(now-started)/1000;check(seconds>=1&&seconds<=3600,"Messung muss zwischen einer Sekunde und 60 Minuten dauern; sonst bitte verwerfen.");if(samples.size()==120)samples.erase(samples.begin());samples.push_back({kind,measureQueue,measureWeekday,measureMinute,measureSize,int(seconds)});cancel();message="Messung gespeichert. Der Einlass bleibt unverändert.";}
  else if(type=="measurementDeleteLast"){check(!samples.empty(),"Keine Messung vorhanden.");samples.pop_back();message="Letzte Messung gelöscht.";}
  else return false;return true;
 }
};
}
