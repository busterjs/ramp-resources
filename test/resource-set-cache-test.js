var buster = require("buster-node");
var when = require("when");
var rr = require("../lib/ramp-resources");
var assert = require("./test-helper").referee.assert;

function add(rs, path, content, options) {
    options.path = options.path || path;
    options.content = options.content || content;
    return rs.addResource(options);
}

function addResourcesAndInflate(cache, resourceSet, resources, done) {
    var promises = resources.map(function (r) {
        add.apply(this, [resourceSet].concat(r));
    });
    when.all(promises).then(function () {
        cache.inflate(resourceSet).then(done);
    });
}

function maxSizeSetUp() {
    this.rs = rr.createResourceSet();
    this.rs2 = rr.createResourceSet();
    this.cache = rr.createCache({ ttl: 250, maxSize: 150 });

    return when.all([
        add(this.rs, "/buster.js", "Yo!", { etag: "abcd" }),
        add(this.rs, "/sinon.js", "Hey", { etag: "1234" }),
        add(this.rs, "/when.js", "Hm", { etag: "0123" }),
        add(this.rs2, "/jquery.js", "Eh", { etag: "zxcv" })
    ]);
}

buster.testCase("Resource set cache", {
    setUp: function () {
        this.clock = this.useFakeTimers();
        this.rs = rr.createResourceSet();
        this.cache = rr.createCache({ ttl: 250 });

        var rs = rr.createResourceSet();
        return when.all([
            add(rs, "/buster.js", "Yo!", { etag: "abcd1234" }),
            add(rs, "/sinon.js", "Hey!", {})
        ]).then(function () {
            return this.cache.inflate(rs);
        }.bind(this));
    },

    "inflate": {
        setUp: function () {
            var rs = rr.createResourceSet();
            return add(rs, "/buster.coffee", "Yoo!", {
                etag: "dedede",
                alternatives: [{
                    content: "HAHA",
                    mimeType: "text/uppercase"
                }]
            }).then(function () {
                return this.cache.inflate(rs);
            }.bind(this));
        },

        "resolves with resource set": function (done) {
            this.cache.inflate(this.rs).then(done(function (rs) {
                assert.same(rs, this.rs);
            }.bind(this)));
        },

        "uses cached content for empty-content resource": function (done) {
            addResourcesAndInflate(this.cache, this.rs, [
                ["/buster.js", "", { etag: "abcd1234" }]
            ], function (rs) {
                assert.content(rs.get("/buster.js"), "Yo!", done);
            });
        },

        "uses cached alternatives for empty-content resource": function (done) {
            addResourcesAndInflate(this.cache, this.rs, [
                ["/buster.coffee", "", {
                    etag: "13ae76a598b2aa2cad2c7fd1f4954fff745835d1"
                }]
            ], function (rs) {
                var resource = rs.get("/buster.coffee");
                var alternative = resource.getContentFor("text/uppercase");
                assert.defined(alternative);
                assert.content(alternative, "HAHA", done);
            });
        },

        "does not use cache when etag does not match": function (done) {
            addResourcesAndInflate(this.cache, this.rs, [
                ["/buster.js", "", { etag: "abcd12345" }]
            ], function (rs) {
                assert.content(rs.get("/buster.js"), "", done);
            });
        },

        "does not use cached content when content not empty": function (done) {
            addResourcesAndInflate(this.cache, this.rs, [
                ["/buster.js", "Huh", { etag: "abcd1234" }]
            ], function (rs) {
                assert.content(rs.get("/buster.js"), "Huh", done);
            });
        },

        "does not use cached content for wrong path": function (done) {
            addResourcesAndInflate(this.cache, this.rs, [
                ["/sinon.js", "Huh", { etag: "abcd1234" }]
            ], function (rs) {
                assert.content(rs.get("/sinon.js"), "Huh", done);
            });
        },

        "does not cache resources without etag": function (done) {
            addResourcesAndInflate(this.cache, this.rs, [
                ["/sinon.js", "Huh", {}]
            ], function (rs) {
                assert.content(rs.get("/sinon.js"), "Huh", done);
            });
        },

        "does not cache identical versions multiple times": function (done) {
            addResourcesAndInflate(this.cache, this.rs, [
                ["/sinon.js", "Huh", { etag: "123" }]
            ], function (rs) {
                var cacheSize = this.cache.size();
                addResourcesAndInflate(this.cache, this.rs, [
                    ["/sinon.js", "Huh", { etag: "123" }]
                ], done(function (rs) {
                    assert.equals(cacheSize, this.cache.size());
                }.bind(this)));
            }.bind(this));
        },

        "does not cache uncacheable resource": function (done) {
            var rs2 = rr.createResourceSet();
            addResourcesAndInflate(this.cache, this.rs, [
                ["/uncacheable.js", "Stuff", { cacheable: false, etag: "1" }]
            ], function () {
                addResourcesAndInflate(this.cache, rs2, [
                    ["/uncacheable.js", "", { etag: "1" }]
                ], function (rs) {
                    assert.content(rs.get("/uncacheable.js"), "", done);
                });
            }.bind(this));
        },

        "does not cache resources when content() rejects": function (done) {
            var rs2 = rr.createResourceSet();
            var d = when.defer();
            d.resolver.reject("Oh noes");
            addResourcesAndInflate(this.cache, this.rs, [
                ["/sinon.js", function () { return d.promise; }, { etag: "1" }]
            ], function () {
                addResourcesAndInflate(this.cache, rs2, [
                    ["/sinon.js", "", { etag: "1" }]
                ], function (rs) {
                    assert.content(rs.get("/sinon.js"), "", done);
                });
            }.bind(this));
        },

        "does not look up from cache when content() rejects": function (done) {
            var rs2 = rr.createResourceSet();
            var d = when.defer();
            d.resolver.reject("Oh noes");
            addResourcesAndInflate(this.cache, this.rs, [
                ["/a.js", "Cached", { etag: "1" }]
            ], function () {
                addResourcesAndInflate(this.cache, rs2, [
                    ["/a.js", function () { return d.promise; }, { etag: "1" }]
                ], function (rs) {
                    rs.get("/a.js").content().then(
                        function () {},
                        done(function (err) {
                            assert.equals(err, "Oh noes");
                        })
                    );
                });
            }.bind(this));
        },

        "does not look up from cache when content() throws": function (done) {
            var rs2 = rr.createResourceSet();
            addResourcesAndInflate(this.cache, this.rs, [
                ["/a.js", "Cached", { etag: "1" }]
            ], function () {
                addResourcesAndInflate(this.cache, rs2, [
                    ["/a.js", function () { throw "WOW"; }, { etag: "1" }]
                ], done(function (rs) {
                    assert.exception(function () {
                        rs.get("/a.js").content();
                    });
                }));
            }.bind(this));
        },

        "uses entire cached resource": function (done) {
            addResourcesAndInflate(this.cache, this.rs, [
                ["/sinon.js", "Huh", {
                    etag: "abcd1234",
                    headers: { "Content-Type": "application/json" }
                }]
            ], done(function (rs) {
                assert.equals(rs.get("/sinon.js").header("Content-Type"),
                              "application/json");
            }));
        },

        "removes resource from cache after ttl ms": function () {
            this.clock.tick(250);
            assert.equals(this.cache.resourceVersions(), {});
        },

        "keeps resources indefinitely with -1 ttl": {
            "setUp": function () {
                var rs = rr.createResourceSet();
                this.cache = rr.createCache({ttl: -1});

                // doing async operations inside setUp, because otherwise clock.tick() makes the test time out
                return add(rs, "/buster.js", "Yo!", {etag: "abcd"})
                    .then(function () {
                        return this.cache.inflate(rs);
                    }.bind(this));
            },
            "test": function () {
                this.clock.tick(30 * 24 * 60 * 60 * 1000);

                assert.equals(this.cache.resourceVersions(), {
                    "/buster.js": ["abcd"]
                });
            }
        }
    },

    "resource versions": {
        "returns cached resource version": function () {
            assert.equals(this.cache.resourceVersions(), {
                "/buster.js": ["abcd1234"]
            });
        },

        "returns all cached resource version": function () {
            return add(this.rs, "/sinon.js", "Yeah", {etag: "123"})
                .then(function () {
                    return add(this.rs, "/buster.js", "Heh", {etag: "666"});
                }.bind(this))
                .then(function () {
                    return add(this.rs, "/when.js", "When??!?", {});
                }.bind(this))
                .then(function () {
                    return this.cache.inflate(this.rs);
                }.bind(this))
                .then(function () {
                    assert.equals(this.cache.resourceVersions(), {
                        "/buster.js": ["abcd1234", "666"],
                        "/sinon.js": ["123"]
                    });
                }.bind(this));
        }
    },

    "freeze": {
        "guarantees resource is available for provided period": function () {
            this.cache.inflate(this.rs);
            this.cache.freeze(300);
            this.clock.tick(299);

            assert.equals(this.cache.resourceVersions(), {
                "/buster.js": ["abcd1234"]
            });
        },

        "should not shorten a resource's life-span": function () {
            this.cache.inflate(this.rs);
            this.cache.freeze(100);
            this.clock.tick(200);

            assert.equals(this.cache.resourceVersions(), {
                "/buster.js": ["abcd1234"]
            });
        }
    },

    "size": {
        "returns cache byte size approximation": function () {
            // Content OK! 3 bytes
            // Etag abcd1234 8 bytes
            // Default headers (names and values) 66 bytes
            assert.equals(this.cache.size(), 77);
        },

        "adjusts cache byte size approximation when adding": function () {
            return add(this.rs, "/sinon.js", "Yeah", {etag: "1"})
                .then(function () {
                    return this.cache.inflate(this.rs);
                }.bind(this))
                .then(function () {
                    assert.equals(this.cache.size(), 148);
                }.bind(this));
        }
    },

    "max size": {
        setUp: maxSizeSetUp,

        "purges oldest content when growing too large": function () {
            return this.cache.inflate(this.rs).then(function () {
                assert.equals(this.cache.resourceVersions(), {
                    "/sinon.js": ["1234"],
                    "/when.js": ["0123"]
                });
            }.bind(this));
        },

        "does not purge oldest content when in freeze": function () {
            this.cache.maxSize(250);
            return this.cache.inflate(this.rs)
                .then(function () {
                    this.cache.freeze(50);
                    return this.cache.inflate(this.rs2);
                }.bind(this))
                .then(function () {
                    assert.equals(this.cache.resourceVersions(), {
                        "/buster.js": ["abcd"],
                        "/sinon.js": ["1234"],
                        "/when.js": ["0123"],
                        "/jquery.js": ["zxcv"]
                    });
                }.bind(this));
        },

        "purges oldest content after current freeze": function () {
            this.cache.maxSize(250);
            return this.cache.inflate(this.rs)
                .then(function () {
                    this.cache.freeze(50);
                    return this.cache.inflate(this.rs2);
                }.bind(this))
                .then(function () {
                    this.clock.tick(50);

                    assert.equals(this.cache.resourceVersions(), {
                        "/sinon.js": ["1234"],
                        "/when.js": ["0123"],
                        "/jquery.js": ["zxcv"]
                    });
                }.bind(this));
        }
    },

    "purgeAll": {
        setUp: function () {
            var setupPromise = maxSizeSetUp.call(this);
            this.cache.maxSize(300);
            return setupPromise;
        },

        "purges everything": function () {
            return this.cache.inflate(this.rs).then(function () {
                this.cache.purgeAll();

                assert.equals(this.cache.resourceVersions(), {});
            }.bind(this));
        },

        "does not purge everything when in freeze": function () {
            return this.cache.inflate(this.rs).then(function () {
                this.cache.freeze(100);
                this.cache.purgeAll();

                assert.equals(this.cache.resourceVersions(), {
                    "/buster.js": ["abcd"],
                    "/sinon.js": ["1234"],
                    "/when.js": ["0123"]
                });
            }.bind(this));
        },

        "purges everything after current freeze": function () {
            return this.cache.inflate(this.rs).then(function () {
                this.cache.inflate(this.rs);
                this.cache.freeze(100);
                this.clock.tick(50);
                this.cache.purgeAll();
                this.clock.tick(50);

                assert.equals(this.cache.resourceVersions(), {});
            }.bind(this));
        }
    }
});
