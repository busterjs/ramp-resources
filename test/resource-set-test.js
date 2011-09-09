var buster = require("buster");
var assert = buster.assert;
var busterResources = require("./../lib/buster-resources");

// For legacy reasons, most of the resource-set tests are encapsulated in session
// and capture tests.
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
});