const { readFile, writeFile, readdir, stat, mkdir, existsSync, unlink } = require('fs')
const { join } = require('path')
const { homedir, tmpdir } = require('os')
const { createServer } = require('http')
const { randomBytes, createCipheriv, createDecipheriv } = require('crypto')

const st = require('st')

process.env.EMPIRE_CONFIG = 'type=CLIENT storageDriver=memory nodeList=https://empire.zacm.uk hidden=true'

const { node } = require('z-empire')

const keyStorePath = process.env.KEY_STORE || join(homedir(), '.z-web-store')

const getKeyStore = () => new Promise(resolve => {
  readFile(keyStorePath, 'utf8', (error, data) => {
    if (error) {
      resolve([])
      return
    }
    resolve(JSON.parse(data))
  })
})

const setKeyStore = data => new Promise((resolve, reject) => {
  writeFile(keyStorePath, JSON.stringify(data), 'utf8', error => {
    error ? reject(error) : resolve()
  })
})

const encrypt = data => {
  const key = randomBytes(32)
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([
    iv,
    cipher.update(data),
    cipher.final()
  ])
  return { key, encrypted }
}

const decrypt = ({ encrypted, key }) => {
  const iv = encrypted.slice(0, 16)
  const data = encrypted.slice(16)
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  return Buffer.concat([
    decipher.update(data),
    decipher.final()
  ])
}

async function* readDir(dir) {
  const files = await new Promise((resolve, reject) => {
    readdir(dir, (error, files) => {
      error ? reject(error) : resolve(files)
    })
  })
  for (const file of files) {
    const fullPath = join(dir, file)
    const stats = await new Promise((resolve, reject) => {
      stat(fullPath, (error, stats) => {
        error ? reject(error) : resolve(stats)
      })
    })
    if (stats.isDirectory()) {
      yield* readDir(fullPath)
    } else {
      yield fullPath
    }
  }
}

const removeSite = async name => {
  const store = await getKeyStore()
  const existingIndex = store.findIndex(obj => obj.name === name)
  if (existingIndex > -1) {
    const site = store[existingIndex]
    for (const [ filename, { storageKey } ] of Object.entries(site.fileKeys)) {
      console.log(`Removing ${ filename }`)
      await node.removeData(storageKey)
    }
    store.splice(existingIndex, 1)
  }
  await setKeyStore(store)
}

const publishSite = async (name, siteDir) => {
  await removeSite(name)

  const fileKeys = {}
  for await (const file of readDir(siteDir)) {
    console.log(`Uploading ${ file }`)
    const fileContent = await new Promise((resolve, reject) => {
      readFile(file, (error, content) => {
        error ? reject(error) : resolve(content.toString('hex'))
      })
    })
    const { key, encrypted } = encrypt(fileContent)
    const { storageKey } = await node.setData(file, encrypted.toString('hex'))
    fileKeys[file.replace(siteDir, '')] = { storageKey, key: key.toString('hex') }
  }

  const store = await getKeyStore()
  store.push({
    name,
    fileKeys
  })
  await setKeyStore(store)
  await node.updateNodes()
  console.log('Finished upload')
}

const getSite = async name => {
  const store = await getKeyStore()
  const site = store.find(obj => obj.name === name)
  if (!site) {
    throw new Error('Site does not exist')
  }

  const tempDir = join(tmpdir(), `.z-web-temp-${ name }`)
  if (existsSync(tempDir)) {
    for await (const file of readDir(tempDir)) {
      await new Promise(resolve => {
        unlink(file, resolve)
      })
    }
  } else {
    await new Promise((resolve, reject) => {
      mkdir(tempDir, error => {
        error ? reject(error) : resolve()
      })
    })
  }

  for (const [ filename, { storageKey, key } ] of Object.entries(site.fileKeys)) {
    console.log(`Downloading ${ filename }`)
    const fileContent = await node.getData(storageKey)
    await new Promise((resolve, reject) => {
      const encrypted = Buffer.from(fileContent.value, 'hex')
      const decrypted = decrypt({ encrypted, key: Buffer.from(key, 'hex') }).toString()
      writeFile(join(tempDir, filename), Buffer.from(decrypted, 'hex'), error => {
        error ? reject(error) : resolve()
      })
    })
  }

  console.log('Finished download')

  const server = createServer(st(tempDir))

  return {
    server,
    start: port => new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, () => {
        server.off('error', reject)
        resolve()
      })
    }),
    stop: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    }),
    cleanup: async () => {
      for await (const file of readDir(tempDir)) {
        await new Promise(resolve => {
          unlink(file, resolve)
        })
      }
    }
  }
}

module.exports = {
  removeSite,
  getSite,
  publishSite
}
