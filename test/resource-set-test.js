var buster = require("buster");
var resource = require("../lib/resource");
var resourceSet = require("../lib/resource-set");
var when = require("when");
require("./test-helper.js");
var FIXTURE_DIR = __dirname + "/fixtures";
var noop = function () {};
var logStack = function (err) { buster.log(err.stack); };

buster.testCase("Resource sets", {
    setUp: function () {
        this.rs = resourceSet.create(FIXTURE_DIR);
    },

    "create": {
        "defaults root path to current working directory": function () {
            var rs = resourceSet.create();
            assert.equals(rs.rootPath, process.cwd());
        },

        "specifies root path": function () {
            var rs = resourceSet.create("/tmp");
            assert.equals(rs.rootPath, "/tmp");
        }
    },

    "adding resource": {
        "fails if resource is falsy": function () {
            var msg = "Resource must be a string, a resource object or " +
                "an object of resource properties";
            assert.invalidResource(this.rs, null, msg);
        },

        "fails with both file and backend": function () {
            assert.invalidResource(this.rs, {
                file: "something.js",
                backend: "http://localhost:8080"
            }, "Resource can only have one of content, file, backend, combine");
        },

        "fails with both file and combine": function () {
            assert.invalidResource(this.rs, {
                file: "something.js",
                combine: ["/a.js", "/b.js"]
            }, "Resource can only have one of content, file, backend, combine");
        },

        "fails with both content and combine": function () {
            assert.invalidResource(this.rs, {
                content: "Something",
                combine: ["/a.js", "/b.js"]
            }, "Resource can only have one of content, file, backend, combine");
        },

        "fails with both backend and combine": function () {
            assert.invalidResource(this.rs, {
                backend: "http://localhost",
                combine: ["/a.js", "/b.js"]
            }, "Resource can only have one of content, file, backend, combine");
        },

        "fails without path": function () {
            assert.invalidResource(this.rs, {
                content: "Hey"
            }, "Resource must have path");
        },

        "fails without content": function () {
            assert.invalidResource(this.rs, {
                path: "/here"
            }, "No content");
        },

        "does not fail with only combine": function () {
            refute.exception(function () {
                this.rs.addResource({ path: "/path", combine: ["/a.js"] });
            }.bind(this));
        },

        "does not fail with only file": function () {
            refute.exception(function () {
                this.rs.addResource({ path: "/path", file: "fixtures/foo.js" });
            }.bind(this));
        },

        "does not fail with only etag": function () {
            refute.exception(function () {
                this.rs.addResource({ path: "/path", etag: "abcd" });
            }.bind(this));
        }
    },

    "adding buster.resource objects": {
        setUp: function () {
            this.resource = resource.create("/buster.js", {
                content: "var buster = {};"
            });
        },

        "returns promise": function () {
            assert(when.isPromise(this.rs.addResource(this.resource)));
        },

        "resolves promise with resource": function (done) {
            this.rs.addResource(this.resource).then(done(function (rs) {
                assert.equals(this.resource, rs);
            }.bind(this)));
        }
    },

    "resourceSet as array-like": {
        setUp: function () {
            this.resource = resource.create("/buster.js", {
                content: "var buster = {};"
            });
        },

        "adding resource increments length": function (done) {
            this.rs.addResource(this.resource).then(done(function (rs) {
                assert.equals(this.rs.length, 1);
            }.bind(this)));
        },

        "exposes added resource on numeric index": function (done) {
            var rs = resource.create("/sinon.js", { content: "var sinon;" });
            when.all([this.rs.addResource(this.resource),
                      this.rs.addResource(rs)]).then(done(function (resources) {
                assert.equals(this.rs.length, 2);
                assert.same(this.rs[0], this.resource);
                assert.same(this.rs[1], rs);
            }.bind(this)));
        }
    },

    "string resources": {
        "resolves path from root path": function (done) {
            this.rs.addResource("foo.js").then(function (rs) {
                assert.equals(rs[0].path, "/foo.js");
                assert.content(rs[0], "var thisIsTheFoo = 5;", done);
            }, done(logStack));
        },

        "adds etag to resource": function (done) {
            this.rs.addResource("./foo.js").then(done(function (rs) {
                assert.defined(rs[0].etag);
            }), done(logStack));
        },

        "adds resource from glob pattern": function (done) {
            this.rs.addResource("*.js").then(done(function (rs) {
                assert.equals(rs.length, 2);
                assert.equals(rs[0].path, "/bar.js");
                assert.equals(rs[1].path, "/foo.js");
            }), done(logStack));
        },

        "fails for missing file": function (done) {
            this.rs.addResource("oops.js").then(noop, done(function (err) {
                assert.defined(err);
                assert.match(err.message, "oops.js matched no files");
            }));
        },

        "fails for file outside root path": function (done) {
            var verify = function (err) {
                assert.defined(err);
                assert.match(err, "../resource-test.js");
                assert.match(err, "outside the project root");
                assert.match(err, "set rootPath to the desired root");
            };
            this.rs.addResource("../resource-test.js").then(noop, done(verify));
        }
    },

    "file resources": {
        "creates resource from file": function (done) {
            this.rs.addFileResource("./bar.js", {
                etag: "abc123"
            }).then(function (rs) {
                assert.content(rs, "var helloFromBar = 1;", done);
            }, done(logStack));
        },

        "does not override custom etag": function (done) {
            this.rs.addFileResource("./foo.js", {
                etag: "abc123"
            }).then(done(function (rs) {
                assert.equals(rs.etag, "abc123");
            }), done(logStack));
        },

        "adds resource with custom path": function (done) {
            this.rs.addFileResource("./foo.js", {
                path: "/oh-my"
            }).then(done(function (rs) {
                assert.equals(rs.path, "/oh-my");
            }), done(logStack));
        },

        "reads file with specified encoding": function (done) {
            this.rs.addFileResource("./foo.js", {
                encoding: "base64"
            }).then(function (rs) {
                assert.content(rs, "dmFyIHRoaXNJc1RoZUZvbyA9IDU7", done);
            }, done(logStack));
        }
    },

    "combine": {
        "fails if referenced resources don't exist": function (done) {
            this.rs.addResource({
                path: "buster.js",
                combine: ["a.js", "b.js"]
            }).then(done, done(function (err) {
                assert.match(err, "Cannot build combined resource /buster.js");
                assert.match(err, "a.js is not an available resource");
            }));
        },

        "combines content of referenced resources in order": function (done) {
            this.rs.addResources(["foo.js", "bar.js"]).then(function () {
                this.rs.addResource({
                    path: "buster.js",
                    combine: ["foo.js", "bar.js"]
                }).then(function (rs) {
                    var concat = "var thisIsTheFoo = 5;var helloFromBar = 1;";
                    assert.content(rs, concat, done);
                }, done(logStack));
            }.bind(this), done(logStack));
        }
    },

    "remove": {
        "makes resource go away": function (done) {
            var resource = { path: "/yo", content: "Ok" };
            this.rs.addResource(resource).then(done(function () {
                this.rs.remove("/yo");
                refute.defined(this.rs.get("/yo"));
            }.bind(this)));
        },

        "makes resource at normalized path go away": function (done) {
            var resource = { path: "/yo", content: "Ok" };
            this.rs.addResource(resource).then(done(function () {
                this.rs.remove("yo");
                refute.defined(this.rs.get("yo"));
            }.bind(this)));
        },

        "readjusts numeric indices": function (done) {
            var add1 = this.rs.addResource({ path: "/yo", content: "Ok" });
            var add2 = this.rs.addResource({ path: "/hey", content: "Not Ok" });

            when.all([add1, add2]).then(done(function () {
                this.rs.remove("yo");
                assert.equals(this.rs.length, 1);
                assert.equals(this.rs[0], this.rs.get("/hey"));
            }.bind(this)), done(logStack));
        }
    },

    "enumerability": {
        setUp: function (done) {
            when.all([
                this.rs.addResource({ path: "/1.js", content: "1.js" }),
                this.rs.addResource({ path: "/2.js", content: "2.js" }),
                this.rs.addResource({ path: "/3.js", content: "3.js" })
            ]).then(function () { done(); });
        },

        "forEach": function () {
            var resources = [];
            this.rs.forEach(function (rs) { resources.push(rs.path); });

            assert.equals(resources, ["/1.js", "/2.js", "/3.js"]);
        },

        "map": function () {
            var resources = this.rs.map(function (rs) { return rs.path; });

            assert.equals(resources, ["/1.js", "/2.js", "/3.js"]);
        },

        "reduce": function () {
            var resources = this.rs.reduce(function (res, rs) {
                res.push(rs.path);
                return res;
            }, []);

            assert.equals(resources, ["/1.js", "/2.js", "/3.js"]);
        }
    },

    "serializing": {
        "resolves as object": function (done) {
            this.rs.serialize().then(done(function (serialized) {
                assert.isObject(serialized);
            }));
        },

        "serializes content resource": function (done) {
            var add = this.rs.addResource({
                path: "/buster.js",
                content: "var a = 42;"
            });

            add.then(function () {
                this.rs.serialize().then(done(function (serialized) {
                    assert.equals(serialized, {
                        resources: [{
                            encoding: "utf-8",
                            path: "/buster.js",
                            content: "var a = 42;"
                        }]
                    });
                }));
            }.bind(this));
        },

        "serializes resource meta data": function (done) {
            var add = this.rs.addResource({
                path: "/buster.js",
                content: "var a = 42;",
                etag: "1234abcd",
                headers: { "X-Buster": "Aww yeah" }
            });

            add.then(function () {
                this.rs.serialize().then(done(function (serialized) {
                    assert.equals(serialized, {
                        resources: [{
                            encoding: "utf-8",
                            path: "/buster.js",
                            content: "var a = 42;",
                            etag: "1234abcd",
                            headers: { "X-Buster": "Aww yeah" }
                        }]
                    });
                }));
            }.bind(this));
        },

        "serializes backend resource": function (done) {
            var add = this.rs.addResource({
                path: "/app",
                backend: "http://localhost:3000/app"
            });

            add.then(function () {
                this.rs.serialize().then(done(function (serialized) {
                    assert.equals(serialized, {
                        resources: [{
                            path: "/app",
                            backend: "http://localhost:3000/app"
                        }]
                    });
                }));
            }.bind(this));
        },

        "waits for pending added resource": function (done) {
            this.rs.addResource("foo.js");
            this.rs.serialize().then(done(function (serialized) {
                assert.match(serialized, {
                    resources: [{
                        path: "/foo.js",
                        content: "var thisIsTheFoo = 5;"
                    }]
                });
            }));
        },

        "combine resource strips out content": function (done) {
            this.rs.addResource({ path: "/buster.js", content: " Buster" });
            this.rs.addResource({ path: "/sinon.js", content: " Sinon" });
            this.rs.addResource({
                path: "/bundle.js",
                combine: ["/buster.js", "/sinon.js"]
            });

            this.rs.serialize().then(done(function (serialized) {
                assert.equals(serialized.resources[2], {
                    encoding: "utf-8",
                    path: "/bundle.js",
                    combine: ["/buster.js", "/sinon.js"]
                });
            }));
        },

        "file resources": function (done) {
            this.rs.addResources(["foo.js", "bar.js"]);

            this.rs.serialize().then(done(function (serialized) {
                assert.match(serialized.resources, [{
                    path: "/foo.js",
                    encoding: "utf-8",
                    content: "var thisIsTheFoo = 5;",
                    etag: /^[a-z0-9]+$/
                }, {
                    path: "/bar.js",
                    encoding: "utf-8",
                    content: "var helloFromBar = 1;",
                    etag: /^[a-z0-9]+$/
                }]);
            }));
        }
    },

    "deserialize": {
        "resolves as resource set with single resource": function (done) {
            resourceSet.deserialize({ resources: [{
                path: "/buster.js",
                content: "Hey mister"
            }] }).then(function (rs) {
                assert.defined(rs.get("/buster.js"));
                assert.content(rs.get("/buster.js"), "Hey mister", done);
            });
        },

        "returns resource set with two resources": function (done) {
            resourceSet.deserialize({ resources: [{
                path: "/buster.js",
                content: "Hey mister"
            }, {
                path: "/buster2.js",
                content: "Yo mister"
            }] }).then(done(function (rs) {
                assert.equals(rs.length, 2);
                assert.defined(rs.get("/buster.js"));
                assert.defined(rs.get("/buster2.js"));
            }));
        },

        "returns resource set with load path": function (done) {
            resourceSet.deserialize({ load: ["/buster.js"], resources: [{
                path: "/buster.js",
                content: "Hey mister"
            }, {
                path: "/buster2.js",
                content: "Yo mister"
            }] }).then(done(function (rs) {
                assert.equals(rs.loadPath.paths(), ["/buster.js"]);
            }));
        },

        "deserializes serialized resource set": function (done) {
            var rs = resourceSet.create(FIXTURE_DIR);
            rs.addResources(["foo.js", "bar.js"]);
            var cb = buster.countdown(2, done);
            rs.serialize().then(function (serialized) {
                resourceSet.deserialize(serialized).then(function (rs2) {
                    assert.equals(rs.length, rs2.length);
                    assert.equals(rs.loadPath.paths, rs.loadPath.paths);
                    assert.resourceEqual(rs.get("/foo.js"),
                                         rs2.get("/foo.js"), cb);
                    assert.resourceEqual(rs.get("/bar.js"),
                                         rs2.get("/bar.js"), cb);
                });
            });
        }
    },

    "concat": {
        "creates new resource set": function () {
            var rs1 = resourceSet.create();
            var rs2 = resourceSet.create();

            var rs3 = rs1.concat(rs2);

            refute.same(rs1, rs3);
            refute.same(rs2, rs3);
        },

        "adds resources from all sources": function (done) {
            var rs1 = resourceSet.create();
            var add1 = rs1.addResource({ path: "/buster.js", content: "Ok" });
            var rs2 = resourceSet.create();
            var add2 = rs2.addResource({ path: "/sinon.js", content: "Nok" });
            var rs3 = resourceSet.create();
            var add3 = rs2.addResource({ path: "/when.js", content: "when()" });

            when.all([add1, add2, add3]).then(done(function () {
                var rs4 = rs1.concat(rs2, rs3);
                var cb = buster.countdown(3, done);

                assert.content(rs4.get("/buster.js"), "Ok", cb);
                assert.content(rs4.get("/sinon.js"), "Nok", cb);
                assert.content(rs4.get("/when.js"), "when()", cb);
            }));
        },

        "resources overwrite from right to left": function (done) {
            var rs1 = resourceSet.create();
            var add1 = rs1.addResource({ path: "/buster.js", content: "Ok" });
            var rs2 = resourceSet.create();
            var add2 = rs2.addResource({ path: "/buster.js", content: "Nok" });

            when.all([add1, add2]).then(done(function () {
                var rs3 = rs1.concat(rs2);
                assert.content(rs3.get("/buster.js"), "Nok", done);
            }));
        },

        "appends load in order": function (done) {
            var rs1 = resourceSet.create();
            var add1 = rs1.addResource({ path: "/buster.js", content: "Ok" });
            var rs2 = resourceSet.create();
            var add2 = rs2.addResource({ path: "/sinon.js", content: "Nok" });

            when.all([add1, add2]).then(done(function () {
                rs1.loadPath.append("/buster.js");
                rs2.loadPath.append("/sinon.js");
                var rs = rs1.concat(rs2);
                var paths = rs.loadPath.paths();
                assert.equals(rs.loadPath.paths(), ["/buster.js", "/sinon.js"]);
            }));
        },

        "uses rootpath of target resource set": function () {
            var rs1 = resourceSet.create("/tmp");
            var rs2 = resourceSet.create("/var");

            var rs3 = rs1.concat(rs2);

            assert.equals(rs3.rootPath, "/tmp");
        }
    },

    "appendLoad": {
        setUp: function (done) {
            this.rs = resourceSet.create(FIXTURE_DIR);
            var resource = { path: "/buster.js", content: "Ok" };
            this.rs.addResource(resource).then(function () {
                done();
            });
        },

        "adds existing resource to load path": function (done) {
            this.rs.addResource({ path: "/foo.js", content: "Yeah" });
            this.rs.appendLoad("foo.js").then(done(function (loadPath) {
                assert.equals(loadPath.paths(), ["/foo.js"]);
            }), done);
        },

        "adds multiple existing resources to load path": function (done) {
            this.rs.addResource({ path: "/foo.js", content: "Yeah" });
            this.rs.addResource({ path: "/bar.js", content: "Hmm" });
            this.rs.appendLoad(["foo.js", "bar.js"]).then(done(function (lp) {
                assert.equals(lp.paths(), ["/foo.js", "/bar.js"]);
            }), done);
        },

        "adds existing resources to load path using globs": function (done) {
            this.rs.addResource({ path: "/tmp/foo.js", content: "Yeah" });
            this.rs.addResource({ path: "/tmp/bar.js", content: "Hmm" });
            this.rs.appendLoad(["/tmp/*.js"]).then(done(function (loadPath) {
                assert.equals(loadPath.paths(), ["/tmp/foo.js", "/tmp/bar.js"]);
            }), done);
        },

        "adds non-existing resource": function (done) {
            this.rs.appendLoad("foo.js").then(function (loadPath) {
                assert.equals(loadPath.paths(), ["/foo.js"]);
                var content = "var thisIsTheFoo = 5;";
                assert.content(this.rs.get("/foo.js"), content, done);
            }.bind(this), done);
        },

        "adds non-existing resources": function (done) {
            var rs = this.rs;
            rs.appendLoad("*.js").then(function (lp) {
                var cb = buster.countdown(2, done);
                assert.equals(lp.paths(), ["/bar.js", "/foo.js", "/buster.js"]);
                assert.content(rs.get("/bar.js"), "var helloFromBar = 1;", cb);
                assert.content(rs.get("/foo.js"), "var thisIsTheFoo = 5;", cb);
            }, done);
        },

        "does not add duplicate entries": function (done) {
            this.rs.addResource({ path: "/foo.js", content: "Ok" });
            var paths = ["foo.js", " bar.js", "*.js"];
            this.rs.appendLoad(paths).then(done(function (lp) {
                assert.equals(lp.paths(), ["/foo.js", "/bar.js", "/buster.js"]);
            }.bind(this)), done);
        }
    },

    "prependLoad": {
        setUp: function (done) {
            this.rs = resourceSet.create(FIXTURE_DIR);
            var resource = { path: "/buster.js", content: "Ok" };
            this.rs.addResource(resource).then(function () {
                done();
            });
        },

        "adds existing resource to load path": function (done) {
            this.rs.addResource({ path: "/foo.js", content: "Yeah" });
            this.rs.prependLoad("foo.js").then(done(function (loadPath) {
                assert.equals(loadPath.paths(), ["/foo.js"]);
            }), done);
        },

        "adds multiple existing resources to load path": function (done) {
            this.rs.addResource({ path: "/foo.js", content: "Yeah" });
            this.rs.addResource({ path: "/bar.js", content: "Hmm" });
            this.rs.prependLoad(["foo.js", "bar.js"]).then(done(function (lp) {
                assert.equals(lp.paths(), ["/bar.js", "/foo.js"]);
            }), done);
        },

        "adds existing resources to load path using globs": function (done) {
            this.rs.addResource({ path: "/tmp/foo.js", content: "Yeah" });
            this.rs.addResource({ path: "/tmp/bar.js", content: "Hmm" });
            this.rs.prependLoad(["/tmp/*.js"]).then(done(function (loadPath) {
                assert.equals(loadPath.paths(), ["/tmp/bar.js", "/tmp/foo.js"]);
            }), done);
        },

        "adds non-existing resource": function (done) {
            this.rs.prependLoad("foo.js").then(function (loadPath) {
                assert.equals(loadPath.paths(), ["/foo.js"]);
                var content = "var thisIsTheFoo = 5;";
                assert.content(this.rs.get("/foo.js"), content, done);
            }.bind(this), done);
        },

        "adds non-existing resources": function (done) {
            var rs = this.rs;
            rs.prependLoad("*.js").then(function (lp) {
                var cb = buster.countdown(2, done);
                assert.equals(lp.paths(), ["/buster.js", "/foo.js", "/bar.js"]);
                assert.content(rs.get("/bar.js"), "var helloFromBar = 1;", cb);
                assert.content(rs.get("/foo.js"), "var thisIsTheFoo = 5;", cb);
            }, done);
        },

        "does not add duplicate entries": function (done) {
            this.rs.addResource({ path: "/foo.js", content: "Ok" });
            var paths = ["foo.js", " bar.js", "*.js"];
            this.rs.prependLoad(paths).then(done(function (loadPath) {
                assert.equals(loadPath.paths(),
                              ["/buster.js", "/bar.js", "/foo.js"]);
            }.bind(this)), done);
        }
    }
});
