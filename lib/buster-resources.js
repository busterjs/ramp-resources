var resourceSet = require("./resource-set");
var resource = require("./resource");

module.exports = {
    createResourceSet: function (data) {
        var r = resourceSet.create(data);

        for (var path in r.resources) {
            var resource = r.resources[path];
            if ("etag" in resource && !("content" in resource)) {
                if (!getResourceForPathWithEtag.call(this, path, resource.etag)) {
                    throw new Error("Resource with path '" + path
                                    + "' and etag '" + resource.etag
                                    + "' not found.");
                }
            }
        }

        this.resourceSets.push(r);
        return r;
    },

    removeResourceSet: function (resourceSet) {
        for (var i = 0, ii = this.resourceSets.length; i < ii; i++) {
            if (this.resourceSets[i] == resourceSet) {
                this.resourceSets.splice(i, 1);
                break;
            }
        }

        for (var path in resourceSet.resources) {
            var resource = resourceSet.resources[path];
            if ("etag" in resource && "content" in resource) {
                this.removedEtagResources.push(resource);
            }
        }
    },

    getResource: function (path, cb) {
        var self = this;
        for (var i = 0, ii = this.resourceSets.length; i < ii; i++) {
            if (this.resourceSets[i].getResource(path, function (err, resource) {
                if (err) {
                    if (err != resourceSet.RESOURCE_NOT_FOUND) {
                        cb(err, resource);
                    }
                } else {
                    cb(err, resource);
                }
            })) return;
        }

        for (var i = 0, ii = this.resourceSets.length; i < ii; i++) {
            if (getCachedResource.call(this, this.resourceSets[i], path, cb)) return;
        }

        cb(resourceSet.RESOURCE_NOT_FOUND);
    },

    getResourceViaHttp: function (req, res) {
        for (var i = 0, ii = this.resourceSets.length; i < ii; i++) {
            if (this.resourceSets[i].getResourceViaHttp(req, res)) return true;
        }

        for (var i = 0, ii = this.resourceSets.length; i < ii; i++) {
            if (getCachedResource.call(this, this.resourceSets[i], req.url, function (err, resource) {
                res.writeHead(200, resource.headers);
                res.write(resource.content);
                res.end();
            })) return true;
        }
    },

    gc: function () {
        this.removedEtagResources.length = 0;
    },

    validateResourceSet: function (data) {
        return resourceSet.validate(data);
    },

    validateResource: function (data) {
        return resource.validate(data);
    },

    getCachedResources: function () {
        var output = {};
        for (var i = 0, ii = this.resourceSets.length; i < ii; i++) {
            var resources = this.resourceSets[i].resources;
            for (var key in resources) {
                var resource = resources[key];
                if ("etag" in resource) {
                    output[resource.path] = output[resource.path] || [];
                    output[resource.path].push(resource.etag);
                }
            }
        }

        for (var i = 0, ii = this.removedEtagResources.length; i < ii; i++) {
            var resource = this.removedEtagResources[i];
            output[resource.path] = output[resource.path] || [];
            output[resource.path].push(resource.etag);
        }

        return output;
    },

    get resourceSets() {
        return this._resourceSets || (this._resourceSets = []);
    },

    get removedEtagResources() {
        return this._cachedRes || (this._cachedRes = []);
    },

    set removedEtagResources(data) {
        this._cachedRes = data;
    }
};


function getCachedResource(resourceSet, requestedPath, cb) {
    for (var path in resourceSet.resources) {
        if (resourceSet.contextPath + path != requestedPath) continue;
        var resource = resourceSet.resources[path];
        if ("etag" in resource && !("content" in resource)) {
            var cachedResource = getResourceForPathWithEtag.call(this, path, resource.etag);
            if (cachedResource) {
                resourceSet.getResourceContent(cachedResource, null, cb);
                return true;
            }
        }
    }
}

function getResourceForPathWithEtag(path, etag) {
    for (var i = 0, ii = this.resourceSets.length; i < ii; i++) {
        var resources = this.resourceSets[i].resources;
        for (var key in resources) {
            var resource = resources[key];
            if ("etag" in resource && "content" in resource) {
                if (resource.path == path && resource.etag == etag) {
                    return resource;
                }
            }
        }
    }

    for (var i = 0, ii = this.removedEtagResources.length; i < ii; i++) {
        var resource = this.removedEtagResources[i];
        if (resource.path == path && resource.etag == etag) {
            return resource;
        }
    }
}