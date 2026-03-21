# Handle Header Link

An Obsidian plugin that shows an anchor icon next to headers that are referenced by internal links (`[[Note#Header]]` or `[[#Header]]`). Clicking the anchor displays a menu listing all notes that link to that header, allowing quick navigation to each source.

## Features

- Scans the vault for links targeting specific headers
- Displays a link icon next to referenced headers in the editor (Live Preview and Source mode)
- Click the icon to see all notes that reference the header, then click any entry to navigate to it
- Updates automatically as you edit notes and add or remove links

## Installation

1. Copy `main.js`, `manifest.json`, and `styles.css` to your vault at `<Vault>/.obsidian/plugins/handle-header-link/`
2. Reload Obsidian
3. Enable the plugin in **Settings → Community plugins**

## Development

```bash
npm install
npm run dev
```

## Building

```bash
npm run build
```
