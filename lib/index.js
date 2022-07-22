const os = require('os')
const fs = require('fs-extra')
const fetch = require('node-fetch')
const tar = require('tar')
const { exec } = require('child_process')
const Progress = require('node-fetch-progress')
const AbortController = require('abort-controller')
const ora = require('ora')
const prettyBytes = require('pretty-bytes')
const { unpackStreamToFs } = require('ipfs-car/unpack/fs')

function fetchIPFS ({ cid, path, archive, compress, timeout }) {
  return new Promise((resolve, reject) => {
    archive = archive ? '-a' : ''
    compress = compress ? '-C' : ''
    exec(`ipfs get ${cid} -o ${path} ${archive} ${compress}`, { timeout }, err => {
      if (err) return reject(err)
      resolve()
    })
  })
}

async function fetchHTTP ({ gateway, cid, timeout: timeoutMs, path, archive, compress, spinner }) {
  const url = `${gateway}/ipfs/${cid}?format=car`
  const controller = new AbortController()
  const fetchPromise = fetch(url, { signal: controller.signal, method: 'GET' })
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
        spinner.start(`Fetching a verifiable CAR from ${gateway}: ${prettyBytes(p.done)}`)
      }
    })

    if (archive) {
      const tmp = fs.mkdtempSync(os.tmpdir())
      await unpackStreamToFs({ input: res.body, output: tmp })
      await tar.create({
        file: path,
        strict: true,
        cwd: tmp,
        compress
      }, ['./'])
      fs.rm(tmp, { recursive: true })
    } else {
      await unpackStreamToFs({ input: res.body, output: path })
    }

    if (progress) progress.removeAllListeners('progress')
  } finally {
    clearTimeout(timeout)
  }
}

module.exports = async ({ cid, path, clean, archive, compress, verbose, timeout, gateway, retries }) => {
  if (!cid || !path) {
    throw new Error('cid and path must be defined')
  }
  if (compress && !archive) {
    throw new Error('compress requires archive mode')
  }

  // match go-ipfs behaviour: 'ipfs get' adds .tar and .tar.gz if missing
  if (compress && !path.endsWith('.tar.gz')) { path += '.tar.gz' }
  if (archive && !path.includes('.tar')) { path += '.tar' }

  if (await fs.pathExists(path)) {
    if (clean) {
      fs.lstatSync(path).isDirectory()
        ? fs.emptyDirSync(path)
        : fs.unlinkSync(path) // --archive produces a file
    } else {
      // no-op if destination already exists
      return
    }
  }

  if (!archive) await fs.ensureDir(path)
  let spinner = ora()

  try {
    spinner.start('Fetching via IPFS CLI…')
    await fetchIPFS({ cid, path, archive, compress, timeout })
    spinner.succeed(`Fetched ${cid} to ${path}!`)
    return
  } catch (_error) {
    spinner.fail('Could not fetch via IPFS.')
  }

  let err = null

  for (let i = 1; i <= retries; i++) {
    spinner = ora()
    spinner.start(`Fetching via IPFS HTTP gateway (attempt ${i})…`)

    try {
      await fetchHTTP({ cid, path, archive, compress, timeout, gateway, verbose, spinner })
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
