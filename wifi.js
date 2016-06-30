exports.getStatus = getStatus;
exports.getConnectedNetwork = getConnectedNetwork;
exports.scan = scan;
exports.startAP = startAP;
exports.stopAP = stopAP;
exports.defineNetwork = defineNetwork;

var child_process = require('child_process');

// A Promise-based version of child_process.execFile.
// It takes a single command line and splits on whitespace to create
// the array of arguments, so it is not suitable for command where
// one of the arguments has spaces. (If we need that, we can use exec
// instead of execFile.)  It rejects the promise if there is an error
// or if there is any output to stderr. Otherwise it resolves the promise
// passing the text that was sent to stdout.
function run(cmdline) {
  return new Promise(function(resolve, reject) {
    console.log("Running command:", cmdline);
    var args = cmdline.split(/\s/);
    var program = args.shift();
    child_process.execFile(program, args, function(error, stdout, stderr) {
      if (error) {
        reject(error);
      }
      else if (stderr && stderr.length > 0) {
        reject(new Error(program + ' output to stderr: ' + stderr));
      }
      else {
        resolve(stdout)
      }
    });
  });
}

/*
 * Determine whether we have a wifi connection with the `wpa_cli
 * status` command. This function returns a Promise that resolves to a
 * string.  On my Rasberry Pi, the string is "DISCONNECTED" or
 * "INACTIVE" when there is no connection and is "COMPLETED" when
 * there is a connection. There are other possible string values when
 * a connection is being established
 */
function getStatus() {
  return run('wpa_cli -iwlan0 status').then(output => {
    var match = output.match(/^wpa_state=(.*)$/m);
    if (!match) {
      throw new Error('unexpected status output from wpa_cli');
    }
    else {
      return match[1];
    }
  });
}

/*
 * Determine the ssid of the wifi network we are connected to.
 * This function returns a Promise that resolves to a
 * string or null if not connected.
 */
function getConnectedNetwork() {
  return run('wpa_cli -iwlan0 status').then(output => {
    var match = output.match(/^ssid=(.*)$/m);
    if (!match) {
      return null;
    }
    else {
      return match[1];
    }
  });
}

/*
 * Scan for available wifi networks using `iwlist wlan0 scan`.
 * Returns a Promise that resolves to an array of strings. Each string
 * is the ssid of a wifi network. They are sorted by signal strength from
 * strongest to weakest. On a Raspberry Pi, a scan seems to require root
 * privileges.
 */
function scan() {
  return run('iwlist wlan0 scan').then(output => {
    var lines = output.split('\n');
    var networks = [];
    var ssid, signal;
    lines.forEach(l => {
      var m = l.match(/Quality=(\d+)/);
      if (m) {
        signal = parseInt(m[1]);
        return;
      }

      m = l.match(/ESSID:"([^"]*)"/);
      if (m) {
        networks.push({
          ssid: m[1],
          strength: signal
        });
        ssid = undefined;
        signal = undefined;
      }
    });

    // Sort networks based on strength
    networks.sort((a,b) => b.strength - a.strength);

    // Return just the ssids
    return networks.map(n => n.ssid);
  });
}

/*
 * Enable an access point that users can connect to to configure the device.
 * This command works by running these commands:
 *
 *   ifconfig wlan0 10.0.0.1
 *   systemctl start hostapd
 *   systemctl start udhcpd
 *
 * It requires that hostapd and udhcpd are installed on the system but not
 * enabled, so that they do not automatically run when the device boots up.
 * It also requires that hostapd and udhcpd have appropriate config files
 * that define the ssid for the wifi network to be created, for example.
 * Also, the udhcpd config file should be set up to work with 10.0.0.1 as
 * the IP address of the device.
 *
 * XXX
 * It would probably be better if the IP address, SSID and password were
 * options to this function rather than being hardcoded in system config
 * files. (Each device ought to be able to add a random number to its
 * SSID, for example, so that when you've got multiple devices they don't
 * all try to create the same network).
 *
 * This function returns a Promise that resolves when the necessary
 * commands have been run.  This does not necessarily mean that the AP
 * will be functional, however. The setup process might take a few
 * seconds to complete before the user will be able to see and connect
 * to the network.
 *
 * Note that this function requires root privileges to work
 */
function startAP() {
  return run('ifconfig wlan0 10.0.0.1')
    .then(output => run('systemctl start hostapd'))
    .then(output => run('systemctl start udhcpd'));
}

/*
 * Like startAP(), but take the network down by running these commands:
 *
 *   systemctl stop udhcpd
 *   systemctl stop hostapd
 *
 * Returns a promise that resolves when the commands have been run. At
 * this point, the AP should be in the process of stopping but may not
 * yet be completely down.
 *
 * Note that this function does not change the local IP address from 10.0.0.1
 * back to whatever it was before startAP() was called. As far as I can tell
 * this does not actually cause any problems.
 *
 * Note that this function requires root privileges to work
 */
function stopAP() {
  return run('systemctl stop udhcpd')
    .then(output => run('systemctl stop hostapd'));
}

/*
 * This function uses wpa_cli to add the specified network ssid and password
 * to the wpa_supplicant.conf file. This assumes that wpa_supplicant is
 * configured to run automatically at boot time and is configured to work
 * with wpa_cli.
 *
 * If the system is not connected to a wifi network, calling this
 * command with a valid ssid and password should cause it to connect.
 *
 * This command does not require root privileges, if the user is in
 * the group defined in wpa_supplicant.conf group
 */
function defineNetwork(ssid, password) {
  var ssidCmd, passwordCmd, enableCmd;

  // First create a new network
  return run('wpa_cli -iwlan0 add_network')
  // Then use the network number output by that command to define
  // the command strings that come next
    .then(out => {
      var id = out.trim();
      ssidCmd = `wpa_cli -iwlan0 set_network ${id} ssid "${ssid}"`;

      if (password) {
        passwordCmd = `wpa_cli -iwlan0 set_network ${id} psk "${password}"`;
      }
      else {
        passwordCmd = `wpa_cli -iwlan0 set_network ${id} key_mgmt NONE`;
      }

      enableCmd = `wpa_cli -iwlan0 enable_network ${id}`;
    })
  // Then set the ssid and password for the network and enable it
    .then(out => run(ssidCmd))
    .then(out => run(passwordCmd))
    .then(out => run(enableCmd))
  // Then save the network to the config file so it persists across reboots
    .then(out => run('wpa_cli -iwlan0 save_config'))
}
