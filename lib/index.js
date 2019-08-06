const fs = require('fs-extra')
const fetch = require('node-fetch')
const tar = require('tar')
const { exec } = require('child_process')
const Progress = require('node-fetch-progress')
const AbortController = require('abort-controller')
const ora = require('ora')
const prettyBytes = require('pretty-bytes')

function fetchIPFS ({ cid, path }) {
  return new Promise((resolve, reject) => {
    exec(`ipfs get ${cid} -o ${path}`, err => {
      if (err) return reject(err)
      resolve()
    })
  })
}

async function fetchHTTP ({ api, cid, timeout: timeoutMs, path, spinner }) {
  const url = `${api}/v0/get?arg=${cid}&archive=true&compress=true`
  const controller = new AbortController()
  const fetchPromise = fetch(url, { signal: controller.signal })
  const abort = () => controller.abort()
  let timeout = setTimeout(abort, timeoutMs)

  try {
    const res = await fetchPromise

    if (!res.ok) {
      throw new Error(`Unexpected status: ${res.status}`)
    }

    const progress = new Progress(res, { throttle: 100 })
    progress.on('progress', (p) => {
      clearTimeout(timeout)
      timeout = setTimeout(abort, timeoutMs)

      if (spinner) {
        spinner.start(`${prettyBytes(p.done)} fetched…`)
      }
    })

    const extractor = tar.extract({
      strip: 1,
      C: path,
      strict: true
    })

    await new Promise((resolve, reject) => {
      res.body.pipe(extractor)
        .on('error', reject)
        .on('finish', () => {
          if (progress) progress.removeAllListeners('progress')
          resolve()
        })
    })
  } finally {
    clearTimeout(timeout)
  }
}

module.exports = async (opts) => {
  opts.timeout = opts.timeout || 60000
  opts.retries = opts.retries || 3
  opts.api = opts.api || 'https://ipfs.io/api'

  const { cid, path, clean, verbose, timeout, api, retries } = opts

  if (!cid || !path) {
    throw new Error('cid and path must be defined')
  }

  if (await fs.pathExists(path)) {
    if (clean) {
      await fs.emptyDir(path)
    } else {
      return
    }
  }

  await fs.ensureDir(path)
  let spinner = ora()

  try {
    spinner.start('Fetching via IPFS…')
    await fetchIPFS({ cid, path })
    spinner.succeed(`Fetched ${cid} to ${path}!`)
    return
  } catch (_error) {
    spinner.fail(`Could not fetch via IPFS.`)
  }

  let err = null

  for (let i = 1; i <= retries; i++) {
    spinner = ora()
    spinner.start(`Fetching via IPFS HTTP gateway (attempt ${i})…`)

    try {
      await fetchHTTP({ cid, path, timeout, api, verbose, spinner })
      spinner.succeed(`Fetched ${cid} to ${path}!`)
      return
    } catch (e) {
      err = e
      await fs.emptyDir(path)
      spinner.fail(`Could not fetch via IPFS HTTP gateway (attempt ${i}).`)
    }
  }

  throw err
}
