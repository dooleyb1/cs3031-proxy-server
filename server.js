var fs = require('fs');
var https = require('https');
var http = require('http');
var url = require('url');
var request = require('request');
const NodeCache = require( "node-cache" );

// Create cache, never delete files unless updated by request
const myCache = new NodeCache({ stdTTL: 3600, checkperiod: 3600 });

function handleHttpRequest(url, client_response){

  http.get(url, (res) => {
    const { statusCode } = res;
    const contentType = res.headers['content-type'];

    let error;
    console.log('Expires: ' + res.headers['expires']);

    //If no 200 status received, error
    if (statusCode !== 200) {
      error = new Error('Request Failed.\n' +
      `Status Code: ${statusCode}`);
    }

    if (error) {
      console.error(error.message);

      client_response.write(error.message);
      client_response.end();
      return;
    }

    res.setEncoding('utf8');

    let rawData = '';

    res.on('data', (chunk) => { rawData += chunk; });

    res.on('end', () => {
      client_response.write(rawData);
      client_response.end();
    });
  }).on('error', (e) => {
    console.error(`Got error: ${e.message}`);
  });
}

function handleHttpsRequest(url, client_response){

  https.get(url, (res) => {

    // Extract status code and expires from response
    const { statusCode } = res;
    const responseExpiry = res.headers['expires'];

    let error;

    //If no 200 status received, error
    if (statusCode !== 200) {
      error = new Error('Request Failed.\n' +
      `Status Code: ${statusCode}`);
    }

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
          console.log("URL found in cache, returning cached page to client...");

          console.log("Expiry of object in cache: " + cachedResponse.expiry);
          console.log("Response expiry: " + responseExpiry);

          var cachedExpiryDate = Date.parse(cachedResponse.expiry);
          var responseExpiryDate = Date.parse(responseExpiry);

          // If cache expiry equal or better than response expiry cache hit
          if (cachedExpiryDate >= responseExpiryDate){
            console.log("Cache hit - newer expiry")
            client_response.write(cachedResponse.body);
            client_response.end();
            cacheHit = true;
          } else{
            console.log("Cache miss - file had expired");
          }

          return;
        }
      }
    });

    // If url not found in cache, continue with request and cache new response
    if(!cacheHit){
      res.setEncoding('utf8');

      let rawData = '';

      res.on('data', (chunk) => { rawData += chunk; });

      res.on('end', () => {

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
    } else{
      console.log("Cache hit, returning...");
      return;
    }

  }).on('error', (e) => {
    console.error(`Got error: ${e.message}`);
  });
}

function onRequest(client_request, client_response) {

    var url = client_request.url.substring(1);
    console.log('Received request for: ' + url);

    if(url.substring(0,7) == 'http://'){
      handleHttpRequest(url, client_response);
    } else if(url.substring(0,8) == 'https://'){
      handleHttpsRequest(url, client_response);
    } else {
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
