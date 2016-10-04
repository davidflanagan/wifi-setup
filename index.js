var Express = require('express');
var Handlebars = require('handlebars');
var bodyParser = require('body-parser');
var fs = require('fs');
var run = require('./run.js');
var platform = require('./platform.js');
var wifi = require('./wifi.js');
var wait = require('./wait.js');

// The Edison device can't scan for wifi networks while in AP mode, so
// we've got to scan before we enter AP mode and save the results
var preliminaryScanResults;

// Wait until we have a working wifi connection. Retry every 3 seconds up
// to 10 times. If we are connected, then start just start the next stage
// and exit. But if we never get a wifi connection, go into AP mode.
waitForWifi(20, 3000)
  .then(runNextStageAndExit)
  .catch(() => { startServer(); startAP() });

// Return a promise, then check every interval ms for a wifi connection.
// Resolve the promise when we're connected. Or, if we aren't connected
// after maxAttempts attempts, then reject the promise
function waitForWifi(maxAttempts, interval) {
  return new Promise(function(resolve, reject) {
    var attempts = 0;
    check();

    function check() {
      attempts++;
      console.log('check', attempts);
      wifi.getStatus()
        .then(status => {
          console.log(status);
          if (status === 'COMPLETED') {
            console.log('Wifi connection found');
            resolve();
          }
          else {
            console.log('No wifi connection on attempt', attempts);
            retryOrGiveUp()
          }
        })
        .catch(err => {
          console.error('Error checking wifi on attempt', attempts, ':', err);
          retryOrGiveUp();
        });
    }

    function retryOrGiveUp() {
      if (attempts >= maxAttempts) {
        console.error('Giving up. No wifi available.');
        reject();
      }
      else {
        setTimeout(check, interval);
      }
    }
  });
}

function startAP() {
  console.log("startAP");

  // Scan for wifi networks now because we can't always scan once
  // the AP is being broadcast
  wifi.scan(10)   // retry up to 10 times
    .then(ssids => preliminaryScanResults = ssids) // remember the networks
    .then(() => wifi.startAP())                    // start AP mode
    .then(() => {
      console.log('No wifi found; entering AP mode')
    });
}

function startServer(wifiStatus) {
  // Now start up the express server
  var server = Express();

  // When we get POSTs, handle the body like this
  server.use(bodyParser.urlencoded({extended:false}));

  // Define the handler methods for the various URLs we handle
  server.get('/', handleWifiSetup);
  server.post('/connect', handleConnect);

  // And start listening for connections
  // XXX: note that we are HTTP only... is this a security issue?
  // XXX: for first-time this is on an open access point.
  server.listen(80);
  console.log('HTTP server listening on port 80');
}

function getTemplate(filename) {
  return Handlebars.compile(fs.readFileSync(filename, 'utf8'));
}

var wifiSetupTemplate = getTemplate('./templates/wifiSetup.hbs');
var connectTemplate = getTemplate('./templates/connect.hbs');

// This function handles requests for the root URL '/'.
function handleWifiSetup(request, response) {
  wifi.scan().then(results => {
    // On Edison, scanning will fail since we're in AP mode at this point
    // So we'll use the preliminary scan instead
    if (results.length === 0) {
      results = preliminaryScanResults;
    }

    // XXX
    // To handle the case where the user entered a bad password and we are
    // not connected, we should show the networks we know about, and modify
    // the template to explain that if the user is seeing it, it means
    // that the network is down or password is bad. This allows the user
    // to re-enter a network.  Hopefully wpa_supplicant is smart enough
    // to do the right thing if there are two entries for the same ssid.
    // If not, we could modify wifi.defineNetwork() to overwrite rather than
    // just adding.

    response.send(wifiSetupTemplate({ networks: results }));
  });
}

function handleConnect(request, response) {
  var ssid = request.body.ssid.trim();
  var password = request.body.password.trim();

  response.send(connectTemplate({ssid: ssid}));

  // Wait before switching networks to make sure the response gets through.
  // And also wait to be sure that the access point is fully down before
  // defining the new network. If I only wait two seconds here, it seems
  // like the Edison takes a really long time to bring up the new network
  // but a 5 second wait seems to work better.
  wait(2000)
    .then(() => wifi.stopAP())
    .then(() => wait(5000))
    .then(() => wifi.defineNetwork(ssid, password))
    .then(() => waitForWifi(20, 3000))
    .then(() => runNextStageAndExit())
    .catch(() => {
      // XXX not sure how to handle an error here
      console.error("Failed to bring up wifi in handleConnect()");
    });
}

// Once wifi is up, we run the next stage command, if there is one, and exit.
function runNextStageAndExit() {
  if (platform.nextStageCommand) {
    run(platform.nextStageCommand)
      .then((out) => console.log('Next stage started:', out))
      .catch((err) => console.error('Error starting next stage:', err))
      .then(() => process.exit());
  }
  else {
    process.exit();
  }
}

// You can use this to give user feedback during the setup process.
function play(filename) {
  return run(platform.playAudio, { AUDIO: filename });
}
