var resourceSet = require("./resource-set");

module.exports = {
    RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",

    createResourceSet: function (data) {
        var r = resourceSet.create(data, this);
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
            if ("etag" in resource) {
                this.removedEtagResources.push(resource);
            }
        }
    },

    getResource: function (path, cb) {
        for (var i = 0, ii = this.resourceSets.length; i < ii; i++) {
            if (this.resourceSets[i].getResource(path, cb)) return;
        }

        cb(this.RESOURCE_NOT_FOUND);
    },

    getResourceViaHttp: function (req, res) {
        for (var i = 0, ii = this.resourceSets.length; i < ii; i++) {
            if (this.resourceSets[i].getResourceViaHttp(req, res)) return true;
        }
    },

    gc: function () {
        this.removedEtagResources.length = 0;
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

    getResourceForPathWithEtag: function (path, etag) {
        for (var i = 0, ii = this.resourceSets.length; i < ii; i++) {
            var resources = this.resourceSets[i].resources;
            for (var key in resources) {
                var resource = resources[key];
                if ("etag" in resource) {
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

        throw new Error("Resource with path '" + path + "' and etag '" + etag + "' not found.");
    },

    startCacheInvalidationTimeout: function () {
        var self = this;
        setTimeout(function () {
            self.invalidateCache();
            self.startCacheInvalidationTimeout();
        }, this.cacheInvalidationTimeout || 3600000);
    },

    invalidateCache: function () {
        var now = new Date().getTime();

        var notInvalid = [];
        for (var i = 0, ii = this.removedEtagResources.length; i < ii; i++) {
            var resource = this.removedEtagResources[i];
            if ((now - resource.timestamp) <= this.cacheInvalidationAge) {
                notInvalid.push(resource);
            }
        }

        this.removedEtagResources = notInvalid;
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