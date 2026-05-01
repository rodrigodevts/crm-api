'use strict';

const {
  apply,
  mergeWith,
  move,
  template,
  url,
  chain,
  MergeStrategy,
} = require('@angular-devkit/schematics');
const { strings } = require('@angular-devkit/core');

const APP_MODULE_PATH = 'src/app.module.ts';

/**
 * @typedef {Object} FeatureOptions
 * @property {string} name
 */

/** @param {FeatureOptions} options */
function applyFiles(options) {
  return (tree, context) => {
    const sourceTemplates = url('./files');
    const sourceParametrized = apply(sourceTemplates, [
      template({
        ...strings,
        name: options.name,
      }),
      move('src/modules'),
    ]);
    return mergeWith(sourceParametrized, MergeStrategy.Overwrite)(tree, context);
  };
}

/** @param {FeatureOptions} options */
function updateAppModule(options) {
  return (tree, context) => {
    const buf = tree.read(APP_MODULE_PATH);
    if (!buf) {
      context.logger.warn(`${APP_MODULE_PATH} not found; skipping auto-import. Add it manually.`);
      return tree;
    }
    let content = buf.toString();
    const dash = strings.dasherize(options.name);
    const className = `${strings.classify(options.name)}Module`;
    const importLine = `import { ${className} } from './modules/${dash}/${dash}.module';`;

    let changed = false;

    // Step 1 — add import line
    if (!content.includes(importLine)) {
      const moduleImports = [
        ...content.matchAll(/import \{ \w+Module \} from '\.\/modules\/[\w-]+\/[\w-]+\.module';/g),
      ];
      const fallback = [...content.matchAll(/^import .+;$/gm)];
      const target = moduleImports.length
        ? moduleImports[moduleImports.length - 1]
        : fallback[fallback.length - 1];
      if (!target || target.index === undefined) {
        context.logger.warn(
          `Could not find import anchor in ${APP_MODULE_PATH}. Add manually:\n  ${importLine}`,
        );
        return tree;
      }
      const insertAt = target.index + target[0].length;
      content = content.slice(0, insertAt) + '\n' + importLine + content.slice(insertAt);
      changed = true;
    }

    // Step 2 — add to @Module imports: [...] array
    const arrayMatch = content.match(/(@Module\(\{[\s\S]*?imports:\s*\[)([\s\S]*?)(\n\s*\],?)/);
    if (!arrayMatch) {
      context.logger.warn(
        `@Module imports array not found in ${APP_MODULE_PATH}. Add manually:\n  ${className},`,
      );
      if (changed) tree.overwrite(APP_MODULE_PATH, content);
      return tree;
    }
    const [, head, body, tail] = arrayMatch;
    if (!new RegExp(`\\b${className}\\b`).test(body)) {
      const indentMatch = body.match(/\n(\s+)\S/);
      const indent = indentMatch ? indentMatch[1] : '    ';
      const newBody = `${body.replace(/\s*$/, '')}\n${indent}${className},`;
      content = content.replace(arrayMatch[0], `${head}${newBody}${tail}`);
      changed = true;
    }

    if (changed) tree.overwrite(APP_MODULE_PATH, content);
    return tree;
  };
}

/** @param {FeatureOptions} options */
function feature(options) {
  return chain([applyFiles(options), updateAppModule(options)]);
}

exports.feature = feature;
