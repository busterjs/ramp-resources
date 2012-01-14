var buster = require("buster");
var resourceSet = require("../lib/resource-set");
var resourceMiddleWare = require("../lib/resource-middleware");
var h = require("./test-helper");

buster.testCase("Resource middleware", {
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
            this.resources.contextPath = "/resources";

            h.req({ path: "/elsewhere" }, done(function (req, res) {
                assert.equals(res.statusCode, 418);
            })).end();
        }
    },

    "one resource set mounted": {
        setUp: function (done) {
            this.rs = resourceSet.create();
            this.rs.addResource({ path: "/buster.js", content: "OK" });
            this.resources = resourceMiddleWare.create();
            this.resources.mount(this.rs);
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
        }
    }
});

