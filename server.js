var fs = require('fs');
var https = require('https');
var http = require('http');
var WebSocket = require('ws');
var URL = require('url');
var NodeCache = require( "node-cache" );
var SimpleHashTable = require('simple-hashtable');
var stdin = process.openStdin();

// Create cache, never delete files unless updated by request
const myCache = new NodeCache({ stdTTL: 3600, checkperiod: 3600 });
const blockedURLS = new SimpleHashTable();

// Constants for timing
const NS_PER_SEC = 1e9
const MS_PER_NS = 1e6

// Block TCD to start with
//blockedURLS.put('www.tcd.ie', 'blocked');

// Console input listener, block URLs here
stdin.addListener("data", function(data) {

    // Extract command (block, unblock, printBlocked, printCache)
    var input = data.toString();
    var command = input.substring(0, input.indexOf(' '));

    switch(command){
      // Handle the dynamic blocking of URLs
      case "block":
        var urlToBlock = data.toString().substring(6).trim();
        blockedURLS.put(urlToBlock);
        console.log("Successfully blocked URL: " + urlToBlock);
        break;

      // Handle the dynamic unblocking of URLs
      case "unblock":
        var urlToUnBlock = data.toString().substring(8).trim();

        if(blockedURLS.containsKey(urlToUnBlock)){
          blockedURLS.remove(urlToUnBlock);
          console.log("Successfully unblocked URL: " + urlToUnBlock)
        } else {
          console.log("URL " + urlToUnBlock + " not found in blocked URLs");
        }

        break;

      default:
        console.log("Unknown command - " + command);
        break;
    }
});

// Handle responses
function handleResponse(options, res, client_response, eventTimes){

  // Extract URL from options
  var url = options.hostname;

  // Check if URL is blocked
  if(blockedURLS.containsKey(url)){
    console.log("URL " + url + " is blocked.");
    client_response.write("URL " + url + " is blocked.");
    client_response.end();
    return;
  }

  // Extract status code and expires from response
  const { statusCode } = res;
  const responseExpiry = res.headers['expires'];

  let error;

  //If no 200 status received, error
  if (statusCode !== 200) {
    error = new Error('Request Failed.\n' +
    `Status Code: ${statusCode}`);
  }

  // Handle response error
  if (error) {
    console.error(error.message);
    client_response.write(error.message);
    client_response.end();
    return;
  }

  var cacheHit = false;

  // Start cache lookup time
  eventTimes.cacheLookupAt = process.hrtime()

  // Check cache for web page and verify expires
  myCache.get(url, (err, cachedResponse) => {
    if( !err ){

      if(cachedResponse == undefined){
        console.log("URL " + url + " not found in cache. Continuing with request...");
        console.log("---------------------------------------------------------------------");
      }else{
        console.log("URL found in cache, verifying cache page hasn't expired...");

        var cachedExpiryDate = Date.parse(cachedResponse.expiry);
        var responseExpiryDate = Date.parse(responseExpiry);

        // If cache expiry equal or better than response expiry cache hit
        if (cachedExpiryDate >= responseExpiryDate){
          console.log("Cached page has not expired - returning...")
          client_response.write(cachedResponse.body);
          client_response.end();
          eventTimes.cacheReturnAt = process.hrtime();

          var responseSizeB = Buffer.byteLength(cachedResponse.body, 'utf8');
          var responseSizeKB = responseSizeB/1024;

          // Calculate and display total response size
          console.log("---------------------------------------------------------------------");
          console.log("Cached response size:  " + cachedResponse.body.length + " characters, " + responseSizeB + " bytes", responseSizeKB + " KB");
          console.log("---------------------------------------------------------------------");

          eventTimes.endAt = process.hrtime()
          var cacheLookupTime = getHrTimeDurationInMs(eventTimes.cacheLookupAt, eventTimes.cacheReturnAt);

          // Display timings
          console.log("Process                          | Time Taken (ms)                       ");
          console.log("---------------------------------------------------------------------");
          console.log("DNS Lookup                       | 0");
          console.log("TCP Connection                   | 0");
          console.log("TLS Handshake                    | 0");
          console.log("First Byte                       | 0");
          console.log("Content Transfer                 | 0");
          console.log("Cache Lookup                     | " + cacheLookupTime);
          console.log("---------------------------------------------------------------------");
          console.log("Total Request Time               | " + cacheLookupTime + " ms");

          // Calculate bandwidth (KB/s)
          var bandwidth = (responseSizeKB/(cacheLookupTime*0.001)).toFixed(6)
          console.log("Total Request Bandwidth          | " + bandwidth + " KB/s");

          cacheHit = true;
        } else{
          console.log("Cached response expired - fetching up to date response...");
          console.log("---------------------------------------------------------------------");
        }
      }
    }
  });

  // If url not found in cache, continue with request and cache new response
  if(!cacheHit){
    res.setEncoding('utf8');

    let rawData = '';

    // When first byte recieved
    res.once('readable', () => {
      eventTimes.firstByteAt = process.hrtime()
      console.time('firstByteAt')
    })

    // When data is received
    res.on('data', (chunk) => {
      rawData += chunk;
      console.log("Received chunk of size " + chunk.length + " characters, " + Buffer.byteLength(chunk, 'utf8') + " bytes");
    });

    // When response is finished
    res.on('end', () => {

      eventTimes.endAt = process.hrtime()

      var responseSizeB = Buffer.byteLength(rawData, 'utf8');
      var responseSizeKB = responseSizeB/1024;

      // Calculate and display total response size
      console.log("---------------------------------------------------------------------");
      console.log("Total response size:  " + rawData.length + " characters, " + responseSizeB + " bytes", responseSizeKB + " KB");
      console.log("---------------------------------------------------------------------");

      var timings = getTimings(eventTimes);

      // Display timings
      console.log("Process                          | Time Taken (ms)                       ");
      console.log("---------------------------------------------------------------------");
      console.log("DNS Lookup                       | " + timings.dnsLookup);
      console.log("TCP Connection                   | " + timings.tcpConnection);
      console.log("TLS Handshake                    | " + timings.tlsHandshake);
      console.log("First Byte                       | " + timings.firstByte);
      console.log("Content Transfer                 | " + timings.contentTransfer);
      console.log("---------------------------------------------------------------------");
      console.log("Total Request Time               | " + timings.total + " ms");

      // Calculate bandwidth (KB/s)
      var bandwidth = (responseSizeKB/(timings.total*0.001)).toFixed(6)
      console.log("Total Request Bandwidth          | " + bandwidth + " KB/s");


      // Create cache object with expiry
      cacheObject = {
        expiry: responseExpiry,
        body: rawData
      }

      myCache.set(url, cacheObject, (err, success) => {
        if(!err && success){
          console.log("\nSuccessfully added " + url + " to cache");
        } else{
          console.log("\nFailed to add " + url + " to cache");
        }
      })

      client_response.write(rawData);
      client_response.end();
    });
  }
}

// Handle requests
function onRequest(client_request, client_response) {

    // Record specific event times here
    const eventTimes = {
      // use process.hrtime() as it's not a subject of clock drift
      startAt: process.hrtime(),
      dnsLookupAt: undefined,
      tcpConnectionAt: undefined,
      tlsHandshakeAt: undefined,
      firstByteAt: undefined,
      endAt: undefined,
      cacheLookupAt: undefined,
      cacheReturnAt: undefined
    }

    var options = URL.parse(client_request.url.substring(1), true);

    // Only handle HTTP and HTTPS requests
    if(options.protocol == 'http:' || options.protocol == 'https:'){

      // Filter out favicon and assets requests
      if(options.path != 'favicon.ico' && options.hostname != 'assets'){
        console.log('\nReceived request for: ' + options.protocol + '//'+ options.hostname);

        var proxy_req = null;

        // Handle http and https request seperately
        switch(options.protocol){
          case 'http:':
            proxy_req = http.get(options.href, (res) => handleResponse(options, res, client_response, eventTimes));
            break;
          case 'https:':
            proxy_req = https.get(options.href, (res) => handleResponse(options, res, client_response, eventTimes))
            .on('socket', (socket) => {
              // Record DNS Lookup
              socket.on('lookup', () => {
                eventTimes.dnsLookupAt = process.hrtime();
              })
              // Record TCP connection
              socket.on('connect', () => {
                eventTimes.tcpConnectionAt = process.hrtime();
              })
              // If HTTPS record TLS handshake timing
              socket.on('secureConnect', () => {
                eventTimes.tlsHandshakeAt = process.hrtime();
              })
              socket.on('end', () => {
                eventTimes.requestEndAt = process.hrtime();
              })
            });
            break;
          default:
            client_response.write('Invalid request, please enter a valid request such as:\n\nhttp://localhost:3080/https://www.tcd.ie');
            client_response.end();
            break;

          // Handle proxy request events
          // Once a socket is assigned to the proxy request
          proxy_req.on('socket', (socket) => {
            // Record DNS Lookup
            socket.on('lookup', () => {
              eventTimes.dnsLookupAt = process.hrtime();
            })
            // Record TCP connection
            socket.on('connect', () => {
              eventTimes.tcpConnectionAt = process.hrtime();
            })
            // If HTTPS record TLS handshake timing
            socket.on('secureConnect', () => {
              eventTimes.tlsHandshakeAt = process.hrtime();
            })
            socket.on('end', () => {
              eventTimes.requestEndAt = process.hrtime();
            })
          });

          // Handle request timeouts
          proxy_req.on('timeout', () => {
            console.log('Proxy request timed out...');
            client_response.write('Proxy request timed out...');
            client_response.end();
            proxy_req.abort();
          })

          // Handle request errors
          proxy_req.on('error', (e) => {
            console.error(`Got error: ${e.message}`);
            client_response.write(`Got error: ${e.message}`);
            client_response.end();
            proxy_req.abort();
          });
        }
      } else{
        client_response.end();
      }
    } else{
      client_response.write('Invalid request, please enter a valid request such as:\n\nhttp://localhost:3080/https://www.tcd.ie');
      client_response.end();
    }
}

// Handle WebSocket requests
function handleWebSocketRequest(url, ws){

  // Record specific event times here
  const eventTimes = {
    // use process.hrtime() as it's not a subject of clock drift
    startAt: process.hrtime(),
    dnsLookupAt: undefined,
    tcpConnectionAt: undefined,
    tlsHandshakeAt: undefined,
    firstByteAt: undefined,
    endAt: undefined,
    cacheLookupAt: undefined,
    cacheReturnAt: undefined
  }

  var options = URL.parse(url, true);

  // Only handle HTTP and HTTPS requests
  if(options.protocol == 'http:' || options.protocol == 'https:'){

    // Filter out favicon and assets requests
    if(options.path != 'favicon.ico' && options.hostname != 'assets'){
      console.log('\nReceived request for: ' + options.protocol + '//'+ options.hostname);

      var proxy_req = null;

      // Handle http and https request seperately
      switch(options.protocol){
        case 'http:':
          proxy_req = http.get(options.href, (res) => handleWebSocketResponse(options, res, ws, eventTimes));
          break;
        case 'https:':
          proxy_req = https.get(options.href, (res) => handleWebSocketResponse(options, res, ws, eventTimes))
          .on('socket', (socket) => {
            // Record DNS Lookup
            socket.on('lookup', () => {
              eventTimes.dnsLookupAt = process.hrtime();
            })
            // Record TCP connection
            socket.on('connect', () => {
              eventTimes.tcpConnectionAt = process.hrtime();
            })
            // If HTTPS record TLS handshake timing
            socket.on('secureConnect', () => {
              eventTimes.tlsHandshakeAt = process.hrtime();
            })
            socket.on('end', () => {
              eventTimes.requestEndAt = process.hrtime();
            })
          });
          break;
        default:
          ws.send('Invalid request, please enter a valid request such as:\n\nhttp://localhost:3080/https://www.tcd.ie');
          break;

        // Handle proxy request events
        // Once a socket is assigned to the proxy request
        proxy_req.on('socket', (socket) => {
          // Record DNS Lookup
          socket.on('lookup', () => {
            eventTimes.dnsLookupAt = process.hrtime();
          })
          // Record TCP connection
          socket.on('connect', () => {
            eventTimes.tcpConnectionAt = process.hrtime();
          })
          // If HTTPS record TLS handshake timing
          socket.on('secureConnect', () => {
            eventTimes.tlsHandshakeAt = process.hrtime();
          })
          socket.on('end', () => {
            eventTimes.requestEndAt = process.hrtime();
          })
        });

        // Handle request timeouts
        proxy_req.on('timeout', () => {
          console.log('Proxy request timed out...');
          ws.send('Proxy request timed out...');
          proxy_req.abort();
        })

        // Handle request errors
        proxy_req.on('error', (e) => {
          console.error(`Got error: ${e.message}`);
          ws.send(`Got error: ${e.message}`);
          proxy_req.abort();
        });
      }
    }
  } else{
    ws.send('Invalid request, please enter a valid request such as:\n\nhttp://localhost:3080/https://www.tcd.ie');
  }
}

// Handle WebSocket responses
function handleWebSocketResponse(options, res, ws, eventTimes){

  // Extract URL from options
  var url = options.hostname;

  // Check if URL is blocked
  if(blockedURLS.containsKey(url)){
    console.log("URL " + url + " is blocked.");
    ws.send("URL " + url + " is blocked.");
    return;
  }

  // Extract status code and expires from response
  const { statusCode } = res;
  const responseExpiry = res.headers['expires'];

  let error;

  //If no 200 status received, error
  if (statusCode !== 200) {
    error = new Error('Request Failed.\n' +
    `Status Code: ${statusCode}`);
  }

  // Handle response error
  if (error) {
    console.error(error.message);
    ws.send(error.message);
    return;
  }

  var cacheHit = false;

  // Check cache for web page and verify expires
  myCache.get(url, (err, cachedResponse) => {
    if( !err ){

      if(cachedResponse == undefined){
        console.log("URL " + url + " not found in cache. Continuing with request...");
      }else{
        console.log("URL found in cache, verifying cache page hasn't expired...");

        console.log("Cache object expiry: " + cachedResponse.expiry);
        console.log("Response expiry: " + responseExpiry);

        var cachedExpiryDate = Date.parse(cachedResponse.expiry);
        var responseExpiryDate = Date.parse(responseExpiry);

        // If cache expiry equal or better than response expiry cache hit
        if (cachedExpiryDate >= responseExpiryDate){
          console.time('Cached Request Time');
          console.log("Cached page has not expired - returning...")
          ws.send(cachedResponse.body);
          console.timeEnd('Cached Request Time');
          cacheHit = true;
        } else{
          console.log("Cached response expired - fetching up to date response...");
        }
      }
    }
  });

  // If url not found in cache, continue with request and cache new response
  if(!cacheHit){
    res.setEncoding('utf8');

    let rawData = '';
    console.time('Non-Cached Request Time');

    // When first byte recieved
    res.once('readable', () => {
      eventTimes.firstByteAt = process.hrtime()
      console.time('firstByteAt')
    })

    // When data is received
    res.on('data', (chunk) => { rawData += chunk; });

    // When response is finished
    res.on('end', () => {

      console.timeEnd('Non-Cached Request Time');
      eventTimes.endAt = process.hrtime()
      var timings = getTimings(eventTimes);
      console.log(timings);

      // Create cache object with expiry
      cacheObject = {
        expiry: responseExpiry,
        body: rawData
      }

      myCache.set(url, cacheObject, (err, success) => {
        if(!err && success){
          console.log("Successfully added " + url + " to cache");
        } else{
          console.log("Failed to add " + url + " to cache");
        }
      })

      ws.send(rawData);
    });
  }
}

// Calculates all of the stored timing values
function getTimings (eventTimes) {
  return {
    // There is no DNS lookup with IP address
    dnsLookup: eventTimes.dnsLookupAt !== undefined ? getHrTimeDurationInMs(eventTimes.startAt, eventTimes.dnsLookupAt) : undefined,
    tcpConnection: getHrTimeDurationInMs(eventTimes.dnsLookupAt || eventTimes.startAt, eventTimes.tcpConnectionAt),
    tlsHandshake: eventTimes.tlsHandshakeAt !== undefined ? (getHrTimeDurationInMs(eventTimes.tcpConnectionAt, eventTimes.tlsHandshakeAt)) : undefined,
    firstByte: getHrTimeDurationInMs((eventTimes.tlsHandshakeAt || eventTimes.tcpConnectionAt), eventTimes.firstByteAt),
    contentTransfer: getHrTimeDurationInMs(eventTimes.firstByteAt, eventTimes.endAt),
    cachedResponseTime: (eventTimes.cacheLookupAt != undefined && eventTimes.cacheReturnAt != undefined) ? getHrTimeDurationInMs(eventTimes.cacheLookupAt, eventTimes.cacheReturnAt) : undefined,
    total: getHrTimeDurationInMs(eventTimes.startAt, eventTimes.endAt)
  }
}

// Converts times to ms
function getHrTimeDurationInMs (startTime, endTime) {
  const secondDiff = endTime[0] - startTime[0]
  const nanoSecondDiff = endTime[1] - startTime[1]
  const diffInNanoSecond = secondDiff * NS_PER_SEC + nanoSecondDiff

  return diffInNanoSecond / MS_PER_NS
}

// HTTP Server
var server = http.createServer(onRequest).listen(4000, function () {
  console.log('Example app listening on port 4000! Go to http://localhost:4000/')
})

// WebSocket server
var wsServer = new WebSocket.Server({ server });

// Handle connections to WebSocket server
wsServer.on('connection', function connection(ws) {

  console.log("Received websocket connection...");

  ws.on('message', function incoming(message) {
    console.log('Received WebSocket request for: %s', message);
    handleWebSocketRequest(message, ws);
  });
});
