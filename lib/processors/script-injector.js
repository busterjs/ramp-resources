module.exports = {
    process: function (html) {
        if (html instanceof Buffer) {
            html = html.toString("utf8");
        }

        var bodyTag = "</body>";
        var beforeBodyEnd = html.slice(0, html.indexOf(bodyTag));
        var afterBodyEnd = html.slice(beforeBodyEnd.length + bodyTag.length);
        var scriptsHtml = "";

        var scripts = this.scripts();
        for (var i = 0, ii = scripts.length; i < ii; i++) {
            scriptsHtml += '<script src="' + scripts[i] + '" type="text/javascript"></script>\n';
        }

        return beforeBodyEnd + scriptsHtml + afterBodyEnd;
    }
};