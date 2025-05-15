/etc/wifi_setup.py

from flask import Flask, request
import os

app = Flask(__name__)

WPA_SUPPLICANT_CONF = "/etc/wpa_supplicant/wpa_supplicant.conf"
DEVICE_INFO_FILE = "/etc/device_info.conf"

def save_wifi(ssid, password, device_name, device_location):
    wifi_config = f"""ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=GB

network={{
    ssid="{ssid}"
    psk="{password}"
    key_mgmt=WPA-PSK
}}
"""
    with open(WPA_SUPPLICANT_CONF, "w") as file:
        file.write(wifi_config)

    with open(DEVICE_INFO_FILE, "w") as file:
        file.write(f"device_name={device_name}.ruby\n")
        file.write(f"device_location={device_location}\n")

    os.system("sudo systemctl stop hostapd")
    os.system("sudo systemctl stop dnsmasq")
    os.system("sudo wpa_supplicant -i wlan0 -c /etc/wpa_supplicant/wpa_supplicant.conf -B")
    os.system("sudo dhclient wlan0")

@app.route("/", methods=["GET", "POST"])
def index():
    if request.method == "POST":
        ssid = request.form["ssid"]
        password = request.form["password"]
        device_name = request.form["device_name"]
        device_location = request.form["device_location"]

        if " " in device_name:
            return "<script>alert('Device name cannot contain spaces!'); window.history.back();</script>"

        save_wifi(ssid, password, device_name, device_location)

        return '''
            <script>
                alert("Wi-Fi, device name, and location saved! The device will now reboot.");
                window.location.href = "/reboot";
            </script>
        '''

    return '''
        <!DOCTYPE html>
        <html>
        <head>
            <title>Device Wi-Fi Setup</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(to right, #74ebd5, #ACB6E5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }
                .form-container {
                    background-color: white;
                    padding: 30px 40px;
                    border-radius: 12px;
                    box-shadow: 0 8px 20px rgba(0,0,0,0.15);
                    width: 100%;
                    max-width: 400px;
                    box-sizing: border-box;
                }
                .form-container h2 {
                    margin-bottom: 20px;
                    color: #333;
                    text-align: center;
                }
                label {
                    display: block;
                    margin: 12px 0 5px;
                    font-weight: bold;
                }
                input {
                    width: 100%;
                    padding: 10px;
                    border: 1px solid #ccc;
                    border-radius: 6px;
                    box-sizing: border-box;
                }
                button {
                    margin-top: 20px;
                    width: 100%;
                    padding: 12px;
                    background-color: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 16px;
                    cursor: pointer;
                    transition: background 0.3s ease;
                }
                button:hover {
                    background-color: #45a049;
                }
            </style>
        </head>
        <body>
            <div class="form-container">
                <h2>Wi-Fi Configuration For Device Ruby</h2>
                <form method="post">
                    <label for="device_name">Device Name (No Spaces!):</label>
                    <input type="text" name="device_name" required pattern="^[a-zA-Z0-9_-]+$" title="No spaces allowed">

                    <label for="device_location">Device Location (City Name):</label>
                    <input type="text" name="device_location" required pattern="^[a-zA-Z ]+$" title="Only letters and spaces allowed">

                    <label for="ssid">Wi-Fi SSID:</label>
                    <input type="text" name="ssid" required>

                    <label for="password">Password:</label>
                    <input type="password" name="password" required>

                    <button type="submit">Save & Reboot</button>
                </form>
            </div>
        </body>
        </html>
    '''


@app.route("/reboot")
def reboot():
    os.system("sudo reboot")
    return "Rebooting now..."

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)