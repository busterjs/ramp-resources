var buster = require("buster");
var resourceSet = require("../lib/resource-set");
var resourceMiddleWare = require("../lib/resource-middleware");
var h = require("./test-helper");

function createResourceSets() {
    var resourceSets = {
        withBuster: resourceSet.create(),
        withSinon: resourceSet.create()
    };

    resourceSets.withBuster.addResource({
        path: "/buster.js",
        content: "OK",
        headers: { "X-Buster": "Yes" }
    });

    resourceSets.withSinon.addResource({ path: "/sinon.js", content: "Hey" });

    return resourceSets;
}

buster.testCase("Resource middleware", {
    setUp: function () {
        this.sets = createResourceSets();
    },

    "no resource sets mounted": {
        setUp: function (done) {
            this.resources = resourceMiddleWare.create();
            this.server = h.createServer(this.resources, done);
        },

        tearDown: h.serverTearDown,

        "root responds with 404": function (done) {
            h.req({ path: "/" }, done(function (req, res) {
                assert.equals(res.statusCode, 404);
            })).end();
        },

        "contextPath responds with 404": function (done) {
            this.resources.contextPath = "/resources";

            h.req({ path: "/resources" }, done(function (req, res) {
                assert.equals(res.statusCode, 404);
            })).end();
        },

        "requests below contextPath are not handled": function (done) {
            this.resources.setContextPath("/resources");

            h.req({ path: "/elsewhere" }, done(function (req, res) {
                assert.equals(res.statusCode, 418);
            })).end();
        }
    },

    "one resource set mounted": {
        setUp: function (done) {
            this.resources = resourceMiddleWare.create();
            this.resources.mount(this.sets.withBuster);
            this.server = h.createServer(this.resources, done);
        },

        tearDown: h.serverTearDown,

        "root responds with 404": function (done) {
            h.req({ path: "/" }, done(function (req, res) {
                assert.equals(res.statusCode, 404);
            })).end();
        },

        "serves matching resource": function (done) {
            h.req({ path: "/buster.js" }, done(function (req, res, body) {
                assert.equals(res.statusCode, 200);
                assert.equals(body, "OK");
            })).end();
        },

        "serves resource with headers": function (done) {
            h.req({ path: "/buster.js" }, done(function (req, res, body) {
                assert.equals(res.headers["content-type"],
                              "application/javascript; charset=utf-8");
                assert.equals(res.headers["x-buster"], "Yes");
            })).end();
        },

        "ignores url parameters": function (done) {
            h.req({ path: "/buster.js?123" }, done(function (req, res, body) {
                assert.equals(body, "OK");
            })).end();
        }
    },

    "two resource sets mounted": {
        setUp: function (done) {
            this.resources = resourceMiddleWare.create();
            this.resources.mount(this.sets.withBuster);
            this.resources.mount(this.sets.withSinon);
            this.server = h.createServer(this.resources, done);
        },

        tearDown: h.serverTearDown,

        "root responds with 404": function (done) {
            h.req({ path: "/" }, done(function (req, res) {
                assert.equals(res.statusCode, 404);
            })).end();
        },

        "serves content from first set": function (done) {
            h.req({ path: "/buster.js" }, done(function (req, res, body) {
                assert.equals(body, "OK");
            })).end();
        },

        "serves content from second set": function (done) {
            h.req({ path: "/sinon.js" }, done(function (req, res, body) {
                assert.equals(body, "Hey");
            })).end();
        },

        "prefers first set when duplicates": function (done) {
            this.sets.withBuster.addResource({
                path: "/sinon.js",
                content: "HAHA"
            });

            h.req({ path: "/sinon.js" }, done(function (req, res, body) {
                assert.equals(body, "HAHA");
            })).end();
        },

        "stops serving from unmounted set": function (done) {
            this.resources.unmount(this.sets.withBuster);

            h.req({ path: "/buster.js" }, done(function (req, res) {
                assert.equals(res.statusCode, 404);
            })).end();
        }
    },

    "with context path": {
        setUp: function (done) {
            this.resources = resourceMiddleWare.create("/ctx/1");
            this.resources.mount(this.sets.withBuster);
            this.server = h.createServer(this.resources, done);
        },

        tearDown: h.serverTearDown,

        "serves resource from context path": function (done) {
            h.req({ path: "/ctx/1/buster.js" }, done(function (req, res, body) {
                assert.equals(res.statusCode, 200);
                assert.equals(body, "OK");
            })).end();
        }
    },

    "with proxy resource matching path": {
        setUp: function (done) {
            this.backend = h.createProxyBackend(2222);
            this.resources = resourceMiddleWare.create();
            var rs = resourceSet.create();
            rs.addResource({ path: "/app", backend: "localhost:2222" });
            this.resources.mount(rs);
            this.server = h.createServer(this.resources, done);
        },

        tearDown: function (done) {
            var cb = buster.countdown(2, done);
            this.backend.close(cb);
            h.serverTearDown.call(this, cb);
        },

        "hits backend through proxy": function (done) {
            this.backend.onRequest = done(function (req, res) {
                assert.equals(req.url, "/app");
            });
            h.req({ path: "/app" }).end();
        },

        "proxys request with url parameters": function (done) {
            this.backend.onRequest = done(function (req, res) {
                assert.equals(req.url, "/app?id=2");
            });
            h.req({ path: "/app?id=2" }).end();
        },

        "proxys any request matching root url": function (done) {
            this.backend.onRequest = done(function (req, res) {
                assert.equals(req.url, "/app/service.json");
            });
            h.req({ path: "/app/service.json" }).end();
        },

        "proxys POST requests": function (done) {
            this.backend.onRequest = done(function (req, res) {
                assert.equals(req.url, "/app/service.json");
                assert.equals(req.method, "POST");
            });
            h.req({
                method: "POST",
                path: "/app/service.json"
            }).end("Booyah");
        },

        "strips context path prior to proxy": function (done) {
            this.resources.setContextPath("/sessions");

            this.backend.onRequest = done(function (req, res) {
                assert.equals(req.url, "/app/service.json");
                assert.equals(req.method, "POST");
            });
            h.req({
                method: "POST",
                path: "/sessions/app/service.json"
            }).end("Booyah");
        }
    },

    "with proxy resource on different path": {
        setUp: function (done) {
            this.backend = h.createProxyBackend(2222);
            this.resources = resourceMiddleWare.create();
            var rs = resourceSet.create();
            rs.addResource({
                path: "/app",
                backend: "localhost:2222/test-app"
            });
            this.resources.mount(rs);
            this.server = h.createServer(this.resources, done);
        },

        tearDown: function (done) {
            var cb = buster.countdown(2, done);
            this.backend.close(cb);
            h.serverTearDown.call(this, cb);
        },

        "hits backend through proxy": function (done) {
            this.backend.onRequest = done(function (req, res) {
                assert.equals(req.url, "/test-app/app");
            });
            h.req({ path: "/app" }).end();
        },

        "strips context path prior to proxy": function (done) {
            this.resources.setContextPath("/sessions");

            this.backend.onRequest = done(function (req, res) {
                assert.equals(req.url, "/test-app/app/service.json");
                assert.equals(req.method, "POST");
            });
            h.req({
                method: "POST",
                path: "/sessions/app/service.json"
            }).end("Booyah");
        }
    }
});

