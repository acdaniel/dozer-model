var util = require('util');
var _ = require('lodash');
var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('dozer-model:array-proxy');
var ImmutableDate = require('bloody-immutable-date');

function _args (args) {
  for (var l = args.length, a = new Array(l), i = 0; i < l; i++) {
    a[i] = args[i];
  }
  return a;
};

function ArrayProxy (arr) {
  Object.defineProperty(this, '__arr', {
    enumerable: false,
    configurable: true,
    writable: false,
    value: []
  });
  if (Array.isArray(arr)) {
    arr.forEach(function (item, index) {
      this.push(item);
    }.bind(this));
  }
  Array.observe(this.__arr, function (changes) {
    changes.forEach(function (change) {
      var event = {
        object: this,
        type: change.type
      };
      if ('undefined' !== typeof change.name) { event.name = change.name; }
      if ('undefined' !== typeof change.oldValue) { event.oldValue = change.oldValue; }
      if ('undefined' !== typeof change.index) { event.index = change.index; }
      if ('undefined' !== typeof change.removed) { event.removed = change.removed; }
      if ('undefined' !== typeof change.addedCount) { event.addedCount = change.addedCount; }
      this.emit('change', event);
    }.bind(this));
  }.bind(this));
};

util.inherits(ArrayProxy, EventEmitter);

ArrayProxy.prototype.__wrapItem = function (item) {
  var type = this.__definition.items.type;
  if (this.__itemProxy) {
    item = new this.__itemProxy(item);
  } else if (type === 'date') {
    item = new ImmutableDate(item);
  }
  return item;
};

ArrayProxy.prototype.__unwrapItem = function (item) {
  var type = this.__definition.items.type;
  if (type === 'object') {
    item = item.toObject();
  } else if (type === 'date') {
    item = item._date;
  }
  return item;
}

ArrayProxy.prototype.set = function (path, value) {
  if (util.isString(path)) {
    path = path.split('.');
  } else if (!util.isArray(path)) {
    path = [path];
  }
  var type = this.__definition.items.type;
  var index = parseInt(path.shift(), 10);
  if (path.length === 0) {
    this.__arr[index] = this.__wrapItem(value);
    // TODO listen for changes on new item
  } else {
    if ('undefined' === typeof this.__arr[index]) {
      this.__arr[index] = this.__wrapItem({});
    }
    if (path.length === 1) {
      this.__arr[index][path[0]] = value;
    } else {
      this.__arr[index].set(path, value);
    }
  }
};

ArrayProxy.prototype.get = function (path) {
  if (util.isString(path)) {
    path = path.split('.');
  } else if (!util.isArray(path)) {
    path = [path];
  }
  var index = parseInt(path.shift(), 10);
  if (path.length === 0) {
    return this.__arr[index];
  } else if (path.length === 1) {
    return this.__arr[index][path[0]];
  } else {
    return this.__arr[index].get(path)
  }
};

ArrayProxy.prototype.pop = function () {
  var type = this.__definition.items.type;
  return this.__unwrapItem(this.__arr.pop());
};

ArrayProxy.prototype.push = function () {
  var args = _args(arguments).map(function (value) {
    return this.__wrapItem(value);
  }.bind(this));
  // TODO listen for changes on new items
  return Array.prototype.push.apply(this.__arr, args);
};

ArrayProxy.prototype.shift = function () {
  var type = this.__definition.items.type;
  return this.__unwrapItem(this.__arr.shift());
};

ArrayProxy.prototype.splice = function () {
  var type = this.__definition.items.type;
  var args = _args(arguments).map(function (arg, index) {
    if (index < 2) {
      return arg;
    } else {
      return this.__wrapItem(arg);
    }
  }.bind(this));
  // TODO listen for changes on new items
  var removed = Array.prototype.splice.apply(this.__arr, args);
  return removed.map(function (item) {
    return this.__unwrapItem(item);
  }.bind(this));
};

ArrayProxy.prototype.unshift = function () {
  var args = _args(arguments).map(function (value) {
    return this.__wrapItem(value);
  }.bind(this));
  // TODO listen for changes on new items
  return Array.prototype.unshift.apply(this.__arr, args);
};

ArrayProxy.prototype.reverse = function () {
  return Array.prototype.reverse.apply(this.__arr, _args(arguments));
};

ArrayProxy.prototype.sort = function () {
  return Array.prototype.sort.apply(this.__arr, _args(arguments));
};

ArrayProxy.prototype.concat = function () {
  return Array.prototype.concat.apply(this.__arr, _args(arguments));
};

ArrayProxy.prototype.join = function () {
  return Array.prototype.join.apply(this.__arr, _args(arguments));
};

ArrayProxy.prototype.toString = function () {
  return Array.prototype.toString.apply(this.__arr, _args(arguments));
};

ArrayProxy.prototype.toLocaleString = function () {
  return Array.prototype.toLocaleString.apply(this.__arr, _args(arguments));
};

ArrayProxy.prototype.indexOf = function () {
  return Array.prototype.indexOf.apply(this.__arr, _args(arguments));
};

ArrayProxy.prototype.lastIndexOf = function () {
  return Array.prototype.lastIndexOf.apply(this.__arr, _args(arguments));
};

ArrayProxy.prototype.forEach = function () {
  return Array.prototype.forEach.apply(this.__arr, _args(arguments));
};

ArrayProxy.prototype.every = function () {
  return Array.prototype.every.apply(this.__arr, _args(arguments));
};

ArrayProxy.prototype.some = function () {
  return Array.prototype.some.apply(this.__arr, _args(arguments));
};

ArrayProxy.prototype.filter = function () {
  return Array.prototype.filter.apply(this.__arr, _args(arguments));
};

ArrayProxy.prototype.map = function () {
  return Array.prototype.map.apply(this.__arr, _args(arguments));
};

ArrayProxy.prototype.reduce = function () {
  return Array.prototype.reduce.apply(this.__arr, _args(arguments));
};

ArrayProxy.prototype.reduceRight = function () {
  return Array.prototype.reduceRight.apply(this.__arr, _args(arguments));
};

ArrayProxy.prototype.toArray = function () {
  function arrify (val) {
    var r;
    if ('undefined' !== typeof val && _.isFunction(val.toArray)) {
      r = val.toArray();
    } else if ('undefined' !== typeof val && _.isFunction(val.toObject)) {
      r = val.toObject();
    } else if (val instanceof ImmutableDate) {
      // HACK ImmutableDate doesn't give us access to the underlying date, so
      // we have to refer to the private var
      r = val._date;
    } else {
      r = val;
    }
    return r;
  }
  return this.__arr.map(function (item) {
    return arrify(item);
  });
};

ArrayProxy.prototype.toJSON = function () {
  function jsonify (val) {
    var r;
    if (val instanceof ImmutableDate) {
      r = { $date: val.toISOString() };
    } else if ('undefined' !== typeof val && _.isFunction(val.toJSON)) {
      r = val.toJSON();
    } else  if (_.isRegExp(val)) {
      r = { $regex: val.toString() };
    } else {
      r = val;
    }
    return r;
  }
  return this.__arr.map(function (item) {
    return jsonify(item);
  });
};

ArrayProxy.create = function (definition) {
  var ObjectProxy = require('./object-proxy');
  var constr = function (arr) {
    ArrayProxy.call(this, arr);
  };
  util.inherits(constr, ArrayProxy);

  definition = definition || {};
  definition.items = definition.items || { type: '*' };

  Object.defineProperty(constr.prototype, 'length', {
    get: function () {
      return this.__arr.length;
    }
  });

  Object.defineProperty(constr.prototype, '__definition', {
    writable: false,
    enumerable: false,
    value: definition
  });

  if (definition.items.type === 'object') {
    Object.defineProperty(constr.prototype, '__itemProxy', {
      writable: false,
      enumerable: false,
      value: ObjectProxy.create(definition.items)
    });
  } else if (definition.items.type === 'array') {
    throw new Error('ArrayProxy does not support arrays as item types');
  }

  return constr;
};

module.exports = ArrayProxy;
