#!/usr/bin/env node

const yargs = require('yargs')
const download = require('../lib')

const argv = yargs
  .usage('$0', 'Download a CID via IPFS CLI, falling back to CAR and HTTP Gateway.')
  .scriptName('ipfs-or-gateway')
  .option('cid', {
    alias: 'c',
    describe: 'CID to download',
    type: 'string',
    demandOption: true
  }).option('path', {
    alias: 'p',
    describe: 'path to output the files',
    type: 'string',
    demandOption: true
  }).option('clean', {
    describe: 'clean path first',
    type: 'boolean',
    default: false
  }).option('archive', {
    describe: 'output a TAR archive',
    type: 'boolean',
    default: false
  }).option('compress', {
    describe: 'compress the archive with GZIP compression',
    type: 'boolean',
    default: false
  }).option('api', {
    alias: 'a',
    describe: 'HTTP Gateway used for CAR export',
    type: 'string',
    default: 'https://ipfs.io'
  }).option('retries', {
    alias: 'r',
    describe: 'number of retries for each gateway',
    type: 'number',
    default: 3
  }).option('timeout', {
    alias: 't',
    describe: 'timeout of request without data from the server',
    type: 'number',
    default: 60000
  })
  .help()
  .argv

async function run () {
  try {
    await download(argv)
  } catch (error) {
    console.error(error.toString())
    process.exit(1)
  }
}

run()
