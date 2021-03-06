/**
 * Copyright (c) 2014, Facebook, Inc. All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+jsinfra
 */
'use strict';

jest.autoMockOff();
jest.mock('../../environments/JSDOMEnvironment');

var path = require('path');
var utils = require('../../lib/utils');

describe('HasteModuleLoader', function() {
  var HasteModuleLoader;
  var JSDOMEnvironment;
  var resourceMap;

  var CONFIG = utils.normalizeConfig({
    cacheDirectory: global.CACHE_DIRECTORY,
    name: 'HasteModuleLoader-requireModule-tests',
    rootDir: path.join(__dirname, 'test_root'),
  });

  function buildLoader() {
    if (!resourceMap) {
      return HasteModuleLoader.loadResourceMap(CONFIG).then(function(map) {
        resourceMap = map;
        return buildLoader();
      });
    } else {
      var mockEnvironment = new JSDOMEnvironment(CONFIG);
      return Promise.resolve(
        new HasteModuleLoader(CONFIG, mockEnvironment, resourceMap)
      );
    }
  }

  beforeEach(function() {
    HasteModuleLoader = require('../HasteModuleLoader');
    JSDOMEnvironment = require('../../environments/JSDOMEnvironment');
  });

  describe('requireModule', function() {
    pit('finds @providesModule modules', function() {
      return buildLoader().then(function(loader) {
        var exports = loader.requireModule(null, 'RegularModule');
        expect(exports.isRealModule).toBe(true);
      });
    });

    pit('provides `module.parent` to modules', function() {
      return buildLoader().then(function(loader) {
        var exports = loader.requireModule(null, 'RegularModule');
        expect(exports.parent).toEqual({
          id: 'mockParent',
          exports: {},
        });
      });
    });

    pit('throws on non-existant @providesModule modules', function() {
      return buildLoader().then(function(loader) {
        expect(function() {
          loader.requireModule(null, 'DoesntExist');
        }).toThrow(new Error('Cannot find module \'DoesntExist\' from \'.\''));
      });
    });

    pit('finds relative-path modules without file extension', function() {
      return buildLoader().then(function(loader) {
        var exports = loader.requireModule(
          __filename,
          './test_root/RegularModule'
        );
        expect(exports.isRealModule).toBe(true);
      });
    });

    pit('finds relative-path modules with file extension', function() {
      return buildLoader().then(function(loader) {
        var exports = loader.requireModule(
          __filename,
          './test_root/RegularModule.js'
        );
        expect(exports.isRealModule).toBe(true);
      });
    });

    pit('throws on non-existant relative-path modules', function() {
      return buildLoader().then(function(loader) {
        expect(function() {
          loader.requireModule(__filename, './DoesntExist');
        }).toThrow(new Error(
          'Cannot find module \'./DoesntExist\' from \'' + __filename + '\''
        ));
      });
    });

    pit('finds node core built-in modules', function() {
      return buildLoader().then(function(loader) {
        expect(function() {
          loader.requireModule(null, 'fs');
        }).not.toThrow();
      });
    });

    pit('finds and loads JSON files without file extension', function() {
      return buildLoader().then(function(loader) {
        var exports = loader.requireModule(__filename, './test_root/JSONFile');
        expect(exports.isJSONModule).toBe(true);
      });
    });

    pit('finds and loads JSON files with file extension', function() {
      return buildLoader().then(function(loader) {
        var exports = loader.requireModule(
          __filename,
          './test_root/JSONFile.json'
        );
        expect(exports.isJSONModule).toBe(true);
      });
    });

    pit('requires a JSON file twice successfully', function() {
      return buildLoader().then(function(loader) {
        var exports1 = loader.requireModule(
          __filename,
          './test_root/JSONFile.json'
        );
        var exports2 = loader.requireModule(
          __filename,
          './test_root/JSONFile.json'
        );
        expect(exports1.isJSONModule).toBe(true);
        expect(exports2.isJSONModule).toBe(true);
        expect(exports1).toBe(exports2);
      });
    });

    pit('emulates a node stack trace during module load', function() {
      return buildLoader().then(function(loader) {
        let hasThrown = false;
        try {
          loader.requireModule(
            __filename,
            './test_root/throwing.js'
          );
        } catch (err) {
          hasThrown = true;
          expect(err.stack).toMatch(/^Error: throwing\s+at Object.<anonymous>/);
        }
        expect(hasThrown).toBe(true);
      });
    });

    pit('emulates a node stack trace during function execution', function() {
      return buildLoader().then(function(loader) {
        let hasThrown = false;
        const sum = loader.requireModule(
          __filename,
          './test_root/throwing-fn.js'
        );

        try {
          sum();
        } catch (err) {
          hasThrown = true;
          expect(err.stack).toMatch(/^Error: throwing fn\s+at sum.+HasteModuleLoader\/__tests__\/test_root\/throwing-fn.js:12:9/);
        }
        expect(hasThrown).toBe(true);
      });
    });

    describe('features I want to remove, but must exist for now', function() {
      /**
       * I'd like to kill this and make all tests use something more explicit
       * when they want a manual mock, like:
       *
       *   require.mock('MyManualMock');
       *   var ManuallyMocked = require('ManuallyMocked');
       *
       *   --or--
       *
       *   var ManuallyMocked = require.manualMock('ManuallyMocked');
       *
       * For now, however, this is built-in and many tests rely on it, so we
       * must support it until we can do some cleanup.
       */
      pit('provides manual mock when real module doesnt exist', function() {
        return buildLoader().then(function(loader) {
          var exports = loader.requireModule(
            __filename,
            'ExclusivelyManualMock'
          );
          expect(exports.isExclusivelyManualMockModule).toBe(true);
        });
      });

      /**
       * requireModule() should *always* return the real module. Mocks should
       * only be returned by requireMock().
       *
       * See the 'overrides real modules with manual mock when one exists' test
       * for more info on why I want to kill this feature.
       */
      pit(
        'doesnt override real modules with manual mocks when explicitly ' +
          'marked with .dontMock()',
          function() {
            return buildLoader().then(function(loader) {
              loader.__getJestRuntimeForTest(__filename)
                .dontMock('ManuallyMocked');
              var exports = loader.requireModule(__filename, 'ManuallyMocked');
              expect(exports.isManualMockModule).toBe(false);
            });
          }
      );
    });
  });
});
