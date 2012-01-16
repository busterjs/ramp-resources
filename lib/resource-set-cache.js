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
exports.create = function (ttl, maxSize) {
    var resources = [], currentFreeze;
    ttl = ttl || HOUR;

    function purge(cached) {
        resource = cached.resource;
        resources = resources.filter(function (r) {
            r = r.resource;
            return r.path !== resource.path || r.etag !== resource.etag;
        });
    }

    function limitCacheSize() {
        if (!maxSize || Date.now() < currentFreeze) { return; }
        while (size() > maxSize) {
            purge(resources[0]);
        }
    }

    function gc() {
        var n = Date.now();
        resources.filter(function (r) { return r.killAt <= n; }).forEach(purge);
        if (n >= currentFreeze) { currentFreeze = null; }
        limitCacheSize();
    }

    function cache(r) {
        if (!r.content) { return; }
        var cached = {
            resource: r.resource,
            size: r.content.length + JSON.stringify(r.resource.headers()).length
        };
        if (ttl >= 0) {
            cached.killAt = Date.now() + ttl;
            setTimeout(gc, ttl);
        }
        resources.push(cached);
        limitCacheSize();
    }

    function lookup(r) {
        var resource = r.resource;
        return resources.map(function (r) {
            return r.resource;
        }).filter(function (res) {
            return res.path === resource.path && res.etag === resource.etag;
        })[0] || resource;
    }

    function size() {
        return resources.reduce(function (sum, r) {
            return sum + r.size;
        }, 0);
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

        freeze: function (ttl) {
            currentFreeze = Date.now() + ttl;
            resources.forEach(function (r) {
                r.killAt = Math.max(r.killAt, currentFreeze);
            });
            setTimeout(gc, ttl);
        },

        resourceVersions: function () {
            var result = {};
            resources.forEach(function (cached) {
                var res = cached.resource;
                if (!result[res.path]) { result[res.path] = []; }
                result[res.path].push(res.etag);
            });
            return result;
        },

        size: size
    };
};
