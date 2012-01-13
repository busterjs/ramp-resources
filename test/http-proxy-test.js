var buster = require("buster");
var http = require("http");
var httpProxy = require("../lib/http-proxy");

function body(res, callback) {
    var data = "";
    res.on("data", function (chunk) { data += chunk; });
    res.on("end", function () { callback(data); });
}

function request(opt, callback) {
    var req = http.request(buster.extend({
        method: "GET",
        host: "localhost",
        port: 2233
    }, opt));

    req.on("response", function (res) {
        if (callback) {
            callback(req, res);
        }
    });

    return req;
}

buster.testCase("HTTP proxy", {
    setUp: function (done) {
        var self = this;
        this.proxyMiddleware = httpProxy.create("localhost", 2222);
        this.requests = [];

        this.backend = http.createServer(function (req, res) {
            self.requests.push({ req: req, res: res });
            if (self.onBackendRequest) {
                self.onBackendRequest(req, res);
            }
        });

        this.proxy = http.createServer(function (req, res) {
            self.proxyMiddleware.respond(req, res);
        });

        this.backend.listen(2222);
        this.proxy.listen(2233, done);
    },

    tearDown: function (done) {
        var cb = buster.countdown(2, done);
        var i, l;

        for (i = 0, l = this.requests.length; i < l; ++i) {
            if (!this.requests[i].res.ended) {
                this.requests[i].res.end();
            }
        }

        this.proxy.on("close", cb);
        this.backend.on("close", cb);
        this.backend.close();
        this.proxy.close();
    },

    "incoming requests": {
        "forwards request to backend": function (done) {
            request().end();
            this.onBackendRequest = done(function (req, res) {
                assert(true);
            });
        },

        "forwards method and path": function (done) {
            request({ method: "GET", path: "/buster" }).end();
            this.onBackendRequest = done(function () {
                assert.match(this.requests[0].req, {
                    method: "GET",
                    url: "/buster"
                });
            });
        },

        "forwards url with query parameters": function (done) {
            request({ path: "/buster?id=23" }).end();

            this.onBackendRequest = done(function (req, res) {
                assert.match(req, { url: "/buster?id=23" });
            });
        },

        "forwards POST body": function (done) {
            var req = request({ method: "POST" });
            req.write("Yo, hey");
            req.end();

            this.onBackendRequest = function (req, res) {
                body(req, done(function (body) {
                    assert.equals(body, "Yo, hey");
                }));
            };
        },

        "forwards headers": function (done) {
            request({ headers: {
                "Expires": "Sun, 15 Mar 2012 12:18 26 GMT",
                "X-Buster": "Yes"
            }}).end();

            this.onBackendRequest = done(function (req, res) {
                assert.match(req.headers, {
                    "expires": "Sun, 15 Mar 2012 12:18 26 GMT",
                    "x-buster": "Yes"
                });
            });
        }
    },

    "responses": {
        "sends response": function (done) {
            request({}, done(function () {
                assert(true);
            })).end();

            this.onBackendRequest = function (req, res) {
                res.writeHead(200);
                res.end();
            };
        },

        "forwards response code": function (done) {
            request({}, done(function (req, res) {
                assert.equals(res.statusCode, 202);
            })).end();

            this.onBackendRequest = function (req, res) {
                res.writeHead(202);
                res.end();
            };
        },

        "forwards response body": function (done) {
            request({}, function (req, res) {
                body(res, done(function (body) {
                    assert.equals(body, "Yo, hey");
                }));
            }).end();

            this.onBackendRequest = function (req, res) {
                res.writeHead(200);
                res.end("Yo, hey");
            };
        },

        "forwards headers": function (done) {
            request({}, done(function (req, res) {
                assert.match(res.headers, {
                    "expires": "Sun, 15 Mar 2012 12:18 26 GMT",
                    "x-buster": "Yes"
                });
            })).end();

            this.onBackendRequest = function (req, res) {
                res.writeHead(200, {
                    "Expires": "Sun, 15 Mar 2012 12:18 26 GMT",
                    "X-Buster": "Yes"
                });
                res.end();
            };
        },

        "responds with 503 when backend is down": function (done) {
            this.proxyMiddleware = httpProxy.create("localhost", 2220);

            request({}, done(function (req, res) {
                assert.equals(res.statusCode, 503);
            })).end();
        }
    },

    "backend context path": {
        setUp: function () {
            this.proxyMiddleware = httpProxy.create("localhost", 2222, "/app");
        },

        "forwards requests to scoped path": function (done) {
            request({ method: "GET", path: "/buster" }).end();

            this.onBackendRequest = done(function () {
                assert.equals(this.requests[0].req.url, "/app/buster");
            });
        },

        "avoids double slash": function (done) {
            this.proxyMiddleware.path = "/app/";
            request({ method: "GET", path: "/buster" }).end();

            this.onBackendRequest = done(function () {
                assert.equals(this.requests[0].req.url, "/app/buster");
            });
        },

        "strips context path from Location response header": function (done) {
            request({method: "GET", path: "/buster"}, done(function (req, res) {
                assert.equals(res.headers.location, "/buster");
            })).end();

            this.onBackendRequest = function (req, res) {
                res.writeHead(302, { "Location": "/app/buster" });
                res.end();
            };
        }
    },

    "proxy context path": {
        setUp: function () {
            this.proxyMiddleware = httpProxy.create("localhost", 2222);
            this.proxyMiddleware.setProxyPath("/buster");
        },

        "forwards requests to stripped path": function (done) {
            request({ method: "GET", path: "/buster/" }).end();

            this.onBackendRequest = done(function () {
                assert.equals(this.requests[0].req.url, "/");
            });
        },

        "adds missing slash": function (done) {
            request({ method: "GET", path: "/buster" }).end();

            this.onBackendRequest = done(function () {
                assert.equals(this.requests[0].req.url, "/");
            });
        },

        "avoids double slash": function (done) {
            this.proxyMiddleware.setProxyPath("/buster/");
            request({ method: "GET", path: "/buster/bundle.js" }).end();

            this.onBackendRequest = done(function () {
                assert.equals(this.requests[0].req.url, "/bundle.js");
            });
        },

        "adds context path to Location response header": function (done) {
            var url = "/buster/sumptn";
            request({ method: "GET", path: url }, done(function (req, res) {
                assert.equals(res.headers.location, "/buster/other");
            })).end();

            this.onBackendRequest = function (req, res) {
                res.writeHead(302, { "Location": "/other" });
                res.end();
            };
        }
    },

    "proxy context path and backend path": {
        setUp: function () {
            this.proxyMiddleware = httpProxy.create("localhost", 2222, "/foo");
            this.proxyMiddleware.setProxyPath("/bar");
        },

        "forwards requests to correct path": function (done) {
            request({method: "GET", path: "/bar/baz"}, done(function (r, res) {
                assert.equals(res.headers.location, "/bar/foo/zing");
            })).end();

            this.onBackendRequest = function (req, res) {
                assert.equals(req.url, "/foo/baz");
                res.writeHead(301, { Location: "/foo/zing" });
                res.end();
            };
        }
    }
});
