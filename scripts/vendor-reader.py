from pathlib import Path
root=Path(__file__).resolve().parent.parent
source=root.parent/'work'
dest=root/'firmware/src/reader'
dest.mkdir(parents=True,exist_ok=True)
h=(source/'MFRC522.h').read_text(encoding='utf-8').replace('MFRC522','MensaRFID').replace('FM17522_firmware_reference','MensaFM17522_firmware_reference')
h=h.replace('MensaRFID(uint8_t chipAddress);','MensaRFID(uint8_t chipAddress);\n void setBus(m5::I2C_Class* bus){_bus=bus;}\n bool ioOk=true;')
h=h.replace('uint8_t _chipAddress;','uint8_t _chipAddress;\n m5::I2C_Class* _bus=&M5.In_I2C;')
c=(source/'MFRC522.cpp').read_text(encoding='utf-8').replace('MFRC522','MensaRFID').replace('FM17522_firmware_reference','MensaFM17522_firmware_reference')
c=c.replace('M5.In_I2C.writeRegister(', 'ioOk &= _bus->writeRegister(').replace('M5.In_I2C.readRegister(', 'ioOk &= _bus->readRegister(')
c=c.replace('uint8_t value;','uint8_t value = 0;')
# The original bulk read ignored rxAlign, losing bits during anticollision.
c=c.replace('ioOk &= _bus->readRegister(_chipAddress, reg, values, count, 100000);', 'uint8_t oldFirst=values[0];\n    ioOk &= _bus->readRegister(_chipAddress, reg, values, count, 100000);\n    if(rxAlign){uint8_t mask=uint8_t(0xFF << rxAlign);values[0]=(oldFirst & ~mask)|(values[0] & mask);}')
# Bound the original reset loop in case the hardware or its bus is faulty.
c=c.replace('while (PCD_ReadRegister(CommandReg) & (1<<4)) {','unsigned tries=0;\n while (PCD_ReadRegister(CommandReg) & (1<<4)) {\n if(++tries>20){ioOk=false;break;}')
(dest/'MensaRFID.h').write_text(h,encoding='utf-8')
(dest/'MensaRFID.cpp').write_text(c,encoding='utf-8')
