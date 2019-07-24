const fs = require('fs-extra')
const fetch = require('node-fetch')
const tar = require('tar')
const debug = require('debug')('ipfs-or-gateway')
const { exec } = require('child_process')
const Progress = require('node-fetch-progress')
const AbortController = require('abort-controller')

function fetchIPFS ({ cid, path }) {
  return new Promise((resolve, reject) => {
    exec(`ipfs get ${cid} -o ${path}`, err => {
      if (err) return reject(err)
      resolve()
    })
  })
}

async function fetchHTTP ({ api, cid, timeout: timeoutMs, path, verbose }) {
  const controller = new AbortController()
  const url = `${api}/v0/get?arg=${cid}&archive=true&compress=true`
  debug('url:', url)
  const res = await fetch(url, { signal: controller.signal })

  if (!res.ok) {
    throw new Error(`Unexpected status: ${res.status}`)
  }

  let timeout

  return new Promise((resolve, reject) => {
    const abort = () => {
      controller.abort()
      reject(new Error('timeout'))
    }
    timeout = setTimeout(abort, timeoutMs)

    const progress = new Progress(res, { throttle: 100 })
    progress.on('progress', (p) => {
      clearTimeout(timeout)
      timeout = setTimeout(abort, timeoutMs)

      if (verbose) {
        console.log(`${p.done} bytes downloaded. ETA: ${p.etah}.`)
      }
    })

    const extractor = tar.extract({
      strip: 1,
      C: path,
      strict: true
    })

    res.body.pipe(extractor)
      .on('error', reject)
      .on('finish', () => {
        if (progress) progress.removeAllListeners('progress')
        resolve()
      })
  }).finally(() => {
    clearTimeout(timeout)
  })
}

module.exports = async (opts) => {
  opts.timeout = opts.timeout || 3600
  opts.retries = opts.retries || 3
  opts.api = opts.api || 'https://ipfs.io/api'

  const { cid, path, clean, verbose, timeout, api, retries } = opts

  debug('options: ', opts)

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
    return
  } catch (e) {
    debug('could not fetch via IPFS', e)
  }

  debug('fetching via HTTP')
  let err = null

  for (let i = 0; i < retries; i++) {
    try {
      if (i !== 0) console.log(`Try #${i}`)
      debug(`try #${i}`)
      await fetchHTTP({ cid, path, timeout, api, verbose })
      debug('fetched via HTTP')
      return
    } catch (e) {
      err = e
      await fs.emptyDir(path)
      debug(`try #${i}`, e)
      console.log(`Could not download`)
    }
  }

  throw err
}
