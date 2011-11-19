var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var http = require("http");
var h = require("./test-helper");

var busterResources = require("./../lib/buster-resources");
var busterResourcesResourceSet = require("./../lib/resource-set");
var busterResourcesResource = require("./../lib/resource");

buster.testCase("Buster resources", {
    setUp: function () {
        var self = this;
        this.br = Object.create(busterResources);
    },

    "test provides validation APIs": function () {
        this.stub(busterResourcesResourceSet, "validate");
        busterResources.validateResourceSet("whatever");
        assert(busterResourcesResourceSet.validate.calledOnce);
        assert(busterResourcesResourceSet.validate.calledWith("whatever"));

        this.stub(busterResourcesResource, "validate");
        busterResources.validateResource("whatever");
        assert(busterResourcesResource.validate.calledOnce);
        assert(busterResourcesResource.validate.calledWith("whatever"));

    },

    "resource sets": {
        setUp: function () {
            this.rs = this.br.createResourceSet({
                load: ["/foo.js"],
                resources: {
                    "/foo.js": {
                        content: "var a = 5 + 5;"
                    }
                }
            });
        },

        "test getting cached resources with nothing cached": function () {
            assert.equals(this.br.getCachedResources(), {});
        },

        "test getting cached resources with resource cached": function () {
            this.rs.addResource("/test.js", {
                content: "",
                etag: "123abc"
            });

            var actual = this.br.getCachedResources();
            assert.equals(Object.keys(actual).length, 1);
            assert.equals(actual, {"/test.js": ["123abc"]});
        },

        "test re-using cached resource when creating new resource set": function (done) {
            this.rs.addResource("/test.js", {
                content: "Hello, World!",
                headers: {"X-Foo": "666"},
                etag: "123abc"
            });

            var rs2 = this.br.createResourceSet({
                contextPath: "/rs2",
                resources: {
                    "/test.js": {etag: "123abc"}
                }
            });

            this.br.getResource("/rs2/test.js", function (err, resource) {
                assert.equals(resource.content, "Hello, World!");
                assert.match(resource.headers, {"X-Foo": "666"});
                done();
            });
        },

        "test creating new resource with none existing etag": function (done) {
            var self = this;
            try {
                self.br.createResourceSet({
                    contextPath: "/rs2",
                    resources: {
                        "/test.js": {etag: "123abc"}
                    }
                });
            } catch (e) {
                buster.assert.match(e.message, "/test.js");
                buster.assert.match(e.message, "123abc");
                buster.assert.match(e.message, "not found");
                done();
            }
        },

        "test removing resource sets": function (done) {
            var self = this;
            var rs = this.br.createResourceSet({
                resources: {
                    "/myfile.js": {
                        content: "Hi there."
                    }
                }
            });
            rs.contextPath = "/yay";

            var resourcePath = "/yay/myfile.js";

            this.br.getResource(resourcePath, function (err, resource) {
                refute.defined(err);
                assert.defined(resource);
                self.br.removeResourceSet(rs);

                self.br.getResource(resourcePath, function (err, resource) {
                    assert.equals(err, busterResourcesResourceSet.RESOURCE_NOT_FOUND);
                    refute.defined(resource);
                    done();
                });
            });
        },

        "test re-using cached resource for destroyed resource set": function () {
            var rs = this.br.createResourceSet({
                resources: {
                    "/myfile.js": {
                        content: "Hi there.",
                        etag: "123abc"
                    }
                }
            });

            this.br.removeResourceSet(rs);

            var actual = this.br.getCachedResources();
            assert.equals(Object.keys(actual).length, 1);
            assert.equals(actual, {"/myfile.js": ["123abc"]});
        },

        "test creating new resource with etag for resource in deleted resource set": function (done) {
            var rs = this.br.createResourceSet({
                resources: {
                    "/myfile.js": {
                        content: "Hi there.",
                        etag: "123abc"
                    }
                }
            });
            this.br.removeResourceSet(rs);

            var rs2 = this.br.createResourceSet({
                contextPath: "/rs2",
                resources: {
                    "/myfile.js": {etag: "123abc"}
                }
            });

            this.br.getResource(rs2.contextPath + "/myfile.js", function (err, resource) {
                assert.equals(resource.content, "Hi there.");
                done();
            });
        },

        "test multiple caches for the same path": function () {
            this.rs.addResource("/test.js", {
                content: "Hello, World!",
                etag: "123abc"
            });

            var rs2 = this.br.createResourceSet({
                resources: {
                    "/test.js": {
                        content: "Hello again, World.",
                        etag: "321cba"
                    }
                }
            });

            var actual = this.br.getCachedResources();
            assert.equals(actual["/test.js"], ["123abc", "321cba"]);
        },

        "test garbage collecting deletes resources for removed resource sets": function (done) {
            var self = this;
            var rs = this.br.createResourceSet({
                contextPath: "/myrs",
                resources: {
                    "/myfile.js": {
                        content: "Hi there.",
                        etag: "123abc"
                    }
                }
            });
            this.br.removeResourceSet(rs);
            this.br.gc();

            this.br.getResource(rs.contextPath + "/myfile.js", function (err, resource) {
                assert.equals(err, busterResourcesResourceSet.RESOURCE_NOT_FOUND);
                done();
            });
        }
    },

    "via http": {
        setUp: function (done) {
            var self = this;

            this.server = http.createServer(function (req, res) {
                if (self.br.getResourceViaHttp(req, res)) return;

                res.writeHead(h.NO_RESPONSE_STATUS_CODE);
                res.end();
            });
            this.server.listen(h.SERVER_PORT, done);
        },

        tearDown: function (done) {
            this.server.on("close", done);
            this.server.close();
        },

        "should retrieve cached resource": function (done) {
            this.br.createResourceSet({
                contextPath: "/a",
                resources: {
                    "/foo.js": {
                        content: "Hello from foo",
                        etag: "1234",
                        headers: {"X-Foo": "Bar"}
                    }
                }
            });

            this.br.createResourceSet({
                contextPath: "/b",
                resources: {
                    "/foo.js": {
                        etag: "1234"
                    }
                }
            });

            h.request({path: "/b/foo.js", method: "GET"}, function (res, body) {
                assert.equals(res.statusCode, 200);
                assert.match(res.headers, {"x-foo": "Bar"});
                assert.equals(body, "Hello from foo");
                done();
            }).end();
        }
    }
});