import babel from 'rollup-plugin-babel';
import replace from '@rollup/plugin-replace';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import versionInjector from 'rollup-plugin-version-injector';
import copy from 'rollup-plugin-copy';
import analyze from 'rollup-plugin-analyzer';
import license from 'rollup-plugin-license';

export default {
  input: './src/MetOClient.js',
  output: {
    file: './dist/metoclient.js',
    format: 'iife',
    name: 'fmi.metoclient',
    exports: 'named'
  },
  plugins: [
    babel({
      include: [
        'src/**',
        'node_modules/luxon/**'
      ],
      presets: [
        [
          '@babel/env',
          {
            targets: {
              browsers: 'ie >= 11'
            },
            corejs: 3,
            useBuiltIns: 'usage'
          }
        ]
      ]
    }),
    replace({
      'process.env.NODE_ENV': JSON.stringify('production')
    }),
    resolve({
      preferBuiltins: true
    }),
    commonjs(),
    terser({
      keep_fnames: true
    }),
    versionInjector({
      injectInComments: {
        fileRegexp: /\.js/g,
        tag: `MetOClient {version}-test.${Date.now()} - FMI - {date}`,
        dateFormat: 'longDate'
      },
    }),
    copy({
      targets: [
        {
          src: 'css',
          dest: 'dist'
        },
        {
          src: 'img',
          dest: 'dist'
        }
      ]
    }),
    analyze({
      summaryOnly: true
    }),
    license({
      thirdParty: {
        output: 'metoclient.licenses.txt',
        includePrivate: true,
      },
    })
  ]
};