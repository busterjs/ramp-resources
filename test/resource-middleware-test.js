var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var fs = require("fs");
var http = require("http");

var busterResources = require("./../lib/buster-resources");
var h = require("./test-helper");

function assertBodyIsRootResourceProcessed(body, resourceSet) {
    assert.match(body, '<script src="' + resourceSet.contextPath  + '/foo.js"');
}

buster.testCase("Resource middleware", {
    setUp: function () {
        var self = this;
        this.br = Object.create(busterResources);
    },

    "test root resource defaults to text/html content-type": function (done) {
        var rs = this.br.createResourceSet({
            load: [],
            resources: {"/": {content: "hullo!"}}
        });

        
        buster.assert.match(rs.resources["/"].headers, {"Content-Type": "text/html"});
        rs.getResource("/", function (err, resource) {
            buster.assert.match(resource.headers, {"Content-Type": "text/html"});
            done();
        });
    },

    "test root resource as a buffer": function (done) {
        var rs = this.br.createResourceSet({
            load: [],
            resources: {"/": {content: new Buffer([0x3c, 0x62, 0x6f, 0x64, 0x79, 0x3e, 0x3c, 0x2f, 0x62, 0x6f, 0x64, 0x79, 0x3e])}}
        });

        rs.getResource("/", function (err, resource) {
            assert.match(resource.content, /^<body>/);
            done();
        });
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

        "test adding resource post create": function (done) {
            this.rs.addResource("/roflmao.txt", {"content": "Roflmao!"});

            this.br.getResource("/roflmao.txt", function (err, resource) {
                assert.equals(resource.content, "Roflmao!");
                done();
            });
        },

        "test adding new root resource post create": function (done) {
            var self = this;
            this.rs.addResource("/", {content: "hullo"});

            this.br.getResource("/", function (err, resource) {
                assertBodyIsRootResourceProcessed(resource.content, self.rs);
                done();
            });
        },

        "test adding new root resouce with custom content-type": function (done) {
            var self = this;
            this.rs.addResource("/", {content: "hullo", headers: {"Content-Type": "text/wtf"}});

            this.br.getResource("/", function (err, resource) {
                assert.equals(resource.headers["Content-Type"], "text/wtf");
                done();
            });
        },

        "test serving buffer resources": function (done) {
            this.rs.addResource("/hullo.txt", {content: new Buffer([0x50, 0x4e, 0x47])});

            this.br.getResource("/hullo.txt", function (err, resource) {
                assert.equals(resource.content, "PNG");
                done();
            });
        },

        "test provides resources created with resoruce set": function (done) {
            this.br.getResource("/foo.js", function (err, resource) {
                assert.equals(resource.content, "var a = 5 + 5;");
                assert.equals(resource.headers["Content-Type"], "application/javascript");
                done();
            });
        },

        "test hosts resources with custom headers": function (done) {
            this.rs.addResource("/baz.js", {content: "", headers: {"Content-Type": "text/custom"}});
            this.br.getResource("/baz.js", function (err, resource) {
                assert.equals(resource.headers["Content-Type"], "text/custom");                
                done();
            });
        },

        "test provides default root resource": function (done) {
            this.br.getResource("/", function (err, resource) {
                assert.equals(resource.headers["Content-Type"], "text/html");
                done();
            });
        },

        "test does not serve none existing resources": function (done) {        
            this.br.getResource("/does/not/exist.js", function (err, resource) {
                assert.equals(err, busterResources.RESOURCE_NOT_FOUND);
                assert.isUndefined(resource);
                done();
            });
        },

        "test inserts scripts into root resource": function (done) {
            var self = this;
            this.br.getResource("/", function (err, resource) {
                assertBodyIsRootResourceProcessed(resource.content, self.rs);
                done();
            });
        },

        "test content is function": function (done) {
            this.rs.addResource("/test", {
                content: function (promise) {
                    promise.resolve("Test");
                }
            });

            this.br.getResource("/test", function (err, resource) {
                assert.equals("Test", resource.content);
                done();
            });
        },

        "test content is function with failure": function (done) {
            this.rs.addResource("/test", {
                content: function (promise) {
                    promise.reject("something");
                }
            });

            this.br.getResource("/test", function (err, resource) {
                assert.equals("something", err);
                // TODO: specify what 'resource.content' should be.
                done();
            });
        },

        "test adding file by path": function (done) {
            this.rs.addFile(__filename);

            this.br.getResource(__filename, function (err, resource) {                
                assert.equals(resource.content.toString("utf8"), fs.readFileSync(__filename).toString("utf8"));
                done();
            });
        },

        "test adding file by path with missing file": function (done) {
            var filename = "/tmp/i-sure-hope-this-file-does-not-exist" + new Date().getTime().toString();
            this.rs.addFile(filename);

            this.br.getResource(filename, function (err, resource) {
                assert.isUndefined(resource);
                assert.equals(err.code, "ENOENT");
                done();
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

            this.br.getResource("/test.js", function (err, resource) {
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
                assert.isUndefined(err);
                refute.isUndefined(resource);
                self.br.removeResourceSet(rs);

                self.br.getResource(resourcePath, function (err, resource) {
                    assert.equals(err, busterResources.RESOURCE_NOT_FOUND);
                    assert.isUndefined(resource);
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
                assert.equals(err, self.br.RESOURCE_NOT_FOUND);
                done();
            });
        },

        "test periodically resetting cached resources": function () {
            this.br.cacheInvalidationTimeout = 3600000;
            this.br.cacheInvalidationAge = 1800000;

            var clock = this.useFakeTimers();
            this.br.startCacheInvalidationTimeout();

            var rs = this.br.createResourceSet({
                resources: {
                    "/test.js": {
                        content: "Yep yep",
                        etag: "123abc"
                    }
                }
            });
            this.br.removeResourceSet(rs);

            clock.tick(1800000);

            var rs = this.br.createResourceSet({
                resources: {
                    "/test.js": {
                        content: "Good stuff",
                        etag: "321cba"
                    }
                }
            });
            this.br.removeResourceSet(rs);

            clock.tick(1800000);

            var actual = this.br.getCachedResources();
            assert.equals(actual, {"/test.js":["321cba"]});
        },

        "test cache invalidation timeout reschedules": function () {
            var clock = this.useFakeTimers();
            this.spy(this.br, "startCacheInvalidationTimeout");
            this.br.startCacheInvalidationTimeout();
            clock.tick(3600000 * 4);
            
            buster.assert.equals(this.br.startCacheInvalidationTimeout.callCount, 5);
        },

        "mime types": {
            "should serve javascript with reasonable mime-type": function (done) {
                this.br.getResource(this.rs.contextPath + "/foo.js", function (err, resource) {
                    assert.match(resource.headers, {"Content-Type": "application/javascript"});
                    done();
                });
            },

            "should not overwrite custom mime-type": function (done) {
                this.rs.addResource("/baz.js", {content: "", headers: {"Content-Type": "text/custom"}});
                this.br.getResource(this.rs.contextPath + "/baz.js", function (err, resource) {
                    assert.match(resource.headers, {"Content-Type": "text/custom"});
                    done();
                });
            }
        },


        "bundles": {
            setUp: function () {
                this.rs.addResource("/bundle.js", {
                    combine: ["/foo.js", "/bar/baz.js"],
                    headers: { "Expires": "Sun, 15 Mar 2012 22:22 37 GMT" }
                });

                this.rs.addResource("/bar/baz.js", {
                    content: "var b = 5 + 5; // Yes",
                    headers: {"Content-Type": "text/custom"}
                });
            },

            "should serve combined contents with custom header": function (done) {
                this.br.getResource(this.rs.contextPath + "/bundle.js", function (err, resource) {
                    assert.equals(resource.content, "var a = 5 + 5;\nvar b = 5 + 5; // Yes\n");
                    assert.match(resource.headers, {
                        "Expires": "Sun, 15 Mar 2012 22:22 37 GMT"
                    });
                    done();
                });
            },

            "should serve combined contents minified": function (done) {
                this.rs.addResource("/bundle.min.js", {
                    combine: ["/bundle.js"],
                    minify: true
                });

                this.br.getResource(this.rs.contextPath + "/bundle.min.js", function (err, resource) {
                    assert.equals(resource.content, "var a=10,b=10");
                    done();
                });
            },

            "should serve single resource contents minified": function (done) {
                this.rs.addResource("/foo.min.js", {
                    content: "var a = 5 + 5;",
                    minify: true
                });

                this.br.getResource(this.rs.contextPath + "/foo.min.js", function (err, resource) {
                    assert.equals(resource.content, "var a=10");
                    done();
                });
            }
        },

        "proxy requests": {
            setUp: function (done) {
                var port = 17171;

                this.proxyBackend = http.createServer(function (req, res) {
                    res.writeHead(200, { "X-Buster-Backend": "Yes" });
                    res.end("PROXY: " + req.url);
                });

                this.proxyBackend.listen(port, done);

                this.rs.addResource("/other", {
                    backend: "http://localhost:" + port + "/"
                });
            },

            tearDown: function (done) {
                this.proxyBackend.on("close", done);
                this.proxyBackend.close();
            },

            "should proxy requests to /other": function (done) {
                this.br.getResource(this.rs.contextPath + "/other/file.js", function (err, resource) {
                    assert.isUndefined(err);
                    assert.equals(resource.content.toString("utf8"), "PROXY: /other/file.js");
                    assert.equals(resource.headers["x-buster-backend"], "Yes");
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

            "should get resources": function (done) {
                h.request({path: this.rs.contextPath + "/foo.js"}, function (res, body) {
                    assert.equals(res.statusCode, 200);
                    assert.equals(body, "var a = 5 + 5;");
                    done();
                }).end();
            },

            "should not respond for none existing resources": function (done) {
                h.request({path: this.rs.contextPath + "/does-not-exist.js"}, function (res, body) {
                    assert.equals(res.statusCode, h.NO_RESPONSE_STATUS_CODE);
                    done();
                }).end();
            },

            "on combined resources": {
                setUp: function () {
                    this.rs.addResource("/bundle.js", {
                        combine: ["/foo.js", "/bar/baz.js"],
                        headers: { "Expires": "Sun, 15 Mar 2012 22:22 37 GMT" }
                    });

                    this.rs.addResource("/bar/baz.js", {
                        content: "var b = 5 + 5; // Yes",
                        headers: {"Content-Type": "text/custom"}
                    });
                },

                "should serve combined contents with custom header": function (done) {
                    h.request({path: this.rs.contextPath + "/bundle.js"}, function (res, body) {
                        assert.equals(200, res.statusCode);
                        assert.equals(body, "var a = 5 + 5;\nvar b = 5 + 5; // Yes\n");
                        assert.match(res.headers, {
                            "expires": "Sun, 15 Mar 2012 22:22 37 GMT"
                        });
                        done();
                    }).end();
                }
            },

            "on proxies": {
                setUp: function (done) {
                    var port = 17171;

                    this.proxyBackend = http.createServer(function (req, res) {
                        res.writeHead(201, { "X-Buster-Backend": "Yes" });
                        res.end("PROXY: " + req.url);
                    });

                    this.proxyBackend.listen(port, done);

                    this.rs.addResource("/other", {
                        backend: "http://localhost:" + port + "/"
                    });
                },

                tearDown: function (done) {
                    this.proxyBackend.on("close", done);
                    this.proxyBackend.close();
                },

                "should proxy requests to /other": function (done) {
                    h.request({path: this.rs.contextPath + "/other/file.js"}, function (res, body) {
                        assert.equals(201, res.statusCode);
                        assert.equals(body, "PROXY: /other/file.js");
                        assert.equals(res.headers["x-buster-backend"], "Yes");
                        done();
                    }).end();;
                }
            }
        }
    }
});