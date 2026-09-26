#include <Arduino.h>
#include "../../core/engine.hpp"
mensa::Engine checkEngine;
void setup(){Serial.begin(115200);Serial.println(checkEngine.status(0).dump().c_str());}
void loop(){if(Serial.available()){try{auto j=mensa::Json::parse(Serial.readStringUntil('\n').c_str());Serial.println(checkEngine.command(j,millis()).dump().c_str());}catch(...){Serial.println("Invalid command");}}delay(10);}
