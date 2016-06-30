var wifi = require('./wifi.js')
wifi.getStatus().then(console.log);
wifi.scan().then(console.log);
