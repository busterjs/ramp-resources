var buster = require("buster");
var when = require("when");
var resourceSet = require("../lib/resource-set");
var resourceSetCache = require("../lib/resource-set-cache");
require("./test-helper");

function add(rs, path, content, options) {
    return rs.addResource(buster.extend({
        path: path,
        content: content
    }, options));
}

function addResourcesAndInflate(cache, resourceSet, resources, done) {
    var promises = resources.map(function (r) {
        add.apply(this, [resourceSet].concat(r));
    });
    when.all(promises).then(function () {
        cache.inflate(resourceSet).then(done);
    });
}

buster.testCase("Resource set cache", {
    setUp: function (done) {
        this.clock = this.useFakeTimers();
        this.rs = resourceSet.create();
        this.cache = resourceSetCache.create(250);

        var rs = resourceSet.create();
        when.all([
            add(rs, "/buster.js", "Yo!", { etag: "abcd1234" }),
            add(rs, "/sinon.js", "Hey!", {})
        ], function () {
            this.cache.inflate(rs).then(function () { done(); });
        }.bind(this));
    },

    "inflate": {
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

        "removes resource from cache after ttl ms": function (done) {
            this.clock.tick(250);
            addResourcesAndInflate(this.cache, this.rs, [
                ["/buster.js", "", { etag: "abcd1234" }]
            ], function (rs) {
                assert.content(rs.get("/buster.js"), "", done);
            });
        }
    }
});
