var whenNode = require("when/node/function");
var fs = require("fs");
var glob = require("./file").expand;
var Path = require("path");
var fileEtag = require("./file-etag");

function partial(fn, arg) {
    return fn.bind(null, arg);
}

function addUnique(arr1, arr2) {
    arr1 = arr1 || [];
    (arr2 || []).forEach(function (item) {
        if (arr1.indexOf(item) < 0) { arr1.push(item); }
    });
    return arr1;
}

function relativePath(rootPath, path) {
    return Path.relative(rootPath, path || "");
}

function absolutePath(rootPath, path) {
    return Path.resolve(rootPath, path || "");
}

function outsideRoot(rootPath, path) {
    return path.indexOf(rootPath) < 0;
}

function outsideRootError(rootPath, paths) {
    var offendingPaths = paths.filter(partial(outsideRoot, rootPath));
    if (offendingPaths.length === 0) { return; }
    var plural = offendingPaths.length > 1 ? "Some paths are " : "A path is ";
    var offending = offendingPaths.map(partial(Path.relative, rootPath));

    return new Error(plural + "outside the project root. Set rootPath to " +
                     "the desired root to refer to paths outside of " +
                     rootPath + ".\n  " + offending.join("\n  "));
}

function resolvePaths(rs, paths, callback, options) {
    options = options || {};
    // make sure, that glob always get relative paths
    var relativePaths = paths.map(function (p) {
        return p.replace(/^\//, "");
    });
    var files;
    try {
        files = glob({
            cwd : rs.rootPath,
            strict : options.strict
        }, relativePaths);
    } catch (e) {
        return callback.call(rs, e);
    }

    var ms = files.map(partial(absolutePath, rs.rootPath));
    var err = outsideRootError(rs.rootPath, ms);
    if (err) { return callback.call(rs, err); }
    ms = ms.filter(function (file) {
        var stat = fs.statSync(file);
        return stat.isFile();
    });
    ms = ms.map(partial(relativePath, rs.rootPath));
    ms = addUnique(ms, rs.matchPaths(paths));
    callback.call(rs, err, ms);
}

function fileReader(fileName) {
    return function () {
        return whenNode.call(fs.readFile.bind(fs), fileName, this.encoding);
    };
}

function prepareResource(rootPath, path, resource) {
    var fileName = absolutePath(rootPath, path);
    resource.content = fileReader(fileName);
    return whenNode.call(fileEtag.add.bind(fileEtag), fileName, resource)
        .then(function () {
            return resource;
        });
}

module.exports = {
    resolvePaths: resolvePaths,
    relativePath: relativePath,
    absolutePath: absolutePath,
    prepareResource: prepareResource
};
