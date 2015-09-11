var chai = require('chai');
var util = require('util');
var dozer = require('dozer').client;

chai.use(require('chai-datetime'));
var expect = chai.expect;

describe('Model', function () {

  var Model = require('../lib/model');
  var FullTestModel = require('./support/full-test-model');

  describe('.define()', function () {

    it('should return prototype with static methods defined', function () {
      expect(FullTestModel).to.include.keys('find', 'findOne', 'remove');
    });

    it('should allow extending of a model', function () {
      var ModelA = Model.define({
          name: 'ModelA',
          abstract: true,
          collectionUri: '/db/mocha_test',
          properties: {
            _type: { type: 'string', enum: ['A', 'B'], default: 'A'},
            strA: { type: 'string' }
          }
        });
        ModelA.foo = function () {
          return 'foo';
        };
        ModelA.prototype.blah = function () {
          return 'blah';
        };
        var ModelB = Model.define({
          name: 'ModelB',
          where: { _type: 'B' },
          properties: {
            _type: { type: 'string', default: 'B', valid: 'B' },
            strB: { type: 'string' }
          }
        }, ModelA);
        ModelB.bar = function () {
          return 'bar';
        };
        var myModelB = new ModelB({
          strA: 'abc',
          strB: '123'
        });
        expect(myModelB).to.be.an.instanceof(ModelA);
        expect(ModelB.bar()).to.equal('bar');
        expect(myModelB.strB).to.equal('123');
        expect(ModelB.foo()).to.equal('foo');
        expect(myModelB.strA).to.equal('abc');
        expect(myModelB.blah()).to.equal('blah');
    });

    describe('#constructor', function () {

      it('should have run initialized', function () {
        var newModel = new FullTestModel({
          str: 'this is a string'
        });
        expect(newModel.str).to.equal('this is a string');
        expect(newModel.bool).to.be.true;
      });

    });

  });

  describe('.markAsModified(), .isModified()', function () {

    var model;

    before(function () {
      model = new FullTestModel({
        str: 'test string',
        obj: { prop1: 'foo', prop2: 'bar' }
      });
    });

    it('should except a string path', function () {
      model.markAsModified('str');
      model.markAsModified('obj.deep.blah');

      expect(model.isModified('str')).to.be.true;
      expect(model.isModified('obj')).to.true;
      expect(model.isModified('obj.deep')).to.true;
      expect(model.isModified('obj.deep.blah')).to.true;
    });

    it('should except an array path', function () {
      model.markAsModified(['str']);
      model.markAsModified(['obj', 'deep', 'blah']);

      expect(model.isModified(['str'])).to.be.true;
      expect(model.isModified(['obj'])).to.true;
      expect(model.isModified(['obj', 'deep'])).to.true;
      expect(model.isModified(['obj', 'deep', 'blah'])).to.true;
    });

  });

  describe('.before()', function () {

    it('should allow code exectution before a method', function () {
      var model = new FullTestModel({ str: '' });
      expect(model.str).to.equal('');
      model.fooString();
      expect(model.str).to.equal('(foo)');

      model.str = '';
      model.before('fooString', function () {
        this.str = 'bar';
      });
      expect(model.str).to.equal('');
      model.fooString();
      expect(model.str).to.equal('bar(foo)');
    });

  });

  describe('.after()', function () {

    it('should allow code exectution after a method', function () {
      var model = new FullTestModel({ str: '' });
      expect(model.str).to.equal('');
      model.fooString();
      expect(model.str).to.equal('(foo)');

      model.str = '';
      model.after('fooString', function () {
        this.str += 'bar';
      });
      expect(model.str).to.equal('');
      model.fooString();
      expect(model.str).to.equal('(foo)bar');
    });

  });

  describe('.validate()', function () {

    it('should reject promise if validation fails', function (done) {
      var model = new FullTestModel({ str: '' });
      model.validate()
        .then(
          function () {
            expect(false).to.be.true;
          },
          function (err) {
            expect(err).to.exist;
            done();
          })
        .done(null, done);
    });

    it('should resolve promise if validation succeeds', function (done) {
      var model = new FullTestModel({ str: 'bar' });
      model.validate()
        .then(function () {
          expect(true).to.be.true;
          done();
        })
        .catch(function (err) {
          expect(err).to.not.exist;
        })
        .done(null, done);
    });

  });

  describe('.save()', function () {

    var model;

    before(function () {
      model = new FullTestModel({
        str: 'test string',
        obj: { foo: 'bar' }
      });
    });

    after(function (done) {
      dozer.del('/db/mocha_test', { query: {}, multiple: true })
        .then(function () {
          done();
        })
        .catch(function (err) {
          done(err);
        });
    });

    it('should insert a new document', function (done) {
      model.save()
        .then(function () {
          expect(model._id).to.exist;
          expect(model._etag).to.exist;
          expect(model.isModified()).to.be.false;
          return dozer.get('/db/mocha_test', { count: true })
            .then(function (result) {
              expect(result.count).to.equal(1);
              return dozer.get('/db/mocha_test/' + model._id, { one: true });
            })
            .then(function (doc) {
              expect(model._etag).to.equal(doc._etag);
              expect(model._id.toString()).to.equal(doc._id.toString());
              expect(model.bool).to.equal(doc.bool);
              expect(model.date).to.equalDate(doc.date);
              expect(model.num).to.equal(doc.num);
              expect(model.obj.toObject({virtuals: false})).to.eql(doc.obj);
              expect(model.str).to.equal(doc.str);
              done();
            });
        })
        .done(null, done);
    });

    it('should update an existing document', function (done) {
      var _id = model._id.toString(), _etag = model._etag;
      model.str = 'test update';
      expect(model.isModified()).to.be.true;
      model.save()
        .then(function () {
          expect(model._id.toString()).to.equal(_id);
          expect(model._etag).to.not.equal(_etag);
          expect(model.isModified()).to.be.false;
          return dozer.get('/db/mocha_test', { count: true })
            .then(function (result) {
              expect(result.count).to.equal(1);
              return dozer.get('/db/mocha_test/' + model._id, { one: true });
            })
            .then(function (doc) {
              expect(model._etag).to.equal(doc._etag);
              expect(model._id.toString()).to.equal(doc._id.toString());
              expect(model.bool).to.equal(doc.bool);
              expect(model.date).to.equalDate(doc.date);
              expect(model.num).to.equal(doc.num);
              expect(model.obj.toObject({virtuals: false})).to.eql(doc.obj);
              expect(model.str).to.equal(doc.str);
              done();
            });
        })
        .done(null, done);
    });

  });

  describe('.remove()', function () {
    var model;

    before(function () {
      model = new FullTestModel({
        str: 'test string',
        obj: { foo: 'bar' }
      });
    });

    after(function (done) {
      dozer.del('/db/mocha_test', { query: {}, multiple: true })
        .then(function () {
          done();
        })
        .catch(function (err) {
          done(err);
        });
    });

    it('should remove the document', function (done) {
      model.save()
        .then(function () {
          expect(model._id).to.exist;
          return model.remove();
        })
        .then(function (result) {
          expect(model._id).to.not.exist;
          expect(model._etag).to.not.exist;
          expect(model.isModified()).to.be.false;
          return dozer.get('/db/mocha_test', { count: true })
            .then(function (result) {
              expect(result.count).to.equal(0);
              done();
            });
        })
        .done(null, done);
    });

  });

  describe('.count()', function () {
    var model;

    before(function () {
      model = new FullTestModel({
        str: 'test string',
        obj: { foo: 'bar' }
      });
    });

    after(function (done) {
      dozer.del('/db/mocha_test', { query: {}, multiple: true })
        .then(function () {
          done();
        })
        .catch(function (err) {
          done(err);
        });
    });

    it('should return the count of objects', function (done) {
      model.save()
        .then(function () {
          expect(model._id).to.exist;
          return FullTestModel.count({ _id: model._id });
        })
        .then(function (count) {
          expect(count).to.equal(1);
          done();
        })
        .done(null, done);
    });
  });

  describe('.find()', function () {
    var model;

    before(function () {
      model = new FullTestModel({
        str: 'test string',
        obj: { foo: 'bar' }
      });
    });

    after(function (done) {
      dozer.del('/db/mocha_test', { query: {}, multiple: true })
        .then(function () {
          done();
        })
        .catch(function (err) {
          done(err);
        });
    });

    it('should return an array of objects', function (done) {
      model.save()
        .then(function () {
          expect(model._id).to.exist;
          return FullTestModel.find({ _id: model._id });
        })
        .then(function (arr) {
          expect(arr.length).to.equal(1);
          expect(arr[0]._id.toString()).to.equal(model._id.toString());
          done();
        })
        .done(null, done);
    });
  });

  describe('.findOne()', function () {
    var model;

    before(function () {
      model = new FullTestModel({
        str: 'test string',
        obj: { foo: 'bar' }
      });
    });

    after(function (done) {
      dozer.del('/db/mocha_test', { query: {}, multiple: true })
        .then(function () {
          done();
        })
        .catch(function (err) {
          done(err);
        });
    });

    it('should return an object', function (done) {
      model.save()
        .then(function () {
          expect(model._id).to.exist;
          return FullTestModel.findOne({ _id: model._id });
        })
        .then(function (doc) {
          expect(doc).to.exist;
          expect(doc._id.toString()).to.equal(model._id.toString());
          done();
        })
        .done(null, done);
    });

    it('should return null if no document is found', function (done) {
      FullTestModel.findOne({ _id: 'asdfasdfasdf' })
        .then(function (doc) {
          expect(doc).to.not.exist;
          done();
        })
        .done(null, done);
    });

  });

  describe('.remove() [static]', function () {
    var model;

    before(function () {
      model = new FullTestModel({
        str: 'test string',
        obj: { foo: 'bar' }
      });
    });

    after(function (done) {
      dozer.del('/db/mocha_test', { query: {}, multiple: true })
        .then(function () {
          done();
        })
        .catch(function (err) {
          done(err);
        });
    });

    it('should remove a document', function (done) {
      model.save()
        .then(function () {
          expect(model._id).to.exist;
          return FullTestModel.remove({ _id: model._id });
        })
        .then(function () {
          return dozer.get('/db/mocha_test', { query: { _id: model._id }, count: true });
        })
        .then(function (result) {
          expect(result.count).to.equal(0);
          done();
        })
        .done(null, done);
    });
  });

  describe('.extend', function () {

    it('should allow extending of a model', function () {
      var ModelA = Model.define({
        name: 'ModelA',
        abstract: true,
        properties: {
          'strA': { type: 'string' }
        }
      });
      ModelA.foo = function () {
        return 'foo';
      };
      ModelA.prototype.blah = function () {
        return 'blah';
      };
      var ModelB = ModelA.extend({
        name: 'ModelB',
        collectionUri: '/db/modelb',
        properties: {
          'strB': { type: 'string' }
        }
      });
      ModelB.bar = function () {
        return 'bar';
      };
      var myModelB = new ModelB({
        strA: 'abc',
        strB: '123'
      });
      expect(myModelB).to.be.an.instanceof(ModelA);
      expect(ModelB.bar()).to.equal('bar');
      expect(myModelB.strB).to.equal('123');
      expect(ModelB.foo()).to.equal('foo');
      expect(myModelB.strA).to.equal('abc');
      expect(myModelB.blah()).to.equal('blah');
    });

  });

});
