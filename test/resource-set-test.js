var fs = require("fs");
var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var busterResources = require("./../lib/buster-resources");
var busterResourcesResource = require("./../lib/resource");
var busterResourcesResourceSet = require("./../lib/resource-set");
var resourceSet = require("./../lib/resource-set");
var http = require("http");
var h = require("./test-helper");

function assertBodyIsRootResourceProcessed(body, resourceSet) {
    assert.match(body, '<script src="' + resourceSet.contextPath  + '/foo.js"');
}

var basicResourceSet = {
    load: ["/foo.js"],
    resources: {
        "/foo.js": {
            content: "var a = 5 + 5;"
        }
    }
};

buster.testCase("resource-set", {
    setUp: function () {
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

    "test creating with blank object": function () {
        var r = this.br.createResourceSet({resources: {}});
        assert(r.load instanceof Array);
        assert.equals(r.load.length, 0);

        assert.equals("", r.contextPath);
    },

    "test adding resource post create": function (done) {
        var rs = this.br.createResourceSet({});
        var r = rs.addResource("/roflmao.txt", {"content": "Roflmao!"});
        assert(busterResourcesResource.isPrototypeOf(r));

        rs.getResource("/roflmao.txt", function (err, resource) {
            assert.equals(resource.content, "Roflmao!");
            done();
        });
    },

    "test prepending entries to load post creation": function () {
        var r = this.br.createResourceSet({
            load: ["/foo"],
            resources: {
                "/foo":{"content":"foo"},
                "/bar": {"content":"bar"}
            }
        });

        r.prependToLoad(["/bar"]);
        assert.equals(r.load, ["/bar", "/foo"]);
    },

    "test adding new root resource post create": function (done) {
        var rs = this.br.createResourceSet(basicResourceSet);
        rs.addResource("/", {content: "hullo"});

        rs.getResource("/", function (err, resource) {
            assert.equals(resource.content, "hullo");
            done();
        });
    },

    "test adding new root resource post create and set up script loading": function (done) {
        var rs = this.br.createResourceSet(basicResourceSet);
        rs.addResource("/", {content: "hullo"});
        rs.addScriptLoadingToRootResource();

        rs.getResource("/", function (err, resource) {
            assertBodyIsRootResourceProcessed(resource.content, rs);
            done();
        });
    },

    "test adding new root resouce with custom content-type": function (done) {
        var self = this;
        var rs = this.br.createResourceSet({});
        rs.addResource("/", {content: "hullo", headers: {"Content-Type": "text/wtf"}});

        rs.getResource("/", function (err, resource) {
            assert.equals(resource.headers["Content-Type"], "text/wtf");
            done();
        });
    },

    "test serving buffer resources": function (done) {
        var rs = this.br.createResourceSet({});
        rs.addResource("/hullo.txt", {content: new Buffer([0x50, 0x4e, 0x47])});

        rs.getResource("/hullo.txt", function (err, resource) {
            assert.equals(resource.content, "PNG");
            done();
        });
    },

    "test provides resources created with resoruce set": function (done) {
        var rs = this.br.createResourceSet(basicResourceSet);
        rs.getResource("/foo.js", function (err, resource) {
            assert.equals(resource.content, "var a = 5 + 5;");
            assert.equals(resource.headers["Content-Type"], "application/javascript");
            done();
        });
    },

    "test hosts resources with custom headers": function (done) {
        var rs = this.br.createResourceSet({});
        rs.addResource("/baz.js", {content: "", headers: {"Content-Type": "text/custom"}});
        rs.getResource("/baz.js", function (err, resource) {
            assert.equals(resource.headers["Content-Type"], "text/custom");
            done();
        });
    },

    "test setting up root resource": function (done) {
        var rs = this.br.createResourceSet({});
        rs.createDefaultRootResourceIfNotExists();
        rs.getResource("/", function (err, resource) {
            assert.equals(resource.headers["Content-Type"], "text/html");
            assert.equals(resource.content, rs.DEFAULT_ROOT_RESOURCE);
            done();
        });
    },

    "test setting up root resource with one already present": function (done) {
        var rs = this.br.createResourceSet({
            resources: {
                "/": {content: "hullo"}
            }
        });
        rs.createDefaultRootResourceIfNotExists();
        rs.getResource("/", function (err, resource) {
            assert.equals(resource.headers["Content-Type"], "text/html");
            assert.equals(resource.content, "hullo");
            done();
        });
    },

    "test does not serve none existing resources": function (done) {
        var rs = this.br.createResourceSet({});
        rs.getResource("/does/not/exist.js", function (err, resource) {
            assert.equals(err, busterResourcesResourceSet.RESOURCE_NOT_FOUND);
            refute.defined(resource);
            done();
        });
    },

    "test content is function": function (done) {
        var rs = this.br.createResourceSet({});
        rs.addResource("/test", {
            content: function (promise) {
                promise.resolve("Test");
            }
        });

        rs.getResource("/test", function (err, resource) {
            assert.equals("Test", resource.content);
            done();
        });
    },

    "test content is function with failure": function (done) {
        var rs = this.br.createResourceSet({});

        rs.addResource("/test", {
            content: function (promise) {
                promise.reject("something");
            }
        });

        rs.getResource("/test", function (err, resource) {
            assert.equals("something", err);
            // TODO: specify what 'resource.content' should be.
            done();
        });
    },

    "mime types": {
        setUp: function () {
            this.rs = this.br.createResourceSet(basicResourceSet);
        },

        "should serve javascript with reasonable mime-type": function (done) {
            this.rs.getResource(this.rs.contextPath + "/foo.js", function (err, resource) {
                assert.match(resource.headers, {"Content-Type": "application/javascript"});
                done();
            });
        },

        "should not overwrite custom mime-type": function (done) {
            this.rs.addResource("/baz.js", {content: "", headers: {"Content-Type": "text/custom"}});
            this.rs.getResource(this.rs.contextPath + "/baz.js", function (err, resource) {
                assert.match(resource.headers, {"Content-Type": "text/custom"});
                done();
            });
        }
    },

    "bundles": {
        setUp: function () {
            this.rs = this.br.createResourceSet(basicResourceSet);
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
            this.rs.getResource(this.rs.contextPath + "/bundle.js", function (err, resource) {
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

            this.rs.getResource(this.rs.contextPath + "/bundle.min.js", function (err, resource) {
                assert.equals(resource.content, "var a=10,b=10");
                done();
            });
        },

        "should serve single resource contents minified": function (done) {
            this.rs.addResource("/foo.min.js", {
                content: "var a = 5 + 5;",
                minify: true
            });

            this.rs.getResource(this.rs.contextPath + "/foo.min.js", function (err, resource) {
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

            this.rs = this.br.createResourceSet(basicResourceSet);
            this.rs.addResource("/other", {
                backend: "http://localhost:" + port + "/"
            });
        },

        tearDown: function (done) {
            this.proxyBackend.on("close", done);
            this.proxyBackend.close();
        },

        "should proxy requests to /other": function (done) {
            this.rs.getResource(this.rs.contextPath + "/other/file.js", function (err, resource) {
                refute.defined(err);
                assert.equals(resource.content.toString("utf8"), "PROXY: /other/file.js");
                assert.equals(resource.headers["x-buster-backend"], "Yes");
                done();
            });
        },

        "should honor context path": function (done) {
            this.rs.contextPath = "/foo";

            this.rs.getResource(this.rs.contextPath + "/other/file.js", function (err, resource) {
                refute.defined(err);
                assert.equals(resource.content.toString("utf8"), "PROXY: /other/file.js");
                assert.equals(resource.headers["x-buster-backend"], "Yes");
                done();
            });
        }
    },

    "via http": {
        setUp: function (done) {
            var self = this;
            this.rs = this.br.createResourceSet(basicResourceSet);

            this.server = http.createServer(function (req, res) {
                if (self.rs.getResourceViaHttp(req, res)) return;

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

        "should error for resource erroring resource": function (done) {
            this.rs.addFile("/tmp/does-not-exist");
            h.request({path: this.rs.contextPath + "/tmp/does-not-exist"}, function (res, body) {
                assert.equals(500, res.statusCode);
                var parsed = JSON.parse(body);
                assert.equals(parsed.code, "ENOENT");
                done();
            }).end();
        },

        "should error for failing combined resource": function (done) {
            this.rs.addFile("/tmp/does-not-exist");
            this.rs.addResource("/test", {combine: ["/foo.js", "/tmp/does-not-exist"]});

            h.request({path: this.rs.contextPath + "/test"}, function (res, body) {
                assert.equals(500, res.statusCode);
                var parsed = JSON.parse(body);
                assert.equals(parsed.code, "ENOENT");
                done();
            }).end();
        },

        "should provide request to content handler": function (done) {
            this.rs.addResource("/test", {
                content: function (promise, req) {
                    promise.resolve("test");
                    assert.defined(req);
                    assert.match(req.headers, {"x-foo": "bar"});
                    done();
                }
            });

            h.request({headers: {"x-foo": "bar"}, path: this.rs.contextPath + "/test"}, function (res, body) {
            }).end();
        },

        "should not provide request to content handler when getting via none-http": function (done) {
            this.rs.addResource("/test", {
                content: function (promise, req) {
                    promise.resolve("test");
                    assert.isNull(req);
                    done();
                }
            });

            this.rs.getResource("/test", function(){});
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
    },

    "should prepend a single entry to load post creation": function () {
        var r = this.br.createResourceSet({
            load: ["/foo"],
            resources: {
                "/foo":{"content":"foo"},
                "/bar": {"content":"bar"}
            }
        });

        r.prependToLoad("/bar");
        assert.equals(r.load, ["/bar", "/foo"]);
    },

    "test prepending entry to load post creation that isn't in 'resources'": function (done) {
        var r = this.br.createResourceSet({resources: {}});

        try {
            r.prependToLoad(["/bar"]);
        } catch (e) {
            assert.match(e.message, "missing corresponding");
            done();
        }
    },

    "test prepending multiple entries in prependToLoad": function () {
        var r = this.br.createResourceSet({
            load: ["/foo"],
            resources: {
                "/foo": {content:"a"},
                "/bar": {content:"b"},
                "/baz": {content:"b"}
            }
        });

        r.prependToLoad(["/bar", "/baz"]);

        assert.equals(r.load, ["/bar", "/baz", "/foo"]);
    },

    "test prepending multiple entries in prependToLoad where one is not present": function () {
        var r = this.br.createResourceSet({
            load: ["/foo"],
            resources: {
                "/foo": {content:"a"},
                "/bar": {content:"b"}
            }
        });

        assert.exception(function () {
            r.prependToLoad(["/bar", "/baz"]);
        });
        assert.equals(r.load, ["/foo"]);
    },

    "test adding existing entry in prependToLoad": function (done) {
        var r = this.br.createResourceSet({
            load: ["/foo"],
            resources: {
                "/foo": {content:"a"},
                "/bar": {content:"b"}
            }
        });

        try {
            r.prependToLoad(["/bar", "/foo"]);
        } catch (e) {
            assert.match(e.message, "Can not prepend")
            assert.match(e.message, "/foo");
            assert.equals(r.load, ["/foo"]);
            done();
        }
    },

    "should load a single resource": function () {
        var r = this.br.createResourceSet({
            load: [],
            resources: {
                "/foo":{"content":"foo"},
                "/bar": {"content":"bar"}
            }
        });

        r.appendToLoad("/bar");
        assert.equals(r.load, ["/bar"]);
    },

    "test appending entries to load post creation": function () {
        var r = this.br.createResourceSet({
            load: ["/foo"],
            resources: {
                "/foo":{"content":"foo"},
                "/bar": {"content":"bar"}
            }
        });

        r.appendToLoad(["/bar"]);
        assert.equals(r.load, ["/foo", "/bar"]);
    },

    "test appending entry to load post creation that isn't in 'resources'": function (done) {
        var r = this.br.createResourceSet({resources: {}});

        try {
            r.appendToLoad(["/bar"]);
        } catch (e) {
            assert.match(e.message, "missing corresponding");
            done();
        }
    },

    "test appending multiple entries in appendToLoad": function () {
        var r = this.br.createResourceSet({
            load: ["/foo"],
            resources: {
                "/foo": {content:"a"},
                "/bar": {content:"b"},
                "/baz": {content:"b"}
            }
        });

        r.appendToLoad(["/bar", "/baz"]);

        assert.equals(r.load, ["/foo", "/bar", "/baz"]);
    },

    "test appending multiple entries in appendToLoad where one is not present": function () {
        var r = this.br.createResourceSet({
            load: ["/foo"],
            resources: {
                "/foo": {content:"a"},
                "/bar": {content:"b"}
            }
        });

        assert.exception(function () {
            r.appendToLoad(["/bar", "/baz"]);
        });
        assert.equals(r.load, ["/foo"]);
    },

    "test adding existing entry in appendToLoad": function (done) {
        var r = this.br.createResourceSet({
            load: ["/foo"],
            resources: {
                "/foo": {content:"a"},
                "/bar": {content:"b"}
            }
        });

        try {
            r.appendToLoad(["/bar", "/foo"]);
        } catch (e) {
            assert.match(e.message, "Can not append")
            assert.match(e.message, "/foo");
            assert.equals(r.load, ["/foo"]);
            done();
        }
    },

    "test all entries in 'load' are script injected to root resource": function (done) {
        var r = this.br.createResourceSet({resources:{}});
        r.createDefaultRootResourceIfNotExists();
        r.addScriptLoadingToRootResource();

        // NOTE: altering 'load' directly is not a supported API.
        r.load = ["/foo", "/bar", "/baz"];

        r.getResource("/", function (err, resource) {
            var body = resource.content;
            assert.match(body, '<!DOCTYPE html><html><head></head><body>');
            assert.match(body,'<script src="' + r.contextPath  + '/foo"');
            assert.match(body, '<script src="' + r.contextPath  + '/bar"');
            assert.match(body, '<script src="' + r.contextPath  + '/baz"');
            assert.match(body, '</body></html>');

            done();
        });
    },

    "test root resource with no html and empty load": function (done) {
        var r = this.br.createResourceSet({resources:{
            "/": {
                content: "Hello, World!"
            }
        }});

        r.getResource("/", function (err, resource) {
            assert.equals(resource.content, "Hello, World!");
            done();
        });
    },

    "test root resource with no html and load entries": function (done) {
        var r = this.br.createResourceSet({
            load: ["/foo.js"],
            resources: {
                "/": {
                    content: "Hello, World!"
                },
                "/foo.js": {
                    content: "var test = 5"
                }
            }
        });
        r.addScriptLoadingToRootResource();

        r.getResource("/", function (err, resource) {
            assert.equals(resource.content,
                          'Hello, World!<script src="'
                          + r.contextPath  + '/foo.js" type="text/javascript">'
                          + '</script>\n');
            done();
        });
    },

    "test adding file by path": function (done) {
        var rs = resourceSet.create({});
        var r = rs.addFile(__filename);
        assert(busterResourcesResource.isPrototypeOf(r));

        rs.getResource(__filename, function (err, resource) {
            assert.equals(resource.content.toString("utf8"), fs.readFileSync(__filename).toString("utf8"));
            done();
        });
    },

    "test adding file by path with missing file": function (done) {
        var filename = "/tmp/i-sure-hope-this-file-does-not-exist" + new Date().getTime().toString();
        var rs = resourceSet.create({});
        rs.addFile(filename);

        rs.getResource(filename, function (err, resource) {
            refute.defined(resource);
            assert.equals(err.code, "ENOENT");
            done();
        });
    },

    "test adding file by path with custom resource path": function (done) {
        var rs = resourceSet.create({});
        rs.addFile(__filename, {path: "/custom.txt"});

        rs.getResource("/custom.txt", function (err, resource) {
            assert.equals(resource.content.toString("utf8"), fs.readFileSync(__filename).toString("utf8"));
            done();
        });
    },

    "test adding file by path with options": function (done) {
        var rs = resourceSet.create({});
        rs.addFile(__filename, {headers: {"X-Foo": "Bar"}});

        rs.getResource(__filename, function (err, resource) {
            assert.match(resource.headers, {"X-Foo": "Bar"});
            done();
        });
    },


    "test getResource fails for none existing resource": function () {
        var rs = resourceSet.create({});
        refute(rs.getResource("/foo.txt", function(){}));
    },

    "test deleting resource": function () {
        var rs = resourceSet.create({resources:{"/foo":{content:"foo"}}});
        rs.removeResource("/foo");
        refute("/foo" in rs.resources);
    },

    "test deleting resource removes it from load": function () {
        var rs = resourceSet.create({load:["/foo"],resources:{"/foo":{content:"foo"}}});
        rs.removeResource("/foo");
        assert.equals(rs.load, []);
    },

    "test deleting resource does not remove entries before itself in load": function () {
        var rs = resourceSet.create({load:["/bar", "/foo"],resources:{
            "/foo":{content:"foo"},
            "/bar":{content:"bar"}
        }});

        rs.removeResource("/foo");
        assert.equals(rs.load, ["/bar"]);
    },

    "test deleting resource does not remove entries after itself in load": function () {
        var rs = resourceSet.create({load:["/foo", "/bar"],resources:{
            "/foo":{content:"foo"},
            "/bar":{content:"bar"}
        }});

        rs.removeResource("/foo");
        assert.equals(rs.load, ["/bar"]);
    },

    "test deleting none existing resource": function () {
        var rs = resourceSet.create({resources:{"/foo":{content:"foo"}}});
        assert.exception(function () {
            rs.removeResource("/bar");
        });
    },

    "test getting none existent resource": function (done) {
        var rs = resourceSet.create({resources:{"/foo":{content:"foo"}}});
        rs.getResource("/bar", function (err, resource) {
            refute.defined(resource);
            assert.equals(err, resourceSet.RESOURCE_NOT_FOUND);
            done();
        });
    },

    "test creating with base64 encoded data": function (done) {
        var rs = this.br.createResourceSet({
            resources: {
                "/foo":{
                    content: "SGVsbG8gV29ybGQ=",
                    base64Encoded: true
                },
            }
        });

        rs.getResource("/foo", function (err, resource) {
            refute.defined(err);
            assert.equals("Hello World", resource.content);
            done();
        });
    },

    "test getting plain resource via context path": function (done) {
        var contextPath = "/123abc";
        var rs = this.br.createResourceSet({
            contextPath: contextPath,
            resources: {
                "/foo":{
                    content: "ohai"
                },
            }
        });

        rs.getResource("/foo", function (err, resource) {
            assert.equals(err, resourceSet.RESOURCE_NOT_FOUND);

            rs.getResource(contextPath + "/foo", function (err, resource) {
                refute.defined(err);
                assert.equals(resource.content, "ohai");
                done();
            });
        });

    },

    "test getting combined resource via context path": function (done) {
        var contextPath = "/123abc";
        var rs = this.br.createResourceSet({
            contextPath: contextPath,
            resources: {
                "/a": {
                    content: "a"
                },
                "/b": {
                    content: "b"
                },
                "/foo":{
                    combine: ["/a", "/b"]
                },
            }
        });

        rs.getResource("/foo", function (err, resource) {
            assert.equals(err, resourceSet.RESOURCE_NOT_FOUND);

            rs.getResource(contextPath + "/foo", function (err, resource) {
                refute.defined(err);
                assert.equals(resource.content, "a\nb\n");
                done();
            });
        });
    },

    "validations": {
        "should fail if load entry misses corresponding resources entry": function (done) {
            try {
                var r = this.br.createResourceSet({load:["/foo"]})
            } catch (e) {
                assert.equals(e.message, "'load' entry '/foo' missing corresponding 'resources' entry.");
                done();
            }
        },

        "with content property present": {
            "should fail if not a buffer or string": function () {
                var self = this;

                refute.exception(function () {
                    self.br.createResourceSet({resources:{"/foo":{"content":"foo"}}});
                });

                refute.exception(function () {
                    self.br.createResourceSet({resources:{"/foo":{"content":new Buffer([0x00, 0x01])}}});
                });

                assert.exception(function () {
                    self.br.createResourceSet({resources:{"/foo":{"content":1234}}});
                });

                assert.exception(function () {
                    self.br.createResourceSet({resources:{"/foo":{"content":{}}}});
                });

                assert.exception(function () {
                    self.br.createResourceSet({resources:{"/foo":{"content":[]}}});
                });
            }
        },

        "should not fail when creating an empty resource set": function () {
            refute.exception(function () {
                var r = this.br.createResourceSet()
            }.bind(this));
        },

        "should fail if neither etag, content, backend or combine is present": function () {
            var self = this;

            assert.exception(function () {
                self.br.createResourceSet({resources:{"/foo":{}}});
            }, "Error", "Received no resource etag, content, backend or combine");
        },

        "should fail if more than one of content, backend or combine is present": function () {
            var self = this;
            var msg = "Can only have one of content, combine and backend";

            assert.exception(function () {
                self.br.createResourceSet({resources:{"/foo":{content:"foo", combine: ["/xxx"]}}});
            }, "Error", msg);

            assert.exception(function () {
                self.br.createResourceSet({resources:{"/foo":{content:"foo", backend: "http://foo.com"}}});
            }, "Error", msg);

            assert.exception(function () {
                self.br.createResourceSet({resources:{"/foo":{combine:["/xxx"], backend: "http://foo.com"}}});
            }, "Error", msg);
        },

        "should fail if backend is not a valid URL": function () {
            var self = this;
            var msg = "Proxy resource backend is invalid";

            assert.exception(function () {
                self.br.createResourceSet({resources:{"/foo":{backend:"wtf"}}});
            }, "Error", msg);
        },

        "should fail with relative path": function () {
            var self = this;
            var msg = "Proxy resource backend is invalid";

            assert.exception(function () {
                self.br.createResourceSet({resources:{"../foo":{content:""}}});
            }, "Error", "Path can not be relative");
        }
    },

    "read only output": {
        "should handle basic resource": function (done) {
            var r = this.br.createResourceSet({
                load: ["/foo"],
                resources: {
                    "/foo":{"content":"foo"},
                    "/bar": {"content":"bar"}
                }
            });

            r.getReadOnly(function (err, ro) {
                refute.defined(err);
                assert.match(ro, {
                    load: ["/foo"],
                    resources: {
                        "/foo":{"content":"foo"},
                        "/bar": {"content":"bar"}
                    }
                });

                assert(Object.keys(ro.resources).length, 2);
                done();
            });
        },

        "should handle resources with etag": function (done) {
            var r = resourceSet.create({
                resources: {
                    "/foo":{"etag":"1234"}
                }
            });

            r.getReadOnly(function (err, ro) {
                refute.defined(err);
                assert.match(ro, {
                    resources: {
                        "/foo":{"etag":"1234"},
                    }
                });

                refute("content" in ro.resources["/foo"]);
                refute("backend" in ro.resources["/foo"]);
                refute("combine" in ro.resources["/foo"]);

                done();
            });
        },

        "should handle resources with backend": function (done) {
            var r = resourceSet.create({
                resources: {
                    "/foo":{"backend":"http://foo.com"}
                }
            });

            r.getReadOnly(function (err, ro) {
                refute.defined(err);
                assert.match(ro, {
                    resources: {
                        "/foo":{"backend":"http://foo.com"},
                    }
                });

                refute("content" in ro.resources["/foo"]);
                refute("etag" in ro.resources["/foo"]);
                refute("combine" in ro.resources["/foo"]);

                done();
            });
        },

        "should handle resources with combine": function (done) {
            var r = resourceSet.create({
                resources: {
                    "/foo":{"combine":["/bar", "/baz"]},
                    "/bar":{"content":"1234"},
                    "/baz":{"content":"abcd"}
                }
            });

            r.getReadOnly(function (err, ro) {
                refute.defined(err);
                assert.match(ro, {
                    resources: {
                        "/foo":{"combine":["/bar", "/baz"]},
                    }
                });

                refute("content" in ro.resources["/foo"]);
                refute("etag" in ro.resources["/foo"]);
                refute("backend" in ro.resources["/foo"]);

                done();
            });
        },

        "should handle resource with buffer as content": function (done) {
            var aBuffer = new Buffer([92, 52, 39, 11, 79]);
            var r = this.br.createResourceSet({
                load: ["/foo"],
                resources: {
                    "/foo":{"content": aBuffer},
                }
            });

            r.getReadOnly(function (err, ro) {
                refute.defined(err);
                var resource = ro.resources["/foo"];
                assert.equals(resource.content, aBuffer.toString("base64"));
                assert(resource.base64Encoded);

                done();
            });
        }
    }
});