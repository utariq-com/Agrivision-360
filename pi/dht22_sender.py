/home/pi/dht22_sender.py

import time
import board
import adafruit_dht
import requests
import RPi.GPIO as GPIO
import os

def get_mac_address(interface="wlan0"):
    try:
        with open(f'/sys/class/net/{interface}/address') as f:
            return f.read().strip()
    except:
        return "00:00:00:00:00:00"

soil_pin = 17
GPIO.setmode(GPIO.BCM)
GPIO.setup(soil_pin, GPIO.IN)

dht_device = adafruit_dht.DHT22(board.D4)
api_url = "http://192.168.1.170:5050/sensorDataAdd"
device_mac_address = get_mac_address()

try:
    while True:
        try:
            temperature = dht_device.temperature
            humidity = dht_device.humidity
            soil_is_dry = GPIO.input(soil_pin) == 1
            soil_status = "DRY" if soil_is_dry else "MOIST"

            data = {
                "device_mac_address": device_mac_address,
                "dataval_01": temperature,
                "dataval_02": humidity,
                "dataval_03": soil_status,
                "dataval_04": None
            }

            print(f"Temp: {temperature}°C | Humidity: {humidity}% | Soil: {soil_status}")
            print("Sending data:", data)

            response = requests.post(api_url, json=data)
            print(f"Sent: {response.status_code} - {response.text}\n")

        except Exception as e:
            print("Error in sensor read or API call:", e)

        time.sleep(30)

except KeyboardInterrupt:
    print("\nProgram stopped by user.")
    GPIO.cleanup()