const fs = require('fs-extra')
const fetch = require('node-fetch')
const tar = require('tar')
const debug = require('debug')('ipfs-or-gateway')
const { exec } = require('child_process')
const Progress = require('node-fetch-progress')

function fetchIPFS ({ cid, path }) {
  return new Promise((resolve, reject) => {
    exec(`ipfs get ${cid} -o ${path}`, err => {
      if (err) return reject(err)
      resolve()
    })
  })
}

async function fetchHTTP ({ api, cid, path, verbose }) {
  const url = `${api}/v0/get?arg=${cid}&archive=true&compress=true`
  const res = await fetch(url)
  let progress

  if (!res.ok) {
    throw new Error(`Unexpected status: ${res.status}`)
  }

  if (verbose) {
    progress = new Progress(res, { throttle: 100 })
    progress.on('progress', (p) => {
      console.log(`${p.done} bytes downloaded. ETA: ${p.etah}.`)
    })
  }

  const extractor = tar.extract({
    strip: 1,
    C: path
  })

  await new Promise((resolve, reject) => {
    res.body.pipe(extractor)
      .on('error', reject)
      .on('finish', () => {
        if (progress) progress.removeAllListeners('progress')
        resolve()
      })
  })
}

module.exports = async ({ cid, path, clean, verbose, api = 'https://ipfs.io/api' }) => {
  if (!cid || !path) {
    throw new Error('cid and path must be defined')
  }

  if (await fs.pathExists(path)) {
    debug('path already exists')
    if (clean) {
      debug('cleaning path')
      await fs.emptyDir(path)
    } else {
      debug('not cleaning')
      return
    }
  }

  debug('ensuring directory existence')
  await fs.ensureDir(path)

  try {
    debug('trying to fetch via IPFS')
    await fetchIPFS({ cid, path })
    debug('fetched via IPFS')
  } catch (e) {
    debug('could not fetch via IPFS', e)
    debug('fetching via HTTP')
    await fetchHTTP({ cid, path, api, verbose })
    debug('fetched via HTTP')
  }
}
