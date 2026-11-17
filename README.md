<p align="center">
  <img src="src-tauri/icons/icon.png" alt="Skein" width="120" height="120" />
</p>

<h1 align="center">Skein</h1>

<p align="center">
  A thin fork of
  <a href="https://github.com/CatVinci-Studio/Textus">Textus</a> - the
  Markdown editor for macOS, Windows, Linux, iPhone and iPad, built on
  Tauri 2.<br>
  The fork follows upstream by release tag and grows its own product line
  on top: the today queue, the assets, the collect and confirm loops, and
  an interface rebuilt to its own design boards.
</p>

## What this fork is

- **Everything fork-specific lives in [docs/skein/](docs/skein/README.md)**
  (in Chinese): what we are building, the design boards, the task ledger,
  and the rules for working here.
- Upstream's code and engineering docs stay the toolbooks:
  [CONTRIBUTING.md](CONTRIBUTING.md), [docs/dev/](docs/README.md).
- Upstream's product design and UI screenshots are dropped from this
  checkout on purpose - they are not this fork's reference.
- **Upstream contributions are never built from this checkout**: clone
  upstream fresh; the procedure is in
  [docs/skein/01-纪律/publishing-gate.md](docs/skein/01-%E7%BA%AA%E5%BE%8B/publishing-gate.md).

## Development

```bash
npm install
npm run tauri dev
npm run check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the checks, and how
pull requests work. Fork collaboration rules (AI assistants included):
[docs/skein/01-纪律/AI协作纪律.md](docs/skein/01-%E7%BA%AA%E5%BE%8B/AI%E5%8D%8F%E4%BD%9C%E7%BA%AA%E5%BE%8B.md).
