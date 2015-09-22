var chai = require('chai');
var dozer = require('dozer-client');
var q = require('q');

chai.use(require('chai-datetime'));
var expect = chai.expect;

describe('Model', function () {

  var Model = require('../lib/model');
  var Immutable = require('../lib/immutable');
  var FullTestModel = require('./support/full-test-model');

  describe('.define()', function () {

    it('should return a model definition', function () {
      var ModelA = Model.define({
        collectionUri: '/db/mocha_test',
        properties: {
          _type: { type: 'string', enum: ['A', 'B'], default: 'A'},
          strA: { type: 'string' }
        },
        methods: {
          blah: function () {
            return 'blah';
          }
        }
      });
      expect(ModelA.create).to.exist;
      expect(ModelA.extend).to.exist;
      expect(ModelA.count).to.exist;
      expect(ModelA.find).to.exist;
      expect(ModelA.findOne).to.exist;
      expect(ModelA.remove).to.exist;
    });

  });

  describe('.get()', function () {

    it('should return a value at the given path', function () {
      var model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      expect(model.get('str')).to.equal('foo');
      expect(model.get('obj.deep.blah')).to.equal('blah');
    });

  });

  describe('.set()', function () {

    it('should except a path and value and return a new model', function () {
      var model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      var model2 = model.set('obj.deep.blah', 'boo');
      expect(FullTestModel.isA(model2)).to.be.true;
      var m = model.toObject();
      var m2 = model2.toObject();
      expect(model.get('obj.deep.blah')).to.equal('blah');
      expect(model2.get('obj.deep.blah')).to.equal('boo');
    });

    it('should except an object of values to assign and return a new model', function () {
      var model = FullTestModel.create({});
      var model2 = model.set({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      expect(FullTestModel.isA(model2)).to.be.true;
      expect(model2.fooString('str is set to {str}')).to.equal('str is set to foo');
      expect(model.get('str')).to.not.exist;
      expect(model.get('obj.deep.blah')).to.not.exist;
      expect(model2.get('str')).to.equal('foo');
      expect(model2.get('obj.deep.blah')).to.equal('blah');
    });

  });

  describe('.del()', function () {

    it('should delete the var at the given path and return a new model', function () {
      var model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      var model2 = model.del('str');
      var model3 = model.del('obj.deep.blah');
      expect(FullTestModel.isA(model2)).to.be.true;
      expect(FullTestModel.isA(model3)).to.be.true;
      expect(model.get('str')).to.equal('foo');
      expect(model2.get('str')).to.not.exist;
      expect(model.get('obj.deep.blah')).to.equal('blah');
      expect(model3.get('obj.deep.blah')).to.not.exist;
    });

  });

  describe('.has()', function () {

    it('should return true if the model contains a value at the given path', function () {
      var model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      expect(model.has('str')).to.be.true;
      expect(model.has('obj.deep.blah')).to.be.true;
    });

  });

  describe('.is()', function () {

    after(function (done) {
      dozer.del('/db/mocha_test', { query: {}, multiple: true })
        .then(function () {
          done();
        })
        .catch(function (err) {
          done(err);
        });
    });

    // TODO split this up into multiple tests
    it('should return true if both objects reference the same doc', function (done) {
      var obj = null;
      var modelA = Model.define({
        name: 'ModelA',
        collectionUri: '/db/mocha_test',
        properties: {
          str: { type: 'string' }
        }
      }).create({ str: 'foo'});
      var modelB = Model.define({
        name: 'ModelB',
        collectionUri: '/db/mocha_test',
        properties: {
          str: { type: 'string' }
        }
      }).create({ str: 'foo'});
      expect(modelA.is(obj)).to.be.false;
      expect(modelA.is(modelB)).to.be.false;
      var m = modelA;
      expect(modelA.is(m)).to.be.true;
      m = modelA.set('str', 'blah');
      expect(modelA.is(m)).to.be.false;
      modelA.save()
        .then(function (modelA2) {
          expect(modelA.is(modelA2)).to.be.false;
          var m2 = modelA2.set('str', 'bar');
          expect(modelA2.is(m2)).to.be.true;
          done();
        })
        .done(null, done);
    });

  });

  describe('.equals()', function () {

    after(function (done) {
      dozer.del('/db/mocha_test', { query: {}, multiple: true })
        .then(function () {
          done();
        })
        .catch(function (err) {
          done(err);
        });
    });

    it('should return true if both objects reference the same doc and version', function (done) {
      var obj = null;
      var modelA = Model.define({
        name: 'ModelA',
        collectionUri: '/db/mocha_test',
        properties: {
          str: { type: 'string' }
        }
      }).create({ str: 'foo'});
      var m = modelA.set('str', 'blah');
      expect(modelA.equals(m)).to.be.false;
      modelA.save()
        .then(function (modelA2) {
          var m2 = modelA2.set('num', 10);
          expect(modelA2.equals(m2)).to.be.false;
          done();
        })
        .done(null, done);
    });

  });

  describe('.isNew()', function (done) {

    after(function (done) {
      dozer.del('/db/mocha_test', { query: {}, multiple: true })
        .then(function () {
          done();
        })
        .catch(function (err) {
          done(err);
        });
    });

    it('should return true if the model is new', function (done) {
      var model = FullTestModel.create({
        str: 'foo'
      });
      expect(model.isNew()).to.be.true;
      model.save()
        .then(function (model2) {
          expect(model2.isNew()).to.be.false;
          done();
        })
        .done(null, done);
    });

  });

  describe('.getModifiedPaths()', function () {

    it('should return an array of modified paths', function () {
      var model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      var m = model
        .set('obj.deep.blah', 'foo')
        .set('arr', [1, 2, 3])
        .set('bool', true);
      expect(m.getModifiedPaths()).to.eql(['obj.deep.blah', 'arr', 'bool']);
      m = m.set({ obj: { prop1: 'a', prop2: 'b' } }).set(['arr', 0], 4);
      expect(m.getModifiedPaths()).to.eql(['arr', 'bool', 'obj']);
    });

  });

  describe('.isModified()', function () {

    it('should return true if the given path is modified', function () {
      var model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      var m = model.set('arr', [1, 2, 3]);
      expect(m.isModified('arr')).to.be.true;
      expect(m.isModified('str')).to.be.false;
      var m2 = model.set('obj.deep.blah', 'boo');
      expect(m2.isModified('obj')).to.be.true;
      expect(m2.isModified('obj.deep')).to.be.true;
      expect(m2.isModified('obj.deep.blah')).to.be.true;
    });

    it('should return true if no path is given and the object has been modified', function () {
      var model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      expect(model.isModified()).to.be.false;
      var m = model.set('arr', [1, 2, 3]);
      expect(m.isModified()).to.be.true;
    });

  });

  describe('.toJSON()', function () {

    after(function (done) {
      dozer.del('/db/mocha_test', { query: {}, multiple: true })
        .then(function () {
          done();
        })
        .catch(function (err) {
          done(err);
        });
    });

    it('should except a virtuals option', function () {
      var model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      model
        .save()
        .then(function (newModel) {
          // console.log(newModel.toJSON({ virtuals: true }));
        });
    });

    it('should except an extended option', function () {
      var model = FullTestModel.create({
        str: 'foo',
        obj: { deep: { blah: 'blah' } }
      });
      model
        .save()
        .then(function (newModel) {
          // console.log(newModel.toJSON({ extended: false }));
        });
    });

  });

  describe('.validate()', function () {

    it('should reject promise if validation fails', function (done) {
      var model = FullTestModel.create({});
      model
        .validate()
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
      var model = FullTestModel.create({ str: 'bar' });
      model
        .validate()
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
      model = FullTestModel.create({
        str: 'foo',
        obj: { prop1: 'bar' }
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
      var updatedModel;
      model
        .save()
        .then(function (newModel) {
          updatedModel = newModel;
          expect(updatedModel._id).to.exist;
          expect(updatedModel._etag).to.exist;
          return dozer.get('/db/mocha_test', { count: true })
        })
        .then(function (result) {
          expect(result.count).to.equal(1);
          return dozer.get('/db/mocha_test/' + updatedModel._id.toString(), { one: true });
        })
        .then(function (doc) {
          expect(updatedModel._etag).to.equal(doc._etag);
          expect(updatedModel._id.toString()).to.equal(doc._id.toString());
          expect(updatedModel.bool).to.equal(doc.bool);
          expect(updatedModel.date).to.equalDate(doc.date);
          expect(updatedModel.num).to.equal(doc.num);
          expect(updatedModel.obj.toObject()).to.eql(doc.obj);
          expect(updatedModel.str).to.equal(doc.str);
          done();
        })
        .done(null, done);
    });

    it('should update an existing document', function (done) {
      var newModel, updatedModel;
      model
        .save()
        .then(function (model) {
          newModel = model;
          return newModel.set('str', 'test update').save();
        })
        .then(function (model) {
          updatedModel = model;
          expect(updatedModel._id.toString()).to.equal(newModel._id.toString());
          expect(updatedModel._etag).to.not.equal(newModel._etag);
          return dozer.get('/db/mocha_test/' + updatedModel._id.toString(), { one: true });
        })
        .then(function (doc) {
          expect(updatedModel._etag).to.equal(doc._etag);
          expect(updatedModel._id.toString()).to.equal(doc._id.toString());
          expect(updatedModel.bool).to.equal(doc.bool);
          expect(updatedModel.date).to.equalDate(doc.date);
          expect(updatedModel.num).to.equal(doc.num);
          expect(updatedModel.obj.toObject()).to.eql(doc.obj);
          expect(updatedModel.str).to.equal(doc.str);
          done();
        })
        .done(null, done);
    });

  });

  describe('.remove()', function () {
    var model;

    before(function () {
      model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
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
      model
        .save()
        .then(function (updatedModel) {
          return updatedModel.remove();
        })
        .then(function (result) {
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
      model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
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
      model
        .save()
        .then(function (updatedModel) {
          return FullTestModel.count({ _id: updatedModel._id });
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
      model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
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
      model
        .save()
        .then(function (updatedModel) {
          return FullTestModel.find({ _id: updatedModel._id });
        })
        .then(function (arr) {
          expect(arr.length).to.equal(1);
          done();
        })
        .done(null, done);
    });
  });

  describe('.findOne()', function () {
    var model;

    before(function () {
      model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
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
      model
        .save()
        .then(function (updatedModel) {
          return FullTestModel.findOne({ _id: updatedModel._id });
        })
        .then(function (doc) {
          expect(doc).to.exist;
          expect(Immutable.isImmutableType(doc, 'FullTestModel'));
          done();
        })
        .done(null, done);
    });

    it('should return null if no document is found', function (done) {
      FullTestModel
        .findOne({ _id: 'asdfasdfasdf' })
        .then(function (doc) {
          expect(doc).to.not.exist;
          done();
        })
        .done(null, done);
    });

  });

  describe('.distinct()', function () {

    after(function (done) {
      dozer.del('/db/mocha_test', { query: {}, multiple: true })
        .then(function () {
          done();
        })
        .catch(function (err) {
          done(err);
        });
    });

    it('should return distinct key values', function (done) {
      var model = FullTestModel.create({
        str: 'test string'
      });
      var model2 = FullTestModel.create({
        str: 'another test string'
      });
      var model3 = FullTestModel.create({
        str: 'test string'
      });
      q.all([model.save(), model2.save(), model3.save()])
        .then(function (results) {
          return FullTestModel.distinct('str');
        })
        .then(function (results) {
          expect(results).to.contain('test string', 'another test string');
          done();
        })
        .done(null, done);
    });

  });

  describe('.aggregate()', function () {

    after(function (done) {
      dozer.del('/db/mocha_test', { query: {}, multiple: true })
        .then(function () {
          done();
        })
        .catch(function (err) {
          done(err);
        });
    });

    it('should return results of aggregate pipeline', function (done) {
      var model = FullTestModel.create({
        str: 'test string'
      });
      var model2 = FullTestModel.create({
        str: 'another test string'
      });
      var model3 = FullTestModel.create({
        str: 'test string'
      });
      q.all([model.save(), model2.save(), model3.save()])
        .then(function (results) {
          return FullTestModel.aggregate([
            { $group: { _id: '$str', count: { $sum: 1 } } }
          ]);
        })
        .then(function (results) {
          expect(results.length).to.equal(2);
          results.forEach(function (item) {
            expect(item).to.contain.all.keys('_id', 'count');
            expect(item).to.satisfy(function (val) {
              return (val._id === 'test string' && val.count === 2) ||
                (val._id === 'another test string' && val.count === 1);
            });
          });
          done();
        })
        .done(null, done);
    });

  });

  describe('.remove() [static]', function () {
    var model;

    before(function () {
      model = FullTestModel.create({
        str: 'test string',
        obj: { prop1: 'bar' }
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
      var id;
      model
        .save()
        .then(function (updatedModel) {
          id = updatedModel._id;
          return FullTestModel.remove({ _id: updatedModel._id });
        })
        .then(function () {
          return dozer.get('/db/mocha_test', { query: { _id: id }, count: true });
        })
        .then(function (result) {
          expect(result.count).to.equal(0);
          done();
        })
        .done(null, done);
    });
  });

  describe('.extend()', function () {

    it('should allow extending of a model', function () {
      var ModelA = Model.define({
        name: 'ModelA',
        abstract: true,
        collectionUri: '/db/mocha_test',
        properties: {
          _type: { type: 'string', enum: ['A', 'B'], default: 'A'},
          strA: { type: 'string', default: 'A' }
        },
        methods: {
          blah: function () {
            return 'blah';
          }
        }
      });
      var ModelB = ModelA.extend({
        name: 'ModelB',
        where: { _type: 'B' },
        properties: {
          _type: { type: 'string', default: 'B', valid: 'B' },
          strB: { type: 'string', default: 'B' }
        }
      });
      var myModelA = ModelA.create({});
      expect(myModelA.strA).to.equal('A');
      expect(myModelA.strB).to.not.exist;
      var myModelB = ModelB.create({
        strA: 'abc',
        strB: '123'
      });
      expect(myModelB.strB).to.equal('123');
      expect(myModelB.strA).to.equal('abc');
      expect(myModelB.blah()).to.equal('blah');
    });

  });

});
