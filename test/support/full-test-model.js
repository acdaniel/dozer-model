var Model = require('../../lib/model');

var FullTestModel = Model.define({
  name: 'FullTestModel',
  collectionUri: '/db/mocha_test',
  properties: {
    str: { type: 'string', 'default': '' },
    obj: {
      type: 'object',
      properties: {
        prop1: { type: 'string' },
        prop2: { type: 'string' },
        propv: {
          type: 'virtual',
          get: function () {
            return this.prop1 + '.' + this.prop2;
          },
          set: function (value) {
            var parts = value.split('.');
            this.prop1 = parts[0];
            this.prop2 = parts[1];
          }
        },
        deep: {
          type: 'object',
          properties: {
            blah: { type: 'string' }
          }
        }
      }
    },
    date: { type: 'date', default: function () { return new Date(); } },
    arr: { type: 'array' },
    num: { type: 'number', default: 0 },
    bool: { type: 'boolean', default: false },
    any: { type: 'any' },
    virt: {
      type: 'virtual',
      get: function () {
        return this.str + '.virtual';
      },
      set: function (value) {
        var parts = value.split('.');
        this.str = parts[0];
      }
    }
  },
  initialize: function () {
    this.bool = true;
  }
});

FullTestModel.prototype.fooString = function () {
  this.str += '(foo)';
};

module.exports = FullTestModel;
