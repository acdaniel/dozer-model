var defaults = require('defaults');
var clone = require('clone');

var IMMUTABLE_TYPES = [ 'function', 'string', 'boolean', 'number', 'undefined' ];

function isImmutable (value) {
  if ('undefined' === typeof value) { return true; }
  return (IMMUTABLE_TYPES.indexOf(typeof value) > -1 || !!value.__immutable);
}

function isImmutableType (value, type) {
  return value && value.__immutable && value.__type === type;
}

function create (data, definition, options) {
  if (isImmutable(data)) {
    return data;
  }

  options = defaults(options, {
    clone: true
  });

  if (options.clone) {
    data = clone(data);
  }

  var props = {
    __type: {
      enumerable: false,
      value: 'object'
    },
    __immutable: {
      enumerable: false,
      value: true
    },
    toObject: {
      enumerable: false,
      value: function () {
        return data;
      }
    },
    mutate: {
      enumerable: false,
      value: function (cb) {
        var obj = clone(data);
        cb.apply(obj);
        return create(obj, definition, { clone: false });
      }
    }
  };

  if (definition) {
    props.__definition = {
      enumerable: false,
      value: create(definition)
    };
    if (definition.name) {
      props.__type.value = definition.name;
    }
    if (definition.properties) {
      Object.keys(definition.properties).forEach(function (prop) {
        var propertyDef = definition.properties[prop];
        var defaultVal = propertyDef.default;
        if ('undefined' === typeof data[prop] && 'undefined' !== typeof defaultVal) {
          data[prop] = 'function' === typeof defaultVal ? defaultVal.call(data) : defaultVal;
        }
      });
    }
    if (definition.virtuals) {
      Object.keys(definition.virtuals).forEach(function (virtual) {
        var virtualFunc = definition.virtuals[virtual];
        props[virtual] = _defineProp(virtual, function () {
          return virtualFunc.call(this);
        });
      });
    }
    if (definition.methods) {
      Object.keys(definition.methods).forEach(function (method) {
        var methodFunc = definition.methods[method];
        props[method] = _defineProp(method, function () {
          return methodFunc.bind(this);
        }, { enumerable: false });
      });
    }
  }

  // Object.keys(data).forEach(function (name) {
  function addProp(name) {
    if (Object.hasOwnProperty(props, name)) {
      throw new Error('Property ' + name + ' has already been defined');
    }
    var value = data[name];
    if ('function' === typeof value) { return; }
    var propertyDef = definition && definition.properties ?
      definition.properties[name] : undefined;
    var getter = function () {
      return (value = create(value, propertyDef, { clone: false }));
    };
    var options = {};
    if (propertyDef && 'undefined' !== typeof propertyDef.enumerable) {
      options.enumerable = propertyDef.enumerable;
    }
    props[name] = _defineProp(name, getter, options);
  }
  for (var p in data) {
    addProp(p);
  }
  // });

  if (Array.isArray(data)) {
    _defineArray(data, props, definition);
  } else if (data instanceof Date) {
    _defineDate(data, props);
  }

  return Object.freeze(
    Object.create(Object.prototype, props)
  );

}

module.exports = {
  create: create,
  isImmutable: isImmutable,
  isImmutableType: isImmutableType
};

function _defineProp (name, get, options) {
  options = defaults(options, { enumerable: true });
  options.get = get;
  options.set = function () {
    throw new Error('Cannot modify an immutable object');
  };
  return options;
}

function _defineArray (arr, props, definition) {
  props.__type.value = 'array';

  props.length = _defineProp('length', function () {
    return arr.length;
  });
  var itemDefinition = definition ? definition.items || {} : {};

  ['forEach', 'map', 'filter', 'some', 'every'].forEach(function (name) {
    props[name] = _defineProp(name, function () {
      return function (cb, thisArg) {
        var immuArr = create(arr, definition);
        return create(Array.prototype[name].call(arr, function (val, index) {
          return cb.call(thisArg, create(val, itemDefinition, { clone: false }), index, immuArr);
        }));
      };
    });
  });

  ['reduce', 'reduceRight'].forEach(function (name) {
    props[name] = _defineProp(name, function () {
      return function (cb, initialValue) {
        var immuArr = create(arr, definition);
        return create(Array.prototype[name].call(arr, function (prev, cur, index) {
          return cb(create(prev), create(cur, itemDefinition, { clone: false }), index, immuArr);
        }));
      }.bind(this);
    });
  });

  ['concat', 'join', 'slice', 'indexOf', 'lastIndexOf', 'reverse', 'toString', 'toLocaleString'].forEach(function (name) {
    props[name] = _defineProp(name, function () {
      return function () {
        return create(Array.prototype[name].apply(arr, arguments), definition);
      };
    });
  });

  props.push = _defineProp('push', function () {
    return function () {
      return create(Array.prototype.concat.apply(arr, arguments), definition);
    };
  });

  props.unshift = _defineProp('unshift', function () {
    return function () {
      var args = Array(arguments.length);
      for (var i = 0, l = arguments.length; i < l; i++) {
        args[i] = arguments[i];
      }
      return create(args.concat(arr), definition);
    };
  });

  props.sort = _defineProp('sort', function () {
    return function (cb) {
      var newArr = clone(arr);
      if (!cb) {
        return create(newArr.sort(), definition);
      }
      return create(newArr.sort(function (a, b) {
        return cb(create(a), create(b));
      }));
    };
  });

  props.splice = _defineProp('splice', function () {
    return function () {
      var args = Array(arguments.length);
      for (var i = 0, l = arguments.length; i < l; i++) {
        args[i] = arguments[i];
      }
      var start = args[0];
      var deleteCount = args[1];
      var items = args.slice(2) || [];
      var front = arr.slice(0, start);
      var back = arr.slice(start + deleteCount);

      return create(front.concat(items, back), definition);
    }
  });

  props.reverse = _defineProp('reverse', function () {
    return function () {
      var newArr = clone(arr);
      return create(newArr.reverse(), definition);
    };
  });

}

function _defineDate (date, props) {
  props.__type.value = 'date';

  props.mutate.value = function (cb) {
    var newDate = new Date(date.valueOf());
    cb.apply(newDate);
    return create(newDate, null, { clone: false });
  };

  ['toString', 'toISOString', 'toUTCString', 'toDateString', 'toTimeString',
  'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'valueOf',
  'getTime', 'getFullYear', 'getUTCFullYear', 'toGMTString', 'getMonth',
  'getUTCMonth', 'getDate', 'getUTCDate', 'getDay', 'getUTCDay', 'getHours',
  'getUTCHours', 'getMinutes', 'getUTCMinutes', 'getSeconds', 'getUTCSeconds',
  'getMilliseconds', 'getUTCMilliseconds', 'getTimezoneOffset', 'getYear',
  'toJSON'].forEach(function (name) {
    props[name] = _defineProp(name, function () {
      return function () {
        var args = Array(arguments.length);
        for (var i = 0, l = args.length; i < l; i++) {
          args[i] = arguments[i];
        }
        return Date.prototype[name].apply(date, args);
      };
    });
  });

  ['setTime', 'setMilliseconds', 'setUTCMilliseconds', 'setSeconds',
  'setUTCSeconds', 'setMinutes', 'setUTCMinutes', 'setHours', 'setUTCHours',
  'setDate', 'setUTCDate', 'setMonth', 'setUTCMonth', 'setFullYear',
  'setUTCFullYear', 'setYear'].forEach(function (name) {
    props[name] = _defineProp(name, function () {
      return function () {
        var args = Array(arguments.length);
        for (var i = 0, l = args.length; i < l; i++) {
          args[i] = arguments[i];
        }
        var newDate = new Date(date.valueOf());
        newDate[name].apply(newDate, args);
        return create(newDate);
      };
    });
  });
}
