'use strict';

const { apply, mergeWith, move, template, url, chain } = require('@angular-devkit/schematics');
const { strings } = require('@angular-devkit/core');

/**
 * @typedef {Object} FeatureOptions
 * @property {string} name
 */

/**
 * @param {FeatureOptions} options
 */
function feature(options) {
  return chain([
    (tree, context) => {
      const sourceTemplates = url('./files');
      const sourceParametrized = apply(sourceTemplates, [
        template({
          ...strings,
          name: options.name,
        }),
        move('src/modules'),
      ]);
      return mergeWith(sourceParametrized)(tree, context);
    },
  ]);
}

exports.feature = feature;
