var buster = require("buster");
var assert = buster.assert;
var refute = buster.refute;
var busterResources = require("./../lib/buster-resources");

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
    }
});