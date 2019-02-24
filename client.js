const WebSocket = require('ws');

var stdin = process.openStdin();
var validUrl = require('valid-url');

// Console input listener, block URLs here
stdin.addListener("data", function(data) {

    // Extract command (block, unblock, printBlocked, printCache)
    var input = data.toString();
    var command = input.substring(0, input.indexOf(' '));

    switch(command){
      // Handle the dynamic blocking of URLs
      case "request":
        var urlToRequest = data.toString().substring(8).trim();

        if(validUrl.isUri(urlToRequest)){
          console.log("Valid URI - Sending request to proxy...");
          ws.send(urlToRequest);
        } else {
          console.log("Invalid URL - " + urlToRequest + "\n");
        }
        break;

      default:
        console.log("Unknown command - " + command);
        break;
    }
});

const ws = new WebSocket('ws://localhost:4000');

ws.on('open', function open() {
  console.log("Successful WebSocket connection to proxy via ws://localhost:4000");
});

ws.on('message', function incoming(message) {
    console.log('Received response from proxy: %s', message);
});

ws.on('close', function closed() {
  console.log("WebSocket connection to proxy was closed");
})
