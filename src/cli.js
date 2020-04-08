#! /usr/bin/env node
const { resolve } = require('path')

const open = require('open')

const [ , , action, name, dir, _keyStore ] = process.argv

const keyStore = (_keyStore || action === 'publish') ? _keyStore : dir
if (keyStore) {
  process.env.KEY_STORE = resolve(process.cwd(), keyStore)
}

const { getSite, publishSite, removeSite } = require('./router')

const port = process.env.PORT || 3001

let promise
if (action === 'get' || action === 'browse') {
  promise = getSite(name)
    .then(server => server.start(port))
    .then(() => console.log(`Serving ${ name } of port ${ port }`))
}
if (action === 'browse') {
  promise = promise
    .then(() => console.log('Opening in default browser'))
    .then(() => open(`http://localhost:${ port }`, { wait: true }))
}
if (action === 'publish') {
  promise = publishSite(name, resolve(process.cwd(), dir))
}
if (action === 'remove') {
  promise = removeSite(name)
}

if (!promise) {
  console.error(`Invalid arguments, usage:
z-web <action> <name> [dir] [key store]
  
Actions:
  get <name> - fetches and serves the requested site
  browse <name> - fetches and opens the requested site in the default browser
  publish <name> <dir> - publish the given directory under the given name
  remove <name> - removes the given name
`)
  process.exit(1)
}

promise
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
  .then(() => {
    if (action === 'browse') {
      return
    }
    console.log('Exiting')
    process.exit()
  })
