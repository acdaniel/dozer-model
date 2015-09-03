var chai = require('chai');

chai.use(require('chai-datetime'));
var expect = chai.expect;

describe('ObjectProxy', function () {

  var ImmutableDate = require('bloody-immutable-date');
  var ObjectProxy = require('../lib/object-proxy');
  var ArrayProxy = require('../lib/array-proxy');

  var MyObjectProxy = ObjectProxy.create({
    name: 'MyObjectProxy',
    properties: {
      str: { type: 'string' },
      num: { type: 'number' },
      bool: { type: 'boolean' },
      any: { type: 'any' },
      any2: { type: '*' },
      any3: {},
      virt: {
        type: 'virtual',
        get: function () {
          return this.any + '.' + this.any2;
        },
        set: function (value) {
          var parts = value.split('.');
          this.any = parts[0];
          this.any2 = parts[1];
        }
      },
      obj: {
        type: 'object',
        properties: {
          foo: { type: 'string' },
          bar: { type: 'string' }
        }
      },
      obj2: {
        type: 'object',
        properties: {
          bar: { type: 'string' }
        }
      },
      arr: { type: 'array' },
      date: { type: 'date' }
    },
    init: function () {
      if (!this.arr) { this.arr = []; }
    }
  });

  describe('.create()', function () {

    it('should return a constructor function', function () {
      expect(typeof MyObjectProxy).to.equal('function');
    });

    it('should return prototype with properties defined', function () {
      expect(MyObjectProxy.prototype).to.contain.keys('str', 'num', 'bool', 'any',
        'any2', 'any3', 'virt', 'obj', 'obj2', 'arr', 'date');
    });

    describe('#constructor', function () {

      it('should create new object with defined properties', function () {
        var obj = new MyObjectProxy({
          str: 'test string'
        });
        expect(obj).to.be.instanceOf(MyObjectProxy);
        var props = [];
        for (var p in obj) {
          if (typeof obj[p] !== 'function') {
            props.push(p);
          }
        }
        expect(props).to.contain('str', 'num', 'bool', 'any', 'any2', 'any3',
          'virt', 'obj', 'obj2', 'arr', 'date');
      });

      it('should populate values given to constructor', function () {
        var obj = new MyObjectProxy({
          str: 'this is a string'
        });
        expect(obj.str).to.equal('this is a string');
      });

      it('should wrap given nested objects in appropriate proxies', function () {
        var obj = new MyObjectProxy({
          obj: { foo: 'foo' },
          arr: [ 'a', 'b', 'c' ],
          date: new Date()
        });
        expect(obj.obj).to.be.instanceOf(ObjectProxy);
        expect(obj.arr).to.be.instanceOf(ArrayProxy);
        expect(obj.date).to.be.instanceOf(ImmutableDate);
      });

    });

  });

  describe('.set()', function () {

    it('should wrap given nested objects in appropriate proxies', function () {
      var obj = new MyObjectProxy();
      obj.set({
        obj: { foo: 'foo' },
        arr: [ 'a', 'b', 'c' ],
        date: new Date()
      });
      expect(obj.obj).to.be.instanceOf(ObjectProxy);
      expect(obj.arr).to.be.instanceOf(ArrayProxy);
      expect(obj.date).to.be.instanceOf(ImmutableDate);
    });

    it('should except a single object of values', function () {
      var obj = new MyObjectProxy();
      obj.set({
        str: 'str',
        any: 'blah',
        bool: false,
        num: 10
      });

      expect(obj.str).to.equal('str');
      expect(obj.any).to.equal('blah');
      expect(obj.bool).to.be.false;
      expect(obj.num).to.equal(10);
    });

    it('should except a string path and value', function () {
      var obj = new MyObjectProxy();
      obj.set('str', 'str');
      obj.set('obj.foo', 'foo');
      obj.set('obj2', {});

      expect(obj.str).to.equal('str');
      expect(obj.obj.foo).to.equal('foo');
      expect(typeof obj.obj2).to.equal('object');
    });

    it('should trigger change event', function (done) {
      var obj = new MyObjectProxy();
      obj.on('change', function (event) {
        expect(event.path).to.equal('str');
        expect(event.value).to.equal('str');
        expect(event.oldValue).to.not.exist;
        done();
      });
      obj.set('str', 'str');
    });

    it('should trigger change event on an array', function (done) {
      var obj = new MyObjectProxy({
        arr: []
      });
      obj.on('change', function (event) {
        expect(event).to.eql({
          object: obj,
          path: 'arr',
          type: 'splice',
          index: 0,
          removed: [],
          addedCount: 1
        });
        done();
      });
      obj.arr.push('a');
    });

    it('should trigger change event on a date', function (done) {
      var obj = new MyObjectProxy({
        date: new Date(2000, 0, 1)
      });
      obj.on('change', function (event) {
        expect(event.path).to.equal('date');
        done();
      });
      obj.date = obj.date.setMonth(11);
    });

    it('should trigger change event on nested change', function (done) {
      var obj = new MyObjectProxy({
        obj: {}
      });
      obj.on('change', function (event) {
        expect(event.path).to.equal('obj.foo');
        expect(event.value).to.equal('foo');
        expect(event.oldValue).to.not.exist;
        done();
      });
      obj.set('obj.foo', 'foo');
    });

    it('should call virtual setter', function () {
      var obj = new MyObjectProxy();
      obj.virt = 'boo.blah';
      expect(obj.any).to.equal('boo');
      expect(obj.any2).to.equal('blah');
    });

  });

  describe('.get()', function () {

    it('should return undefined for undefine properties', function () {
      var obj = new MyObjectProxy({
        str: 'test string',
        obj: { foo: 'foo' }
      });
      expect(obj.get('blahblahblah')).to.not.exist;
    });

    it('should except a string path', function () {
      var obj = new MyObjectProxy({
        str: 'test string',
        obj: { foo: 'foo' }
      });
      expect(obj.get('str')).to.equal('test string');
      expect(obj.get('obj.foo')).to.equal('foo');
    });

    it('should except an array path', function () {
      var obj = new MyObjectProxy({
        str: 'test string',
        obj: { foo: 'foo' }
      });
      expect(obj.get(['str'])).to.equal('test string');
      expect(obj.get(['obj', 'foo'])).to.equal('foo');
    });

    it('should call virtual setter', function () {
      var obj = new MyObjectProxy();
      obj.virt = 'boo.blah';
      expect(obj.virt).to.equal('boo.blah');
    });

  });

  describe('.has()', function () {

    it('should except a string path', function () {
      var obj = new MyObjectProxy({
        str: 'test string',
        obj: { foo: 'foo' }
      });
      expect(obj.has('str')).to.be.true;
      expect(obj.has('obj.foo')).to.be.true;
    });

  });

  describe('.toJSON()', function () {

    it('should return the correct JSON object', function () {
      var now = new Date();
      var obj = new MyObjectProxy({
        str: 'str',
        arr: ['a', 'b', 'c'],
        obj: { foo: 'foo' },
        date: now,
        any: 'boo',
        any2: 'blah'
      });
      obj.date.setFullYear(1976);
      var expected = {
        str: 'str',
        arr: ['a', 'b', 'c'],
        obj: { foo: 'foo' },
        date: { $date: now.toISOString() },
        any: 'boo',
        any2: 'blah',
        virt: 'boo.blah'
      };
      var json = obj.toJSON();
      expect(json).eql(expected);
    });

  });

});
