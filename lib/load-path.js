var buster = require("buster");
var partial = buster.partial;
var resource = require("./resource");
var invalid = require("./invalid-error");

/**
 * Manipulate the load path of resource sets
 */
exports.create = function (resourceSet) {
    function getExistingPath(path) {
        var rs = resourceSet.get(path);
        if (!rs) {
            throw invalid("Cannot add non-existent resource " + path +
                          "to load path");
        }
        return rs.path;
    }

    function newPath(path) {
        return paths.indexOf(path) < 0;
    }

    function array(thing) {
        return Array.isArray(thing) ? thing : [thing];
    }

    var paths = [];
    function push(item) { paths.push(item); }
    function unshift(item) { paths.unshift(item); }

    return {
        /**
         * Append paths to load. If any path is not added as a
         * resource, method throws an error.
         */
        append: function (paths) {
            array(paths).map(getExistingPath).filter(newPath).forEach(push);
        },

        /**
         * Prepend paths to load. If any path is not added as a
         * resource, method throws an error.
         */
        prepend: function (paths) {
            array(paths).map(getExistingPath).filter(newPath).forEach(unshift);
        },

        /**
         * Remove resource from load array.
         */
        remove: function (path) {
            var index = paths.indexOf(path);
            if (index < 0) { return; }
            paths.splice(index, 1);
        },

        clear: function () {
            paths.length = 0;
        },

        toString: function () {
            return "[" + paths.join(", ") + "]";
        },

        paths: function () {
            return paths.slice(0);
        }
    };
};
