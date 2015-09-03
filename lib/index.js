var fs = require('fs');
var path = require('path');

exports.Model = require('./model');
exports.ArrayProxy = require('./array-proxy');
exports.DateProxy = require('./date-proxy');
exports.ObjectProxy = require('./object-proxy');

exports.load = function (dir) {
  var models = {};
  var modelFiles = fs.readdirSync(dir);
  for (var i = 0, l = modelFiles.length; i < l; i++) {
    var model = require(path.resolve(dir, modelFiles[i]));
    models[model.__name] = model;
  }
  return models;
};
