# Extension signing key

`prometheus-extension.pem` is the private half of the RSA keypair whose public
half is embedded in `apps/extension/public/manifest.json`'s `"key"` field.
That field is what gives the extension a stable ID (`npbijhhppmhcpbeoipdjjlmgfgdlmecg`)
computed the same way on every machine, instead of a random one per
unpacked-install location — required before tightening the server-side
origin allowlist and before Chrome Web Store submission.

**This file is gitignored and must stay that way.** Losing it means losing
the extension's ID permanently — every existing install, any origin
allowlist pinned to this ID, and the Chrome Web Store listing (once
submitted) would all need to move to a new ID. Back it up somewhere durable
outside this repo (a password manager, a private secrets store) rather than
relying on it only existing on one machine.

Regenerated with:

```bash
openssl genrsa -out prometheus-extension.pem 2048
openssl rsa -in prometheus-extension.pem -pubout -outform DER | openssl base64 -A
```

The base64 output goes into manifest.json's `"key"` field.
