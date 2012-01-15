var http = require("http");
var rs = require("./lib/buster-resources");

var middleware = rs.resourceMiddleware.create("/resources");

var set = rs.resourceSet.create();
set.addResource({ path: "/buster.js", content: "Booyah!" });
middleware.mount(set);

http.createServer(function (req, res) {
    if (middleware.respond(req, res)) { return; }
    res.writeHead(404);
    res.end();
}).listen(9988);

// Test it
http.request({
    host: "localhost",
    port: 9988,
    path: "/resources/buster.js"
}, function (res) {
    res.setEncoding("utf8");
    res.on("data", function (chunk) {
        console.log(chunk);
    });
}).end();
