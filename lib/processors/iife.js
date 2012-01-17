module.exports = function (xports) {
    return function (resource, content) {
        var glbl = "", args = "", exportStmt = "";
        if (xports && xports.length > 0) {
            glbl = "typeof global != \"undefined\" ? global : this";
            args = "__GLOBAL";
            exportStmt = xports.map(function (variable) {
                return "__GLOBAL." + variable + "=" + variable + ";";
            }).join("");
            exportStmt = !/;\s*$/.test(content) ? ";" + exportStmt : exportStmt;
        }

        return "(function (" + args + ") {" + content + exportStmt + "}(" +
            glbl + "));";
    };
};
