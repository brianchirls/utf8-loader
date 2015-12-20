var path = require("path");
module.exports = {
	entry: './entry.js',
	target: 'node',
	output: {
		path: path.join(__dirname, 'out'),
		filename: 'bundle.js'
	},
	module: {
		loaders: [
			{
				test: /\.(jpg|png)$/,
				loader: 'url-loader',
				query: {
					limit: 8192,
					name: 'images/[name].[ext]'
				}
			},
			{
				test: /\.json$/,
				loader: path.join(__dirname, "..")
			}
		]
	}
};
