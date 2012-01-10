var B = require("buster-core");
var when = require("when");
var invalid = require("./invalid-error");
var bResource = require("./resource");
var fileResolver = require("./resource-file-resolver");
var combiner = require("./resource-combiner");
var loadPath = require("./load-path");

/**
 * Create new resource set, resolved from the provided rootPath,
 * or process.cwd()
 */
exports.create = function (rootPath) {
    rootPath = rootPath || process.cwd();
    var resources = {};
    var promises = [];

    function deferredAdder() {
        var deferred = when.defer();
        promises.push(deferred);
        return deferred;
    }

    function whenAllAdded(cb, eb) {
        when.all(promises).then(cb, eb);
    }

    function addResource(resource) {
        if (!bResource.isResource(resource)) {
            resource = bResource.create(resource.path, resource);
        }
        resources[resource.path] = resource;
        resourceSet[resourceSet.length++] = resource;
        return resource;
    }

    var resourceSet = {
        length: 0,
        rootPath: rootPath,

        /**
         * Add all resources in array resources. Returns a promise.
         */
        addResources: function (resources) {
            return when.all(resources.map(B.bind(this, "addResource")));
        },

        /**
         * Add single resource.
         *
         * Resource may be a resource object, a string, or an object of properties
         * supported by resource.create();
         *
         * When the resource is a string, it is passed on to addStringResource.
         *
         * When the resource is an object of properties to pass on to
         * resource.create(), a couple of additional properties are supported:
         *
         * - path    Path is passed as first argument to resource.create()
         * - combine Array of resources to combine. Fails if any of the
         *           referenced resources are not part of the resource set.
         * - file    Add file as resource.
         *
         * Returns a promise. Promise will be rejected if adding an invalid
         * resource (see resource#validate).
         */
        addResource: function (resource) {
            if (typeof resource == "string") {
                return this.addStringResource(resource);
            }
            var err = exports.validate(resource);
            if (err) return rejected(err);
            if (resource.file) {
                return this.addFileResource(resource.file, resource);
            }
            if (resource.combine) {
                return this.addCombinedResource(resource.combine, resource);
            }
            return when(addResource(resource));
        },

        /**
         * Add a string as a resource. String will be taken as glob, and
         * all resulting paths are added as files (relative to rootPath).
         *
         * Returns a promise. Promise is rejected if glob pattern matches
         * no files, or if adding any resource fails.
         */
        addStringResource: function (path) {
            var d = deferredAdder();
            fileResolver.resolvePaths(this, [path], function (e, paths) {
                if (e || paths.length == 0) {
                    return d.resolver.reject(e || {message:path + " matched no files"});
                }
                this.addFileResources(paths).then(B.bind(d.resolver, "resolve"),
                                                  B.bind(d.resolver, "reject"));
            });
            return d.promise;
        },

        /**
         * Adds an array of paths as file resources.
         *
         * Returns a promise.
         */
        addFileResources: function (paths, rs) {
            return when.all((paths || []).map(function (path) {
                return this.addFileResource(path, rs);
            }.bind(this)));
        },

        /**
         * Adds a resource from a file on disk. Resource argument is
         * optional and can contain path and headers etc.
         *
         * Returns a promise.
         */
        addFileResource: function (path, rs) {
            var d = deferredAdder();
            fileResolver.prepareResource(rootPath, path, rs || {}).then(function (res) {
                res.path = res.path || path;
                d.resolver.resolve(addResource(res));
            }.bind(this), B.bind(d.resolver, "reject"));
            return d.promise;
        },

        /**
         * Adds a resource that combines other resources' contents for
         * its contents
         */
        addCombinedResource: function (sources, resource) {
            var d = deferredAdder();
            combiner.prepareResource(this, sources, resource).then(function (res) {
                var resource = addResource(res);
                resource.combine = sources;
                d.resolver.resolve(resource);
            }, B.bind(d.resolver, "reject"));
            return d.promise;
        },

        /**
         * Get the resource at path. Path is normalized, so:
         * rs.get("foo.js") === rs.get("/foo.js")
         */
        get: function (path) {
            return resources[bResource.normalizePath(path)];
        },

        /**
         * Remove resource at path. Returns true when successfully removed,
         * false if resource does not exist. Also removes from load.
         */
        remove: function (path) {
            path = bResource.normalizePath(path);
            rotateIndices(this, resources[path]);
            this.length -= 1;
            delete resources[path];
        },

        /**
         * Serializes the resource set as a fully resolved data structure.
         * Suitable for transmission over the wire. Returns a promise.
         */
        serialize: function () {
            var d = when.defer();
            whenAllAdded(function () {
                when.all(this.map(serialize)).then(function (resources) {
                    d.resolver.resolve({ resources: resources });
                });
            }.bind(this), B.bind(d.resolver, "reject"));
            return d.promise;
        },

        /**
         * Merge resource set with others, returning a new resource set.
         */
        concat: function () {
            var sets = [this].concat([].slice.call(arguments));
            return sets.reduce(function (resourceSet, rs) {
                resourceSet.addResources(rs);
                resourceSet.loadPath.append(rs.loadPath.paths());
                return resourceSet;
            }, exports.create(this.rootPath));
        }
    };

    // Mix in enumerators from Array.prototype
    ["forEach", "map", "reduce", "filter"].forEach(function (method) {
        resourceSet[method] = Array.prototype[method];
    });

    resourceSet.loadPath = loadPath.create(resourceSet);
    return resourceSet;
};

/**
 * Validates properties on a resource.
 */
exports.validate = function (resource) {
    if (!resource) {
        return invalid("Resource must be a string, a resource " +
                       "object or an object of resource properties");
    }
    var count = setCount(resource, ["backend", "file", "combine", "content"]);
    if (count > 1) {
        return invalid("Resource can only have one of content, " +
                       "file, backend, combine");
    }
    if (!resource.path) {
        return invalid("Resource must have path");
    }
    if (!resource.combine && !resource.file) {
        return bResource.validate(resource);
    }
};

/**
 * De-serializes data structures created by serialize(). Returns a
 * resource set.
 */
exports.deserialize = function (data) {
    var d = when.defer();
    var rs = exports.create();
    var resources = data && data.resources || [];
    when.all((resources).map(B.bind(rs, "addResource"))).then(function () {
        rs.loadPath.append(data && data.load || []);
        d.resolver.resolve(rs);
    });
    return d.promise;
};

function setCount(resource, properties) {
    return properties.reduce(function (count, property) {
        return count + (resource[property] ? 1 : 0);
    }, 0);
}

function rejected(err) {
    var deferred = when.defer();
    deferred.resolver.reject(err);
    return deferred.promise;
}

function rotateIndices(rs, resource) {
    for (var i = 0, l = rs.length; i < l; ++i) {
        if (rs[i] == resource) {
            for (; i < l; ++i) {
                rs[i] = rs[i + 1];
            }
        }
    }
}

function serialize(resource) {
    var d = when.defer();
    resource.serialize().then(function (serialized) {
        if (resource.combine) {
            delete serialized.content;
            serialized.combine = resource.combine;
        }
        d.resolver.resolve(serialized);
    });
    return d.promise;
}
