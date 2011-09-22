var fs = require("fs");
var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var busterResources = require("./../lib/buster-resources");
var resourceSet = require("./../lib/resource-set");

buster.testCase("resource-set", {
    setUp: function () {
        this.br = Object.create(busterResources);
    },

    "test creating with blank object": function () {
        var r = this.br.createResourceSet({resources: {}});
        assert(r.load instanceof Array);
        assert.equals(r.load.length, 0);

        assert.equals("", r.contextPath);
    },

    "test adding entries to load post creation": function () {
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

    "test adding entry to load post creation that isn't in 'resources'": function (done) {
        var r = this.br.createResourceSet({resources: {}});

        try {
            r.prependToLoad(["/bar"]);
        } catch (e) {
            assert.match(e.message, "missing corresponding");
            done();
        }
    },

    "test adding multiple entries in prependToLoad": function () {
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

    "test adding multiple entries in prependToLoad where one is not present": function () {
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

    "test all entries in 'load' are script injected to root resource": function (done) {
        var r = this.br.createResourceSet({resources:{}});

        // NOTE: altering 'load' directly is not a supported API.
        r.load = ["/foo", "/bar", "/baz"];

        r.getResource("/", function (err, resource) {
            var body = resource.content;
            assert.match(body,'<script src="' + r.contextPath  + '/foo"');
            assert.match(body, '<script src="' + r.contextPath  + '/bar"');
            assert.match(body, '<script src="' + r.contextPath  + '/baz"');
            done();
        });
    },

    "test adding file by path": function (done) {
        var rs = resourceSet.create({});
        rs.addFile(__filename);

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
            assert.isUndefined(resource);
            assert.equals(err.code, "ENOENT");
            done();
        });
    },

    "test adding file by path with custom resource path": function (done) {
        var rs = resourceSet.create({});
        rs.addFile(__filename, "/custom.txt");

        rs.getResource("/custom.txt", function (err, resource) {                
            assert.equals(resource.content.toString("utf8"), fs.readFileSync(__filename).toString("utf8"));
            done();
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

        "should fail when not an object": function (done) {
            try {
                var r = this.br.createResourceSet()
            } catch (e) {
                assert.equals(e.message, "Resource object is null or undefined.");
                done();
            }
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
                assert.isUndefined(err);
                assert.match(ro, {
                    load: ["/foo"],
                    resources: {
                        "/foo":{"content":"foo"},
                        "/bar": {"content":"bar"}
                    }
                });

                assert("/" in ro.resources);
                assert(Object.keys(ro.resources).length, 3);

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
                assert.isUndefined(err);
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
                assert.isUndefined(err);
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
                assert.isUndefined(err);
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
        }
    }
});