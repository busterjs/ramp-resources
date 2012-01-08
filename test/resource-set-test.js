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
            assert.invalidResource(this.rs, null, "Resource must be a string, a resource object or an object of resource properties");
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
            var rs2 = resource.create("/sinon.js", { content: "var sinon = {};" });
            when.all([this.rs.addResource(this.resource),
                      this.rs.addResource(rs2)]).then(done(function (resources) {
                assert.equals(this.rs.length, 2);
                assert.same(this.rs[0], this.resource);
                assert.same(this.rs[1], rs2);
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
            this.rs.addResource("../resource-test.js").then(noop, done(function (err) {
                assert.defined(err);
                assert.match(err, "../resource-test.js");
                assert.match(err, "outside the project root");
                assert.match(err, "set rootPath to the desired root");
            }));
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
                    var concatinated = "var thisIsTheFoo = 5;var helloFromBar = 1;";
                    assert.content(rs, concatinated, done);
                }, done(logStack));
            }.bind(this), done(logStack));
        }
    },

    "remove": {
        "makes resource go away": function (done) {
            this.rs.addResource({ path: "/yo", content: "Ok" }).then(done(function () {
                this.rs.remove("/yo");
                refute.defined(this.rs.get("/yo"));
            }.bind(this)));
        },

        "makes resource at normalized path go away": function (done) {
            this.rs.addResource({ path: "/yo", content: "Ok" }).then(done(function () {
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
        }
    }
/*

buster.testCase("configuration group", {


    "loads resource as source": function (done) {
        var group = bcGroup.create({
            resources: ["foo.js"],
            sources: ["foo.js"]
        }, __dirname + "/fixtures");

        assertLoad(group, ["/foo.js"], done);
    },

    "adds source files to load and add them as file resources": function (done) {
        var group = bcGroup.create({
            sources: ["foo.js", "bar.js"]
        }, __dirname + "/fixtures");

        var next = buster.countdown(2, done);
        assertContainsResources(group, ["/foo.js", "/bar.js"], next);
        assertLoad(group, ["/foo.js", "/bar.js"], next);
    },

    "creates group without file system access": function (done) {
        var group = bcGroup.create({
            resources: [{ path: "/hey", content: "// OK" }],
            sources: ["/hey"]
        });

        group.resolve().then(function (resourceSet) {
            assert.equals(resourceSet.load, ["/hey"]);
            done();
        }.bind(this));
    },

    "adds source files via glob pattern": function (done) {
        var group = bcGroup.create({
            sources: ["*.js"]
        }, __dirname + "/fixtures");

        assertContainsResources(group, ["/foo.js", "/bar.js"], done);
    },

    "loads libs, sources and tests in right order with globbing": function (done) {
        var group = bcGroup.create({
            libs: ["fo*.js"],
            sources: ["b*r.js"],
            tests: ["test/*.js"]
        }, __dirname + "/fixtures");

        var paths = ["/foo.js", "/bar.js", "/test/my-testish.js"];
        var callback = buster.countdown(2, done);

        assertContainsResources(group, paths, callback);
        assertLoad(group, paths, callback);
    },

    "loads tests and testHelpers in right order": function (done) {
        var group = bcGroup.create({
            testLibs: ["test/*.js"],
            tests: ["b*r.js"]
        }, __dirname + "/fixtures");

        var paths = ["/test/my-testish.js", "/bar.js"];
        var callback = buster.countdown(2, done);

        assertContainsResources(group, paths, callback);
        assertLoad(group, paths, callback);
    },

    "loads deps, sources and specs in right order": function (done) {
        var group = bcGroup.create({
            deps: ["fo*.js"], src: ["b*r.js"], specs: ["test/*.js"]
        }, __dirname + "/fixtures");

        assertLoad(group, ["/foo.js", "/bar.js", "/test/my-testish.js"], done);
    },

    "loads libs, deps and sources in right order": function (done) {
        var group = bcGroup.create({
            deps: ["fo*.js"], libs: ["b*r.js"], sources: ["test/*.js"]
        }, __dirname + "/fixtures");

        assertLoad(group, ["/foo.js", "/bar.js", "/test/my-testish.js"], done);
    },

    "loads test libs and spec libs in right order": function (done) {
        var group = bcGroup.create({
            specLibs: ["fo*.js"],
            testLibs: ["b*r.js"]
        }, __dirname + "/fixtures");

        assertLoad(group, ["/foo.js", "/bar.js"], done);
    },

    "loads libs, src and sources in right order": function (done) {
        var group = bcGroup.create({
            libs: ["ba*.js"], src: ["f*.js"], sources: ["test/*.js"]
        }, __dirname + "/fixtures");

        assertLoad(group, ["/bar.js", "/foo.js", "/test/my-testish.js"], done);
    },

    "server address": {
        "is parsed": function () {
            var group = bcGroup.create({
                server: "http://localhost:1234/buster"
            }, __dirname + "/fixtures");

            assert.match(group.server, {
                hostname: "localhost",
                port: 1234,
                pathname: "/buster"
            });
        },

        "is parsed without path": function () {
            var group = bcGroup.create({
                server: "http://localhost:1234"
            }, __dirname + "/fixtures");

            assert.match(group.server, {
                hostname: "localhost",
                port: 1234,
                pathname: "/"
            });
        }
    },

    "environments": {
        "is set": function () {
            var group = bcGroup.create({ environment: "node" });
            assert.equals(group.environment, "node");
        },

        "defaults to browser": function () {
            var group = bcGroup.create({});
            assert.equals(group.environment, "browser");
        },

        "is set via env shorthand": function () {
            var group = bcGroup.create({ env: "node" });
            assert.equals(group.environment, "node");
        }
    },

    "autoRun": {
        "is set": function () {
            var group = bcGroup.create({ autoRun: true });
            assert.equals(group.options.autoRun, true);
        },

        "is not set by default": function () {
            var group = bcGroup.create({});
            refute.defined(group.options.autoRun);
        }
    },

    "supports duplicate items in sources to allow simple ordering": function (done) {
        var group = bcGroup.create({
            sources: ["foo.js", "foo.js", "*.js"]
        }, __dirname + "/fixtures");

        assertLoad(group, ["/foo.js", "/bar.js"], done);
    },

    "framework resources": {
        setUp: function (done) {
            this.group = bcGroup.create({}, __dirname + "/fixtures");
            this.group.resolve().then(function () {
                this.resourceSet = this.group.resourceSet;
                done();
            }.bind(this));
        },

        "adds bundle groups": function () {
            this.group.setupFrameworkResources();

            var bundleResourceName = "/buster/bundle-0.2.1.js";
            var bundleResource = this.resourceSet.resources[bundleResourceName];
            assert.defined(bundleResource);

            var compatResourceName = "/buster/compat-0.2.1.js";
            var compatResource = this.resourceSet.resources[compatResourceName];
            assert.defined(compatResource);

            assert.equals([bundleResourceName, compatResourceName],
                          this.resourceSet.load.slice(0, 2));
        },

        "allows extension with events": function () {
            this.group.on("load:resources", function (resourceSet) {
                resourceSet.addResource("/stuff", {
                    content: "Oh yeah!"
                });
            });
            this.group.setupFrameworkResources();

            assert.defined(this.resourceSet.resources["/stuff"]);
            assert.equals(this.resourceSet.resources["/stuff"].content, "Oh yeah!");
        }
    },

    "does not resolve multiple times": function (done) {
        var group = bcGroup.create({
            libs: ["foo.js"]
        }, __dirname + "/fixtures");

        group.resolve().then(function (resourceSet) {
            group.resolve().then(function (rs) {
                assert.same(resourceSet, rs);
                done();
            });
        });
    },

    "resource load hooks": {
        "can override dependencies": function (done) {
            var group = bcGroup.create({
                deps: ["foo.js"]
            }, __dirname + "/fixtures");

            group.on("load:libs", function (libs) {
                libs.push("bar.js");
            });

            assertLoad(group, ["/foo.js", "/bar.js"], done);
        },

        "triggers with resolved glob patterns": function (done) {
            var group = bcGroup.create({
                deps: ["*.js"]
            }, __dirname + "/fixtures");

            var resources = [];
            group.on("load:libs", function (libs) {
                resources.push(libs[0]);
                resources.push(libs[1]);
            });

            group.resolve().then(function () {
                assert.equals(resources, ["bar.js", "foo.js"]);
                done();
            });
        },

        "fires dependencies only once for libs/deps": function (done) {
            var group = bcGroup.create({
                deps: ["foo.js"], libs: ["bar.js"]
            }, __dirname + "/fixtures");

            group.on("load:libs", function (libs) {
                libs.shift();
                libs.shift();
            });

            group.resolve().then(function () {
                assert.equals(group.resourceSet.resources, {});
                done();
            });
        },

        "fires sources once for src/sources": function (done) {
            var group = bcGroup.create({
                src: ["foo.js"], sources: ["bar.js"]
            }, __dirname + "/fixtures");

            group.on("load:sources", function (sources) {
                sources.shift();
                sources.shift();
            });

            group.resolve().then(function () {
                assert.equals(group.resourceSet.resources, {});
                done();
            });
        },

        "fires tests once for specs/tests": function (done) {
            var group = bcGroup.create({
                tests: ["foo.js"], specs: ["bar.js"]
            }, __dirname + "/fixtures");

            group.on("load:tests", function (tests) {
                tests.shift();
                tests.shift();
            });

            group.resolve().then(function () {
                assert.equals(group.resourceSet.resources, {});
                done();
            });
        }
    },

    "extended configuration": {
        setUp: function () {
            this.group = bcGroup.create({
                libs: ["foo.js"],
                server: "localhost:9191",
                autoRun: true
            }, __dirname + "/fixtures");
        },

        "inherits libs from parent group": function (done) {
            var group = this.group.extend();

            group.resolve().then(function () {
                assert("/foo.js" in group.resourceSet.resources);
                done();
            });
        },

        "does not modify parent group resources": function (done) {
            var group = this.group.extend({
                sources: ["bar.js"]
            }, __dirname + "/fixtures");

            this.group.resolve().then(function (rs) {
                group.resolve().then(function () {
                    assert("/bar.js" in group.resourceSet.resources);
                    refute("/bar.js" in rs.resources);
                    done();
                });
            });
        },

        "mixes load from both groups": function (done) {
            var group = this.group.extend({
                sources: ["bar.js"]
            }, __dirname + "/fixtures");

            group.resolve().then(function (resourceSet) {
                assert.equals(resourceSet.load, ["/foo.js", "/bar.js"]);
                done();
            });
        },

        "does not modify parent group load": function (done) {
            var group = this.group.extend({
                tests: ["bar.js"]
            }, __dirname + "/fixtures");

            this.group.resolve().then(function (resourceSet) {
                group.resolve().then(function () {
                    assert.equals(resourceSet.load, ["/foo.js"]);
                    done();
                });
            });
        },

        "uses libs from both in correct order": function (done) {
            var group = this.group.extend({
                libs: ["bar.js"]
            }, __dirname + "/fixtures");

            group.resolve().then(function (resourceSet) {
                assert.equals(resourceSet.load, ["/foo.js", "/bar.js"]);
                done();
            });
        },

        "inherits server setting": function () {
            var group = this.group.extend({ libs: [] });
            assert.match(group.server, { hostname: "localhost", port: 9191 });
        },

        "overrides server setting": function () {
            var group = this.group.extend({ server: "localhost:7878" });
            assert.match(group.server, { port: 7878 });
        },

        "inherits environment": function () {
            var group = this.group.extend({ libs: [] });
            assert.equals(group.environment, "browser");
        },

        "overrides environment": function () {
            var group = this.group.extend({ environment: "node", libs: [] });
            assert.equals(group.environment, "node");
        },

        "inherits autoRun option": function () {
            var group = this.group.extend({ libs: [] });
            assert(group.options.autoRun);
        },

        "overrides autoRun option": function () {
            var group = this.group.extend({ autoRun: false, libs: [] });
            refute(group.options.autoRun);
        }
    },

    "extensions": {
        setUp: function () {
            this.configure = this.spy();
            this.stub(moduleLoader, "load").returns({ configure: this.configure });
        },

        "loads modules with buster-module-loader": function (done) {
            var group = bcGroup.create({
                extensions: ["baluba"]
            }, __dirname + "/fixtures");

            group.resolve().then(function () {
                assert.calledOnceWith(moduleLoader.load, "baluba");
                done();
            });
        },

        "loads all extensions": function (done) {
            var group = bcGroup.create({
                extensions: ["baluba", "swan"]
            }, __dirname + "/fixtures");

            group.resolve().then(function () {
                assert.calledWith(moduleLoader.load, "baluba");
                assert.calledWith(moduleLoader.load, "swan");
                done();
            });
        },

        "calls configure on extensions": function (done) {
            var group = bcGroup.create({
                extensions: ["baluba"]
            }, __dirname + "/fixtures");

            group.resolve().then(function () {
                assert.calledOnceWith(this.configure, group);
                done();
            }.bind(this));
        },

        "fails gracefully if extension cannot be found": function (done) {
            moduleLoader.load.throws({
                name: "Error",
                message: "Cannot find module 'baluba'"
            });

            var group = bcGroup.create({
                extensions: ["baluba"]
            }, __dirname + "/fixtures");

            group.resolve().then(function () {}, function (e) {
                assert.match(e.message, "Failed loading extensions");
                assert.match(e.message, "Cannot find module 'baluba'");
                done();
            }.bind(this));
        },

        "fails gracefully if extension has no configure method": function (done) {
            moduleLoader.load.returns({});

            var group = bcGroup.create({
                extensions: ["baluba"]
            }, __dirname + "/fixtures");

            group.resolve().then(function () {}, function (e) {
                assert.match(e.message, "Failed loading extensions");
                assert.match(e.message, "Extension 'baluba' has no 'configure' method");
                done();
            }.bind(this));
        }
    },

    "unknown options": {
        "cause an error": function (done) {
            var group = bcGroup.create({
                thingie: "Oh noes"
            });

            group.resolve().then(function () {}, function (err) {
                assert.defined(err);
                done();
            });
        },

        "include custom message": function (done) {
            var group = bcGroup.create({
                load: [""]
            });

            group.resolve().then(function () {}, function (err) {
                assert.match(err, "Did you mean one of");
                done();
            });
        }
    }
});


*/

});
