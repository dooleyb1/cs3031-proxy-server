var fs = require('fs');
var https = require('https');
var http = require('http');
var URL = require('url');
var NodeCache = require( "node-cache" );
var SimpleHashTable = require('simple-hashtable');
var stdin = process.openStdin();

// Create cache, never delete files unless updated by request
const myCache = new NodeCache({ stdTTL: 3600, checkperiod: 3600 });
const blockedURLS = new SimpleHashTable();

// Block TCD to start with
blockedURLS.put('www.tcd.ie', 'blocked');

// Console input listener, block URLs here
stdin.addListener("data", function(data) {

    // Extract command (block, unblock, printBlocked, printCache)
    var input = data.toString();
    var command = input.substring(0, input.indexOf(' '));

    switch(command){
      case "block":
        var urlToBlock = data.toString().substring(6).trim();
        blockedURLS.put(urlToBlock);
        console.log("Successfully blocked URL: " + urlToBlock);
        break;

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

function handleResponse(options, res, client_response){

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
          client_response.write(cachedResponse.body);
          client_response.end();
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

    res.on('data', (chunk) => { rawData += chunk; });

    res.on('end', () => {

      console.timeEnd('Non-Cached Request Time');

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

      client_response.write(rawData);
      client_response.end();
    });
  }
}

function onRequest(client_request, client_response) {

    var options = URL.parse(client_request.url.substring(1), true);

    // Only handle HTTP and HTTPS requests
    if(options.protocol == 'http:' || options.protocol == 'https:'){

      // Filter out favicon and assets requests
      if(options.path != 'favicon.ico' && options.hostname != 'assets'){
        console.log('\nReceived request for: ' + options.protocol + '//'+ options.hostname);

        // Handle http and https request seperately
        switch(options.protocol){
          case 'http:':
            http.get(options.href, (res) => handleResponse(options, res, client_response))
            .on('error', (e) => {
              console.error(`Got error: ${e.message}`);
            });
            break;
          case 'https:':
            https.get(options.href, (res) => handleResponse(options, res, client_response))
            .on('error', (e) => {
              console.error(`Got error: ${e.message}`);
            });
            break;
          default:
            client_response.write('Invalid request, please enter a valid request such as:\n\nhttp://localhost:3080/https://www.tcd.ie');
            client_response.end();
            break;
        }
      } else{
        client_response.end();
      }
    } else{
      client_response.write('Invalid request, please enter a valid request such as:\n\nhttp://localhost:3080/https://www.tcd.ie');
      client_response.end();
    }
}

http.createServer(onRequest).listen(3080, function () {
  console.log('Example app listening on port 3080! Go to http://localhost:3080/')
})

https.createServer({
  key: fs.readFileSync('certs/server.key'),
  cert: fs.readFileSync('certs/server.cert')
}, onRequest)
.listen(3443, function () {
  console.log('Example app listening on port 3443! Go to https://localhost:3443/')
})
