# Z-Web
This project is an example of using [Z-Empire](https://github.com/zacm-uk/z-empire).

This project publishes a folder to Z-Empire and allows downloading and starting a local server to browse that folder.

This also demonstrates security practices that should be used when using Z-Empire (data is encrypted using aes-256-cbc and the keys are stored locally).

Storage keys that are returned from Z-Empire are stored in a local "keystore" along with the aes encryption keys for each file.

This is not designed to be used in any production processes, it purely demonstrates how to use Z-Empire, and what you should not store. I'm not a security expert so if you can find a way to securely store everything, then go for it.

## Installation
```bash
npm install -g .
```

## Usage
```bash
z-web publish test-site src .store
z-web browse test-site .store
z-web remove test-site .store
```
