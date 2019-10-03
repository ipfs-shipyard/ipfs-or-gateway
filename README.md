# ipfs-or-gateway

[![](https://img.shields.io/npm/v/ipfs-or-gateway.svg?style=flat-square)](https://www.npmjs.com/package/ipfs-or-gateway)
[![](https://img.shields.io/badge/freenode-%23ipfs-blue.svg?style=flat-square)](https://webchat.freenode.net/?channels=%23ipfs)

> Download an hash via IPFS, falling back to an HTTP Gateway

## Usage

```
npx ipfs-or-gateway -c cid -p path [--clean --archive --compress -a apiUrl]
```

- `--clean` – remove destination if it already exists
- `--archive` – produce `.tar` archive instead of unpacked directory tree
- `--compress` – compress produced archive with Gzipi, produce `.tar.gz` (requires `--archive`)

## Contributing

PRs accepted.

## License

MIT © Protocol Labs
