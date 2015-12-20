/*
Run this through iron-node for debugging
*/

var webpack = require('webpack');
var config = require('./webpack.config');

var path = require('path');
config = {
	entry: path.resolve(__dirname, '../index.js') + '!' +
		path.resolve(__dirname, './model/hand.json'),
	output: {
		path: __dirname + '/out',
		filename: 'bundle.js'
	}
};

webpack(config, function (err, stats) {
	debugger;
	if (err) {
		throw err;
	}
	stats = stats.toJson();
	console.log(stats);
});
