var fs = require('fs');
var https = require('https');
var http = require('http');
var url = require('url');
var request = require('request');

// Set max sockets opened by proxy
var maxSocks = process.env.MAX_SOCKETS || 2048;

// Set timeout (ms) for proxy requests
var timeout = process.env.TIMEOUT || 25000;

function handleHttpRequest(url, client_response){

  http.get(url, (res) => {
    const { statusCode } = res;
    const contentType = res.headers['content-type'];

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
    const { statusCode } = res;
    const contentType = res.headers['content-type'];

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

function onRequest(client_request, client_response) {

    var url = client_request.url.substring(1);
    console.log('Received request for: ' + url);

    if(url.substring(0,7) == 'http://'){
      handleHttpRequest(url, client_response);
    } else if(url.substring(0,8) == 'https://'){
      handleHttpsRequest(url, client_response);
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
