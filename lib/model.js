var q = require('q');
var assign = require('object-assign');
var bson = require('bson');
var joi = require('joi');
var etag = require('etag');
var debug = require('debug')('dozer:model');
var objectPath = require('object-path');
var dozer = require('dozer-client')
var EJSON = require('mongodb-extended-json');
var defaults = require('defaults');
var clone = require('clone');
var Immutable = require('./immutable');

function define (definition) {

  definition = defaults(definition, {
    properties: {},
    methods: {},
    virtuals:{}
  });

  if (!definition.collectionUri && !definition.abstract) {
    throw new Error('A model must have a collectionUri unless defined as abstract');
  }

  definition.properties._id = {
    type: 'objectid'
  };

  definition.properties._etag = {
    type: 'string'
  };

  definition.virtuals.id = function () {
    return this._id ? this._id.toObject() : undefined;
  };

  definition._schema = _buildSchema(definition);

  return {

    create: function (data) {
      return _create(data, definition);
    },

    extend: function (superDef) {
      return _extend(definition, superDef);
    },

    isA: function (obj) {
      return Immutable.isImmutableType(obj, definition.name || 'object');
    },

    count: function (query, options) {
      query = assign({}, query, definition.where);
      options = options || {};
      options.count = true;
      options.query = query;
      var uri = definition.collectionUri;
      debug('counting ' + JSON.stringify(query) + ' in ' + uri);
      return dozer.get(uri, options)
        .then(function (result) {
          return result.count;
        }.bind(this));
    },

    find: function (query, options) {
      query = assign({}, query, definition.where);
      options = options || {};
      options.query = query;
      var uri = definition.collectionUri;
      debug('finding ' + JSON.stringify(query) + ' in ' + uri);
      return dozer.get(uri, options)
        .then(function (result) {
          return Immutable.create(result, { items: definition });
        }.bind(this));
    },

    findOne: function (query, options) {
      query = assign({}, query, definition.where);
      options = options || {};
      options.query = query;
      options.one = true;
      var uri = definition.collectionUri;
      debug('finding one' + JSON.stringify(query) + ' in ' + uri);
      return dozer.get(uri, options)
        .then(function (result) {
          if (!result) {
            return null;
          } else {
            return !result ? null : _create(result, definition);
          }
        }.bind(this));
    },

    remove: function (query, options) {
      query = assign({}, query, definition.where);
      options = options || {};
      options.query = query;
      var uri = definition.collectionUri;
      debug('removing ' + JSON.stringify(query) + ' from ' + uri);
      return dozer.del(uri, options);
    }

  };

};

function _create (data, definition) {

  var _modified = [];

  var _markAsModified = function (path) {
    if (Array.isArray(path)) {
      path = path.join('.');
    }
    var shouldAdd = true;
    _modified = _modified.filter(function (value) {
      shouldAdd = shouldAdd && !(path.indexOf(value + '.', 0) === 0);
      return !(value.indexOf(path + '.', 0) === 0);
    });
    if (shouldAdd) {
      _modified.push(path);
    }
  };

  definition.methods.isModified = function (path) {
    return path ? _modified.indexOf(path) > -1 : _modified.length > 0;
  };

  definition.methods.getModifiedPaths = function () {
    return _modified;
  };

  definition.methods.get = function (path) {
    return objectPath.get(this, path);
  };

  definition.methods.set = function (pathOrObj, value) {
    return this.mutate(function () {
      if ('undefined' === typeof value) {
        assign(this, pathOrObj);
        Object.keys(pathOrObj).forEach(function (item) {
          _markAsModified(item);
        });
      } else {
        objectPath.set(this, pathOrObj, value);
        _markAsModified(pathOrObj);
      }
    });
  };

  definition.methods.del = function (path) {
    return this.mutate(function () {
      objectPath.del(this, path);
      _markAsModified(path);
    });
  };

  definition.methods.has = function (path) {
    return objectPath.has(this, path);
  };

  definition.methods.toJSON = function (options) {
    options = defaults(options, {
      virtuals: true,
      extended: true
    });
    var obj = this.toObject();
    if (options.virtuals) {
      Object.keys(definition.virtuals).forEach(function (name) {
        var val = this[name];
        if ('undefined' === typeof val) { return; }
        if (val.__immutable) {
          obj[name] = val.toObject();
        } else {
          obj[name] = val;
        }
      }.bind(this));
    }
    return options.extended ? EJSON.inflate(obj) : obj;
  };

  definition.methods.validate = function (options) {
    var deferred = q.defer();
    options = defaults(options, {
      abortEarly: false,
      convert: false,
      allowUnknown: false,
      skipFunctions: true,
      stripUnknown: false,
    });
    joi.validate(this.toObject(), definition._schema, options, function (err, value) {
      if (err) { return deferred.reject(err); }
      deferred.resolve(value);
    });
    return deferred.promise;
  };

  definition.methods.save = function (options) {
    if (this._id && !this.isModified()) {
      return q.resolve(this);
    }
    return this.validate(options)
      .then(function (value) {
        var obj = this.toJSON({ virtuals: false });
        var newEtag = etag(JSON.stringify(obj));
        if (this._id) {
          var query = { _etag: this._etag };
          var uri = definition.collectionUri + '/' + this.id.toString();
          obj._etag = newEtag;
          debug('updating ' + uri + ': ' + JSON.stringify(obj));
          return dozer.put(uri, obj, { query: query })
            .then(function (result) {
              debug('update into ' + uri + ' successful');
              _modified = [];
              return this.set('_etag', newEtag);
            }.bind(this));
        } else {
          var uri = definition.collectionUri;
          obj._etag = newEtag;
          debug('inserting into ' + uri + ': ' + JSON.stringify(obj));
          return dozer.post(uri, obj)
            .then(function (result) {
              debug('insert into ' + definition.collectionUri + ' successful');
              _modified = [];
              return _create(Array.isArray(result.ops) ? result.ops[0] : result.ops, definition);
            }.bind(this));
        }
      }.bind(this));
  };

  definition.methods.remove = function (options) {
    var uri = definition.collectionUri;
    var query = { _id: this.id, _etag: this._etag };
    debug('removing ' + JSON.stringify(query) + ' in ' + uri);
    return dozer.del(uri, { query: query })
      .then(function (result) {
        debug('remove from ' + uri + ' successful');
        return result;
      }.bind(this));
  };

  return Immutable.create(data, definition);
};

function _extend (definition, superDef) {
  var newDef = definition;
  newDef.properties = defaults(newDef.properties, superDef.properties || {});
  newDef.methods = defaults(newDef.methods, superDef.methods || {});
  newDef.virtuals = defaults(newDef.virtuals, superDef.virtuals || {});
  return define(newDef);
};

module.exports = {
  define: define
};

function _buildSchema (definition) {
  var schema = {};
  for (var p in definition.properties) {
    var propertyDef = definition.properties[p];
    if (propertyDef.type !== 'virtual') {
      schema[p] = _buildPropertySchema(p, propertyDef);
    }
  }
  return schema;
}

function _buildPropertySchema (name, propertyDef) {
  var schema = null;
  switch (propertyDef.type.trim().toLowerCase()) {
    case 'array':
      schema = joi.array();
      if ('undefined' !== typeof propertyDef.items) {
        schema = schema.items(_buildPropertySchema(name + '.items', propertyDef.items));
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
            keys[p] = _buildPropertySchema(name + '.' + p, propertyDef.properties[p]);
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
