var util = require('util');
var _ = require('lodash');
var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('dozer-model:object-proxy');
var q = require('q');
var bson = require('bson');
var ImmutableDate = require('bloody-immutable-date');
var ArrayProxy = require('./array-proxy');

function ObjectProxy(obj) {
  Object.defineProperty(this, '__obj', {
    enumerable: false,
    configurable: true,
    writable: false,
    value: {}
  });
  Object.defineProperty(this, '__changeListeners', {
    enumerable: false,
    configurable: true,
    writable: false,
    value: {}
  });
  if (_.isObject(obj)) {
    for (var p in this.__definition.properties) {
      if ('undefined' !== typeof obj[p]) {
        this[p] = obj[p];
      }
    }
  }
  var init = this.__definition.init || this.__definition.initialize;
  if (init && typeof init === 'function') {
    init.call(this);
  }
}

util.inherits(ObjectProxy, EventEmitter);

ObjectProxy.prototype.set = function (path /* or data */, value) {
  if (_.isObject(path) && !Array.isArray(path)) {
    for (var p in path) {
      this[p] = path[p];
    }
  } else {
    if (util.isString(path)) {
      path = path.split('.');
    } else if (!Array.isArray(path)) {
      path = [path];
    }
    var propertyDef = this.__definition.properties[path[0]];
    var type = propertyDef && propertyDef.type ? propertyDef.type : 'undefined';
    if (path.length === 1) {
      this[path[0]] = value;
    } else {
      if ('undefined' === typeof this[path[0]]) {
        if (type === 'array') {
          this[path[0]] = [];
        } else {
          this[path[0]] = {};
        }
      }
      if (path.length === 2) {
        this[path[0]][path[1]] = value;
      } else {
        var child = this[path.shift()];
        child.set(path, value);
      }
    }
  }
  return this;
};

ObjectProxy.prototype.get = function (path) {
  if (util.isString(path)) {
    path = path.split('.');
  } else if (!util.isArray(path)) {
    path = [path];
  }
  if (path.length === 1) {
    return this[path[0]];
  } else if (path.length === 2) {
    return this[path[0]][path[1]];
  } else {
    return this[path.shift()].get(path);
  }
};

ObjectProxy.prototype.has = function (path) {
  if (!util.isArray(path)) {
    path = path.split('.');
  }
  if (path.length === 1) {
    return path[0] in this;
  }
  return this.get(path.shift()).has(path);
};

ObjectProxy.prototype.toObject = function (options) {
  options = options || {};
  _.defaults(options, {
    virtuals: true
  });
  function objectify (val) {
    var r;
    if (val instanceof ArrayProxy) {
      r = val.toArray(options);
    } else if (val instanceof ObjectProxy) {
      r = val.toObject(options);
    } else if (val instanceof ImmutableDate) {
      // HACK ImmutableDate doesn't give us access to the underlying date, so
      // we have to refer to the private var
      r = val._date;
    } else {
      r = val;
    }
    return r;
  }
  var obj = {};
  for (var p in this.__definition.properties) {
    var propertyDef = this.__definition.properties[p];
    if (!options.virtuals && propertyDef.type === 'virtual') {
      continue;
    }
    var o = objectify(this[p]);
    if (typeof o !== 'undefined') {
      obj[p] = o;
    }
  }
  return obj;
};

ObjectProxy.prototype.toJSON = function (options) {
  options = options || {};
  _.defaults(options, {
    virtuals: true
  });
  function jsonify (val) {
    var r;
    if (val instanceof ImmutableDate) {
      r = { $date: val.toISOString() };
    } else  if (_.isRegExp(val)) {
      r = { $regex: val.toString() };
    } else if (val instanceof bson.ObjectID) {
      r = { $oid: val.toString() };
    } else if ('undefined' !== typeof val && _.isFunction(val.toJSON)) {
      r = val.toJSON(options);
    } else {
      r = val;
    }
    return r;
  }
  var obj = {};
  for (var p in this.__definition.properties) {
    var propertyDef = this.__definition.properties[p];
    if (!options.virtuals && propertyDef.type === 'virtual') {
      continue;
    }
    var o = jsonify(this[p]);
    if (typeof o !== 'undefined') {
      obj[p] = o;
    }
  }
  return obj;
};

ObjectProxy.create = function (definition) {
  var constr = function (obj) {
    ObjectProxy.call(this, obj);
  };
  util.inherits(constr, ObjectProxy);
  ObjectProxy.define(constr, definition);
  return constr;
};

ObjectProxy.define = function (constr, definition) {
  if (!definition && !definition.properties) {
    throw new Error('no properties defined in object definition');
  }
  for (var p in definition.properties) {
    var propertyDef = definition.properties[p];
    var type = propertyDef.type ?
      propertyDef.type.trim().toLowerCase() : '*';
    switch (type) {
      case 'array':
        ObjectProxy.defineArrayProperty(constr, p, propertyDef);
        break;
      case 'date':
        ObjectProxy.defineDateProperty(constr, p, propertyDef);
        break;
      case 'object':
        ObjectProxy.defineObjectProperty(constr, p, propertyDef);
        break;
      case 'virtual':
        ObjectProxy.defineVirtualProperty(constr, p, propertyDef);
        break;
      case 'objectid':
        ObjectProxy.defineObjectIdProperty(constr, p, propertyDef);
        break;
      case 'string':
      case 'number':
      case 'boolean':
      case 'any':
      case '*':
        ObjectProxy.defineProperty(constr, p, propertyDef);
        break;
    }
    propertyDef.type = type;
  }
  Object.defineProperty(constr.prototype, '__definition', {
    writable: false,
    enumerable: false,
    value: definition
  });
};

ObjectProxy.__protectReserved = function (name) {
  var reserved = ['set', 'get', 'has', 'toJSON', 'toObject'];
  if (reserved.indexOf(name) >= 0) {
    throw new Error('%s is a reserved property name and cannot be used');
  }
};

ObjectProxy.defineObjectProperty = function (constr, name, def) {
  ObjectProxy.__protectReserved(name);
  var _Proxy = ObjectProxy.create(def);
  Object.defineProperty(constr.prototype, name, {
    enumerable: true,
    get: function () {
      return this.__obj[name];
    },
    set: function (value) {
      var oldValue = this.__obj[name];
      if (this.__changeListeners[name]) {
        oldValue.removeListener('change', this.__changeListeners[name]);
      }
      this.__obj[name] = new _Proxy(value);
      this.__changeListeners[name] = function (event) {
        var newEvent = {
          path: name + '.' + event.path,
          object: this,
          value: event.value,
          oldValue: event.oldValue
        };
        this.emit('change', newEvent);
      }.bind(this);
      this.__obj[name].addListener('change', this.__changeListeners[name]);
      this.emit('change', {
        path: name,
        object: this,
        value: value,
        oldValue: oldValue
      });
    }
  });
};

ObjectProxy.defineArrayProperty = function (constr, name, def) {
  ObjectProxy.__protectReserved(name);
  var _Proxy = ArrayProxy.create(def);
  Object.defineProperty(constr.prototype, name, {
    enumerable: true,
    get: function () {
      return this.__obj[name];
    },
    set: function (value) {
      var oldValue = this.__obj[name];
      if (this.__changeListeners[name]) {
        oldValue.removeListener('change', this.__changeListeners[name]);
      }
      this.__obj[name] = new _Proxy(value);
      this.__changeListeners[name] = function (event) {
        var newEvent = _.clone(event);
        newEvent.path = event.name ? name + '.' + event.name : name;
        newEvent.object = this;
        this.emit('change', newEvent);
      }.bind(this);
      this.__obj[name].addListener('change', this.__changeListeners[name]);
      this.emit('change', {
        path: name,
        object: this,
        value: value,
        oldValue: oldValue
      });
    }
  });
};

ObjectProxy.defineDateProperty = function (constr, name, def) {
  ObjectProxy.__protectReserved(name);
  Object.defineProperty(constr.prototype, name, {
    enumerable: true,
    get: function () {
      return this.__obj[name];
    },
    set: function (value) {
      var oldValue = this.__obj[name];
      this.__obj[name] = new ImmutableDate(value);
      this.emit('change', {
        path: name,
        object: this,
        value: value,
        oldValue: oldValue
      });
    }
  });
};

ObjectProxy.defineVirtualProperty = function (constr, name, def) {
  ObjectProxy.__protectReserved(name);
  Object.defineProperty(constr.prototype, name, {
    enumerable: true,
    get: def.get,
    set: def.set
  });
};

ObjectProxy.defineObjectIdProperty = function (constr, name, def) {
  ObjectProxy.__protectReserved(name);
  Object.defineProperty(constr.prototype, name, {
    enumerable: true,
    get: function () {
      return this.__obj[name];
    },
    set: function (value) {
      var oldValue = this.__obj[name];
      this.__obj[name] = bson.ObjectID(value);
      this.emit('change', {
        path: name,
        object: this,
        value: value,
        oldValue: oldValue
      });
    }
  });
};

ObjectProxy.defineProperty = function (constr, name, def) {
  ObjectProxy.__protectReserved(name);
  Object.defineProperty(constr.prototype, name, {
    enumerable: true,
    get: function () {
      return this.__obj[name];
    },
    set: function (value) {
      var oldValue = this.__obj[name];
      this.__obj[name] = value;
      this.emit('change', {
        path: name,
        object: this,
        value: value,
        oldValue: oldValue
      });
    }
  });
};

module.exports = ObjectProxy;
