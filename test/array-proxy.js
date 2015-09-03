var chai = require('chai');

chai.use(require('chai-datetime'));
var expect = chai.expect;

describe('ArrayProxy', function () {

  var ImmutableDate = require('bloody-immutable-date');
  var ObjectProxy = require('../lib/object-proxy');
  var ArrayProxy = require('../lib/array-proxy');

  var StrArrProxy = ArrayProxy.create({
    items: { type: 'string '}
  });

  var DateArrProxy = ArrayProxy.create({
    items: { type: 'date' }
  });

  var ObjArrProxy = ArrayProxy.create({
    items: {
      type: 'object',
      properties: {
        foo: { type: 'string' },
        blah: { type: 'string' }
      }
    }
  });

  describe('.create()', function () {

    it('should return a constructor function', function () {
      expect(typeof StrArrProxy).to.equal('function');
      expect(typeof ObjArrProxy).to.equal('function');
    });

    describe('#constructor', function () {

      it('should create new object', function () {
        var arr = new StrArrProxy(['test string']);
        expect(arr).to.be.instanceOf(StrArrProxy);
      });

      it('should populate values given to constructor', function () {
        var arr = new StrArrProxy(['test string']);
        expect(arr).to.be.instanceOf(StrArrProxy);
        expect(arr.__arr.length).to.equal(1);
        expect(arr.__arr[0]).to.equal('test string');
      });

      it('should wrap given nested date in immutable date', function () {
        var arr = new DateArrProxy([
          new Date(),
          new Date(2000, 0, 1)
        ]);
        expect(arr).to.be.instanceOf(DateArrProxy);
        expect(arr.__arr.length).to.equal(2);
        expect(arr.__arr[0]).to.be.instanceOf(ImmutableDate);
        expect(arr.__arr[1]).to.be.instanceOf(ImmutableDate);
      });

      it('should wrap given nested objects in proxy', function () {
        var arr = new ObjArrProxy([
          { foo: 'bar', blah: 'abc' }
        ]);
        expect(arr).to.be.instanceOf(ObjArrProxy);
        expect(arr.__arr.length).to.equal(1);
        expect(arr.__arr[0]).to.be.instanceOf(ObjectProxy);
      });

    });

  });

  describe('.length', function () {

    it('should be equal to the length of the underlying array', function () {
        var arr = new StrArrProxy(['a', 'b', 'c', 'd']);
        expect(arr.length).to.equal(4);
    });

  });

  describe('.set()', function () {

    it('should wrap given nested objects in appropriate proxies', function () {
      var arr = new ObjArrProxy();
      arr.set(0, { foo: 'bar', blah: 'abc' });
      expect(arr.__arr.length).to.equal(1);
      expect(arr.__arr[0]).to.be.instanceOf(ObjectProxy);
    });

    it('should a string path to set nested item values', function () {
      var arr = new ObjArrProxy();
      arr.set('0.foo', 'bar');
      arr.set([0, 'blah'], 'abc');
      expect(arr.__arr.length).to.equal(1);
      expect(arr.__arr[0]).to.be.instanceOf(ObjectProxy);
      expect(arr.__arr[0].foo).to.equal('bar');
      expect(arr.__arr[0].blah).to.equal('abc');
    });

    it('should trigger change event', function (done) {
      var arr = new StrArrProxy(['a', 'b', 'c', 'd']);
      arr.on('change', function (event) {
        expect(event).to.eql({
          object: arr,
          type: 'update',
          name: '3',
          oldValue: 'd'
        });
        done();
      });
      arr.set(3, 'x');
    });

  });

  describe('.get()', function () {

    it('should accept string, int, or array as path', function () {
      var arr1 = new StrArrProxy(['a', 'b', 'c', 'd']);
      expect(arr1.get(2)).to.equal('c');
      expect(arr1.get('2.length')).to.equal(1);
      var arr2 = new ObjArrProxy([ { foo: 'bar', blah: 'abc' }]);
      expect(arr2.get('0.foo')).to.equal('bar');
      expect(arr2.get([0, 'blah'])).to.equal('abc');
      expect(arr2.get([0, 'blah', 'length'])).to.equal(3);
    });

  });

  describe('.pop()', function () {

    it('should pop an item from the array', function () {
      var arr1 = new StrArrProxy(['a', 'b', 'c', 'd']);
      var arr2 = new DateArrProxy([
        new Date(),
        new Date(2000, 0, 1)
      ]);
      var arr3 = new ObjArrProxy([ { foo: 'bar', blah: 'abc' } ]);
      expect(arr1.pop()).to.equal('d');
      expect(arr1.length).to.equal(3);
      expect(arr2.pop()).to.equalDate(new Date(2000, 0, 1));
      expect(arr2.length).to.equal(1);
      expect(arr3.pop()).to.eql({ foo: 'bar', blah: 'abc' });
      expect(arr3.length).to.equal(0);
    });

    it('should trigger change event', function (done) {
      var arr = new StrArrProxy(['a', 'b', 'c', 'd']);
      arr.on('change', function (event) {
        expect(event).to.eql({
          object: arr,
          type: 'splice',
          index: 3,
          removed: ['d'],
          addedCount: 0
        });
        done();
      });
      arr.pop();
    });

  });

  describe('.push()', function () {

    it('should add an item to the end of the array', function () {
      var arr = new ObjArrProxy([ { foo: 'bar', blah: 'abc' } ]);
      arr.push({ foo: 'boo', blah: 'xyz'});
      expect(arr.__arr[1]).to.be.instanceOf(ObjectProxy);
      expect(arr.__arr[1].foo).to.equal('boo');
      expect(arr.__arr[1].blah).to.equal('xyz');
    });

    it('should trigger change event', function (done) {
      var arr = new StrArrProxy(['a', 'b', 'c', 'd']);
      arr.on('change', function (event) {
        expect(event).to.eql({
          object: arr,
          type: 'splice',
          index: 4,
          removed: [],
          addedCount: 1
        });
        done();
      });
      arr.push('e');
    });

  });

  describe('.shift()', function () {

    it('should shift an item from the array', function () {
      var arr1 = new StrArrProxy(['a', 'b', 'c', 'd']);
      var arr2 = new DateArrProxy([
        new Date(),
        new Date(2000, 0, 1)
      ]);
      var arr3 = new ObjArrProxy([ { foo: 'bar', blah: 'abc' } ]);
      expect(arr1.shift()).to.equal('a');
      expect(arr1.length).to.equal(3);
      expect(arr2.shift()).to.equalDate(new Date());
      expect(arr2.length).to.equal(1);
      expect(arr3.shift()).to.eql({ foo: 'bar', blah: 'abc' });
      expect(arr3.length).to.equal(0);
    });

    it('should trigger change event', function (done) {
      var arr = new StrArrProxy(['a', 'b', 'c', 'd']);
      arr.on('change', function (event) {
        expect(event).to.eql({
          object: arr,
          type: 'splice',
          index: 0,
          removed: ['a'],
          addedCount: 0
        });
        done();
      });
      arr.shift();
    });

  });

  describe('.unshift()', function () {

    it('should add an item to the beginning of the array', function () {
      var arr = new ObjArrProxy([ { foo: 'bar', blah: 'abc' } ]);
      arr.unshift({ foo: 'boo', blah: 'xyz'});
      expect(arr.__arr[0]).to.be.instanceOf(ObjectProxy);
      expect(arr.__arr[0].foo).to.equal('boo');
      expect(arr.__arr[0].blah).to.equal('xyz');
    });

    it('should trigger change event', function (done) {
      var arr = new StrArrProxy(['a', 'b', 'c', 'd']);
      arr.on('change', function (event) {
        expect(event).to.eql({
          object: arr,
          type: 'splice',
          index: 0,
          removed: [],
          addedCount: 1
        });
        done();
      });
      arr.unshift('z');
    });

  });

  describe('.splice()', function () {

    it('should update items in array', function () {
      var arr = new ObjArrProxy([
        { foo: 'bar', blah: 'abc' },
        { foo: 'boo', blah: 'xyz'},
        { foo: 'hello', blah: 'world'}
      ]);
      var removed = arr.splice(2, 1, { foo: '1', blah: '2' });
      expect(removed[0]).to.eql({ foo: 'hello', blah: 'world'} );
      expect(arr.__arr[2]).to.be.instanceOf(ObjectProxy);
      expect(arr.__arr[2].foo).to.equal('1');
      expect(arr.__arr[2].blah).to.equal('2');
    });

    it('should trigger change event', function (done) {
      var arr = new StrArrProxy(['a', 'b', 'c', 'd']);
      arr.on('change', function (event) {
        expect(event).to.eql({
          object: arr,
          type: 'splice',
          index: 1,
          removed: ['b', 'c'],
          addedCount: 2
        });
        done();
      });
      arr.splice(1, 2, 'B', 'C');
    });

  });

  describe('.toArray', function () {

    it('should return the underlying array with unwrapped items', function () {
      var src1 = [
        { foo: 'bar', blah: 'abc' },
        { foo: 'boo', blah: 'xyz'},
        { foo: 'hello', blah: 'world'}
      ];
      var arr1 = new ObjArrProxy(src1);
      expect(arr1.toArray()).to.eql(src1);
      var src2 = ['a', 'b', 'c', 'd'];
      var arr2 = new StrArrProxy(src2);
      expect(arr2.toArray()).to.eql(src2);
      var src3 = [ new Date(), new Date(2000, 0, 1) ];
      var arr3 = new DateArrProxy(src3);
      expect(arr3.toArray()).to.eql(src3);
    });

  });

  describe('.toJSON', function () {

    it('should return the underlying array as JSON', function () {
      var src1 = [
        { foo: 'bar', blah: 'abc' },
        { foo: 'boo', blah: 'xyz'},
        { foo: 'hello', blah: 'world'}
      ];
      var arr1 = new ObjArrProxy(src1);
      expect(arr1.toJSON()).to.eql(src1);
      var src2 = ['a', 'b', 'c', 'd'];
      var arr2 = new StrArrProxy(src2);
      expect(arr2.toJSON()).to.eql(src2);
      var src3 = [ new Date(), new Date(2000, 0, 1) ];
      var arr3 = new DateArrProxy(src3);
      expect(arr3.toJSON()).to.eql([
        { $date: src3[0].toISOString() },
        { $date: src3[1].toISOString() }
      ]);
    });

  });

});
