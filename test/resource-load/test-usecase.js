
var Load = function(url, callback){
	var tag = document.createElement('script');
	tag.src = url;
	tag.onload = tag.onerror = callback;
	document.querySelector('head').appendChild(tag);
}


buster.testCase('Resource Loading',{
	'A Letter': function(done){
		Load('resource-load/letters/a/a.js', function(){
			assert.equals(window.Letter, 'A');
			done();
		});
	}
})