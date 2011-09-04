var config = module.exports;

config["Tests"] = {
    environment: "node",
    load: [
        "lib/**/*.js",
        "test/**/*-test.js"
    ]
}