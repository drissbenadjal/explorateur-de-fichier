import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import os from 'os'
import { autoUpdater } from 'electron-updater'
import { randomUUID } from 'crypto'
import { ethers } from 'ethers'
import { Connection, Keypair, LAMPORTS_PER_SOL, clusterApiUrl, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'

function listDrives() {
  // Windows: tester les lettres A-Z et enrichir avec free/size si possible
  const drives = []
  if (process.platform === 'win32') {
    let diskInfoMap = {}
    try {
      const out = execSync('wmic logicaldisk get Caption,FreeSpace,Size /format:csv', {
        encoding: 'utf8'
      })
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !/^Node,Caption,FreeSpace,Size/i.test(l))
      for (const line of out) {
        const parts = line.split(',')
        if (parts.length >= 4) {
          const caption = parts[1] // C:
          const freeStr = parts[2]
          const sizeStr = parts[3]
          const letter = caption?.replace(/:\\?$/, '')?.toUpperCase()
          if (letter && /[A-Z]/.test(letter)) {
            const free = parseInt(freeStr, 10)
            const size = parseInt(sizeStr, 10)
            if (!isNaN(free) && !isNaN(size)) diskInfoMap[letter] = { free, size }
          }
        }
      }
    } catch {
      // wmic peut ne pas exister (certaines versions Windows) => silencieux
    }
    for (let i = 67; i <= 90; i++) {
      // C à Z
      const letter = String.fromCharCode(i)
      const root = letter + ':\\'
      try {
        if (fs.existsSync(root)) {
          const extra = diskInfoMap[letter] || {}
          drives.push({ name: letter + ':', path: root, isDir: true, ...extra })
        }
      } catch {
        // ignore
      }
    }
  } else {
    // Unix: simplement racine (sans info stockage par défaut)
    drives.push({ name: '/', path: '/', isDir: true })
  }
  return drives
}

function safeReadDir(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    return entries
      .map((d) => {
        const full = path.join(dir, d.name)
        let size = null
        let mtime = null
        try {
          const st = fs.statSync(full)
          // taille uniquement pour les fichiers
          if (d.isFile()) size = st.size
          mtime = st.mtimeMs
        } catch {
          // ignore stat error
        }
        return {
          name: d.name,
          path: full,
          isDir: d.isDirectory(),
          size,
          mtime
        }
      })
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  } catch (e) {
    return { error: e.message }
  }
}

function registerFsIpc() {
  ipcMain.handle('fs:home', () => app.getPath('home'))
  ipcMain.handle('fs:list', (_e, dir) => {
    return safeReadDir(dir)
  })
  ipcMain.handle('fs:drives', () => listDrives())
  ipcMain.handle('fs:readFile', (_e, filePath) => {
    try {
      const stat = fs.statSync(filePath)
      const max = 2 * 1024 * 1024 // 2MB max pour preview
      if (stat.size > max) {
        return { error: 'Fichier trop volumineux (>2MB) pour prévisualisation.' }
      }
      const ext = path.extname(filePath).toLowerCase().slice(1)
      const imgExt = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
      const buffer = fs.readFileSync(filePath)
      if (imgExt.includes(ext)) {
        if (ext === 'svg') {
          return { content: buffer.toString('utf8'), name: path.basename(filePath), kind: 'svg' }
        }
        const mime = ext === 'jpg' ? 'image/jpeg' : 'image/' + (ext === 'svg' ? 'svg+xml' : ext)
        return {
          image: buffer.toString('base64'),
          mime,
          name: path.basename(filePath),
          kind: 'image'
        }
      }
      // Détection simple binaire
      const isBinary = buffer.some((b) => b === 0)
      if (isBinary) {
        return { error: 'Fichier binaire, pas de prévisualisation.' }
      }
      return { content: buffer.toString('utf8'), name: path.basename(filePath), kind: 'text' }
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('fs:known', () => {
    return {
      home: app.getPath('home'),
      desktop: app.getPath('desktop'),
      documents: app.getPath('documents'),
      downloads: app.getPath('downloads')
    }
  })
  ipcMain.handle('fs:open', async (_e, targetPath) => {
    try {
      if (!targetPath) return false
      const result = await shell.openPath(targetPath)
      if (result) return { error: result }
      return { ok: true }
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('fs:icon', async (_e, targetPath) => {
    try {
      if (!targetPath) return { error: 'path manquant' }
      const ext = path.extname(targetPath).toLowerCase()
      const { nativeImage } = require('electron')

      async function getIconWithFallback(p) {
        const sizes = ['large', 'normal', 'small']
        for (const size of sizes) {
          try {
            const img = await app.getFileIcon(p, { size })
            if (img && !img.isEmpty()) return img
          } catch {
            // continue
          }
        }
        return null
      }

      // ===================
      // Raccourcis Windows (.lnk)
      // ===================
      if (ext === '.lnk') {
        try {
          const info = shell.readShortcutLink(targetPath)
          const expandEnv = (p) => p.replace(/%([^%]+)%/g, (m, v) => process.env[v] || m)

          // 1. Icône spécifique définie dans le raccourci
          if (info?.icon) {
            try {
              let iconPath = expandEnv(info.icon.trim().replace(/"/g, ''))
              if (!path.isAbsolute(iconPath))
                iconPath = path.resolve(path.dirname(targetPath), iconPath)
              if (fs.existsSync(iconPath)) {
                const lower = iconPath.toLowerCase()
                if (/\.(ico|png|jpg|jpeg|bmp)$/i.test(lower)) {
                  const buf = fs.readFileSync(iconPath)
                  let img = nativeImage.createFromBuffer(buf)
                  if ((!img || img.isEmpty()) && /\.ico$/i.test(lower))
                    img = nativeImage.createFromPath(iconPath)
                  if (img && !img.isEmpty())
                    return { data: img.toPNG().toString('base64'), mime: 'image/png' }
                }
                if (/\.(exe|dll)$/i.test(lower)) {
                  const exeImg = await getIconWithFallback(iconPath)
                  if (exeImg) return { data: exeImg.toPNG().toString('base64'), mime: 'image/png' }
                }
              }
            } catch {
              // ignore icon explicit
            }
          }
          // 2. Cible du raccourci
          if (info?.target) {
            try {
              let real = info.target
              if (!path.isAbsolute(real)) {
                if (info.workingDirectory && path.isAbsolute(info.workingDirectory))
                  real = path.resolve(info.workingDirectory, real)
                else real = path.resolve(path.dirname(targetPath), real)
              }
              if (fs.existsSync(real)) {
                const imgReal = await getIconWithFallback(real)
                if (imgReal) return { data: imgReal.toPNG().toString('base64'), mime: 'image/png' }
              }
            } catch {
              // ignore target
            }
          }
        } catch {
          // ignore readShortcutLink
        }
        // 3. Fallback sur le .lnk lui-même
        const img = await getIconWithFallback(targetPath)
        if (img) return { data: img.toPNG().toString('base64'), mime: 'image/png' }
        return { error: 'icone lnk introuvable' }
      }

      // ===================
      // Fichiers Internet (.url)
      // ===================
      if (ext === '.url') {
        let iconCandidate = null
        try {
          const rawBuf = fs.readFileSync(targetPath)
          let raw
          if (rawBuf[0] === 0xff && rawBuf[1] === 0xfe) raw = rawBuf.toString('utf16le')
          else raw = rawBuf.toString('utf8')
          if (raw.includes('\u0000')) raw = rawBuf.toString('utf16le')
          raw = raw.split('\x00').join('')
          const urlMatch = raw.match(/^URL=(.+)$/im)
          const iconMatch = raw.match(/^IconFile=(.+)$/im)
          const expandEnv = (p) => p.replace(/%([^%]+)%/g, (m, v) => process.env[v] || m)
          if (iconMatch) {
            let iconFile = expandEnv(iconMatch[1].trim().replace(/"/g, ''))
            if (!path.isAbsolute(iconFile))
              iconFile = path.resolve(path.dirname(targetPath), iconFile)
            if (fs.existsSync(iconFile)) iconCandidate = iconFile
          }
          if (iconCandidate) {
            try {
              const lower = iconCandidate.toLowerCase()
              if (/\.(ico|png|jpg|jpeg|bmp)$/i.test(lower)) {
                const b = fs.readFileSync(iconCandidate)
                let img = nativeImage.createFromBuffer(b)
                if ((!img || img.isEmpty()) && /\.ico$/i.test(lower))
                  img = nativeImage.createFromPath(iconCandidate)
                if (img && !img.isEmpty())
                  return { data: img.toPNG().toString('base64'), mime: 'image/png' }
              }
              if (/\.(exe|dll)$/i.test(lower)) {
                const exeImg = await getIconWithFallback(iconCandidate)
                if (exeImg) return { data: exeImg.toPNG().toString('base64'), mime: 'image/png' }
              }
            } catch {
              // ignore icon file
            }
          }
          if (urlMatch) {
            try {
              const rawUrl = urlMatch[1].trim().replace(/"/g, '')
              if (/^https?:\/\//i.test(rawUrl)) {
                const u = new URL(rawUrl)
                const base = `${u.protocol}//${u.host}`
                const candidates = [
                  `${base}/favicon.ico`,
                  `${base}/favicon.png`,
                  `${base}/apple-touch-icon.png`,
                  `${base}/favicon-32x32.png`,
                  `${base}/favicon-192x192.png`
                ]
                for (const fav of candidates) {
                  try {
                    const r = await fetch(fav)
                    if (r.ok) {
                      const buf = Buffer.from(await r.arrayBuffer())
                      if (buf.length) {
                        let img = nativeImage.createFromBuffer(buf)
                        if (img && !img.isEmpty())
                          return { data: img.toPNG().toString('base64'), mime: 'image/png' }
                        return {
                          data: buf.toString('base64'),
                          mime: r.headers.get('content-type') || 'image/x-icon'
                        }
                      }
                    }
                  } catch {
                    // next candidate
                  }
                }
              }
            } catch {
              // ignore url parsing
            }
          }
        } catch {
          // ignore read
        }
        const img = await getIconWithFallback(targetPath)
        if (img) return { data: img.toPNG().toString('base64'), mime: 'image/png' }
        return { error: 'icone url introuvable' }
      }

      // Autres fichiers
      const img = await getIconWithFallback(targetPath)
      if (img) return { data: img.toPNG().toString('base64'), mime: 'image/png' }
      return { error: 'icone indisponible' }
    } catch (e) {
      return { error: e.message }
    }
  })

  // ========= Solana (démo simple) =========
  let solanaKeypair = null
  const solKeyFile = () => {
    try {
      return path.join(app.getPath('userData'), 'sol-key.json')
    } catch {
      return path.join(process.cwd(), 'sol-key.json')
    }
  }
  function loadSolanaKeypair() {
    try {
      const f = solKeyFile()
      if (!fs.existsSync(f)) return null
      const raw = JSON.parse(fs.readFileSync(f, 'utf8'))
      if (raw && raw.secretKey) {
        const sk = Buffer.from(raw.secretKey, 'base64')
        return Keypair.fromSecretKey(new Uint8Array(sk))
      }
    } catch {
      // ignore
    }
    return null
  }
  function saveSolanaKeypair(kp) {
    try {
      const f = solKeyFile()
      const sk = Buffer.from(kp.secretKey).toString('base64')
      fs.writeFileSync(f, JSON.stringify({ secretKey: sk }, null, 2), 'utf8')
    } catch {
      // ignore
    }
  }
  ipcMain.handle('sol:generate', async (_e) => {
    try {
      solanaKeypair = Keypair.generate()
      saveSolanaKeypair(solanaKeypair)
      return { address: solanaKeypair.publicKey.toBase58() }
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('sol:address', async () => {
    try {
      if (!solanaKeypair) solanaKeypair = loadSolanaKeypair()
      if (!solanaKeypair) return { error: "Aucune clé Solana, génère d'abord." }
      return { address: solanaKeypair.publicKey.toBase58() }
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('sol:balance', async (_e, { network } = {}) => {
    try {
      if (!solanaKeypair) solanaKeypair = loadSolanaKeypair()
      if (!solanaKeypair) return { error: "Aucune clé Solana, génère d'abord." }
      const cluster = network === 'mainnet' ? 'mainnet-beta' : 'devnet'
      const conn = new Connection(clusterApiUrl(cluster), 'confirmed')
      const lamports = await conn.getBalance(new PublicKey(solanaKeypair.publicKey))
      return { sol: lamports / LAMPORTS_PER_SOL, cluster }
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('sol:airdrop', async (_e, { network, amount } = {}) => {
    try {
      if (!solanaKeypair) solanaKeypair = loadSolanaKeypair()
      if (!solanaKeypair) return { error: "Aucune clé Solana, génère d'abord." }
      const cluster = network === 'mainnet' ? 'mainnet-beta' : 'devnet'
      if (cluster !== 'devnet') return { error: 'Airdrop disponible uniquement sur devnet' }
      const conn = new Connection(clusterApiUrl(cluster), 'confirmed')
      const sig = await conn.requestAirdrop(
        new PublicKey(solanaKeypair.publicKey),
        Math.floor((amount || 0.1) * LAMPORTS_PER_SOL)
      )
      return { signature: sig }
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('sol:send', async (_e, { to, amountSol, network } = {}) => {
    try {
      if (!solanaKeypair) solanaKeypair = loadSolanaKeypair()
      if (!solanaKeypair) return { error: "Aucune clé Solana, génère d'abord." }
      if (!to) return { error: 'Destinataire manquant' }
      const value = Number(amountSol)
      if (!isFinite(value) || value <= 0) return { error: 'Montant invalide' }
      const cluster = network === 'mainnet' ? 'mainnet-beta' : 'devnet'
      const conn = new Connection(clusterApiUrl(cluster), 'confirmed')
      const toPub = new PublicKey(to)
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: solanaKeypair.publicKey,
          toPubkey: toPub,
          lamports: Math.floor(value * LAMPORTS_PER_SOL)
        })
      )
      const sig = await sendAndConfirmTransaction(conn, tx, [solanaKeypair])
      return { signature: sig }
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('price:solEur', async () => {
    try {
      async function tryCoingecko() {
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=eur&include_24hr_change=true')
        if (!r.ok) throw new Error('coingecko http ' + r.status)
        const j = await r.json()
        if (!j?.solana) throw new Error('coingecko invalid')
        return { price: j.solana.eur, change: j.solana.eur_24h_change, source: 'coingecko' }
      }
      async function tryBinance() {
        const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLEUR')
        if (!r.ok) throw new Error('binance http ' + r.status)
        const j = await r.json()
        if (!j?.price) throw new Error('binance invalid')
        return { price: parseFloat(j.price), change: null, source: 'binance' }
      }
      let data = null
      try { data = await tryCoingecko() } catch { try { data = await tryBinance() } catch { /* ignore */ } }
      if (!data) return { error: 'sources indisponibles' }
      return data
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('fs:rename', (_e, oldPath, newName) => {
    try {
      if (!oldPath || !newName) return { error: 'param manquant' }
      newName = newName.trim()
      if (!newName) return { error: 'Nom vide' }
      if (/[*"<>:?|/\\]/.test(newName)) return { error: 'Caractères invalides' }
      const dir = path.dirname(oldPath)
      const newPath = path.join(dir, newName)
      if (newPath === oldPath) return { ok: true, newPath }
      if (fs.existsSync(newPath)) return { error: 'Existe déjà' }
      fs.renameSync(oldPath, newPath)
      return { ok: true, newPath }
    } catch (e) {
      return { error: e.message }
    }
  })

  // ========= Stats système =========
  ipcMain.handle('app:stats', () => {
    try {
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      const usedMem = totalMem - freeMem
      const cpus = os.cpus()
      const cpuModel = cpus?.[0]?.model || 'N/A'
      const cpuCores = cpus.length
      const load = os.loadavg?.() || []
      return {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        uptime: os.uptime(),
        memory: {
          total: totalMem,
          free: freeMem,
          used: usedMem,
          pct: totalMem ? usedMem / totalMem : 0
        },
        cpu: { model: cpuModel, cores: cpuCores, load }
      }
    } catch (e) {
      return { error: e.message }
    }
  })

  // ========= Raccourcis utilisateur =========
  function shortcutsFile() {
    try {
      return path.join(app.getPath('userData'), 'shortcuts.json')
    } catch {
      return path.join(process.cwd(), 'shortcuts.json')
    }
  }
  function readShortcuts() {
    const f = shortcutsFile()
    try {
      if (!fs.existsSync(f)) return []
      const raw = fs.readFileSync(f, 'utf8')
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return arr
      return []
    } catch {
      return []
    }
  }
  function writeShortcuts(list) {
    try {
      fs.writeFileSync(shortcutsFile(), JSON.stringify(list, null, 2), 'utf8')
    } catch {
      // ignore
    }
  }
  ipcMain.handle('app:shortcuts:list', () => {
    return readShortcuts()
  })
  ipcMain.handle('app:shortcuts:add', (_e, item) => {
    try {
      if (!item || !item.name || !item.path) return { error: 'données manquantes' }
      const list = readShortcuts()
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      const rec = { id, name: item.name.trim(), path: item.path }
      list.push(rec)
      writeShortcuts(list)
      return { ok: true, item: rec }
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('app:shortcuts:remove', (_e, id) => {
    try {
      if (!id) return { error: 'id manquante' }
      let list = readShortcuts()
      const before = list.length
      list = list.filter((s) => s.id !== id)
      writeShortcuts(list)
      return { ok: true, removed: before - list.length }
    } catch (e) {
      return { error: e.message }
    }
  })
}

// ====== Wallet ETH (simple) ======
function walletStoreFile() {
  try {
    return path.join(app.getPath('userData'), 'wallet.json')
  } catch {
    return path.join(process.cwd(), 'wallet.json')
  }
}
function loadWalletFile() {
  const f = walletStoreFile()
  if (fs.existsSync(f)) {
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {
      // ignore parse error
    }
  }
  return null
}
function saveWalletFile(data) {
  try {
    fs.writeFileSync(walletStoreFile(), JSON.stringify(data, null, 2), 'utf8')
  } catch {
    // ignore write error
  }
}

// ===== RPC Ethereum fallbacks (Sépolia & Mainnet) =====
const FALLBACK_RPCS = {
  sepolia: [
    'https://rpc.sepolia.org',
    'https://1rpc.io/sepolia',
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://sepolia.drpc.org'
  ],
  mainnet: [
    'https://cloudflare-eth.com',
    'https://ethereum-rpc.publicnode.com',
    'https://eth.llamarpc.com',
    'https://1rpc.io/eth',
    'https://rpc.ankr.com/eth'
  ]
}
// cache par chaîne
const cachedRpc = {}

async function createProviderWithTimeout(url, ms = 5000, expectedChain) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: controller.signal
    })
    const txt = await resp.text()
    let json
    try {
      json = JSON.parse(txt)
    } catch {
      throw new Error('Réponse non JSON')
    }
    const chainHex = json?.result
    if (!chainHex) throw new Error('Réponse sans result')
    const chainId = parseInt(chainHex, 16)
    if (expectedChain && chainId !== expectedChain) throw new Error('Chaîne inattendue: ' + chainId)
    const netName = chainId === 1 ? 'mainnet' : chainId === 11155111 ? 'sepolia' : 'unknown'
    const provider = new ethers.JsonRpcProvider(url, { chainId, name: netName })
    return provider
  } finally {
    clearTimeout(timer)
  }
}

async function resolveProvider(preferredUrl, chain) {
  const fallbacks = FALLBACK_RPCS[chain] || []
  const tried = new Set()
  const order = []
  if (preferredUrl) order.push(preferredUrl)
  if (cachedRpc[chain] && !order.includes(cachedRpc[chain])) order.push(cachedRpc[chain])
  for (const u of fallbacks) if (!order.includes(u)) order.push(u)
  for (const url of order) {
    if (tried.has(url)) continue
    tried.add(url)
    try {
      const expected = chain === 'mainnet' ? 1 : chain === 'sepolia' ? 11155111 : undefined
      const provider = await createProviderWithTimeout(url, 6000, expected)
      cachedRpc[chain] = url
      return { provider, url }
    } catch {
      // next
    }
  }
  throw new Error('Aucun RPC accessible pour ' + chain)
}

async function withRpc({ preferredUrl, chain }, fn) {
  const errors = []
  const tried = new Set()
  const fallbacks = FALLBACK_RPCS[chain] || []
  const order = []
  if (preferredUrl) order.push(preferredUrl)
  if (cachedRpc[chain] && !order.includes(cachedRpc[chain])) order.push(cachedRpc[chain])
  for (const u of fallbacks) if (!order.includes(u)) order.push(u)
  for (const url of order) {
    if (tried.has(url)) continue
    tried.add(url)
    try {
      const start = Date.now()
      const { provider } = await resolveProvider(url, chain)
      const result = await fn(provider)
      const latency = Date.now() - start
      return { ...result, rpcUrl: url, latency }
    } catch (e) {
      errors.push(url + ': ' + (e?.message || e))
      // essayer prochain
    }
  }
  return { error: 'RPC indisponible', details: errors }
}
function registerWalletIpc() {
  ipcMain.handle('wallet:init', async () => {
    let stored = loadWalletFile()
    if (stored?.mnemonic && stored.address) {
      return { address: stored.address }
    }
    // create new wallet (random mnemonic)
    const wallet = ethers.Wallet.createRandom()
    stored = {
      mnemonic: wallet.mnemonic?.phrase,
      address: wallet.address,
      created: Date.now(),
      id: randomUUID()
    }
    saveWalletFile(stored)
    return { address: stored.address, created: stored.created }
  })
  ipcMain.handle('wallet:balance', async (_e, opts) => {
    try {
      const { rpcUrl, chain = 'sepolia' } =
        typeof opts === 'string' ? { rpcUrl: opts, chain: 'sepolia' } : opts || {}
      const stored = loadWalletFile()
      if (!stored?.mnemonic) return { error: 'wallet absent' }
      const r = await withRpc({ preferredUrl: rpcUrl, chain }, async (provider) => {
        const [bal, block, feeData] = await Promise.all([
          provider.getBalance(stored.address),
          provider.getBlockNumber(),
          provider.getFeeData().catch(() => ({}))
        ])
        const gasWei = feeData?.gasPrice || feeData?.maxFeePerGas || null
        return {
          wei: bal.toString(),
          eth: ethers.formatEther(bal),
          block,
          gasGwei: gasWei ? Number(ethers.formatUnits(gasWei, 'gwei')).toFixed(2) : null,
          chain
        }
      })
      return r
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('wallet:send', async (_e, { to, amountEth, rpcUrl, chain = 'sepolia' }) => {
    try {
      const stored = loadWalletFile()
      if (!stored?.mnemonic) return { error: 'wallet absent' }
      if (!to || !amountEth) return { error: 'param manquant' }
      const r = await withRpc({ preferredUrl: rpcUrl, chain }, async (provider) => {
        const wallet = ethers.Wallet.fromPhrase(stored.mnemonic).connect(provider)
        const tx = await wallet.sendTransaction({
          to,
          value: ethers.parseEther(String(amountEth))
        })
        return { hash: tx.hash }
      })
      return r
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('wallet:txStatus', async (_e, { hash, rpcUrl, chain = 'sepolia' }) => {
    try {
      const r = await withRpc({ preferredUrl: rpcUrl, chain }, async (provider) => {
        const receipt = await provider.getTransactionReceipt(hash)
        if (!receipt) return { pending: true }
        return { pending: false, status: receipt.status }
      })
      return r
    } catch (e) {
      return { error: e.message }
    }
  })
  ipcMain.handle('wallet:history', async (_e, { address, chain = 'sepolia', apiKey, limit = 5 }) => {
    try {
      if (!address) return { error: 'address manquante' }
      const base = chain === 'mainnet' ? 'https://api.etherscan.io/api' : 'https://api-sepolia.etherscan.io/api'
      const params = new URLSearchParams({
        module: 'account',
        action: 'txlist',
        address,
        page: '1',
        offset: String(Math.max(5, limit * 2)),
        sort: 'desc'
      })
      if (apiKey) params.set('apikey', apiKey.trim())
      const url = base + '?' + params.toString()
      const resp = await fetch(url)
      if (!resp.ok) return { error: 'HTTP ' + resp.status }
      const data = await resp.json()
      if (data.status === '0' && data.message !== 'No transactions found') {
        return { error: data.result || data.message }
      }
      const list = Array.isArray(data.result) ? data.result : []
      const out = list.slice(0, limit).map((tx) => {
        const valEth = Number(tx.value) / 1e18
        return {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          valueEth: valEth,
          time: Number(tx.timeStamp) * 1000,
          direction: tx.from?.toLowerCase() === address.toLowerCase() ? 'out' : 'in',
          confirmed: tx.confirmations && Number(tx.confirmations) > 0,
          chain
        }
      })
      return { items: out }
    } catch (e) {
      return { error: e.message }
    }
  })

  // ===== Prix ETH/EUR (CSP contournée via main) =====
  ipcMain.handle('price:ethEur', async () => {
    try {
      async function tryCoingecko() {
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=eur&include_24hr_change=true')
        if (!r.ok) throw new Error('coingecko http ' + r.status)
        const j = await r.json()
        if (!j?.ethereum) throw new Error('coingecko invalid')
        return { price: j.ethereum.eur, change: j.ethereum.eur_24h_change, source: 'coingecko' }
      }
      async function tryBinance() {
        const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHEUR')
        if (!r.ok) throw new Error('binance http ' + r.status)
        const j = await r.json()
        if (!j?.price) throw new Error('binance invalid')
        return { price: parseFloat(j.price), change: null, source: 'binance' }
      }
      let data = null
      try { data = await tryCoingecko() } catch { try { data = await tryBinance() } catch { /* ignore */ } }
      if (!data) return { error: 'sources indisponibles' }
      return data
    } catch (e) {
      return { error: e.message }
    }
  })
}

// ======== Gestion fenêtres (splash + principale) =========
let splashWindow = null
let mainWindow = null
let mainLaunched = false

function createMainWindow() {
  if (mainLaunched) return
  mainLaunched = true
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 720,
    minWidth: 1200,
    minHeight: 520,
    show: false,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    autoHideMenuBar: true,
    transparent: false,
    backgroundColor: '#ffffffff',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('win:maximized', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('win:maximized', false)
  })
  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close()
      splashWindow = null
    }
  })
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    resizable: false,
    movable: true,
    show: false,
    alwaysOnTop: false,
    transparent: false,
    backgroundColor: '#181A1F',
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  splashWindow.on('ready-to-show', () => splashWindow.show())
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    // On suppose que le serveur Vite sert aussi le fichier splash.html à la racine /splash.html
    splashWindow.loadURL(process.env['ELECTRON_RENDERER_URL'].replace(/\/$/, '') + '/splash.html')
  } else {
    splashWindow.loadFile(join(__dirname, '../renderer/splash.html'))
  }
}

function launchMainAfter(delay = 800) {
  if (mainLaunched) return
  setTimeout(() => {
    if (!mainLaunched) createMainWindow()
  }, delay)
}

// IPC fenêtres personnalisées
function registerWindowControls() {
  function current() {
    return BrowserWindow.getFocusedWindow()
  }
  ipcMain.handle('win:minimize', () => {
    current()?.minimize()
  })
  ipcMain.handle('win:maximize', () => {
    const w = current()
    if (!w) return false
    if (w.isMaximized()) {
      w.restore()
      return false
    }
    w.maximize()
    return true
  })
  ipcMain.handle('win:close', () => {
    current()?.close()
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))
  // Version appli
  ipcMain.handle('app:version', () => app.getVersion())

  registerFsIpc()
  registerWalletIpc()
  registerWindowControls()

  createSplashWindow()

  // Auto update & progression via splash
  function sendSplash(status, extra = {}) {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send('splash:status', { status, ...extra })
    }
  }

  ipcMain.handle('splash:launchMain', () => {
    sendSplash('launching')
    createMainWindow()
  })

  sendSplash('boot')

  if (!is.dev) {
    try {
      autoUpdater.autoDownload = true
      autoUpdater.logger = require('electron-log')
      autoUpdater.logger.transports.file.level = 'info'

      autoUpdater.on('checking-for-update', () => sendSplash('checking'))
      autoUpdater.on('update-available', (info) => sendSplash('update-available', { info }))
      autoUpdater.on('update-not-available', (info) => {
        sendSplash('no-update', { info })
        launchMainAfter(700)
      })
      autoUpdater.on('error', (err) => {
        sendSplash('error', { message: err?.message })
        launchMainAfter(1000)
      })
      autoUpdater.on('download-progress', (p) => {
        sendSplash('downloading', {
          percent: p.percent,
          transferred: p.transferred,
          total: p.total,
          bytesPerSecond: p.bytesPerSecond
        })
      })
      autoUpdater.on('update-downloaded', (info) => {
        sendSplash('downloaded', { info })
        // On attend l'action utilisateur (bouton) pour installer
      })

      autoUpdater.checkForUpdates().catch((e) => {
        sendSplash('error', { message: e?.message })
        launchMainAfter(1000)
      })
      ipcMain.handle('update:quitAndInstall', () => {
        sendSplash('installing')
        try {
          autoUpdater.quitAndInstall()
        } catch (e) {
          sendSplash('error', { message: e?.message })
          launchMainAfter(1000)
        }
      })
    } catch (e) {
      console.error('Updater init error', e)
      sendSplash('error', { message: e?.message })
      launchMainAfter(800)
    }
  } else {
    // En dev, pas d'updates => splash très bref
    sendSplash('dev')
    launchMainAfter(500)
  }

  // (logic déplacée dans la section splash ci-dessus)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
