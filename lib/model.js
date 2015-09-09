var q = require('q');
var _ = require('lodash');
var util = require('util');
var joi = require('joi');
var etag = require('etag');
var debug = require('debug')('dozer-models:model');
var bson = require('bson');
var dozer = require('dozer').client

var ObjectProxy = require('./object-proxy');

function Model(data) {
  if (this.__definition.abstract) {
    throw new Error('An abstract model cannot be instantiated');
  }
  this.__modified = {};
  ObjectProxy.call(this, data);
  this.on('change', function (event) {
    this.markAsModified(event.path);
  }.bind(this));
}

util.inherits(Model, ObjectProxy);

Model.prototype.validate = function (options) {
  var deferred = q.defer();
  _.defaults(options, {
    abortEarly: false,
    convert: true,
    allowUnknown: false,
    skipFunctions: true,
    stripUnknown: true,
  });
  joi.validate(this.toObject({ virtuals: false }), this.__schema, options, function (err, value) {
    if (err) { return deferred.reject(err); }
    deferred.resolve(value);
  });
  return deferred.promise;
};

Model.prototype.markAsModified = function (path) {
  var partialPath = null;
  if (!util.isArray(path)) {
    path = path.split('.');
  }
  for (var i = 0, l = path.length - 1; i < l; i++) {
    partialPath = partialPath ? partialPath + '.' + path[i] : path[i];
    debug('marking ' + partialPath + ' as modified');
    this.__modified[partialPath] = true;
  }
  debug('marking ' + path.join('.') + ' as modified');
  this.__modified[path.join('.')] = true;
};

Model.prototype.isModified = function (path) {
  if (util.isArray(path)) {
    path = path.join('.');
  }
  return !path ? Object.keys(this.__modified).length > 0 : this.__modified[path];
};

Model.prototype.after = function (method, afterFunc) {
  var oFunc = this[method];
  this[method] = function composedFunc () {
    var val = oFunc.apply(this, arguments);
    if (q.isPromiseAlike(val)) {
      return val.then(function () {
        return afterFunc.apply(this, arguments);
      }.bind(this));
    } else {
      return afterFunc.apply(this, arguments);
    }
  }.bind(this);
};

Model.prototype.before = function (method, beforeFunc) {
  var oFunc = this[method];
  this[method] = function composedFunc () {
    var val = beforeFunc.apply(this, arguments);
    if (q.isPromiseAlike(val)) {
      return val.then(function () {
        return oFunc.apply(this, arguments);
      }.bind(this));
    } else {
      return oFunc.apply(this, arguments);
    }
  }.bind(this);
};

Model.prototype.save = function (options) {
  return this.validate(options)
    .then(
      function (value) {
        this.set(value);
        if (!this.isModified()) {
          return this;
        }
        var obj = this.toJSON({ virtuals: false });
        var newEtag = etag(JSON.stringify(obj));
        if (this._id) {
          var query = { _etag: this._etag };
          var $set = {};
          for (var p in this.__modified) {
            $set[p] = obj[p];
          }
          $set._etag = newEtag;
          var update = { $set: $set };
          var uri = this.__definition.collectionUri + '/' + this._id;
          debug('updating ' + uri + ': ' + JSON.stringify(update));
          return dozer.put(uri, update, { query: query })
            .then(function (result) {
              debug('update into ' + uri + ' successful');
              this._etag = newEtag;
              this.__modified = {};
              return this;
            }.bind(this));
        } else {
          var uri = this.__definition.collectionUri;
          obj._etag = newEtag;
          debug('inserting into ' + uri + ': ' + JSON.stringify(obj));
          return dozer.post(uri, obj)
            .then(function (result) {
              debug('insert into ' + this.__definition.collectionUri + ' successful');
              this.set(Array.isArray(result.ops) ? result.ops[0] : result.ops);
              this.__modified = {};
              return this;
            }.bind(this));
        }
      }.bind(this),
      function (err) {
        console.log(err);
        throw err;
      }.bind(this)
    );
};

Model.prototype.remove = function () {
  var uri = this.__definition.collectionUri;
  var query = { _id: this._id, _etag: this._etag };
  debug('removing ' + JSON.stringify(query) + ' in ' + uri);
  return dozer.del(uri, { query: query })
    .then(function (result) {
      debug('remove from ' + uri + ' successful');
      delete this.__obj._id;
      delete this.__obj._etag;
      this.__modified = {};
      return this;
    }.bind(this));
};

Model.define = function (definition, superModel) {
  var schema = {}
  _.defaults(definition, {
    abstract: false,
    final: false
  });

  if (!definition.name) {
    throw new Error('A model name is required');
  }

  definition.properties = definition.properties || {};
  definition.properties._id = { type: 'objectId' };
  definition.properties._etag = { type: 'string' };

  var constr = function (data) {
    constr.super_.apply(this, arguments);
  };

  if (superModel) {
    _.mixin(constr, superModel);
    util.inherits(constr, superModel);
    var superDef = superModel.prototype.__definition;
    if (!definition.collectionUri) {
      definition.collectionUri = superDef.collectionUri;
    }
    definition.where = _.assign({}, superDef.where, definition.where);
    _.defaults(definition.properties, superDef.properties);
  } else {
    util.inherits(constr, Model);
  }

  if (!definition.abstract && !definition.collectionUri) {
    throw new Error('A model must have a collectionUri unless marked as abstract');
  }

  ObjectProxy.define(constr, definition);

  for (var p in definition.properties) {
    var propertyDef = definition.properties[p];
    if (propertyDef.type !== 'virtual') {
      schema[p] = buildPropertySchema(p, propertyDef);
    }
  }

  Object.defineProperty(constr.prototype, '__schema', {
    writable: false,
    enumerable: false,
    value: schema
  });

  constr.create = function (data, options) {
    var doc = new constr(data);
    return doc.save(options);
  };

  constr.extend = function (definition) {
    return Model.define(definition, constr);
  };

  constr.count = function (query, options) {
    query = _.assign({}, query, definition.where);
    options = options || {};
    options.count = true;
    options.query = query;
    var uri = definition.collectionUri;
    debug('counting ' + JSON.stringify(query) + ' in ' + uri);
    return dozer.get(uri, options)
      .then(function (result) {
        return result.count;
      }.bind(this));
  };

  constr.find = function (query, options) {
    query = _.assign({}, query, definition.where);
    options = options || {};
    options.query = query;
    var uri = definition.collectionUri;
    debug('finding ' + JSON.stringify(query) + ' in ' + uri);
    return dozer.get(uri, options)
      .then(function (result) {
        return result.map(function (doc) {
          return new constr(doc);
        });
      }.bind(this));
  };

  constr.findOne = function (query, options) {
    query = _.assign({}, query, definition.where);
    options = options || {};
    options.query = query;
    options.one = true;
    var uri = definition.collectionUri;
    debug('finding one' + JSON.stringify(query) + ' in ' + uri);
    return dozer.get(uri, options)
      .then(function (result) {
        return new constr(result);
      }.bind(this));
  };

  constr.remove = function (query, options) {
    query = _.assign({}, query, definition.where);
    options = options || {};
    options.query = query;
    var uri = definition.collectionUri;
    debug('removing ' + JSON.stringify(query) + ' from ' + uri);
    return dozer.del(uri, options);
  };

  return constr;
};

module.exports = Model;

function buildPropertySchema (name, propertyDef) {
  var schema = null;
  switch (propertyDef.type.trim().toLowerCase()) {
    case 'array':
      schema = joi.array();
      if ('undefined' !== typeof propertyDef.items) {
        schema = schema.items(buildPropertySchema(name + '.items', propertyDef.items));
      }
      if ('undefined' !== typeof propertyDef.sparse) { schema = schema.sparse(propertyDef.sparse); }
      if (propertyDef.unique) { schema = schema.unique(); }
      break;
    case 'binary':
      schema = joi.binary();
      if ('undefined' !== typeof propertyDef.encoding) { schema = schema.encoding(propertyDef.encoding); }
      break;
    case 'boolean':
      schema = joi.boolean();
      break;
    case 'date':
      schema = joi.date();
      if (propertyDef.iso) { schema = schema.iso(); }
      if ('undefined' !== typeof propertyDef.format) { schema = schema.format(propertyDef.format); }
      break;
    case 'number':
      schema = joi.number();
      if ('undefined' !== typeof propertyDef.greater) { schema = schema.greater(propertyDef.greater); }
      if ('undefined' !== typeof propertyDef.less) { schema = schema.less(propertyDef.less); }
      if ('undefined' !== typeof propertyDef.integer) { schema = schema.integer(propertyDef.integer); }
      if ('undefined' !== typeof propertyDef.precision) { schema = schema.precision(propertyDef.precision); }
      if ('undefined' !== typeof propertyDef.multiple) { schema = schema.multiple(propertyDef.multiple); }
      if (propertyDef.negative) { schema = schema.negative(); }
      if (propertyDef.positive) { schema = schema.positive(); }
      break;
    case 'object':
      schema = joi.object();
      if ('undefined' !== typeof propertyDef.constr) {
        schema = schema.type(propertyDef.constr);
      }
      if ('undefined' !== typeof propertyDef.properties) {
        var keys = {};
        for (var p in propertyDef.properties) {
          if (propertyDef.properties[p].type !== 'virtual') {
            keys[p] = buildPropertySchema(name + '.' + p, propertyDef.properties[p]);
          }
        }
        schema = schema.keys(keys);
      }
      if ('undefined' !== typeof propertyDef.unknown) { schema = schema.unknown(propertyDef.unknown); }
      if ('undefined' !== typeof propertyDef.rename) { schema = schema.rename(propertyDef.rename); }
      if ('undefined' !== typeof propertyDef.requiredKeys) { schema = schema.requiredKeys(propertyDef.requiredKeys); }
      break;
    case 'string':
      schema = joi.string();
      if (propertyDef.insensitive) { schema = schema.insensitive(); }
      if (propertyDef.creditCard) { schema = schema.creditCard(); }
      if ('undefined' !== typeof propertyDef.regex) { schema = schema.regex(propertyDef.regex); }
      if (propertyDef.alphanum) { schema = schema.alphanum(); }
      if (propertyDef.token) { schema = schema.token(); }
      if (propertyDef.email) { schema = schema.email(); }
      if (propertyDef.guid) { schema = schema.guid(); }
      if (propertyDef.hostname) { schema = schema.hostname(); }
      if (propertyDef.lowercase) { schema = schema.lowercase(); }
      if (propertyDef.uppercase) { schema = schema.uppercase(); }
      if (propertyDef.trim) { schema = schema.trim(); }
      break;
    case 'objectid':
      schema = joi.object().type(bson.ObjectId);
    case 'any':
    case '*':
      schema = joi.any();
      break;
    default:
      throw new Error('Invalid type (' + propertyDef.type + ') for property ' + name);
  }
  if ('undefined' !== typeof propertyDef.min) { schema = schema.min(propertyDef.min); }
  if ('undefined' !== typeof propertyDef.max) { schema = schema.max(propertyDef.max); }
  if ('undefined' !== typeof propertyDef.length) { schema = schema.length(propertyDef.length); }
  if ('undefined' !== typeof propertyDef.allow) { schema = schema.allow(propertyDef.allow); }
  if ('undefined' !== typeof propertyDef.valid) { schema = schema.valid(propertyDef.valid); }
  if ('undefined' !== typeof propertyDef.invalid) { schema = schema.invalid(propertyDef.invalid); }
  if (propertyDef.forbidden) { schema = schema.forbidden(); }
  if (propertyDef.strip) { schema = schema.strip(); }
  if (propertyDef.required) { schema = schema.required(); }
  if ('undefined' !== typeof propertyDef.strict) { schema = schema.strict(propertyDef.strict); }
  if ('undefined' !== typeof propertyDef.label) { schema = schema.label(propertyDef.label); }
  if (propertyDef.raw) { schema = schema.raw(); }
  if ('undefined' !== typeof propertyDef.default) { schema = schema.default(propertyDef.default, 'default'); }
  return schema;

}
