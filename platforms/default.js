module.exports = {
  platform: "default",

  // Define this nextStageCommand property to specify what we should
  // do once wifi is up. If not defined, we'll just exit
//  nextStageCommand: 'systemctl start git-auto-updater',

  playAudio: 'aplay -q $AUDIO',

  // A shell command that outputs the string "COMPLETED" if we are
  // connected to a wifi network and outputs something else otherwise
  getStatus:
    "wpa_cli -iwlan0 status | sed -n -e '/^wpa_state=/{s/wpa_state=//;p;q}'",

  // A shell command that outputs the SSID of the current wifi network
  // or outputs nothing if we are not connected to wifi
  getConnectedNetwork:
    "wpa_cli -iwlan0 status | sed -n -e '/^ssid=/{s/ssid=//;p;q}'",

  // A shell command that scans for wifi networks and outputs the ssids in
  // order from best signal to worst signal, omitting hidden networks
  scan: `iwlist wlan0 scan |\
sed -n -e '
  /Quality=/,/ESSID:/H
  /ESSID:/{
    g
    s/^.*Quality=\\([0-9]\\+\\).*ESSID:"\\([^"]*\\)".*$/\\1\t\\2/
    p
    s/.*//
    x
  }' |\
sort -nr |\
cut -f 2 |\
sed -e '/^$/d;/\\x00/d'`,

  // A shell command that lists the names of known wifi networks, one
  // to a line.
  getKnownNetworks: "wpa_cli -iwlan0 list_networks | sed -e '1d' | cut -f 2",

  // Start broadcasting an access point.
  // The name of the AP is defined in a config file elsewhere
  // Note that we use different commands on Yocto systems than
  // we do on Raspbian systems
  startAP: 'ifconfig wlan0 10.0.0.1 && systemctl start hostapd && systemctl start udhcpd',

  // Stop broadcasting an AP and attempt to reconnect to local wifi
  stopAP: 'systemctl stop udhcpd && systemctl stop hostapd && ifconfig wlan0 0.0.0.0',

  // Define a new wifi network. Expects the network name and password
  // in the environment variables SSID and PSK.
  defineNetwork: 'ID=`wpa_cli -iwlan0 add_network` && wpa_cli -iwlan0 set_network $ID ssid \\"$SSID\\" && wpa_cli -iwlan0 set_network $ID psk \\"$PSK\\" && wpa_cli -iwlan0 enable_network $ID && wpa_cli -iwlan0 save_config',

  // Define a new open wifi network. Expects the network name
  // in the environment variable SSID.
  defineOpenNetwork: 'ID=`wpa_cli -iwlan0 add_network` && wpa_cli -iwlan0 set_network $ID ssid \\"$SSID\\" && wpa_cli -iwlan0 set_network $ID key_mgmt NONE && wpa_cli -iwlan0 enable_network $ID && wpa_cli -iwlan0 save_config',
}
