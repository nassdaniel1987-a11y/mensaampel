"""Small packaged entry point for official esptool and serial-port discovery."""
import json
import sys
import esptool
from serial.tools import list_ports

def main():
    if len(sys.argv)>1 and sys.argv[1]=='ports':
        print(json.dumps([{'port':p.device,'description':p.description,'vid':p.vid,'pid':p.pid} for p in list_ports.comports()]))
    else:
        esptool.main(sys.argv[1:])

if __name__=='__main__':
    main()
