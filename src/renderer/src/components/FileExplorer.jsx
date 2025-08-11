import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  FaArrowLeft,
  FaArrowRight,
  FaLevelUpAlt,
  FaSyncAlt,
  FaThLarge,
  FaBars,
  FaSortAlphaDown,
  FaEllipsisH,
  FaFolder,
  FaRegFile,
  FaRegFileImage,
  FaRegFileCode,
  FaRegFileArchive,
  FaRegFileAlt,
  FaHome,
  FaDesktop,
  FaDownload,
  FaHdd,
  FaSearch,
  FaPlus
} from 'react-icons/fa'
import { FaCloudDownloadAlt } from 'react-icons/fa'
import PropTypes from 'prop-types'
import { SiEthereum } from 'react-icons/si'

export default function FileExplorer({ onOpenWallet = () => {} }) {
  // Helper de formatage CPU (évite ReferenceError si utilisé ailleurs / hot reload)
  const formatCpu = useCallback((cpu) => {
    if (!cpu) return { brand: 'CPU', series: '', extra: '', cores: '?', full: 'CPU' }
    let raw = typeof cpu === 'string' ? cpu : cpu.model || 'CPU'
    // Normaliser divers symboles et garantir espaces entre segments
    raw = raw
      .replace(/\(R\)|\(TM\)|\(r\)|\(tm\)/g, '')
      // Séparer "CPU1234" éventuel => "CPU 1234"
      .replace(/CPU(?=\d)/gi, 'CPU ')
      // Retirer doubles espaces avant/ après
      .replace(/\s+/g, ' ')
      .trim()
    // Retirer mots redondants mais garder l'espace propre
    raw = raw
      .replace(/\bProcessor\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
    const cores = typeof cpu === 'object' && cpu.cores != null ? cpu.cores : '?'
    // Exemples restants: "AMD Ryzen 7 5800X3D 8-Core" ou "Intel Core i7-10750H CPU @ 2.60GHz"
    let brand = ''
    let series = ''
    let extra = ''
    const tokens = raw.split(/\s+/).filter(Boolean)
    // Sauter éventuel token "CPU" seul au début
    if (tokens[0] && /^(CPU)$/i.test(tokens[0]) && tokens.length > 1) tokens.shift()
    if (tokens.length) {
      brand = tokens.shift()
    }
    // Chercher un token contenant un chiffre (ex: 5800X3D ou i7-10750H)
    const idxNum = tokens.findIndex((t) => /\d/.test(t))
    if (idxNum >= 0) {
      series = tokens.slice(0, idxNum).join(' ')
      extra = tokens.slice(idxNum).join(' ')
    } else {
      series = tokens.join(' ')
    }
    const full = `${brand} ${series} ${extra}`.trim().replace(/\s{2,}/g, ' ')
    return { brand, series, extra, cores, full }
  }, [])
  // Etat principal
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [known, setKnown] = useState(null)
  const [search, setSearch] = useState('')
  const [history, setHistory] = useState([]) // historique pour bouton back
  const [forwardStack, setForwardStack] = useState([])
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [drives, setDrives] = useState([])
  const [viewMode, setViewMode] = useState('grid')
  const loadIdRef = useRef(0)
  // Vue actuelle interne: overview | explorer (le wallet est maintenant géré hors de ce composant)
  const [currentView, setCurrentView] = useState('overview')
  const showOverview = currentView === 'overview'
  const [sysStats, setSysStats] = useState(null)
  const [shortcuts, setShortcuts] = useState([])
  const [shortcutIcons, setShortcutIcons] = useState({})
  const [addingShortcut, setAddingShortcut] = useState(false)
  const nameRef = useRef(null)
  const pathRef = useRef(null)
  // Tri & options
  const [sortField, setSortField] = useState('name') // name | size | type | date
  const [sortDir, setSortDir] = useState('asc') // asc | desc
  const [groupFolders, setGroupFolders] = useState(false) // désactivé par défaut
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showOptionsMenu, setShowOptionsMenu] = useState(false)
  const [hideSpecialExts, setHideSpecialExts] = useState(true)
  const [showHidden, setShowHidden] = useState(false) // fichiers cachés (.) masqués par défaut
  const hideExtFor = useRef(new Set(['lnk', 'url', 'exe']))
  const sortMenuWrapRef = useRef(null)
  const optionsMenuWrapRef = useRef(null)
  const [shortcutDragId, setShortcutDragId] = useState(null)
  const [dragOverShortcutZone, setDragOverShortcutZone] = useState(false)
  const shortcutZoneDragCounter = useRef(0)
  const goOverview = () => setCurrentView('overview')

  const load = useCallback(
    async (dir, pushHistory = true) => {
      if (!dir) return
      // sortir de l'overview seulement lors d'une navigation explicite (pushHistory=true)
      if (showOverview && pushHistory) setCurrentView('explorer')
      let target = dir
      if (/^[A-Za-z]:$/.test(target)) target = target + '\\'
      const myId = ++loadIdRef.current
      setLoading(true)
      setError(null)
      const data = await window.api.fs.list(target)
      // Si une navigation plus récente a commencé, on abandonne l'application du résultat
      if (myId !== loadIdRef.current) return
      if (data && data.error) {
        setError(data.error)
        setEntries([])
      } else {
        if (pushHistory && currentPath && currentPath !== target) {
          setHistory((h) => [...h, currentPath])
          setForwardStack([])
        }
        setEntries(data)
        setCurrentPath(target)
        setSelectedFolder(null)
        setSelectedFile(null)
      }
      setLoading(false)
    },
    [currentPath, showOverview]
  )

  const openHome = useCallback(async () => {
    // Charger chemins connus mais ne pas quitter l'Overview tant que l'utilisateur n'a pas navigué
    const k = await window.api.fs.known().catch(() => null)
    if (k) setKnown(k)
    const home = k?.home || (await window.api.fs.home())
    if (!currentPath) {
      // Précharger le contenu utilisateur sans quitter l'overview
      load(home, false)
    }
    window.api.fs
      .drives()
      .then((ds) => setDrives(ds))
      .catch(() => {})
  }, [load, currentPath])

  useEffect(() => {
    openHome()
  }, [openHome])

  // Rafraîchissement automatique des lecteurs toutes les 60s
  useEffect(() => {
    const id = setInterval(() => {
      window.api.fs
        .drives()
        .then((ds) => setDrives(ds))
        .catch(() => {})
    }, 60000)
    return () => clearInterval(id)
  }, [])

  // Chargement stats & raccourcis quand Overview affiché
  const refreshOverview = useCallback(() => {
    if (!showOverview) return
    window.api.app.stats().then((s) => !s?.error && setSysStats(s))
    window.api.app.shortcuts.list().then((l) => Array.isArray(l) && setShortcuts(l))
  }, [showOverview])
  useEffect(() => {
    refreshOverview()
    if (!showOverview) return
    const id = setInterval(refreshOverview, 8000)
    return () => clearInterval(id)
  }, [showOverview, refreshOverview])

  useEffect(() => {
    // Charger icônes des raccourcis
    shortcuts.forEach((sc) => {
      if (!shortcutIcons[sc.path]) {
        window.api.fs
          .icon(sc.path)
          .then((res) => {
            if (res?.data) {
              setShortcutIcons((m) => ({
                ...m,
                [sc.path]: { data: res.data, mime: res.mime || 'image/png' }
              }))
            }
          })
          .catch(() => {})
      }
    })
  }, [shortcuts, shortcutIcons])

  const cleanPath = useCallback((p) => (p || '').trim().replace(/^"+|"+$/g, ''), [])

  const submitShortcut = () => {
    const n = nameRef.current?.value.trim()
    let p = cleanPath(pathRef.current?.value || '')
    if (!n || !p) return
    window.api.app.shortcuts.add({ name: n, path: p }).then((r) => {
      if (!r?.error && r.item) {
        // si utilisateur avait mis des guillemets ils sont déjà retirés
        setShortcuts((s) => [...s, { ...r.item, path: cleanPath(r.item.path) }])
        window.api.fs.icon(cleanPath(r.item.path)).then((res) => {
          if (res?.data) {
            setShortcutIcons((m) => ({
              ...m,
              [cleanPath(r.item.path)]: { data: res.data, mime: res.mime || 'image/png' }
            }))
          }
        })
        setAddingShortcut(false)
        nameRef.current.value = ''
        pathRef.current.value = ''
      }
    })
  }
  const removeShortcut = (id) => {
    window.api.app.shortcuts.remove(id).then((r) => {
      if (r?.ok) setShortcuts((s) => s.filter((x) => x.id !== id))
    })
  }
  const openShortcut = (sc) => {
    if (!sc) return
    const p = cleanPath(sc.path)
    window.api.fs.open(p)
  }
  const ensureShortcutIcon = useCallback(
    (p) => {
      const cp = cleanPath(p)
      if (shortcutIcons[cp]) return
      window.api.fs
        .icon(cp)
        .then((res) => {
          if (res?.data) {
            setShortcutIcons((m) => ({
              ...m,
              [cp]: { data: res.data, mime: res.mime || 'image/png' }
            }))
          }
        })
        .catch(() => {})
    },
    [shortcutIcons, cleanPath]
  )
  // ============ Drag & Drop Shortcuts ============
  const onShortcutDragStart = (e, id) => {
    setShortcutDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(id))
  }
  const reorderShortcuts = useCallback((fromId, toId) => {
    if (fromId === toId) return
    setShortcuts((prev) => {
      const idxFrom = prev.findIndex((s) => s.id === fromId)
      const idxTo = prev.findIndex((s) => s.id === toId)
      if (idxFrom === -1 || idxTo === -1) return prev
      const clone = [...prev]
      const [item] = clone.splice(idxFrom, 1)
      clone.splice(idxTo, 0, item)
      // Optionnel: persister ordre via API si disponible
      window.api?.app?.shortcuts?.reorder &&
        window.api.app.shortcuts.reorder(clone.map((s) => s.id))
      return clone
    })
  }, [])
  const onShortcutDragOver = (e) => {
    if (shortcutDragId == null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const el = e.currentTarget
    el.classList.add('drag-over')
  }
  const onShortcutDragLeave = (e) => {
    e.currentTarget.classList.remove('drag-over')
  }
  const onShortcutDrop = (e, overId) => {
    e.preventDefault()
    e.currentTarget.classList.remove('drag-over')
    if (shortcutDragId != null) reorderShortcuts(shortcutDragId, overId)
    setShortcutDragId(null)
  }
  const onShortcutDragEnd = () => {
    document
      .querySelectorAll('.shortcut-tile.drag-over')
      .forEach((n) => n.classList.remove('drag-over'))
    setShortcutDragId(null)
  }
  // ===== Drag & Drop création de raccourcis =====
  const onShortcutAreaDragOver = (e) => {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
  }
  const onShortcutAreaDragEnter = (e) => {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    shortcutZoneDragCounter.current++
    setDragOverShortcutZone(true)
  }
  const onShortcutAreaDragLeave = (e) => {
    if (![...e.dataTransfer.types].includes('Files')) return
    shortcutZoneDragCounter.current = Math.max(0, shortcutZoneDragCounter.current - 1)
    if (shortcutZoneDragCounter.current === 0) setDragOverShortcutZone(false)
  }
  const onShortcutAreaDrop = (e) => {
    if (!e.dataTransfer.files?.length) return
    e.preventDefault()
    shortcutZoneDragCounter.current = 0
    setDragOverShortcutZone(false)
    const dropped = extractDroppedPaths(e)
    dropped.forEach(({ path: p, name }) => {
      if (!p) return
      const np = cleanPath(p)
      if (shortcuts.some((s) => cleanPath(s.path).toLowerCase() === np.toLowerCase())) return
      window.api.app.shortcuts.add({ name, path: np }).then((r) => {
        if (!r?.error && r.item) {
          setShortcuts((s) => [...s, { ...r.item, path: r.item.path }])
          ensureShortcutIcon(r.item.path)
        }
      })
    })
  }
  // Extraction robuste
  function extractDroppedPaths(event) {
    const out = []
    for (const f of Array.from(event.dataTransfer.files || [])) {
      const p = f.path || f.webkitRelativePath || ''
      out.push({ path: p, name: f.name.replace(/\.[^/.]+$/, '') || f.name })
    }
    const uriList = event.dataTransfer.getData('text/uri-list')
    if (uriList) {
      uriList
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
        .forEach((u) => {
          if (!u.startsWith('file://')) return
          try {
            const dec = decodeURI(u.replace('file://', ''))
            if (!out.some((o) => o.path === dec)) {
              const base = dec.split(/[\\/]/).pop() || 'Fichier'
              out.push({ path: dec, name: base.replace(/\.[^/.]+$/, '') })
            }
          } catch {
            /* ignore */
          }
        })
    }
    return out
  }
  // =====================
  // Fichiers & dossiers filtrés + tri
  // =====================
  const sortedEntries = useMemo(() => {
    if (!entries) return []
    let arr = [...entries]
    if (!showHidden) arr = arr.filter((e) => !e.name.startsWith('.'))
    const dirFactor = groupFolders ? 1 : 0
    arr.sort((a, b) => {
      if (dirFactor) {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      }
      let av
      let bv
      switch (sortField) {
        case 'size':
          av = a.isDir ? 0 : a.size || 0
          bv = b.isDir ? 0 : b.size || 0
          break
        case 'type': {
          const aExt = a.isDir ? '0_folder' : (a.name.split('.').pop() || '').toLowerCase()
          const bExt = b.isDir ? '0_folder' : (b.name.split('.').pop() || '').toLowerCase()
          av = aExt
          bv = bExt
          break
        }
        case 'date':
          av = a.mtime || 0
          bv = b.mtime || 0
          break
        case 'name':
        default:
          av = a.name.toLowerCase()
          bv = b.name.toLowerCase()
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [entries, sortField, sortDir, groupFolders, showHidden])

  const directories = useMemo(() => sortedEntries.filter((e) => e.isDir), [sortedEntries])
  const files = useMemo(() => sortedEntries.filter((e) => !e.isDir), [sortedEntries])
  // Combinaisons filtrées (si groupFolders=false on ne force plus dossiers d'abord)
  const filteredDirs = useMemo(() => {
    if (!groupFolders) return []
    if (!search) return directories
    const low = search.toLowerCase()
    return directories.filter((d) => d.name.toLowerCase().includes(low))
  }, [directories, search, groupFolders])
  const filteredFiles = useMemo(() => {
    if (!groupFolders) return []
    if (!search) return files
    const low = search.toLowerCase()
    return files.filter((f) => f.name.toLowerCase().includes(low))
  }, [files, search, groupFolders])
  const gridItems = useMemo(() => {
    if (groupFolders) return [...filteredDirs, ...filteredFiles]
    // pas de regroupement : filtrer directement l'ensemble trié
    if (!search) return sortedEntries
    const low = search.toLowerCase()
    return sortedEntries.filter((e) => e.name.toLowerCase().includes(low))
  }, [groupFolders, filteredDirs, filteredFiles, search, sortedEntries])
  const filteredCombined = useMemo(() => {
    if (groupFolders) return [...filteredDirs, ...filteredFiles]
    if (!search) return sortedEntries
    const low = search.toLowerCase()
    return sortedEntries.filter((e) => e.name.toLowerCase().includes(low))
  }, [groupFolders, filteredDirs, filteredFiles, search, sortedEntries])

  const [nativeIcons, setNativeIcons] = useState({})
  const nativeIconExts = useRef(['lnk', 'url', 'exe'])
  const fetchingRef = useRef(new Set())
  const fetchNativeIcon = useCallback(
    async (item) => {
      if (!item || item.isDir) return
      const ext = item.name.split('.').pop()?.toLowerCase()
      if (!ext || !nativeIconExts.current.includes(ext)) return
      if (nativeIcons[item.path] || fetchingRef.current.has(item.path)) return
      fetchingRef.current.add(item.path)
      const res = await window.api.fs.icon(item.path)
      if (res?.data) {
        setNativeIcons((m) => ({
          ...m,
          [item.path]: { data: res.data, mime: res.mime || 'image/png' }
        }))
      }
      fetchingRef.current.delete(item.path)
    },
    [nativeIcons]
  )
  // ===== Menu contextuel =====
  const [ctxMenu, setCtxMenu] = useState({ visible: false, x: 0, y: 0, item: null })
  const closeCtx = useCallback(() => setCtxMenu({ visible: false, x: 0, y: 0, item: null }), [])

  function computeMenuPosition(clientX, clientY) {
    const padding = 8
    const mw = 220
    const mh = 260
    let x = clientX
    let y = clientY
    if (x + mw > window.innerWidth - padding) x = window.innerWidth - mw - padding
    if (y + mh > window.innerHeight - padding) y = window.innerHeight - mh - padding
    if (x < padding) x = padding
    if (y < padding) y = padding
    return { x, y }
  }

  const openCtxFor = (e, item) => {
    e.preventDefault()
    const pos = computeMenuPosition(e.clientX, e.clientY)
    setCtxMenu({ visible: true, x: pos.x, y: pos.y, item })
  }
  const openCtxBackground = (e) => {
    // clic droit sur zone vide
    if (e.target.closest('.tile-item, .fe-file-row, .ctx-menu')) return
    e.preventDefault()
    const pos = computeMenuPosition(e.clientX, e.clientY)
    setCtxMenu({ visible: true, x: pos.x, y: pos.y, item: null })
  }
  const copyText = async (txt) => {
    try {
      await navigator.clipboard.writeText(txt)
    } catch {
      // ignore
    }
  }
  const refreshIcon = (item) => {
    if (!item) return
    setNativeIcons((m) => {
      const c = { ...m }
      delete c[item.path]
      return c
    })
    fetchNativeIcon(item)
  }
  useEffect(() => {
    if (!ctxMenu.visible) return
    const onDown = (e) => {
      const menu = document.querySelector('.ctx-menu')
      if (menu && !menu.contains(e.target)) closeCtx()
    }
    const onScroll = () => closeCtx()
    const onEsc = (e) => {
      if (e.key === 'Escape') closeCtx()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [ctxMenu.visible, closeCtx])

  // Précharger icônes visibles après chaque listing
  useEffect(() => {
    if (!entries.length) return
    entries.forEach((e) => fetchNativeIcon(e))
  }, [entries, fetchNativeIcon])

  const clickFile = (file) => {
    setSelectedFile(file.path)
    setSelectedFolder(null)
  }

  const goUp = () => {
    if (!currentPath) return
    const norm = currentPath.replace(/\\+$/, '')
    // Si on est déjà à la racine lecteur (ex: C:\) on ne monte pas plus
    if (/^[A-Za-z]:$/.test(norm) || /^[A-Za-z]:\\?$/.test(currentPath)) return
    const segments = norm.split(/\\|\//)
    segments.pop()
    if (!segments.length) return
    let parent = segments.join('/')
    // Si parent devient 'C:' => remettre C:\
    if (/^[A-Za-z]:$/.test(parent)) parent += '\\'
    load(parent)
  }

  const goBack = () => {
    setHistory((h) => {
      if (!h.length) return h
      const prev = h[h.length - 1]
      setForwardStack((f) => [currentPath, ...f])
      load(prev, false)
      return h.slice(0, -1)
    })
  }

  const goForward = () => {
    setForwardStack((f) => {
      if (!f.length) return f
      const next = f[0]
      setHistory((h) => [...h, currentPath])
      load(next, false)
      return f.slice(1)
    })
  }

  // =====================
  // Segments (breadcrumbs)
  // =====================
  const segments = useMemo(() => {
    if (!currentPath) return []

    // Racine d'un lecteur (C:\ ou C:/)
    if (/^[A-Za-z]:[\\/]?$/.test(currentPath)) {
      const letter = currentPath[0].toUpperCase()
      return [{ name: letter + ':', path: letter + ':\\' }]
    }

    let normalized = currentPath.replace(/\\+/g, '/').replace(/\/+$/, '')
    const rawParts = normalized.split('/').filter(Boolean)

    const items = []
    if (normalized.startsWith('/')) {
      items.push({ name: '/', path: '/' })
    }

    let acc = items.length ? items[0].path : ''
    rawParts.forEach((part) => {
      if (/^[A-Za-z]:$/.test(part)) {
        acc = part + '/' // assurer le slash
        items.push({ name: part, path: part + '\\' })
      } else {
        acc = acc
          ? acc === '/'
            ? `/${part}`
            : `${acc.replace(/\\$/, '').replace(/\/$/, '')}/${part}`
          : part
        items.push({ name: part, path: /^[A-Za-z]:$/.test(acc) ? acc + '\\' : acc })
      }
    })
    return items
  }, [currentPath])

  const isActivePath = (p) => {
    if (!currentPath) return false
    const norm = (x) => x.replace(/\\+/g, '\\').replace(/\\$/, '').toLowerCase()
    return norm(currentPath) === norm(p)
  }

  const hideExtCondition = (ext) => hideSpecialExts && hideExtFor.current.has(ext)

  // Nom d'utilisateur dérivé du chemin home
  const userName = useMemo(() => {
    if (!known?.home) return 'Utilisateur'
    const parts = known.home.replace(/\\+/g, '/').split('/')
    return parts[parts.length - 1] || 'Utilisateur'
  }, [known])

  useEffect(() => {
    if (!showSortMenu && !showOptionsMenu) return
    const onPointerDown = (e) => {
      if (showSortMenu && sortMenuWrapRef.current && !sortMenuWrapRef.current.contains(e.target)) {
        setShowSortMenu(false)
      }
      if (
        showOptionsMenu &&
        optionsMenuWrapRef.current &&
        !optionsMenuWrapRef.current.contains(e.target)
      ) {
        setShowOptionsMenu(false)
      }
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showSortMenu) setShowSortMenu(false)
        if (showOptionsMenu) setShowOptionsMenu(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [showSortMenu, showOptionsMenu])

  // Renommage
  const [renamingPath, setRenamingPath] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef(null)
  const renamingCommittedRef = useRef(false)
  const startRenaming = (item) => {
    const hasDot = !item.isDir && item.name.includes('.')
    const rawExt = hasDot ? item.name.split('.').pop() : ''
    const extLower = rawExt ? rawExt.toLowerCase() : ''
    const baseName =
      hasDot && hideExtCondition(extLower) ? item.name.slice(0, -(extLower.length + 1)) : item.name
    setRenamingPath(item.path)
    setRenameValue(baseName)
    renamingCommittedRef.current = false
    setTimeout(() => renameInputRef.current && renameInputRef.current.select(), 10)
  }
  const cancelRename = () => {
    setRenamingPath(null)
    setRenameValue('')
    renamingCommittedRef.current = false
  }
  const commitRename = async (item, newRaw) => {
    if (!item) return
    if (renamingCommittedRef.current) return
    // Reconstituer le nom affiché original (sans extension si masquée)
    const hasDot = !item.isDir && item.name.includes('.')
    const rawExt = hasDot ? item.name.split('.').pop() : ''
    const extLower = rawExt ? rawExt.toLowerCase() : ''
    let originalBase = item.name
    if (hasDot && hideExtCondition(extLower)) {
      originalBase = item.name.slice(0, -(extLower.length + 1))
    }
    let finalNameInput = (newRaw != null ? newRaw : renameValue).trim()
    if (!finalNameInput) {
      cancelRename()
      return
    }
    if (finalNameInput === originalBase) {
      cancelRename()
      return
    }
    if (rawExt && !finalNameInput.toLowerCase().endsWith('.' + extLower) && !item.isDir) {
      finalNameInput = finalNameInput + '.' + rawExt
    }
    renamingCommittedRef.current = true
    const res = await window.api.fs.rename(item.path, finalNameInput)
    if (res?.error) {
      alert('Erreur: ' + res.error)
      renamingCommittedRef.current = false
      return
    }
    cancelRename()
    load(currentPath, false)
  }

  const [editingShortcutId, setEditingShortcutId] = useState(null)
  const editNameRef = useRef(null)
  const editPathRef = useRef(null)
  const startEditShortcut = (sc) => {
    if (!sc) return
    setEditingShortcutId(sc.id)
    setTimeout(() => {
      if (editNameRef.current) editNameRef.current.value = sc.name
      if (editPathRef.current) editPathRef.current.value = sc.path
      editNameRef.current && editNameRef.current.focus()
    }, 0)
  }
  const cancelEditShortcut = () => setEditingShortcutId(null)
  const applyEditShortcut = () => {
    if (!editingShortcutId) return cancelEditShortcut()
    const n = editNameRef.current?.value.trim()
    const p = cleanPath(editPathRef.current?.value.trim())
    if (!n || !p) return cancelEditShortcut()
    setShortcuts((list) =>
      list.map((s) => (s.id === editingShortcutId ? { ...s, name: n, path: p } : s))
    )
    ensureShortcutIcon(p)
    setEditingShortcutId(null)
  }

  // Update notification
  const [updateReady, setUpdateReady] = useState(false)
  useEffect(() => {
    if (window.api?.app?.onUpdateReady) {
      window.api.app.onUpdateReady(() => setUpdateReady(true))
    }
  }, [])
  const installUpdate = () => {
    window.api?.app?.installUpdate && window.api.app.installUpdate()
  }

  // ========== Rendu ==========
  return (
    <div className="fe-layout minimal">
      {/* Update banner */}
      {updateReady && (
        <div className="update-banner">
          <div className="ub-left">
            <FaCloudDownloadAlt size={14} />
            <span>Mise à jour disponible</span>
          </div>
          <div className="ub-actions">
            <button className="mini-btn" onClick={installUpdate}>
              Redémarrer et installer
            </button>
          </div>
        </div>
      )}
      <aside className="sidebar-app">
        <div className="side-group" style={{ paddingBottom: 4 }}>
          <button className={`side-item ${showOverview ? 'active' : ''}`} onClick={goOverview}>
            <FaHome size={14} />
            <span>Overview</span>
          </button>
        </div>
        <div className="side-group" style={{ paddingBottom: 4 }}>
          <button className="side-item" onClick={onOpenWallet} title="Aller au wallet">
            <SiEthereum size={14} />
            <span>Wallet</span>
          </button>
        </div>
        <div className="side-group">
          <div className="side-group-label">Quick Access</div>
          {known && (
            <>
              <button
                className={`side-item ${!showOverview && isActivePath(known.home) ? 'active' : ''}`}
                onClick={() => load(known.home)}
              >
                <FaHome size={14} />
                <span>User</span>
              </button>
              <button
                className={`side-item ${!showOverview && isActivePath(known.desktop) ? 'active' : ''}`}
                onClick={() => load(known.desktop)}
              >
                <FaDesktop size={14} />
                <span>Desktop</span>
              </button>
              <button
                className={`side-item ${!showOverview && isActivePath(known.documents) ? 'active' : ''}`}
                onClick={() => load(known.documents)}
              >
                <FaRegFileAlt size={14} />
                <span>Documents</span>
              </button>
              <button
                className={`side-item ${!showOverview && isActivePath(known.downloads) ? 'active' : ''}`}
                onClick={() => load(known.downloads)}
              >
                <FaDownload size={14} />
                <span>Downloads</span>
              </button>
            </>
          )}
          <button className="side-item" onClick={goUp} disabled={showOverview}>
            <FaLevelUpAlt size={14} />
            <span>Parent folder</span>
          </button>
        </div>
        <div className="side-separator" />
        <div className="side-group">
          <div className="side-group-label">Lecteurs</div>
          {drives.map((d) => {
            const isLetter = /^[A-Za-z]:/.test(d.path)
            const letter = isLetter ? d.path[0].toUpperCase() : null
            const label = letter ? `Disque local (${letter}:)` : d.name
            return (
              <button
                key={d.path}
                className={`side-item ${!showOverview && isActivePath(d.path) ? 'active' : ''}`}
                onClick={() => load(d.path)}
                disabled={showOverview}
              >
                <FaHdd size={14} />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
        {/* Usage stockage */}
        {drives.some((d) => d.size && d.free != null) && (
          <div className="side-storage-section">
            <div className="side-group-label">Stockage</div>
            <div className="storage-list">
              {drives
                .filter((d) => d.size && d.free != null)
                .map((d) => {
                  const used = d.size - d.free
                  const pct = d.size > 0 ? (used / d.size) * 100 : 0
                  const toGB = (v) => (v / 1024 ** 3).toFixed(1)
                  return (
                    <div key={d.path} className="storage-item">
                      <div className="storage-head">
                        <span className="storage-label">{d.path[0].toUpperCase()}:</span>
                        <span className="storage-pct">{pct.toFixed(0)}%</span>
                      </div>
                      <div
                        className="storage-bar-wrap"
                        title={`${toGB(used)} GB / ${toGB(d.size)} GB`}
                      >
                        <div className="storage-bar">
                          <div className="storage-bar-fill" style={{ width: pct + '%' }} />
                        </div>
                      </div>
                      <div className="storage-size">
                        {toGB(used)} / {toGB(d.size)} GB
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
  </aside>
  <main className={`fe-main ${showOverview ? 'overview-mode' : 'no-preview'}`}>
        {/* Barre top (cachée en mode Overview) */}
        {!showOverview && (
          <div
            className="fe-topbar nav-bar refined"
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <div className="nav-group nav-history">
              <button
                type="button"
                className="nav-pill"
                disabled={!history.length}
                onClick={goBack}
                title="Back"
              >
                <FaArrowLeft size={14} />
              </button>
              <button
                type="button"
                className="nav-pill"
                disabled={!forwardStack.length}
                onClick={goForward}
                title="Forward"
              >
                <FaArrowRight size={14} />
              </button>
              <button type="button" className="nav-pill" onClick={goUp} title="Parent">
                <FaLevelUpAlt size={14} />
              </button>
              <button
                type="button"
                className="nav-pill"
                onClick={() => load(currentPath, false)}
                title="Refresh"
              >
                <FaSyncAlt size={14} />
              </button>
            </div>
            <div className="nav-group breadcrumb-wrap" style={{ flex: 1, minWidth: 0 }}>
              <div className="path-bar">
                {segments.map((s, i) => (
                  <span key={s.path} className="path-seg" onClick={() => load(s.path)}>
                    {s.name}
                    {i < segments.length - 1 && <span className="path-sep">›</span>}
                  </span>
                ))}
                {!segments.length && <span className="path-placeholder">Chemin…</span>}
              </div>
            </div>
            <div className="nav-group nav-actions" style={{ gap: 8 }}>
              <button
                className={`nav-pill ${viewMode === 'grid' ? 'active' : ''}`}
                title="Grid view"
                onClick={() => setViewMode('grid')}
              >
                <FaThLarge size={14} />
              </button>
              <button
                className={`nav-pill ${viewMode === 'list' ? 'active' : ''}`}
                title="List view"
                onClick={() => setViewMode('list')}
              >
                <FaBars size={14} />
              </button>
              <div className="dropdown-wrap" style={{ position: 'relative' }} ref={sortMenuWrapRef}>
                <button
                  className={`nav-pill ${showSortMenu ? 'active' : ''}`}
                  title="Sort"
                  onClick={() => setShowSortMenu((v) => !v)}
                >
                  <FaSortAlphaDown size={14} />
                </button>
                {showSortMenu && (
                  <div className="popover-menu fancy-menu">
                    <div className="menu-section-label">Trier par</div>
                    {['name', 'size', 'type', 'date'].map((f) => (
                      <button
                        key={f}
                        className={`menu-item ${sortField === f ? 'active' : ''}`}
                        onClick={() => setSortField(f)}
                      >
                        {(f === 'name' && 'Nom') ||
                          (f === 'size' && 'Taille') ||
                          (f === 'type' && 'Type') ||
                          (f === 'date' && 'Date')}
                      </button>
                    ))}
                    <div className="menu-divider" />
                    <div className="menu-row-buttons">
                      <button
                        className={`menu-item tiny-btn ${sortDir === 'asc' ? 'active' : ''}`}
                        onClick={() => setSortDir('asc')}
                      >
                        Asc
                      </button>
                      <button
                        className={`menu-item tiny-btn ${sortDir === 'desc' ? 'active' : ''}`}
                        onClick={() => setSortDir('desc')}
                      >
                        Desc
                      </button>
                    </div>
                    <div className="menu-divider" />
                    <label className="menu-check">
                      <input
                        type="checkbox"
                        checked={groupFolders}
                        onChange={(e) => setGroupFolders(e.target.checked)}
                      />
                      <span>Dossiers d&apos;abord</span>
                    </label>
                  </div>
                )}
              </div>
              <div
                className="dropdown-wrap"
                style={{ position: 'relative' }}
                ref={optionsMenuWrapRef}
              >
                <button
                  className={`nav-pill ${showOptionsMenu ? 'active' : ''}`}
                  title="Options"
                  onClick={() => setShowOptionsMenu((v) => !v)}
                >
                  <FaEllipsisH size={14} />
                </button>
                {showOptionsMenu && (
                  <div className="popover-menu fancy-menu">
                    <div className="menu-section-label">Options</div>
                    <label className="menu-check">
                      <input
                        type="checkbox"
                        checked={hideSpecialExts}
                        onChange={(e) => setHideSpecialExts(e.target.checked)}
                      />
                      <span>Masquer ext .lnk/.url/.exe</span>
                    </label>
                    <label className="menu-check">
                      <input
                        type="checkbox"
                        checked={showHidden}
                        onChange={(e) => setShowHidden(e.target.checked)}
                      />
                      <span>Afficher fichiers cachés (.)</span>
                    </label>
                    <label className="menu-check">
                      <input
                        type="checkbox"
                        checked={groupFolders}
                        onChange={(e) => setGroupFolders(e.target.checked)}
                      />
                      <span>Dossiers d&apos;abord</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
            <div className="fe-status-zone mini" style={{ marginLeft: 8 }}>
              {loading && <span className="spinner" />}
              {error && (
                <span className="fe-status error" title={error}>
                  !
                </span>
              )}
            </div>
            {/* Recherche tout à droite */}
            <div className="top-search-wrap">
              <FaSearch size={13} className="top-search-ico" />
              <input
                className="top-search-input"
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={showOverview}
              />
            </div>
          </div>
        )}
        {currentView === 'overview' ? (
          <div className="overview-wrap fe-content-scroll overview-gradient">
            <div className="ov-container">
              <div className="ov-header-line">
                <div className="ov-welcome">
                  <h1 className="ov-title">Bienvenue, {userName}</h1>
                  <div className="ov-sub">Vue d&apos;ensemble système & raccourcis</div>
                </div>
                <div className="ov-header-actions">
                  <button className="nav-pill" onClick={refreshOverview} title="Rafraîchir">
                    <FaSyncAlt size={14} />
                  </button>
                </div>
              </div>

              <div className="ov-grid">
                {/* Carte raccourcis déplacée en premier */}
                <div className="ov-card shortcuts">
                  <div className="ov-card-title line">
                    <span>Raccourcis</span>
                    {!addingShortcut && (
                      <button className="mini-btn" onClick={() => setAddingShortcut(true)}>
                        <FaPlus size={11} />
                        <span>Ajouter</span>
                      </button>
                    )}
                  </div>
                  <div className="shortcut-list">
                    {!shortcuts.length && <div className="ov-empty">Aucun raccourci</div>}
                    <div
                      className={`shortcut-pill-list ${dragOverShortcutZone ? 'drop-active' : ''}`}
                      onDragOver={onShortcutAreaDragOver}
                      onDragEnter={onShortcutAreaDragEnter}
                      onDragLeave={onShortcutAreaDragLeave}
                      onDrop={onShortcutAreaDrop}
                    >
                      {dragOverShortcutZone && (
                        <div className="shortcut-drop-overlay">Déposez pour créer un raccourci</div>
                      )}
                      {shortcuts.map((sc) => {
                        const ext = sc.path.split('.').pop()?.toLowerCase() || ''
                        const forceNative = ['lnk', 'url', 'exe'].includes(ext)
                        const cp = cleanPath(sc.path)
                        const isEditing = editingShortcutId === sc.id
                        return (
                          <div
                            key={sc.id}
                            className={`shortcut-tile ${isEditing ? 'editing' : ''}`}
                            tabIndex={0}
                            title={sc.path}
                            draggable={!isEditing}
                            onDragStart={(e) => onShortcutDragStart(e, sc.id)}
                            onDragOver={(e) => onShortcutDragOver(e, sc.id)}
                            onDragLeave={onShortcutDragLeave}
                            onDrop={(e) => onShortcutDrop(e, sc.id)}
                            onDragEnd={onShortcutDragEnd}
                            onDoubleClick={() => !isEditing && openShortcut(sc)}
                            onMouseEnter={() => ensureShortcutIcon(sc.path)}
                          >
                            <div
                              className={`shortcut-ico-wrap ${forceNative && shortcutIcons[cp] ? 'native' : ''}`}
                            >
                              {shortcutIcons[cp] ? (
                                <img
                                  src={`data:${shortcutIcons[cp].mime};base64,${shortcutIcons[cp].data}`}
                                  alt={sc.name}
                                />
                              ) : (
                                <span
                                  className="sc-ico-ph"
                                  style={{
                                    width: forceNative ? 48 : 40,
                                    height: forceNative ? 48 : 40
                                  }}
                                />
                              )}
                            </div>
                            {isEditing ? (
                              <div className="shortcut-edit-form">
                                <input
                                  ref={editNameRef}
                                  className="ov-input sm"
                                  placeholder="Nom"
                                />
                                <input
                                  ref={editPathRef}
                                  className="ov-input sm"
                                  placeholder="Chemin"
                                />
                                <div className="se-actions">
                                  <button className="mini-btn" onClick={applyEditShortcut}>
                                    OK
                                  </button>
                                  <button className="mini-btn ghost" onClick={cancelEditShortcut}>
                                    Annuler
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="shortcut-label" onClick={() => openShortcut(sc)}>
                                {sc.name}
                              </div>
                            )}
                            {!isEditing && (
                              <div className="shortcut-actions">
                                <button
                                  className="shortcut-btn edit"
                                  title="Modifier"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    startEditShortcut(sc)
                                  }}
                                >
                                  ✎
                                </button>
                                <button
                                  className="shortcut-btn del"
                                  title="Supprimer"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (confirm('Supprimer ce raccourci ?')) removeShortcut(sc.id)
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  {addingShortcut && (
                    <div className="add-shortcut-form">
                      <input ref={nameRef} placeholder="Nom" className="ov-input" />
                      <input ref={pathRef} placeholder="Chemin" className="ov-input" />
                      <div className="form-actions">
                        <button className="mini-btn" onClick={submitShortcut}>
                          OK
                        </button>
                        <button className="mini-btn ghost" onClick={() => setAddingShortcut(false)}>
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Carte stats principales */}
                <div className="ov-card kpis">
                  <div className="ov-card-title">Système</div>
                  {!sysStats && <div className="ov-loading">Chargement…</div>}
                  {sysStats && (
                    <div className="kpi-grid">
                      <div className="kpi-item">
                        <span className="kpi-label">OS</span>
                        <span className="kpi-value">{sysStats.platform}</span>
                        <span className="kpi-sub">{sysStats.release}</span>
                      </div>
                      <div className="kpi-item">
                        <span className="kpi-label">Architecture</span>
                        <span className="kpi-value">{sysStats.arch}</span>
                        <span className="kpi-sub">CPU {sysStats.cpu.cores} cœurs</span>
                      </div>
                      <div className="kpi-item">
                        <span className="kpi-label">Uptime</span>
                        <span className="kpi-value">{Math.floor(sysStats.uptime / 3600)}h</span>
                        <span className="kpi-sub">{(sysStats.uptime / 3600).toFixed(1)} h</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Carte mémoire + CPU */}
                <div className="ov-card perf">
                  <div className="ov-card-title">Performance</div>
                  {!sysStats && <div className="ov-loading">…</div>}
                  {sysStats && (
                    <div className="perf-flex">
                      <div
                        className="ring-wrap"
                        title={(sysStats.memory.pct * 100).toFixed(1) + '% mémoire utilisée'}
                      >
                        <div
                          className="ring"
                          style={{
                            background: `conic-gradient(var(--accent) ${(sysStats.memory.pct * 100).toFixed(1)}%, var(--ring-bg) ${(sysStats.memory.pct * 100).toFixed(1)}% 100%)`
                          }}
                        >
                          <div className="ring-inner">
                            {(sysStats.memory.pct * 100).toFixed(0)}%<span>RAM</span>
                          </div>
                        </div>
                      </div>
                      <div className="perf-metrics">
                        <div className="metric-row">
                          <span>RAM</span>
                          <span>
                            {(sysStats.memory.used / 1024 ** 3).toFixed(1)} /{' '}
                            {(sysStats.memory.total / 1024 ** 3).toFixed(1)} GB
                          </span>
                        </div>
                        <div className="bar-line" title="Mémoire">
                          <div
                            className="bar-fill"
                            style={{ width: (sysStats.memory.pct * 100).toFixed(1) + '%' }}
                          />
                        </div>
                        <div className="metric-row">
                          <span>CPU</span>
                          {(() => {
                            const c = formatCpu(sysStats.cpu)
                            return (
                              <span className="cpu-lines" title={c.full}>
                                <strong className="cpu-brand">{c.brand}</strong>
                                {c.series && <span className="cpu-series"> {c.series}</span>}
                                {c.extra && <span className="cpu-extra"> {c.extra}</span>}
                                <span className="cpu-cores"> ({c.cores} cœurs)</span>
                              </span>
                            )
                          })()}
                        </div>
                        <div className="metric-row small">
                          <span>Cœurs</span>
                          <span>{sysStats.cpu.cores}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="fe-content-scroll" onContextMenu={openCtxBackground}>
            {viewMode === 'grid' && (
              <div className="grid-tiles">
                {gridItems.map((item) => {
                  const isDir = item.isDir
                  const active = !isDir && selectedFile === item.path
                  const sel = isDir && selectedFolder === item.path
                  const ext =
                    !isDir && item.name.includes('.')
                      ? item.name.split('.').pop().toLowerCase()
                      : ''
                  const baseName =
                    !isDir && ext && hideExtCondition(ext)
                      ? item.name.slice(0, -(ext.length + 1))
                      : item.name
                  let FileIco = FaRegFile
                  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
                    FileIco = FaRegFileImage
                  else if (['js', 'jsx', 'ts', 'tsx', 'json', 'css', 'html', 'md'].includes(ext))
                    FileIco = FaRegFileCode
                  else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
                    FileIco = FaRegFileArchive
                  else if (['txt', 'log'].includes(ext)) FileIco = FaRegFileAlt
                  return (
                    <div
                      key={item.path}
                      className={`tile-item ${isDir ? 'folder' : 'file'} ${sel || active ? 'selected' : ''}`}
                      onClick={() =>
                        isDir
                          ? (setSelectedFolder(item.path), setSelectedFile(null), load(item.path))
                          : (clickFile(item), fetchNativeIcon(item))
                      }
                      onDoubleClick={() => {
                        if (isDir) {
                          load(item.path)
                        } else {
                          fetchNativeIcon(item)
                          window.api.fs.open(item.path)
                        }
                      }}
                      onContextMenu={(e) => openCtxFor(e, item)}
                    >
                      <div className="tile-icon-wrap">
                        {isDir ? (
                          <FaFolder size={38} className="tile-ico folder-ico" />
                        ) : nativeIcons[item.path] ? (
                          <img
                            src={`data:${nativeIcons[item.path].mime};base64,${nativeIcons[item.path].data}`}
                            alt="ico"
                            style={{ width: 34, height: 34 }}
                          />
                        ) : (
                          <FileIco size={34} className="tile-ico file-ico" />
                        )}
                      </div>
                      <div className="tile-name" title={baseName}>
                        {renamingPath === item.path ? (
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={(e) => commitRename(item, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                commitRename(item, e.currentTarget.value)
                              } else if (e.key === 'Escape') {
                                e.preventDefault()
                                cancelRename()
                              }
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                            className="rename-input"
                            style={{ width: '100%' }}
                          />
                        ) : (
                          baseName
                        )}
                      </div>
                      {!isDir && !hideExtCondition(ext) && (
                        <div className="tile-ext" title={ext}>
                          {ext.toUpperCase()}
                        </div>
                      )}
                    </div>
                  )
                })}
                {!loading && !gridItems.length && <div className="empty-dir">Vide</div>}
              </div>
            )}
            {viewMode === 'list' && (
              <div className="fe-list-view">
                <div className="fe-files-header">
                  <div>Nom</div>
                  <div>Type</div>
                  <div>Taille</div>
                  <div>Date</div>
                </div>
                <div className="fe-files-body">
                  {filteredCombined.map((item) => {
                    const isDir = item.isDir
                    const active = !isDir && selectedFile === item.path
                    const size = isDir ? '-' : ((item.size || 0) / 1024).toFixed(1) + ' KB'
                    const dateStr = item.mtime ? new Date(item.mtime).toLocaleDateString() : ''
                    const rawExt = isDir
                      ? 'Dossier'
                      : item.name.includes('.')
                        ? item.name.split('.').pop()
                        : ''
                    const extLower = rawExt.toLowerCase()
                    const displayName =
                      !isDir && extLower && hideExtCondition(extLower)
                        ? item.name.slice(0, -(extLower.length + 1))
                        : item.name
                    const ext = isDir ? 'Dossier' : rawExt.toUpperCase()
                    let FileIco = FaRegFile
                    if (['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG'].includes(ext))
                      FileIco = FaRegFileImage
                    else if (['JS', 'JSX', 'TS', 'TSX', 'JSON', 'CSS', 'HTML', 'MD'].includes(ext))
                      FileIco = FaRegFileCode
                    else if (['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(ext))
                      FileIco = FaRegFileArchive
                    else if (['TXT', 'LOG'].includes(ext)) FileIco = FaRegFileAlt
                    return (
                      <div
                        key={item.path}
                        className={`fe-file-row list-row ${active ? 'active' : ''}`}
                        onClick={() =>
                          isDir
                            ? (setSelectedFolder(item.path), setSelectedFile(null), load(item.path))
                            : clickFile(item)
                        }
                        onDoubleClick={() => {
                          if (isDir) load(item.path)
                          else window.api.fs.open(item.path)
                        }}
                        onContextMenu={(e) => openCtxFor(e, item)}
                      >
                        <div
                          className="fe-file-name"
                          title={item.name}
                          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                          {isDir ? (
                            <FaFolder size={18} className="row-folder-ico" />
                          ) : nativeIcons[item.path] ? (
                            <img
                              src={`data:${nativeIcons[item.path].mime};base64,${nativeIcons[item.path].data}`}
                              alt="ico"
                              style={{ width: 16, height: 16 }}
                            />
                          ) : (
                            <FileIco size={16} className="row-file-ico" />
                          )}
                          {renamingPath === item.path ? (
                            <input
                              ref={renameInputRef}
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={(e) => commitRename(item, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  commitRename(item, e.currentTarget.value)
                                } else if (e.key === 'Escape') {
                                  e.preventDefault()
                                  cancelRename()
                                }
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              onDoubleClick={(e) => e.stopPropagation()}
                              className="rename-input"
                              style={{ flex: 1 }}
                            />
                          ) : (
                            displayName
                          )}
                        </div>
                        <div className="fe-file-type">
                          {extLower && hideExtCondition(extLower) ? '' : ext}
                        </div>
                        <div className="fe-file-size">{size}</div>
                        <div className="fe-file-date">{dateStr}</div>
                      </div>
                    )
                  })}
                  {!loading && !filteredCombined.length && (
                    <div className="fe-empty-files">Vide</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      {ctxMenu.visible && currentView === 'explorer' && (
        <div className="ctx-menu" style={{ top: ctxMenu.y, left: ctxMenu.x }}>
          {ctxMenu.item ? (
            <>
              <div className="ctx-menu-title">{ctxMenu.item.name}</div>
              <button
                className="ctx-mi"
                onClick={() => {
                  if (ctxMenu.item.isDir) load(ctxMenu.item.path)
                  else window.api.fs.open(ctxMenu.item.path)
                  closeCtx()
                }}
              >
                Ouvrir
              </button>
              <button
                className="ctx-mi"
                onClick={() => {
                  copyText(ctxMenu.item.path)
                  closeCtx()
                }}
              >
                Copier le chemin
              </button>
              <button
                className="ctx-mi"
                onClick={() => {
                  copyText(ctxMenu.item.name)
                  closeCtx()
                }}
              >
                Copier le nom
              </button>
              {!ctxMenu.item.isDir &&
                ['lnk', 'url', 'exe'].includes(
                  ctxMenu.item.name.split('.').pop()?.toLowerCase()
                ) && (
                  <button
                    className="ctx-mi"
                    onClick={() => {
                      refreshIcon(ctxMenu.item)
                      closeCtx()
                    }}
                  >
                    Rafraîchir icône
                  </button>
                )}
              <button
                className="ctx-mi"
                onClick={() => {
                  const parent =
                    ctxMenu.item.path.replace(/\\+$/, '').split(/\\|\//).slice(0, -1).join('\\') ||
                    ctxMenu.item.path
                  if (parent) {
                    let p = parent
                    if (/^[A-Za-z]:$/.test(p)) p += '\\'
                    load(p)
                  }
                  closeCtx()
                }}
              >
                Ouvrir le dossier parent
              </button>
              <button
                className="ctx-mi"
                onClick={() => {
                  startRenaming(ctxMenu.item)
                  closeCtx()
                }}
              >
                Renommer
              </button>
            </>
          ) : (
            <>
              <div className="ctx-menu-title">Dossier</div>
              <button
                className="ctx-mi"
                onClick={() => {
                  load(currentPath, false)
                  closeCtx()
                }}
              >
                Rafraîchir
              </button>
              <button
                className="ctx-mi"
                onClick={() => {
                  navigator.clipboard && copyText(currentPath)
                  closeCtx()
                }}
              >
                Copier chemin courant
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

FileExplorer.propTypes = {
  onOpenWallet: PropTypes.func
}
