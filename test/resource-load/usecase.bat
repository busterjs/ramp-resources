START node ../../node_modules/buster/bin/buster-server

timeout 5 

explorer http://localhost:1111/capture &

timeout 5 

node ../../node_modules/buster/bin/buster-test --config buster-usecase.js