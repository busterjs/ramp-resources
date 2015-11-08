var bResource = require("./resource");
var when = require("when");
var invalid = require("./invalid-error");

module.exports = {
    validateSources: function (resourceSet, sources) {
        var i, l;
        for (i = 0, l = sources.length; i < l; ++i) {
            if (!resourceSet.get(sources[i])) {
                return invalid(sources[i] + " is not an available resource");
            }
        }
    },

    combiner: function (resourceSet, sources) {
        return function () {
            return when.all(sources.map(function (s) {
                    return resourceSet.get(s).content();
                }))
                .then(function (contents) {
                    return contents.join("");
                });
        };
    },

    prepareResource: function (resourceSet, sources, resource) {
        var err = this.validateSources(resourceSet, sources);
        if (err) {
            err.message = "Cannot build combined resource " +
                bResource.normalizePath(resource.path) + ": " + err.message;
            return when.reject(err);
        }

        var combine = this.combiner(resourceSet, sources);
        if (resource.setContent) {
            resource.setContent(combine);
        } else {
            resource.content = combine;
        }
        return when.resolve(resource);
    }
};
