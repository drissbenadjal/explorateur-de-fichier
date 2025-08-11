# ultraxplorateur

An Electron application with React

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

### Thème Neo Dark

Le thème sombre global a été refondu (palette bleu nuit / indigo / violet) pour refléter l’aperçu demandé. Il est appliqué quand le toggle passe en mode sombre. Les variables principales et overrides se trouvent en fin de `src/renderer/src/assets/base.css` (bloc `NEO DARK THEME`) et un complément spécifique wallet dans `main.css` (bloc `NEO DARK palette`). Ajustez les couleurs via `--neo-*` et `--accent-*`.
