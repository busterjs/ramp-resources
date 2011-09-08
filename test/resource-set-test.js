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
        var r = this.br.createResourceSet({});
        assert(r.load instanceof Array);
        assert.equals(r.load.length, 0);

        assert.equals("", r.contextPath);
    }
});