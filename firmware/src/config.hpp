#pragma once
#include <Preferences.h>
#include <esp_system.h>
#include <mbedtls/md.h>
#include <mbedtls/pkcs5.h>
#include "../../core/engine.hpp"
inline std::string randomKey(size_t length=24){static const char alphabet[]="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";std::string value;for(size_t i=0;i<length;i++)value+=alphabet[esp_random()%(sizeof(alphabet)-1)];return value;}
inline std::string passwordHash(const std::string& password,const std::string& salt){
 mbedtls_md_context_t context;mbedtls_md_init(&context);unsigned char output[32];
 if(mbedtls_md_setup(&context,mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),1)!=0)throw std::runtime_error("Kennwortprüfung nicht verfügbar.");
 int result=mbedtls_pkcs5_pbkdf2_hmac(&context,(const unsigned char*)password.data(),password.size(),(const unsigned char*)salt.data(),salt.size(),10000,32,output);mbedtls_md_free(&context);if(result)throw std::runtime_error("Kennwortprüfung fehlgeschlagen.");
 std::string hash;char hex[3];for(auto c:output){snprintf(hex,3,"%02x",c);hash+=hex;}return hash;
}
inline bool constantEqual(const std::string& a,const std::string& b){if(a.size()!=b.size())return false;unsigned char x=0;for(size_t i=0;i<a.size();i++)x|=a[i]^b[i];return x==0;}
struct DeviceConfig {
 bool configured=false;std::string reader="auto",ssid,wifiPassword,salt,adminHash,setupCode;
 void fresh(){configured=false;reader="auto";ssid="Mensaampel-"+randomKey(4);wifiPassword=randomKey(12);salt=randomKey();setupCode=randomKey(10);adminHash=passwordHash(setupCode,salt);}
 mensa::Json json()const{return {{"schema",1},{"configured",configured},{"reader",reader},{"ssid",ssid},{"wifiPassword",wifiPassword},{"salt",salt},{"adminHash",adminHash},{"setupCode",setupCode}};}
 bool load(){Preferences p;if(!p.begin("mensa",false))return false;if(!p.isKey("config")){p.end();fresh();return save();}String raw=p.getString("config","");p.end();try{auto j=mensa::Json::parse(raw.c_str());if(j.at("schema")!=1||!j.at("configured").is_boolean())return false;configured=j["configured"];reader=j.at("reader");ssid=j.at("ssid");wifiPassword=j.at("wifiPassword");salt=j.at("salt");adminHash=j.at("adminHash");setupCode=j.at("setupCode");return (reader=="internal"||reader=="external"||reader=="auto")&&ssid.size()>0&&ssid.size()<=32&&wifiPassword.size()>=8&&wifiPassword.size()<=63&&salt.size()==24&&adminHash.size()==64;}catch(...){return false;}}
 bool save()const{Preferences p;if(!p.begin("mensa",false))return false;auto raw=json().dump();bool ok=p.putString("config",raw.c_str())==raw.size();p.end();return ok;}
 bool authenticate(const std::string& password)const{return constantEqual(passwordHash(password,salt),adminHash);}
};
