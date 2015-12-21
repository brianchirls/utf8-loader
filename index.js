/*
UTF8 Model Loader for webpack
*/

'use strict';

const fs = require('fs');
const path = require('path');
const loaderUtils = require('loader-utils');
const esprima = require('esprima');
const escodegen = require('escodegen');

const dataUriRegex = /^data:image\/(?:png|jpe?g|gif);/
const urlRegex = require('./lib/url-regex');
const textureFields = [
	'map_Kd',
	'map_bump',
	'bump'
];
// const codeGenOpts = {
// 	format: {
// 		compact: true
// 	}
// };

function each(obj, callback) {
	if (obj && typeof obj.hasOwnProperty === 'function') {
		for (let k in obj) {
			if (obj.hasOwnProperty(k)) {
				callback(obj[k], k);
			}
		}
	}
}

function traverseAST(node, callbacks, path) {
	if (!callbacks) {
		return;
	}

	if (!path) {
		path = [];
	}

	if (node.type === 'Program') {
		node.body.forEach(function (statement) {
			traverseAST(statement, callbacks, path);
		});
		return;
	}

	if (node.type === 'ExpressionStatement') {
		traverseAST(node.expression, callbacks, path);
		return;
	}

	const pathKey = path.join('|');
	callbacks.forEach(function (cb) {
		if (cb.regex.test(pathKey)) {
			cb.callback(node, path);
		}
	});

	if (node.type === 'ObjectExpression') {
		node.properties.forEach(function (property, index) {
			const key = property.key.value;
			const nextPath = path.slice();
			nextPath.push(key)
			traverseAST(property.value, callbacks, nextPath);
		});
	} else if (node.type === 'ArrayExpression') {
		node.elements.forEach(function (element, index) {
			const nextPath = path.slice();
			nextPath.push(index)
			traverseAST(element, callbacks, nextPath);
		});
	}

	/*
	Don't expect we'll see any other types if this is JSON
	todo: throw an error if not JSON?
	*/
}

function isRelative(url) {
	return url && !dataUriRegex.test(url) && !urlRegex.test(url);
}

module.exports = function (source) {
	if(!this.emitFile) {
		throw new Error('emitFile is required from module system');
	}

	const options = loaderUtils.parseQuery(this.query) || {};
	const self = this;
	// const imageLoader = options.imageLoader === undefined ? 'url-loader?limit=8192' : options.imageLoader;
	const geometrySizes = {};

	if (this.cacheable) {
		this.cacheable();
	}

	try {
		// get image sizes up front and store them in each material
		const modelInfo = JSON.parse(source);
		if (modelInfo.materials) {
			Object.keys(modelInfo.materials).forEach(function (mat) {
				const material = modelInfo.materials[mat];
				for (let field of textureFields) {
					const tex = material[field]
					if (tex) {
						// get file size
						const imagePath = path.resolve(self.context, tex);
						const stats = fs.statSync(imagePath);
						material[field + '_size'] = stats.size;
					}
				}
			});
			source = JSON.stringify(modelInfo);
		}

		const syntax = esprima.parse('(' + source + ')');

		traverseAST(syntax, [
			{
				regex: /^materials\|[^\|]+\|(map_Kd|(map_)?bump)$/,
				callback: function (node, path) {
					const url = node.value;
					if (isRelative(url)) {
						node.type = 'CallExpression';
						node.callee = {
							'type': 'Identifier',
							'name': 'require'
						};
						// const loader = imageLoader ? imageLoader + '!' : '';
						// const requireValue = loader + './' + node.value;
						const requireValue = './' + node.value;
						node.arguments = [
							{
								type: 'Literal',
								value: requireValue,
								raw: '"' + requireValue + '"' //todo: escape this or something?
							}
						];
					}
				}
			},
			{
				regex: /^urls$/,
				callback: function (node) {
					node.properties.forEach(function (property) {
						const key = property.key;
						const utf8Path = path.resolve(self.context, key.value);
						const utf8Content = fs.readFileSync(utf8Path);

						/*
						todo: allow changing of utf8 file name in the same way
						loaderUtils.interpolateName works. default to [name].[hash].[ext]
						https://github.com/webpack/loader-utils/blob/master/index.js#L229
						*/

						self.addDependency(utf8Path);
						self.emitFile(key.value, utf8Content);
						//key.value = url;
						//key.raw = '"./' + url + '"' //todo: escape this or something?

						// get file size
						geometrySizes[loaderUtils.stringifyRequest(self, key.value)] = utf8Content.byteLength;
					});
				}
			}
		]);

		// extend JSON with file sizes
		const fileSizeSyntax = esprima.parse('(' + JSON.stringify({
			geometrySizes
		}) + ')');
		const modelInfoProperties = syntax.body[0].expression.properties;
		const fileSizeProperties = fileSizeSyntax.body[0].expression.properties;
		Array.prototype.push.apply(modelInfoProperties, fileSizeProperties);

		source = escodegen.generate(syntax);
	} catch (e) {
		console.log('error parsing', e);
		//todo: emitError if parsing fails
	}

	return 'module.exports = ' + source + ';';
};
module.exports.raw = true;
