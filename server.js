var fs = require('fs')
var https = require('https')
var http = require('http')
var url = require('url');
var request = require('request')

function onRequest(req, res) {

    // Parse out / data
    var queryData = url.parse(req.url, true).query;

    // If there exists ?url=
    if (queryData.url) {

      console.log(queryData.url);

      request(queryData.url, function(error, response, body){
        console.log('Request:', queryData.url);
        console.log('StatusCode:', response && response.statusCode);
      }).pipe(res)
    }
    else {
        res.end("No url found");
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
