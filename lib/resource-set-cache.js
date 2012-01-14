var resourceSet = require("./resource-set");
var bind = require("buster-core").bind;
var partial = require("buster-core").partial;
var when = require("when");
var HOUR = 60 * 60 * 1000;

function etagged(resource) {
    return !!resource.etag;
}

function hasContent(r) {
    return !!r.content;
}

function lacksContent(r) {
    return !r.content;
}

function resolveContent(resource) {
    var d = when.defer();
    resource.content().then(function (content) {
        d.resolver.resolve({ resource: resource, content: content });
    });
    return d.promise;
}

/**
 * Manage resource sets and cross-set caches. The cache will keep a reference
 * to any resource that has an etag property. When inflating resource sets,
 * the cache will find resources whose content is empty, look up their etag
 * in the cache, and use the cached content if available.
 *
 * The cache can store multiple versions of a resource at the same path. It
 * does so by keeping etag/content pairs cached.
 *
 * @ttl Time to live for cached resources
 */
exports.create = function (ttl) {
    var resources = {};

    function purge(resource) {
        delete resources[resource.path][resource.etag];
    }

    function cache(r) {
        if (!r.content) { return; }
        if (!resources[r.resource.path]) { resources[r.resource.path] = {}; }
        resources[r.resource.path][r.resource.etag] = r.resource;
        setTimeout(partial(purge, r.resource), ttl || HOUR);
    }

    function lookup(r) {
        var cached = resources[r.resource.path];
        return (cached && cached[r.resource.etag]) || r.resource;
    }

    return {
        inflate: function (resourceSet) {
            var d = when.defer();
            var replace = bind(resourceSet, "addResource");
            when.all(
                resourceSet.filter(etagged).map(resolveContent),
                function (resources) {
                    resources.filter(hasContent).forEach(cache);
                    resources.filter(lacksContent).map(lookup).forEach(replace);
                    d.resolver.resolve(resourceSet);
                }
            );
            return d.promise;
        },

        resourceVersions: function () {
            var path, etag, result = {};
            for (path in resources) {
                result[path] = [];
                for (etag in resources[path]) {
                    result[path].push(etag);
                }
            }
            return result;
        }
    };
};
