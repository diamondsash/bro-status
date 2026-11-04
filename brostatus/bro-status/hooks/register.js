// bro-status – Mod fuer Claude Code
//
// Teil 1: Antwort-Knoepfe fuer nummerierte Punkte in Claudes letzter Antwort.
// Teil 2: Cache-Panel (/bro) mit Warmhalten des Prompt-Caches.
// Teil 3: Feierabend (Schalter oder /bro feierabend) – Plan weiter abarbeiten, solange es geht, dann speichern und alles aus.
// Teil 4: Status oben im Panel, damit die Desktop-App dieselben Angaben wie die Statusline hat.
// Teil 5: Auto-Compact – kurz vor der Kompaktier-Grenze speichern, kompaktieren, weitermachen.
//
// Ablauf Antwort-Knoepfe:
//   1. Claude beendet eine Antwort mit einer nummerierten Liste (1. … 2. …), die etwas fragt:
//      ein Punkt mit „?“, oder eine Frage bzw. Bitte um Rueckmeldung direkt davor oder danach.
//      Reine Anleitungen und Aufzaehlungen bekommen kein Band.
//   2. Ueber dem Eingabefeld erscheint ein Band mit einem Knopf pro Punkt
//   3. Knopf druecken -> Textfeld "Zu 1"
//   4. Antwort tippen, Enter -> Punkt bekommt einen Haken
//   5. "Send" schickt alle Antworten gesammelt als deine Nachricht
// Alle Knoepfe ohne Tastenkuerzel: beim Tippen ins Eingabefeld wird nie etwas ausgeloest.

import { TEXTE, SPRACHEN } from './texte.js'

// Sprache der Oberflaeche: Standard Deutsch, fehlt ein Schluessel, gilt der deutsche Text
let lang = 'de'
export function setLang(l) {
  lang = TEXTE[l] ? l : 'de'
}
export function t(key, ...args) {
  const v = TEXTE[lang][key] !== undefined ? TEXTE[lang][key] : TEXTE.de[key]
  return typeof v === 'function' ? v(...args) : v
}

const MAX_ITEMS = 9
const CYAN = '#22d3ee'
const GREEN = '#34d399'
const SLATE = '#64748b'

let items = [] // [{ n, text }]
let answers = {} // n -> Antworttext
let active = null // n des Punkts, der gerade beantwortet wird
let hidden = false
let bandId = undefined

// ---------- Liste aus Claudes Antwort lesen ----------

// Punkt mit fetter Überschrift vorn („**Sprache:** …“): beschreibt etwas, sein Fragezeichen ist keine Frage an dich
function beschreibt(s) {
  return /^\s*(\*\*|__)[^*_]+?:\s*(\*\*|__)|^\s*(\*\*|__)[^*_]+?(\*\*|__)\s*:/.test(s)
}

// Zeile „Weg 1 (empfohlen): …“ (und Entsprechungen) zaehlt wie ein nummerierter Punkt; empfohlen wird markiert
const WEG = /^\s{0,3}(?:\*\*|__)?(?:weg|way|camino|strada|voie)\s+(\d{1,2})(?![\p{L}\d])/iu
const EMPFOHLEN = /empfohl|recommend|recomend|consigli|recommand/i
function wegItem(n, raw) {
  return { n, text: clean(raw), weg: true, empfohlen: EMPFOHLEN.test(raw.slice(0, 60)) }
}

function clean(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

// Sucht die letzte nummerierte Liste (1., 2., …) oder Aufzaehlung (- …) mit mindestens zwei Punkten.
export function parseItems(answer) {
  if (typeof answer !== 'string' || !answer) return []
  const lines = answer.split('\n')
  const lists = []
  let cur = null
  let inFence = false
  for (const [i, raw] of lines.entries()) {
    if (/^\s*```/.test(raw)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    // Aufzaehlungspunkte (- oder *) zaehlen wie eine nummerierte Liste; die Nummer vergibt die Mod
    const bm = raw.match(/^\s{0,1}[-*•]\s+(.+)$/)
    if (bm) {
      if (cur && cur.bullet) {
        cur.push({ n: cur.length + 1, text: clean(bm[1]), beschreibt: beschreibt(bm[1]) })
        cur.end = i
      } else {
        cur = [{ n: 1, text: clean(bm[1]), beschreibt: beschreibt(bm[1]) }]
        cur.bullet = true
        cur.start = i
        cur.end = i
        lists.push(cur)
      }
      continue
    }
    const wm = raw.match(WEG)
    const m = wm ? [raw, wm[1], raw] : raw.match(/^\s{0,3}(\d{1,2})[.)]\s+(.+)$/)
    if (m) {
      if (cur && cur.bullet) cur = null
      const n = Number(m[1])
      if (cur && n === cur[cur.length - 1].n + 1) {
        cur.push(wm ? { ...wegItem(n, raw), beschreibt: false } : { n, text: clean(m[2]), beschreibt: beschreibt(m[2]) })
        cur.end = i
      } else if (n === 1) {
        cur = [wm ? { ...wegItem(n, raw), beschreibt: false } : { n, text: clean(m[2]), beschreibt: beschreibt(m[2]) }]
        cur.start = i
        cur.end = i
        lists.push(cur)
      } else {
        cur = null
      }
      continue
    }
    // Leerzeilen und eingerueckte Fortsetzungen gehoeren noch zum Punkt
    if (cur && (raw.trim() === '' || /^\s{2,}\S/.test(raw))) continue
    cur = null
  }
  const last = [...lists].reverse().find((l) => l.length >= 2)
  if (!last || !asksSomething(lines, last)) return []
  return last.slice(0, MAX_ITEMS).map(({ n, text, weg, empfohlen }) => (weg ? { n, text, weg, empfohlen } : { n, text }))
}

// Auswahl-Frage („Welche zuerst?“, „Logo links oder rechts?“) gegen Ja/Nein-Frage („Soll ich so anfangen?“):
// Nur bei einer Auswahl sollst du zu den Punkten Stellung nehmen; eine Ja/Nein-Frage bekommt den einen Antwort-Knopf.
const FRAGEWORT = /^[^\p{L}]*(welche[rnms]?|was|wie|wo|womit|wann|warum|wieso|weshalb|wer|wen|wem|wozu|wohin|worauf|wofür|which|what|how|where|when|why|who|cuál(es)?|qué|cómo|dónde|cuándo|quale|quali|cosa|come|dove|quando|perché|quel(le|s|les)?|quoi|comment|où|pourquoi)(?![\p{L}])/iu
export function choiceQuestion(text) {
  return String(text)
    .split(/(?<=[.!?:])\s+/)
    .some((s) => s.includes('?') && (FRAGEWORT.test(clean(s)) || /(?<![\p{L}])(oder|or|ou)(?![\p{L}])/iu.test(s)))
}

// Schlussfrage der Antwort (letzte Zeile endet mit „?“), sonst ''
export function closingQuestion(answer) {
  if (typeof answer !== 'string') return ''
  const lines = answer.split('\n').filter((l) => l.trim())
  const last = lines.length ? clean(lines[lines.length - 1]) : ''
  return /\?[\s)"”»*_]*$/.test(last) ? last : ''
}

// Fragt die Liste etwas? Nur ein „?“ zaehlt: in einem Punkt, in der Zeile davor oder im Absatz direkt danach.
// Punkte mit fetter Ueberschrift („**Sprache:** …?“) beschreiben nur; ihr Fragezeichen zaehlt nicht.
// Davor oder danach zaehlt nur eine Auswahl-Frage, keine Ja/Nein-Frage.
// Woerter wie „entscheide“ oder „sag Bescheid“ stehen auch in Berichten und Anleitungen und loesen kein Band aus.
// Überschrift direkt vor der Liste, die ausdrücklich etwas von dir verlangt („Was ich von dir brauche:“, „Offene Fragen:“)
const BEDARF = /(von dir (brauche|benötige)|brauche ich von dir|fragen an dich|offene fragen|need from you|questions for you|open questions|necesito de ti|preguntas (abiertas|para ti)|(mi serve|ho bisogno) da te|domande (aperte|per te)|j['’]ai besoin de (toi|vous)|questions (ouvertes|pour (toi|vous)))/i
// Ein Fragezeichen in Anführungszeichen („gefällt es dir?“) zitiert nur und fragt nichts
const ohneZitate = (s) => s.replace(/„[^“”]*[“”]|“[^”]*”|"[^"]*"|«[^»]*»/g, '')
export function asksSomething(lines, list) {
  if (list.some((it) => ohneZitate(it.text).includes('?') && !it.beschreibt)) return true
  const before = ohneZitate(lines.slice(0, list.start).filter((l) => l.trim()).slice(-1).join(' '))
  if (BEDARF.test(before)) return true
  let rest = lines.slice(list.end + 1)
  if (list.bullet) {
    // Aufzaehlungen mit „-“ sind oft nur eine Uebersicht: nur der Absatz direkt danach zaehlt, nicht eine Frage am Ende der Antwort
    const first = rest.findIndex((l) => l.trim())
    const body = first < 0 ? [] : rest.slice(first)
    const gap = body.findIndex((l) => !l.trim())
    rest = gap < 0 ? body : body.slice(0, gap)
  }
  const after = ohneZitate(rest.filter((l) => l.trim() && !/^\s{2,}\S/.test(l)).join(' '))
  return [before, after].some(choiceQuestion)
}

// Was das Band zeigt: eine Auswahl-Liste mit je einem Knopf pro Punkt; ohne Liste nur bei einer Ja/Nein-Schlussfrage
// ein einziger Antwort-Knopf. Eine offene Frage („Wie soll ich das umsetzen?“, „Links oder rechts?“) ohne Auswahl
// bekommt kein Band: ein leerer Antwort-Knopf macht dort nur mehr Arbeit, du tippst direkt ins Eingabefeld.
export function bandItems(answer) {
  const found = parseItems(answer)
  if (found.length) return found
  const q = closingQuestion(answer)
  if (q) return !choiceQuestion(q) ? [{ n: 1, text: q, single: true, yesno: true }] : []
  return REPORT_ITEMS[reportKind(answer)] || []
}

// Bericht ohne Frage: fertig (geprueft, gruen, erledigt …) oder Zwischenstand (als Naechstes, folgt, noch offen …).
// Kurze Antworten (unter 80 Zeichen) und alles ohne diese Marker bekommen kein Band.
const REPORT_DONE = /geprüft|grün|erledigt|abgeschlossen|gemergt|gespeichert|umgesetzt|passed|passing|green|done|completed|merged|saved|verificad|hecho|completad|verificat|fatto|completat|terminé|vérifié|fait\b/i
const REPORT_NEXT = /als nächstes|nächster schritt|folgt|noch offen|noch nicht|danach|next step|still to do|pending|todo|siguiente|pendiente|prossimo|prochain/i
export function reportKind(answer) {
  if (typeof answer !== 'string') return ''
  const text = answer.trim()
  if (text.length < 80) return ''
  if (REPORT_NEXT.test(text)) return 'open'
  return REPORT_DONE.test(text) ? 'done' : ''
}
const REPORT_ITEMS = {
  done: [{ n: 1, kind: 'next' }, { n: 2, kind: 'save' }, { n: 3, kind: 'open' }].map((i) => ({ ...i, text: i.kind })),
  open: [{ n: 1, kind: 'open', text: 'open' }],
}

export function composeMessage(list, given) {
  // Ein einzelner Antwort-Knopf (Ja/Nein-Frage) schickt nur deinen Text, ohne „Zu 1 (…)“
  if (list.length === 1 && list[0].single) return (given[list[0].n] || '').trim()
  return list
    .filter((it) => (given[it.n] || '').trim())
    .map((it) => `${t('bandTo')} ${it.n} (${it.text}): ${given[it.n].trim()}`)
    .join('\n')
}

// Kurzname eines Punkts fuer die Knoepfe: „Schritt 5 (nach …): Was …“ wird „Schritt 5“, der volle Text steht im Chat
export function itemName(text) {
  const m = String(text).match(/^(.{2,30}?)\s*(?:\(|:|–|-\s)/)
  return m ? m[1].trim() : text
}

// Beschriftung eines Weg-Knopfs: „WEG 1 · empfohlen · Kurzbeschreibung“
function wegLabel(it, width) {
  const rest = it.text.replace(/^[^\p{L}\d]*\p{L}+\s+\d+\s*(\([^)]*\))?\s*[:.–-]?\s*/u, '')
  const head = t('bandWay').toUpperCase() + ' ' + it.n + (it.empfohlen ? ' · ' + t('bandRecommended') : '')
  return short(rest ? head + ' · ' + rest : head, Math.max(16, width - 4))
}

// Kuerzt am Wortende, damit nichts mitten im Wort abbricht
export function short(s, n) {
  if (s.length <= n) return s
  const cut = s.slice(0, n - 1)
  const space = cut.lastIndexOf(' ')
  return (space > n * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, '') + ' …'
}

function reset() {
  items = []
  answers = {}
  active = null
  hidden = false
}


// ---------- Teil 2: Prompt-Cache warmhalten ----------
//
// Die Statusline (statusline.py) schreibt jede Sekunde state/<session>.cache.json
// (TTL, Ablaufzeit, Trefferquoten, Kontextgroesse). Dieser Mod liest das, frischt
// den Cache kurz vor Ablauf per $.model.fork auf (liest den Cache, schreibt nichts,
// keine Tools, nicht im Chat) und schreibt state/<session>.warm.json zurueck.

const PANE = 'bro-cache'
const TITLE = '◆ BroStatus'
const ORANGE = '#fb923c'
const AMBER = '#fbbf24'
const RED = '#f87171'
const TEXT = '#e2e8f0'
const TRACK = '#1e3a5f'
const WARM_PROMPT = 'Kurze Zwischenfrage ohne Bezug zur Aufgabe: Antworte nur mit "ok".'
const WRITE_FACTOR = { 300: 1.25, 3600: 2 } // Cache neu schreiben (5 min / 1 h), laut Anthropic für alle Modelle gleich

// Cache lesen kostet standardmäßig 0,1 des Eingabepreises. Laut Anthropic (Preisseite, geprüft 2026-10-29) gilt 0,05 bei
// Opus 5.5 und Sonnet 5.5 und 0,025 bei Fable 5.1 und Mythos 5.1. Unbekanntes Modell: 0,1.
const READ_FACTOR_DEFAULT = 0.1
export function readFactor(model) {
  const m = String(model || '').toLowerCase()
  if (/(fable|mythos)[\s._-]*5[\s._-]*1(?!\d)/.test(m)) return 0.025
  if (/(opus|sonnet)[\s._-]*5[\s._-]*5(?!\d)/.test(m)) return 0.05
  return READ_FACTOR_DEFAULT
}
let readF = READ_FACTOR_DEFAULT
let modelName = ''
// Fragt das Modell der Sitzung ab und stellt den Lesefaktor darauf ein
async function refreshModel($) {
  let m
  let fehler = ''
  try {
    m = await $.session.model()
    if (typeof m === 'string' && m) {
      modelName = m
      readF = readFactor(m)
    } else {
      fehler = 'kein Modellname: ' + typeof m
    }
  } catch (err) {
    fehler = String((err && err.message) || err)
  }
  // zur Kontrolle: so kommt der Modellname an und diesen Faktor nimmt BroStatus
  try {
    if (!sid) await ensureSid($)
    if (stateDir && sid) await $.fs.write(filePath(sid + '.model.json'), JSON.stringify({ model: modelName || null, readFactor: readF, fehler }))
  } catch {}
}

// Waehrung: der API-Wert von Claude Code kommt in US-Dollar. Der Kurs steht in kurse.json (EZB-Referenzkurse mit Datum),
// ein eigener Kurs in config.json (currency_rate) hat Vorrang. Die Mod greift dafuer nicht ins Netz.
export const CURRENCIES = [['USD', 'Dollar (USD)'], ['EUR', 'Euro (EUR)'], ['GBP', 'Pfund (GBP)'], ['CHF', 'Franken (CHF)']]
const CURRENCY_SYMBOL = { USD: '$', EUR: '€', GBP: '£', CHF: 'CHF ' }
export function currencyFactor(code, proEur, override) {
  if (code === 'USD') return 1
  if (Number(override) > 0) return Number(override)
  const usd = Number(proEur && proEur.USD)
  if (!(usd > 0)) return null
  if (code === 'EUR') return 1 / usd
  const r = Number(proEur[code])
  return r > 0 ? r / usd : null
}
export function fmtMoney(usd, code, factor) {
  const sym = CURRENCY_SYMBOL[code]
  if (!sym || code === 'USD' || !(factor > 0)) return '≈$' + usd.toFixed(2)
  return '≈' + sym + (usd * factor).toFixed(2)
}
let kurse = null
let ownRate = null
async function loadKurse($) {
  if (!stateDir) return
  const base = basisVon(stateDir)
  try {
    kurse = JSON.parse(await $.fs.read(base + sep() + 'kurse.json'))
  } catch {
    kurse = null
  }
  try {
    const c = JSON.parse(await $.fs.read(base + sep() + 'config.json'))
    ownRate = Number(c.currency_rate) > 0 ? Number(c.currency_rate) : null
  } catch {
    ownRate = null
  }
}
function curFactor() {
  return currencyFactor(cfg.currency, kurse && kurse.pro_eur, ownRate)
}
// Statusline und hook.py lesen die Waehrung aus state/waehrung.json
let currencyWritten = ''
async function writeCurrency($) {
  if (!stateDir || currencyWritten === cfg.currency) return
  try {
    await $.fs.write(filePath('waehrung.json'), JSON.stringify({ code: cfg.currency }))
    currencyWritten = cfg.currency
  } catch {}
}

// Vorlauf je Stufe, passend zur Cache-Dauer (Sekunden vor Ablauf)
const LEAD_STEPS = { auto: { 3600: 180, 300: 45 }, mehr: { 3600: 300, 300: 60 }, viel: { 3600: 600, 300: 120 } }
// Frueher gespeicherte feste Minuten
const LEAD_OLD = { 300: 'mehr', 600: 'viel' }
const IDLE_FIXED = [['10800', 'idleHours3'], ['21600', 'idleHours6'], ['43200', 'idleHours12']]
const IDLE_DEFAULT = '10800'

// Lite-Fassung (öffentlicher Bau): ohne Funktionen, die von selbst Anfragen über das Konto senden
// (Warmhalten, Auto-Compact, Feierabend, Modellwechsel). Der Lite-Installer legt brostatus/lite.json ab; die Mod liest sie beim Start.
let LITE = false
async function loadLite($) {
  if (!stateDir) return
  try {
    const j = JSON.parse(await $.fs.read(basisVon(stateDir) + sep() + 'lite.json'))
    LITE = !!(j && j.lite)
  } catch {
    LITE = false
  }
}

// Gespeicherte Stopp-Werte aus frueheren Fassungen („auto“, 1 h, 8 h) fallen auf die Voreinstellung zurueck
export function idleStep(v) {
  return IDLE_FIXED.some(([value]) => value === String(v)) ? String(v) : IDLE_DEFAULT
}

let cfg = { lang: 'de', currency: 'USD', compactAt: 82, enabled: false, lead: 'auto', idle: IDLE_DEFAULT, compact: false, hidden: false, sound: true, soundWait: 'doppelton', soundDone: 'glocke', soundMin: 15, soundRepeat: 0, soundVolume: 50, eigenStandard: false }
let warm = newWarm()
let bridge = null
let stateDir = null
// Ordner über state/ (Windows mit \, sonst /)
export function basisVon(dir) {
  return String(dir || '').replace(/[\\/]state$/, '')
}
let sid = null
let paneOpen = false
let turnRunning = false
let warming = false
let lastActivity = 0 // Sekunden
let ticks = 0

function newWarm() {
  // streak: Auffrischungen seit der letzten echten Nachricht; kosten: was alle Auffrischungen der Sitzung gekostet haben (Input-Token-Gegenwert)
  return { last_ok: null, last_try: null, count: 0, last_read: 0, cold: false, note: '', streak: 0, kosten: 0 }
}

// Was die naechste Nachricht kostet (Input-Token-Gegenwert): warm = Lesen, kalt = Neuaufbau; ohne Cache-Daten keine Zahl
export function nextCost(ctx, ttlS, left, factor = readF) {
  if (!ctx || !ttlS) return null
  const warm = left > 0
  return { tokens: Math.round(ctx * (warm ? factor : (WRITE_FACTOR[ttlS] || 1.25))), warm }
}

// Vorsatz einer Limit-Angabe: „· S | 5h / “ (Punkt, Buchstabe, Zeitraum), danach folgt der Prozentwert
export function limitPrefix(letter, span) {
  return '· ' + letter + ' | ' + span + ' / '
}

export function ttlSeconds(ttl) {
  return ttl === '1h' ? 3600 : ttl === '5m' ? 300 : 0
}

export function leadStep(lead) {
  return LEAD_STEPS[lead] ? lead : LEAD_OLD[lead] || 'auto'
}

export function leadSeconds(lead, ttlS) {
  return LEAD_STEPS[leadStep(lead)][ttlS >= 3600 ? 3600 : 300]
}

// Dauer kurz und lesbar: 45 s, 3 min, 19 h
export function fmtSpan(secs) {
  return secs < 60 ? secs + ' s' : secs < 3600 ? Math.round(secs / 60) + ' min' : Math.round(secs / 3600) + ' h'
}

// Auswahl „Auffrischen“ mit der echten Zeit fuer die aktuelle Cache-Dauer
export function leadOptions(ttlS) {
  return [['auto', t('leadAuto')], ['mehr', ''], ['viel', '']]
    .map(([value, pre]) => ({ value, label: pre + fmtSpan(leadSeconds(value, ttlS)) + t('leadBefore') }))
}

// Auswahl „Stopp“: feste Zeiten ueber der Lohnt-sich-Grenze werden gekuerzt, das steht dabei
export function idleOptions(ttlS, leadS) {
  const worth = worthLimit(ttlS, leadS)
  return [
    ...IDLE_FIXED.map(([value, key]) => ({ value, label: Number(value) > worth ? t(key) + t('idleCut', fmtSpan(worth)) : t(key) })),
  ]
}

// Ab so vielen Auffrischungen waere ein Neuaufbau billiger gewesen
export function breakEven(ttlS, factor = readF) {
  return Math.floor((WRITE_FACTOR[ttlS] || 1.25) / factor)
}

// So lange lohnt sich Warmhalten ohne neue Nachricht: danach waere ein Neuaufbau billiger
export function worthLimit(ttlS, leadS) {
  return breakEven(ttlS) * Math.max(60, ttlS - leadS)
}

export function idleLimit(idle, ttlS, leadS) {
  const worth = worthLimit(ttlS, leadS)
  return Math.min(Number(idleStep(idle)), worth)
}

export function expiresAt(br, w, ttlS) {
  const fromMain = (br && br.expires_at) || 0
  const fromWarm = !w.cold && w.last_ok ? w.last_ok + ttlS : 0
  return Math.max(fromMain, fromWarm)
}

// Entscheidet, was jetzt zu tun ist. Alle Zeiten in Sekunden.
export function decide({ now, cfg, bridge: br, warm: w, lastActivity: act, turnRunning: busy }) {
  if (!cfg.enabled) return { action: 'off', state: 'aus' }
  const ttlS = ttlSeconds(br && br.ttl)
  if (!br || !br.observed || !ttlS) return { action: 'unknown', state: 'wartet auf Daten' }
  if (busy) return { action: 'wait', state: 'an' }
  const exp = expiresAt(br, w, ttlS)
  if (w.cold || !exp || exp <= now) return { action: 'cold', state: 'kalt' }
  const leadS = leadSeconds(cfg.lead, ttlS)
  const lastMain = br.expires_at ? br.expires_at - ttlS : 0
  const since = now - Math.max(act || 0, lastMain)
  if (since > idleLimit(cfg.idle, ttlS, leadS)) return { action: 'pause', state: 'pausiert' }
  if (now >= exp - leadS) return { action: 'warm', state: 'frischt auf', nextAt: now }
  return { action: 'wait', state: 'an', nextAt: exp - leadS }
}

function fmtClock(secs) {
  secs = Math.max(0, Math.floor(secs))
  return Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0')
}

function fmtTok(n) {
  n = Math.round(n || 0)
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' M'
  if (n >= 1000) return Math.round(n / 1000) + 'k'
  return String(n)
}

function pct1(x) {
  return x === null || x === undefined ? '–' : (x * 100).toFixed(1).replace('.', ',') + ' %'
}

function sep() {
  return stateDir && stateDir.includes('\\') ? '\\' : '/'
}

function filePath(name) {
  return stateDir + sep() + name
}

function safeId(id) {
  return String(id || '').replace(/[^A-Za-z0-9_-]/g, '') || 'default'
}

async function nowS($) {
  return (await $.clock.now()) / 1000
}

async function ensureSid($) {
  try {
    const id = safeId(await $.session.id())
    if (id !== sid) {
      sid = id
      warm = newWarm()
    }
  } catch {}
}

// Ohne Statusline (Desktop-App) gibt es keine Brueckendatei. Dann rechnet die Mod selbst:
// Der Cache wurde mit dem Ende der letzten Antwort aufgebaut und haelt EST_TTL (als geschaetzt gekennzeichnet).
function estimatedBridge() {
  if (!(st.cacheAt > 0)) return null
  return { ttl: '1h', expires_at: st.cacheAt + EST_TTL, observed: true, context: (st.ctx && st.ctx.tokens) || 0, est: true }
}

async function readBridge($) {
  if (!sid) await ensureSid($)
  if (!stateDir || !sid) return estimatedBridge()
  try {
    const b = JSON.parse(await $.fs.read(filePath(sid + '.cache.json')))
    return b && b.observed ? b : estimatedBridge() || b
  } catch {
    return estimatedBridge()
  }
}

async function persist($, state, nextAt) {
  if (!stateDir || !sid) return
  const data = { enabled: cfg.enabled, state, next_at: nextAt || null, ...warm }
  try {
    await $.fs.write(filePath(sid + '.warm.json'), JSON.stringify(data))
  } catch {}
}

let lastState = ''
async function tick($) {
  await ensureSid($)
  bridge = await readBridge($)
  const now = await nowS($)
  const d = decide({ now, cfg, bridge, warm, lastActivity, turnRunning })
  if (d.action === 'warm' && !warming) {
    await warmNow($)
    return
  }
  const key = d.state + '|' + (d.nextAt ? Math.round(d.nextAt) : '')
  if (key !== lastState) {
    lastState = key
    await persist($, d.state, d.nextAt)
  }
}

async function warmNow($) {
  if (warming) return
  warming = true
  const now = await nowS($)
  warm.last_try = now
  await persist($, 'frischt auf')
  $.ui.invalidate('ui.render')
  try {
    const r = await $.model.fork({ prompt: WARM_PROMPT })
    const u = r && r.usage
    if (!u) {
      warm.note = r && r.reason === 'nothing-to-fork'
        ? t('warmNoRequest')
        : t('warmFailed', r && r.reason)
    } else {
      const read = u.cache_read_input_tokens || 0
      const fresh = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0)
      const hit = read + fresh ? read / (read + fresh) : 0
      if (read > 0 && hit >= 0.5) {
        warm.last_ok = await nowS($)
        warm.count += 1
        warm.streak = (warm.streak || 0) + 1
        warm.last_read = read
        warm.kosten = (warm.kosten || 0) + Math.round(read * readF + fresh)
        warm.model = modelName // zur Kontrolle: so kommt der Modellname an
        warm.cold = false
        warm.note = ''
      } else {
        warm.cold = true
        warm.streak = 0
        warm.note = t('warmExpired')
      }
    }
  } catch (err) {
    warm.note = t('warmError')
  }
  warming = false
  const d = decide({ now: await nowS($), cfg, bridge, warm, lastActivity, turnRunning })
  lastState = ''
  await persist($, d.state, d.nextAt)
  $.ui.invalidate('ui.render')
}

async function saveCfg($) {
  try {
    await $.store.set('cache-cfg', cfg)
  } catch {}
  await writeLang($)
  await writeCurrency($)
}

// Statusline und hook.py lesen die Sprache aus state/sprache.json (ohne Datei: Deutsch)
let langWritten = ''
async function writeLang($) {
  if (!stateDir || langWritten === cfg.lang) return
  try {
    await $.fs.write(filePath('sprache.json'), JSON.stringify({ lang: cfg.lang }))
    langWritten = cfg.lang
  } catch {}
}

// ---------- Teil 4: Status oben im Panel (fuer die Desktop-App, wo keine Statusline laeuft) ----------
//
// Sammelt dieselben Angaben wie die Statusline aus den Ereignissen der Sitzung:
// Status (arbeitet / wartet auf Freigabe / fertig / abgebrochen), Kontext, Limits, Kosten,
// Werkzeuge, Skills, MCP, Hosts, Subagents und Dateien. „Wartet auf Freigabe“ kommt aus
// tool.check: Entscheidet Claude Code „ask“ an einen Menschen, steht die Freigabe-Frage.

const BLUE = '#3b82f6'
const SILVER = '#cbd5e1'
const GEM_GREEN = '#22c55e'
const GEM_RED = '#ef4444'
const GEM_ORANGE = '#f97316'
const INDIGO = '#a5b4fc'
const CYAN_D = '#0891b2'
const CTX_STAGES = [50, 70, 85]
const EST_TTL = 3600 // ohne Brueckendatei: angenommener 1-h-Cache

function newStatus() {
  return {
    status: 'bereit', turnStart: 0, finishedAt: 0, lastTurnS: 0, current: [], waitLabel: '', check: null,
    tools: {}, skills: {}, mcp: {}, hosts: {}, agents: {}, files: {},
    ctx: null, limits: [], costUsd: null, cacheAt: 0, hitLast: null, hitRead: 0, hitTotal: 0,
  }
}
let st = newStatus()

function field(o, name) {
  const v = o && o[name]
  return typeof v === 'string' ? v : ''
}

export function baseName(p) {
  const parts = String(p).split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || String(p)
}

export function hostOf(url) {
  const m = String(url).match(/^[a-z]+:\/\/([^/:?#]+)/i)
  return m ? m[1] : ''
}

// Was ein Werkzeugaufruf verraet: Beschriftung und wohin er zaehlt
export function describeTool(tool, input) {
  const mcp = tool.match(/^mcp__(.+?)__(.+)$/)
  if (mcp) {
    const server = mcp[1].replace(/^plugin_[^_]+_/, '')
    return { label: server + ' ' + mcp[2], tool: '', mcp: server }
  }
  const file = field(input, 'file_path') || field(input, 'notebook_path')
  const url = field(input, 'url')
  const label = tool === 'Bash' || tool === 'PowerShell' ? tool + ' ' + field(input, 'command').slice(0, 40)
    : file ? tool + ' ' + baseName(file)
      : url ? tool + ' ' + hostOf(url)
        : tool === 'Skill' ? 'Skill ' + field(input, 'skill')
          : tool
  return {
    label,
    tool: tool === 'Skill' || tool === 'Agent' || tool === 'Task' ? '' : tool.toLowerCase(),
    file,
    mark: tool === 'Read' ? 'R' : tool === 'Write' ? 'W' : /Edit$/.test(tool) ? 'E' : '',
    host: url ? hostOf(url) : tool === 'WebSearch' ? 'web-search' : '',
    skill: tool === 'Skill' ? field(input, 'skill') : '',
    agent: tool === 'Agent' || tool === 'Task' ? field(input, 'subagent_type') || 'agent' : '',
  }
}

function bump(map, key) {
  if (key) map[key] = (map[key] || 0) + 1
}

export function fmtDur(secs) {
  const s = Math.max(0, Math.round(secs))
  if (s < 60) return s + 's'
  const m = Math.floor(s / 60)
  if (m < 60) return m + 'm ' + String(s % 60).padStart(2, '0') + 's'
  return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'
}

export function ctxStage(pct) {
  return CTX_STAGES.filter((lim) => pct >= lim).length
}
const CTX_COLOR = [CYAN, AMBER, ORANGE, RED]

function topList(map, n = 5) {
  const items = Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const parts = items.slice(0, n).map(([k, v]) => (v > 1 ? k + '×' + v : k))
  if (items.length > n) parts.push('+' + (items.length - n))
  return parts
}

// Unter so vielen Spalten ist das Panel eine schmale Seitenleiste (Desktop-App)
const WIDE_COLS = 90
export function isNarrow(e) {
  return ((e.props && e.props.bodyColumns) || 0) < WIDE_COLS
}

// Der Diamant der Statusline (9x3 Braille-Zeichen), im Terminal als Text, sonst als Punkte-Grafik
const GEM = ['⣠⡊⢉⠏⠉⠹⡉⢑⣄', '⠈⠪⡙⡍⠉⢩⢋⠕⠁', '⠀⠀⠈⠺⣤⠗⠁⠀⠀']
const DOTS = [[0x01, 0, 0], [0x02, 0, 1], [0x04, 0, 2], [0x40, 0, 3], [0x08, 1, 0], [0x10, 1, 1], [0x20, 1, 2], [0x80, 1, 3]]

export function gemSvg(color) {
  const circles = []
  GEM.forEach((row, r) => [...row].forEach((ch, i) => {
    const bits = ch.codePointAt(0) - 0x2800
    for (const [bit, x, y] of DOTS) {
      if (bits & bit) circles.push(`<circle cx="${i * 8 + 2 + x * 4}" cy="${r * 16 + 2 + y * 4}" r="1.5"/>`)
    }
  }))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 48" width="72" height="48" fill="${color}">${circles.join('')}</svg>`
}

// Farbe des Diamanten wie in statusline.py: rot > grau > orange > blau > gruen
export function gemColor(s, pct, cache) {
  const stage = pct === null || pct === undefined ? 0 : ctxStage(pct)
  const c = cache || {}
  if (s === 'abbruch' || s === 'fehler' || stage >= 3 || c.urgent) return GEM_RED
  if (s === 'wartet') return SILVER
  if (stage >= 1 || c.soon) return GEM_ORANGE
  if (s === 'arbeitet') return BLUE
  return GEM_GREEN
}

// Hinweis bei langem „wartet auf dich“: in der Desktop-App endet das Warten erst mit dem Befehl, auch wenn du schon
// freigegeben hast. Nach 30 s heisst es darum „Freigabe oder läuft seit …“; kurz vor und nach dem Cache-Ablauf kommt eine Warnung.
export const WAIT_LONG_S = 30
export function waitHint(waited, left, ttlS) {
  const long = waited >= WAIT_LONG_S
  const cache = !long || !ttlS ? '' : left <= 0 ? 'cold' : left < 600 ? 'soon' : ''
  return { long, cache }
}

// cache: { urgent, soon } aus dem Panel; zaehlt nicht, solange das Warmhalten laeuft
function renderStatus($, e, now, cache, nextC, kaltC, cacheLeft, cacheTtl) {
  const { Box, Text, Svg } = $.ui.resolve(e)
  const pct = st.ctx ? st.ctx.percent : null
  // Laeuft noch Hintergrund-Arbeit, ist der Diamant blau wie beim Arbeiten
  const color = gemColor(st.status === 'fertig' && st.background && st.background.length ? 'arbeitet' : st.status, pct, cache)

  // Statuszeile in den Farben der Statusline
  const head = []
  if (st.status === 'arbeitet') {
    head.push(Text({ key: 's-text', bold: true, color: GREEN, children: [t('working')] }), Text({ key: 's-time', color: TEXT, children: [' ' + fmtDur(now - st.turnStart)] }))
    // tool.call feuert vor tool.check: das gerade gepruefte Werkzeug steht schon in st.current, zeigt aber „Auto prueft“
    const laeuft = st.check ? st.current.filter((c) => c.id !== st.check.id) : st.current
    const doing = st.check ? null : laeuft[laeuft.length - 1]
    if (doing) {
      head.push(Text({ key: 's-arrow', color: SLATE, children: [' → '] }), Text({ key: 's-tool', color: '#67e8f9', children: [doing.label] }),
        Text({ key: 's-tool-time', color: SLATE, children: [' ' + fmtDur(now - doing.since) + (st.current.length > 1 ? t('parallel', st.current.length - 1) : '')] }))
    } else if (st.check) {
      head.push(Text({ key: 's-arrow', color: SLATE, children: [' → '] }), Text({ key: 's-check', color: '#67e8f9', children: [t('autoChecks', short(st.check.label, 40))] }))
    } else head.push(Text({ key: 's-think', color: SLATE, children: [t('thinking')] }))
  } else if (st.status === 'wartet') {
    head.push(Text({ key: 's-text', bold: true, color: RED, children: [t('waiting')] }))
    if (st.waitLabel) head.push(Text({ key: 's-wait', color: SLATE, children: [t('approve', short(st.waitLabel, 40))] }))
    if (!st.waitSince) st.waitSince = now
    const hint = waitHint(now - st.waitSince, cacheLeft || 0, cacheTtl || 0)
    if (hint.long) head.push(Text({ key: 's-wait-long', color: AMBER, children: [' · ' + t('waitLong', fmtDur(now - st.waitSince))] }))
    if (hint.cache) head.push(Text({ key: 's-wait-cache', color: RED, children: [' · ' + (hint.cache === 'cold' ? t('waitCacheCold') : t('waitCacheSoon', fmtClock(cacheLeft)))] }))
  } else if (st.status === 'fertig' && st.background && st.background.length) {
    // Claude hat geantwortet, im Hintergrund laeuft aber noch etwas (Befehl, Hilfs-Agent): nicht „fertig“
    // Darunter je laufender Aufgabe eine Zeile, woran gearbeitet wird
    head.push(Text({ key: 's-text', bold: true, color: '#67e8f9', children: [t('background', st.background.length)] }),
      Text({ key: 's-time', color: SLATE, children: [' ·' + t('ago', fmtDur(now - st.finishedAt))] }))
  } else if (st.status === 'fertig' || st.status === 'abbruch' || st.status === 'fehler') {
    head.push(Text({ key: 's-text', bold: true, color: st.status === 'fertig' ? '#67e8f9' : RED, children: [st.status === 'fertig' ? t('done') : st.status === 'fehler' ? t('failed') : t('aborted')] }),
      Text({ key: 's-time', color: TEXT, children: [t('ago', fmtDur(now - st.finishedAt))] }),
      Text({ key: 's-ran', color: SLATE, children: [t('ran', fmtDur(st.lastTurnS))] }))
  } else head.push(Text({ key: 's-text', color: SLATE, children: [t('ready')] }))

  const narrow = isNarrow(e)
  // Beschriftung links, die Eintraege rechts brechen einzeln um statt mitten im Namen
  // Feste Breite fuer die Beschriftung, damit alle Werte an derselben Stelle beginnen
  const row = (key, label, kids) => Box({
    key, flexDirection: 'row', alignItems: 'flex-start',
    children: [
      Box({ key: key + '-lb', width: 8, flexShrink: 0, children: [Text({ key: key + '-l', color: SLATE, mono: true, children: [label] })] }),
      Box({ key: key + '-b', flexDirection: 'row', flexWrap: 'wrap', columnGap: 2, flexShrink: 1, children: kids }),
    ],
  })
  const info = [Box({ key: 'status', flexDirection: 'row', flexWrap: 'wrap', flexShrink: 1, children: head })]
  if (st.status === 'fertig' && st.background && st.background.length) {
    st.background.slice(0, 3).forEach((b, i) => info.push(Text({ key: 'bg-' + i, color: TEXT, wrap: 'truncate-end', children: [
      Text({ key: 'bg-' + i + '-a', color: SLATE, children: ['  → '] }), short(b.label || '?', narrow ? 34 : 60)] })))
    if (st.background.length > 3) info.push(Text({ key: 'bg-more', color: SLATE, children: ['  ' + t('parallel', st.background.length - 3).trim()] }))
  }

  if (pct !== null && pct !== undefined) {
    const stage = ctxStage(pct)
    const col = CTX_COLOR[stage]
    const width = narrow ? 10 : 16
    const filled = Math.max(0, Math.min(width, Math.round(pct * width / 100)))
    const kids = [
      Text({ key: 'k-bar', children: [
        Text({ key: 'k-on', color: col, children: ['▰'.repeat(filled)] }),
        Text({ key: 'k-off', color: TRACK, children: ['▱'.repeat(width - filled)] }),
        Text({ key: 'k-pct', bold: true, color: stage ? col : TEXT, children: [' ' + Math.round(pct) + '%'] }),
      ] }),
    ]
    if (st.ctx.tokens) kids.push(Text({ key: 'k-tok', color: SLATE, children: [' ' + fmtTok(st.ctx.tokens) + '/' + fmtTok(st.ctx.window || 200000)] }))
    if (stage) kids.push(Text({ key: 'k-hint', bold: stage >= 2, color: col, children: [' ▸ ' + t('ctxHint' + stage)] }))
    info.push(row('kontext', t('rowContext'), kids))
  } else info.push(row('kontext', t('rowContext'), [Text({ key: 'k-none', color: SLATE, children: ['–'] })]))

  // Was die naechste Nachricht kostet, eingerueckt unter „kontext“ ohne eigenen Namen (unter der Cache-Uhr war zu wenig Platz)
  if (nextC) info.push(row('next', '', [Text({ key: 'next-text', color: nextC.warm ? SLATE : AMBER, children: [t('nextMsg', fmtTok(nextC.tokens), nextC.warm)] })]))

  // Jede Angabe mit Punkt davor, gleich gebaut: limit · S | 5h / 33%  · W | 7d / 24%, darunter kosten · API | ≈$0.13  · WARM | ≈9k Token / KALT | ≈180k Token
  // S = Sitzungslimit (5 Stunden), W = Wochenlimit (7 Tage)
  const lim = []
  for (const [kind, letter, span] of [['five_hour', t('limitSession'), '5h'], ['seven_day', t('limitWeek'), '7d']]) {
    const l = st.limits.find((x) => x.kind === kind)
    if (l && l.percent !== null && l.percent !== undefined) {
      lim.push(Text({ key: 'l-' + kind, children: [
        Text({ key: 'l-' + kind + '-n', color: SLATE, children: [limitPrefix(letter, span)] }),
        Text({ key: 'l-' + kind + '-p', color: l.percent >= 85 ? RED : l.percent >= 65 ? AMBER : TEXT, children: [Math.round(l.percent) + '%'] }),
      ] }))
    }
  }
  info.push(row('limit', t('rowLimit'), lim.length ? lim : [Text({ key: 'l-none', color: SLATE, children: ['–'] })]))

  const cost = []
  if (st.costUsd !== null && st.costUsd !== undefined) cost.push(Text({ key: 'l-cost', color: SLATE, children: ['· API | ' + fmtMoney(st.costUsd, cfg.currency, curFactor())] }))
  // Warmhalten: „WARM“ = was alle Auffrischungen der Sitzung gekostet haben,
  // „KALT“ = was ein kalter Neustart beim jetzigen Kontext kosten wuerde – das Risiko, gegen das es absichert
  if (cfg.enabled || warm.kosten) {
    cost.push(Text({ key: 'l-save', color: SLATE, children: ['· ' + t('warmKalt', fmtTok(warm.kosten || 0), kaltC ? fmtTok(kaltC.tokens) : '–')] }))
  }
  if (cost.length) info.push(row('kosten', t('rowCost'), cost))

  const aktiv = []
  const add = (key, sym, map, col) => {
    topList(map, narrow ? 4 : 5).forEach((t, i) => aktiv.push(Text({ key: 'a-' + key + '-' + i, color: col, wrap: 'truncate-end', children: [sym + t] })))
  }
  add('tools', '', st.tools, TEXT)
  add('skills', '◇ ', st.skills, INDIGO)
  add('mcp', '⌁ ', st.mcp, CYAN)
  add('hosts', '↗ ', st.hosts, CYAN_D)
  add('agents', '⬡ ', st.agents, GREEN)
  info.push(row('aktiv', t('rowActive'), aktiv.length ? aktiv : [Text({ key: 'a-none', color: SLATE, children: ['–'] })]))

  const files = Object.entries(st.files).sort((a, b) => (a[1].m === 'R') - (b[1].m === 'R') || b[1].t - a[1].t)
  const MARK = { W: ['+', GREEN], E: ['✎', AMBER], R: ['·', SLATE] }
  const maxFiles = narrow ? 3 : 5
  const fkids = files.slice(0, maxFiles).map(([p, f]) => Text({
    key: 'f-' + p, color: f.m === 'R' ? SLATE : TEXT, wrap: 'truncate-end',
    children: [Text({ key: 'f-m-' + p, color: MARK[f.m][1], children: [MARK[f.m][0] + ' '] }), short(baseName(p), 24)],
  }))
  if (files.length > maxFiles) fkids.push(Text({ key: 'f-more', color: SLATE, children: ['+' + (files.length - maxFiles)] }))
  info.push(row('dateien', t('rowFiles'), fkids.length ? fkids : [Text({ key: 'f-none', color: SLATE, children: ['–'] })]))

  const gem = e.surface === 'terminal' || !Svg
    ? Box({ key: 'gem', flexDirection: 'column', children: GEM.map((r, i) => Text({ key: 'gem-' + i, color, children: [r] })) })
    : Svg({ key: 'gem', source: gemSvg(color), alt: 'BroStatus-Diamant', width: 66, height: 44 })
  return [
    Box({
      key: 'status-box', flexDirection: 'row', columnGap: 2, alignItems: 'center',
      // Diamant immer mittig zur ganzen Anzeige
      children: [gem, Box({ key: 'status-info', flexDirection: 'column', alignItems: 'flex-start', flexShrink: 1, children: info })],
    }),
    Text({ key: 'status-gap', children: [' '] }),
  ]
}

function onToolCall(e, now) {
  const d = describeTool(e.tool, e)
  const sub = Boolean(e.agentId)
  if (!sub) st.current = [...st.current, { id: e.tool_use_id, label: d.label, since: now }]
  bump(st.tools, d.tool)
  bump(st.mcp, d.mcp)
  bump(st.skills, d.skill)
  bump(st.hosts, d.host)
  bump(st.agents, d.agent)
}

// Kommt eine Eingabe von dir (getippt, Handy, Desktop-App, Klick im Antwort-Band) und nicht von einem Hintergrund-Ereignis?
const VON_DIR = ['composer', 'bridge', 'sdk', 'slack-ping', 'auto-continuation', 'plugin']
export function vonDir(e) {
  if (!e || e.isMeta || e.command) return false
  const kind = e.origin && e.origin.kind
  return !kind || VON_DIR.includes(kind)
}

// Endete die Antwort mit API-Fehler oder Ablehnung (keine fertige Antwort)?
export function endedWithError(e) {
  return !!e && (e.reason === 'error' || e.reason === 'refusal')
}

// Hat das Werkzeug wirklich gearbeitet? Nicht bei Ablehnung (deny), Fehler oder Abbruch
export function toolOk(r) {
  return !!r && !r.deny && !r.isError
}

// r: Ergebnis von tool.call; undefined, wenn der Aufruf geworfen hat
function onToolDone(e, now, r) {
  // Dateien erst nach dem Ergebnis: tool.call umschliesst Pruefung, Freigabe und Ausfuehrung
  const d = describeTool(e.tool, e)
  if (d.file && d.mark && toolOk(r)) {
    const had = st.files[d.file] && st.files[d.file].m
    // geaendert schlaegt gelesen, neu bleibt neu
    const m = had === 'W' || (had === 'E' && d.mark === 'R') ? had : d.mark
    st.files[d.file] = { m, t: now }
    // Feierabend: eine geschriebene oder geaenderte Datei zaehlt als Fortschritt der Runde
    if (d.mark === 'W' || d.mark === 'E') fzSchreibt++
  }
  st.current = st.current.filter((c) => c.id !== e.tool_use_id)
  subChecks.delete(e.tool_use_id)
  // Wartete eine Frage genau auf dieses Werkzeug (auch eines Hilfs-Agenten), ist sie jetzt beantwortet
  if (e.agentId && st.status === 'wartet' && st.waitId === e.tool_use_id) {
    st.status = 'arbeitet'
    st.waitLabel = ''
    st.waitId = null
  }
  if (!e.agentId) {
    st.cacheAt = now // nach dem Ergebnis geht die naechste Anfrage raus und frischt den Cache auf
    // eine offene Frage eines anderen Werkzeugs (z. B. eines Hilfs-Agenten) bleibt stehen
    if (st.status === 'wartet' && (!st.waitId || st.waitId === e.tool_use_id)) { st.status = 'arbeitet'; st.waitLabel = ''; st.waitId = null }
    st.check = null
  }
}

// ---------- Toene in der Desktop-App ----------
//
// Im Terminal piept hook.py ueber die Terminal-Glocke, in der Desktop-App gibt es sie nicht:
// dort spielt die Mod eigene, selbst berechnete Toene (scripts/toene-bauen.py).
// warten = auffaellig bei „wartet auf dich“, fertig = leise nach laengerer Arbeit.
export const SOUND_MIN_S = 15 // wie notify_min_secs der Statusline
export const WAIT_SOUNDS = [['doppelton', 'Doppelton'], ['klingel', 'Klingel'], ['dreiklang', 'Dreiklang']]
export const DONE_SOUNDS = [['glocke', 'Glöckchen leise'], ['tick', 'Tick leise'], ['dreiklang', 'Dreiklang leise']]
export const SOUND_MINS = [['5', '5 s'], ['15', '15 s'], ['30', '30 s'], ['60', '1 min'], ['180', '3 min']]
let surface = ''
let soundNote = '' // Ergebnis des letzten Tons, damit ein stiller Fehler im Panel sichtbar wird

// Eigene Toene (nur Windows, nur auf dem eigenen Rechner, nicht im Projekt): Ordner toene neben state,
// Dateien warten-<Name>.wav und fertig-<Name>.wav. Auswahlwert 'eigen:<Name>'.
let eigeneToene = { warten: [], fertig: [] }
let toeneDir = null

export function eigeneAusListe(namen) {
  const out = { warten: [], fertig: [] }
  for (const n of namen) {
    const m = /^(warten|fertig)-(.+)\.wav$/i.exec(String(n))
    if (m) out[m[1].toLowerCase()].push(m[2])
  }
  // Kurze Namen zuerst, damit der Grundton („Machine“) vor seinen Varianten steht und Standard wird
  const ordnen = (a, b) => a.length - b.length || a.localeCompare(b)
  out.warten.sort(ordnen)
  out.fertig.sort(ordnen)
  return out
}

export function setzeEigeneToene(dir, liste) {
  toeneDir = dir
  eigeneToene = liste
}

async function ladeEigeneToene($) {
  if (!stateDir) return
  const dir = basisVon(stateDir) + sep() + 'toene'
  try {
    const l = await $.fs.list(dir)
    setzeEigeneToene(dir, eigeneAusListe(l.filter((x) => x.kind === 'file').map((x) => x.name)))
  } catch {
    setzeEigeneToene(null, { warten: [], fertig: [] })
  }
}

// Auswahl je Art: die eingebauten Toene, dahinter die eigenen
export function soundOptions(kind) {
  const list = kind === 'warten' ? WAIT_SOUNDS : DONE_SOUNDS
  const namen = t(kind === 'warten' ? 'soundWait' : 'soundDone')
  return [...list.map(([value]) => ({ value, label: namen[value] })), ...eigeneToene[kind].map((n) => ({ value: 'eigen:' + n, label: n }))]
}

// Datei zu Art (warten/fertig) und gewaehltem Ton; unbekannte Werte fallen auf den ersten zurueck.
// Ein eigener Ton liefert den vollen Pfad im Ordner toene.
export function soundAsset(kind, id) {
  const list = kind === 'warten' ? WAIT_SOUNDS : DONE_SOUNDS
  const eigen = /^eigen:(.+)$/.exec(String(id || ''))
  if (eigen && toeneDir && eigeneToene[kind].includes(eigen[1])) return toeneDir + sep() + kind + '-' + eigen[1] + '.wav'
  const pick = list.find(([v]) => v === id) ? id : list[0][0]
  return 'sounds/' + kind + '-' + pick + '.wav'
}

// Ton wiederholen: verpasst man den Ton, kommt er im gewaehlten Takt noch einmal, hoechstens REPEAT_MAX-mal.
// Jede neue Meldung und jede eigene Nachricht beginnt eine neue Runde (repGen), alte Wiederholungen verfallen.
// Der Status muss noch derselbe sein: eine Freigabe oder Auswahl startet ein Werkzeug, dann steht „arbeitet“.
export const SOUND_REPEATS = ['0', '120', '300']
export const REPEAT_MAX = 3
let repGen = 0

export function stopRepeat() {
  repGen++
}

export function repeatStillDue(kind, gen) {
  if (gen !== repGen) return false
  if (kind === 'warten') return st.status === 'wartet'
  return st.status === 'fertig' && !(st.background && st.background.length)
}

function repeatLater($, kind, gen, n) {
  const sek = Number(cfg.soundRepeat) || 0
  if (!sek || n >= REPEAT_MAX) return
  $.clock.after(sek * 1000, () => {
    if (!repeatStillDue(kind, gen) || (Number(cfg.soundRepeat) || 0) !== sek) return
    ping($, kind)
    repeatLater($, kind, gen, n + 1)
  })
}

// Ton einer echten Meldung (wartet auf dich / fertig), mit Wiederholung
function meldeTon($, kind) {
  stopRepeat()
  ping($, kind)
  repeatLater($, kind, repGen, 0)
}

// Lautstaerke der Toene in Prozent. Der Windows-SoundPlayer hat keinen Regler: PowerShell rechnet die Datei leiser
// (16-Bit-WAV) und legt sie einmal im Temp-Ordner ab; das Original bleibt unveraendert.
export const SOUND_VOLUMES = ['25', '50', '75', '100']
export const SOUND_VOLUME_DEFAULT = 50
export function soundVolume() {
  const v = Number(cfg.soundVolume)
  return SOUND_VOLUMES.includes(String(v)) ? v : SOUND_VOLUME_DEFAULT
}
const SOUND_PS = "$src = $env:BRO_WAV\n$vol = [double]$env:BRO_VOL / 100\n$play = $src\nif ($vol -lt 1) {\n  $tmp = Join-Path $env:TEMP ('brostatus-' + $env:BRO_VOL + '-' + [IO.Path]::GetFileName($src))\n  if (-not ((Test-Path $tmp) -and ((Get-Item $tmp).LastWriteTime -ge (Get-Item $src).LastWriteTime))) {\n    $b = [IO.File]::ReadAllBytes($src)\n    if ($b.Length -gt 44 -and [BitConverter]::ToUInt16($b, 20) -eq 1 -and [BitConverter]::ToUInt16($b, 34) -eq 16) {\n      $i = 12\n      while ($i + 8 -le $b.Length) {\n        $id = [Text.Encoding]::ASCII.GetString($b, $i, 4)\n        $n = [BitConverter]::ToUInt32($b, $i + 4)\n        if ($id -eq 'data') {\n          $e = [Math]::Min($i + 8 + $n, $b.Length) - 2\n          for ($j = $i + 8; $j -le $e; $j += 2) {\n            $s = [int][Math]::Round([BitConverter]::ToInt16($b, $j) * $vol)\n            $b[$j] = $s -band 255\n            $b[$j + 1] = ($s -shr 8) -band 255\n          }\n          break\n        }\n        $i += 8 + $n + ($n % 2)\n      }\n      [IO.File]::WriteAllBytes($tmp, $b)\n    }\n  }\n  if (Test-Path $tmp) { $play = $tmp }\n}\n(New-Object System.Media.SoundPlayer $play).PlaySync()"

// Nie mit await aufrufen: der Clip laeuft bis zum Ende, das wuerde die Freigabe-Frage oder die Antwort aufhalten
// force: Hoerprobe aus dem Menue, auch wenn Ton gerade aus ist
async function ping($, kind, id, force) {
  if (!force && !cfg.sound) return
  // Nur im Terminal bleibt es still (dort piept die Terminal-Glocke); ist die Oberflaeche unbekannt, wird gespielt
  if (surface === 'terminal') {
    soundNote = t('soundTerminal')
    $.ui.invalidate('ui.render')
    return
  }
  const asset = soundAsset(kind, id || (kind === 'warten' ? cfg.soundWait : cfg.soundDone))
  try {
    // Windows: $.audio.play hat keinen Player und bleibt stumm, also spielt PowerShell die Datei
    const root = String($.plugin.root || '')
    if (/^([A-Za-z]:[\\/]|\\\\)/.test(root)) {
      // Ein eigener Ton bringt seinen vollen Pfad schon mit
      const file = /^([A-Za-z]:[\\/]|\\\\)/.test(asset) ? asset : root.replace(/[\\/]+$/, '') + '\\' + asset.replace(/\//g, '\\')
      soundNote = t('soundPlayingWin', asset)
      $.ui.invalidate('ui.render')
      const r = await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
        SOUND_PS], { env: { BRO_WAV: file, BRO_VOL: String(soundVolume()) }, cwd: root, timeoutMs: 15000 })
      soundNote = r.exitCode === 0 ? t('soundWinOk', asset) : t('soundWinError', r.exitCode, String(r.stderr || '').slice(0, 120))
      $.ui.invalidate('ui.render')
      return
    }
    // $.audio.play spielt nur Dateien der Mod: ohne Windows weicht ein eigener Ton auf den ersten eingebauten aus
    const clip = asset.startsWith('sounds/') ? asset : soundAsset(kind, '')
    soundNote = t('soundSending', clip)
    $.ui.invalidate('ui.render')
    const res = await $.audio.play({ asset: clip })
    soundNote = t('soundAnswer', res === undefined ? 'ok' : JSON.stringify(res), clip)
  } catch (err) {
    soundNote = t('soundFailed', String((err && err.message) || err))
  }
  try { $.ui.invalidate('ui.render') } catch {}
}

// ---------- Freigabe: wer entscheidet? ----------
//
// tool.check „ask“ heisst nicht „du musst antworten“: Im Auto-Modus entscheidet zuerst der Auto-Pruefer,
// du wirst erst gefragt, wenn er ablehnt. Die klassischen Ereignisse (classic.*) erreichen die Mod nicht
// (cc-plugin-sec-default haelt sie auf). Sicheres Zeichen: hook.py (Hooks aus settings.json) bekommt die
// Meldung „Freigabe noetig“ (Notification permission_prompt) und setzt in state/<Sitzung>.json den Status
// „waiting“. Die Mod liest die Datei nach einem ask jede Sekunde. Rueckfall ohne hook.py: die Zeitprobe,
// startet das Werkzeug nicht binnen CHECK_PROBE_S, steht „wartet auf dich“.
export const CHECK_PROBE_S = 30
export const HOOK_POLL_MS = 1000

// Meldet hook.py fuer diese Sitzung, dass eine Freigabe auf dich wartet (seit sinceS)?
export function hookWaiting(state, sinceS) {
  return !!state && state.status === 'waiting' && (state.updated || 0) >= sinceS - 2
}

async function readHookState($) {
  if (!sid) await ensureSid($)
  if (!stateDir || !sid) return null
  try {
    return JSON.parse(await $.fs.read(filePath(sid + '.json')))
  } catch {
    return null
  }
}

// Liest nach einem ask die Statusdatei von hook.py, solange das Werkzeug nicht fertig ist (st.check bleibt bis onToolDone).
// Laeuft hook.py (Datei da), zaehlt nur seine echte Meldung „Freigabe noetig“: Ein langer Befehl, den der
// Auto-Pruefer freigegeben hat, ist keine Frage an dich. Nur ohne hook.py greift die Zeitprobe (CHECK_PROBE_S).
function watchHook($, id, label, sinceS, n) {
  $.clock.after(HOOK_POLL_MS, async () => {
    if (!st.check || st.check.id !== id) return
    const state = await readHookState($)
    if (state) st.check.hook = true
    if (hookWaiting(state, sinceS)) {
      // mit id: zeigt genau dieses Werkzeug, dass es laeuft (Freigabe erteilt), endet das Warten
      const neu = askPerson(label, id)
      $.ui.invalidate('ui.render')
      if (neu) meldeTon($, 'warten')
      return
    }
    if (state || n < CHECK_PROBE_S) watchHook($, id, label, sinceS, n + 1)
  })
}

// ---------- Panel in der Desktop-App von selbst oeffnen ----------
//
// Einmal je Sitzung, sobald feststeht, dass die Desktop-App zeichnet. Schliesst du das Panel, bleibt es zu.
let autoOpened = false
export const SURFACE_POLLS = 30
function autoOpen($, s) {
  if (s !== 'desktop' || autoOpened) return
  autoOpened = true
  surface = 'desktop'
  if (paneOpen) return
  paneOpen = true
  $.ui.open({ id: PANE, title: TITLE }).catch(() => { paneOpen = false })
}

function watchSurfaces($, n) {
  $.clock.after(1000, async () => {
    if (autoOpened) return
    try {
      const list = await $.session.surfaces()
      if (Array.isArray(list) && list.includes('desktop')) return autoOpen($, 'desktop')
    } catch {}
    if (n < SURFACE_POLLS) watchSurfaces($, n + 1)
  })
}

// Freigabe-Fragen von Hilfs-Agenten: offen, bis ihr Werkzeug fertig ist (onToolDone)
const subChecks = new Set()
function watchSub($, id, label, sinceS) {
  $.clock.after(HOOK_POLL_MS, async () => {
    if (!subChecks.has(id)) return
    if (hookWaiting(await readHookState($), sinceS)) {
      subChecks.delete(id)
      const neu = askPerson(label, id)
      $.ui.invalidate('ui.render')
      if (neu) meldeTon($, 'warten')
      return
    }
    watchSub($, id, label, sinceS)
  })
}

// Nach Claudes Antwort: meldet hook.py (Stop mit background_tasks) noch laufende Hintergrund-Arbeit?
// hook.py schreibt kurz nach turn.complete, darum einige Versuche im Sekundentakt
export const BG_POLL = 5
export function backgroundOf(state, sinceS) {
  if (!state || state.status !== 'done' || (state.finished_at || 0) < sinceS - 5) return null
  return Array.isArray(state.background) ? state.background : []
}

// ton: nach dieser Antwort soll der Fertig-Ton kommen. Er kommt erst, wenn feststeht, dass nichts mehr im Hintergrund laeuft;
// sonst wartet er (fertigOffen) bis zur Antwort, mit der die Hintergrund-Arbeit endet – auch wenn die nur kurz ist.
// Ohne hook.py (keine Statusdatei) kommt er nach den Versuchen trotzdem.
let fertigOffen = false
function watchBackground($, sinceS, n, ton) {
  $.clock.after(1000, async () => {
    if (st.status !== 'fertig') return
    const bg = backgroundOf(await readHookState($), sinceS)
    if (bg) {
      st.background = bg
      $.ui.invalidate('ui.render')
      if (ton && bg.length) fertigOffen = true
      else if (ton) {
        fertigOffen = false
        meldeTon($, 'fertig')
      }
      return
    }
    if (n < BG_POLL) watchBackground($, sinceS, n + 1, ton)
    else if (ton) {
      fertigOffen = false
      meldeTon($, 'fertig')
    }
  })
}

// Gibt zurueck, ob der Status gerade neu auf „wartet“ gesprungen ist (dann spielt der Aufrufer den Warnton)
export function askPerson(label, id) {
  const neu = st.status !== 'wartet'
  if (neu) st.waitSince = 0 // die Anzeige setzt die Zeit beim ersten Zeichnen, mit derselben Uhr wie sie selbst
  st.status = 'wartet'
  st.waitLabel = label
  st.waitId = id || null
  st.check = null
  return neu
}

// Startet genau das Werkzeug, auf dessen Freigabe gewartet wird, ist die Frage beantwortet (oder gar nicht an dich gegangen)
export function endsWait(status, waitId, toolId) {
  return status === 'wartet' && !!waitId && waitId === toolId
}

// Meldet eine Freigabe-Frage; gibt zurueck, ob dabei neu „wartet auf dich“ erscheint
export function onAsk(mode, id, label) {
  if (mode === 'auto' || !mode) {
    st.check = { id, label }
    return false
  }
  return askPerson(label, id)
}

function onUsage(u) {
  if (!u) return
  if (u.context) st.ctx = { tokens: u.context.tokens ?? null, window: u.context.window || 200000, percent: u.context.percent ?? null }
  if (Array.isArray(u.rateLimits)) st.limits = u.rateLimits.map((r) => ({ kind: r.kind, percent: r.percentUsed }))
  if (u.cost && typeof u.cost.usd === 'number') st.costUsd = u.cost.usd
}

// Trefferquote einer Antwort aus ihren Cache-Zahlen
export function hitOf(usage) {
  if (!usage) return null
  const read = usage.cache_read_input_tokens || 0
  const total = read + (usage.cache_creation_input_tokens || 0) + (usage.input_tokens || 0)
  return total ? { read, total } : null
}

function pct2(x) {
  return x === null || x === undefined ? '–' : (x * 100).toFixed(2).replace('.', ',') + ' %'
}

function hitColor(x) {
  return x === null || x === undefined ? SLATE : x >= 0.8 ? GREEN : x >= 0.5 ? AMBER : RED
}

// Ring fuer einen Anteil (0..1), nur auf Oberflaechen, die Grafik zeichnen; mitte: kurzer Text im Ring (z. B. „3×“)
export function ringSvg(x, color, mitte = '') {
  const r = 15
  const c = 2 * Math.PI * r
  const on = Math.max(0, Math.min(1, x || 0)) * c
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">` +
    `<circle cx="18" cy="18" r="${r}" fill="none" stroke="${TRACK}" stroke-width="4"/>` +
    `<circle cx="18" cy="18" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" ` +
    `stroke-dasharray="${on.toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 18 18)"/>` +
    (mitte ? `<text x="18" y="22" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="bold" fill="${color}">${mitte}</text>` : '') +
    `</svg>`
}

// Wie oft das Warmhalten seit deiner letzten Nachricht aufgefrischt hat, als „3×“ (leer, solange es 0 ist)
export function warmZahl(streak) {
  const n = Math.floor(Number(streak) || 0)
  return n > 0 ? (n > 99 ? '99+' : n + '×') : ''
}

// Kreis mit Wert und Beschriftung daneben; im Terminal nur der Text
function ringBlock($, e, key, frac, color, value, label, extra = [], mitte = '') {
  const { Box, Text, Svg } = $.ui.resolve(e)
  const text = Box({
    key: key + '-text',
    flexDirection: 'column',
    children: [
      Text({ key: key + '-pct', bold: true, tabular: true, color: TEXT, children: [value] }),
      Text({ key: key + '-label', size: 'caption', dimColor: true, children: [label] }),
      ...extra,
    ],
  })
  const kids = e.surface === 'terminal' || !Svg ? [text]
    : [Svg({ key: key + '-ring', source: ringSvg(frac, color, mitte), alt: value + ' ' + label + (mitte ? ' ' + mitte : ''), width: 36, height: 36 }), text]
  // Kreise oben ausrichten, damit alle drei auf einer Hoehe stehen, auch wenn ein Block eine Zeile mehr hat
  return Box({ key, flexDirection: 'row', columnGap: 1, alignItems: 'flex-start', children: kids })
}

function hitBlock($, e, key, value, label) {
  return ringBlock($, e, key, value, hitColor(value), pct2(value), label)
}

// Zustand des Feierabend-Knopfs als farbiges Wort
function fzLabelFor(state) {
  return {
    wartet: [t('fzWaitingAnswer'), AMBER],
    arbeitet: [t('fzWorking'), CYAN],
    haelt: [t('fzHolding'), SLATE],
    pausiert: [t('fzIdle'), SLATE],
    schliesst: [t('fzClosing'), CYAN],
    gespeichert: [t('fzSaved'), GREEN],
    'nicht gespeichert': [t('fzNotSaved'), RED],
  }[state] || null
}

function renderPane($, e, now) {
  const { Box, Text, Button, Select } = $.ui.resolve(e)
  const br = bridge || {}
  const ttlBridge = ttlSeconds(br.ttl)
  // Ohne Brueckendatei (keine Statusline, z. B. Desktop-App) wird der Ablauf geschaetzt
  const estimated = !!br.est || (!ttlBridge && st.cacheAt > 0)
  const ttlS = ttlBridge || (estimated ? EST_TTL : 0)
  const exp = ttlBridge ? expiresAt(br, warm, ttlBridge) : estimated ? st.cacheAt + EST_TTL : 0
  const hitLast = br.hit_last ?? st.hitLast
  const hitSession = br.hit_session ?? (st.hitTotal ? st.hitRead / st.hitTotal : null)
  const left = exp ? Math.max(0, exp - now) : 0
  const urgent = left > 0 && left < (ttlS >= 3600 ? 120 : 30)
  const soon = left > 0 && left < (ttlS >= 3600 ? 600 : 60)
  // Wie bei der Statusline: laeuft das Warmhalten, zaehlt der Cache-Ablauf fuer den Diamanten nicht
  const cacheUrgency = cfg.enabled ? {} : { urgent, soon }
  const d = decide({ now, cfg, bridge, warm, lastActivity, turnRunning })

  // Zustand des Caches als Ampel: gruen gut, gelb bald ab, rot gleich ab oder kalt, grau ohne Daten
  const [stateText, clockCol] = !ttlS ? [t('stateUnknown'), SLATE]
    : !left ? [t('stateCold'), RED]
      : urgent ? [t('stateUrgent'), RED]
        : soon ? [t('stateSoon'), AMBER]
          : [t('stateWarm'), GREEN]
  const ttlLabel = 'Cache' + (ttlS >= 3600 ? ' · 1 h' : ttlS ? ' · 5 min' : '') + (estimated ? ' · ' + t('estimated') : '')

  // Kalter Cache: die Meldung, warum, steht immer sichtbar unter den Kreisen
  const status = warm.note || t('coldNote')

  // Drei Kreise: Restzeit des Caches, Trefferquote der letzten Anfrage und der Session
  const cacheValue = left ? fmtClock(left) : ttlS ? t('stateCold') : '–'
  // Was die naechste Nachricht kostet (Zeile zwischen Kontext und Limit)
  const ctxNow = (st.ctx && st.ctx.tokens) || br.context || br.recache || 0
  const nextC = nextCost(ctxNow, ttlS, left)
  const kaltC = nextCost(ctxNow, ttlS, 0)
  const rows = [
    ...renderStatus($, e, now, cacheUrgency, nextC, kaltC, left, ttlS),
    Box({
      key: 'big',
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: 3,
      rowGap: 1,
      alignItems: 'flex-start',
      children: [
        // Knopf links vor den Kreisen: blendet den Bedienbereich darunter aus und ein
        Button({
          key: 'bro-hide',
          label: cfg.hidden ? '◆ ▸' : '◆ ▾',
          children: [Text({ key: 'bro-hide-text', color: clockCol, children: [cfg.hidden ? '◆ ▸' : '◆ ▾'] })],
          onPress: async () => {
            cfg = { ...cfg, hidden: !cfg.hidden }
            $.ui.invalidate('ui.render')
            await saveCfg($)
          },
        }),
        ringBlock($, e, 'cache-ring', ttlS && left ? left / ttlS : 0, clockCol, cacheValue, ttlLabel, [
          // Im Terminal gibt es keinen Ring: dort steht die Zahl hinter dem Zustand
          Text({ key: 'state', size: 'caption', children: [Text({ key: 'dot', color: clockCol, children: ['● '] }), Text({ key: 'state-text', color: clockCol, children: [stateText + (e.surface === 'terminal' && warmZahl(warm.streak) ? ' · ' + warmZahl(warm.streak) : '')] })] }),
        ], warmZahl(warm.streak)),
        hitBlock($, e, 'hit-last', hitLast, t('lastRequest')),
        hitBlock($, e, 'hit-session', hitSession, t('session')),
      ],
    }),
  ]
  // Wichtige Meldungen immer, Routine nur unter „Mehr“
  const important = d.action === 'cold'
  if (important) rows.push(Text({ key: 'status', color: d.action === 'cold' ? AMBER : SLATE, children: [status] }))

  // Je Modus eine Zeile wie in Einstellungs-Listen: links Name und Zustand, rechts der Schalter An/Aus
  const ctx = st.ctx || {}
  const win = ctx.window || 200000
  const trig = compactTrigger(ctxThreshold, win, cfg.compactAt)
  const tokens = ctx.tokens || 0
  const czCol = !cfg.compact ? SLATE : tokens >= trig ? RED : tokens >= trig * 0.75 ? AMBER : GREEN
  const czLabel = czLabelFor(cz.state)
  const fzLabel = fzLabelFor(fz.state)
  // Unter dem Namen: aus = wofuer er ist, an = was er gerade tut; was der Cache-Kreis schon sagt, steht hier nicht
  const keepState = warming ? t('keepRefreshing')
    : d.action === 'off' ? t('keepOff')
      : d.action === 'unknown' ? t('keepUnknown')
        : d.action === 'cold' ? t('keepCold')
          : d.action === 'pause' ? t('keepPause')
            : t('keepNext', fmtClock((d.nextAt || now) - now))
  const ctxPct = tokens ? t('compactNow', Math.round((tokens / win) * 100)) : ''
  const compactState = !cfg.compact ? [t('compactOff')] : [
    Text({ key: 'compact-dot', color: czCol, children: ['● '] }),
    t('compactFrom', Math.round((trig / win) * 100)) + ctxPct,
    ...(czLabel ? [' · ', Text({ key: 'compact-run', color: czLabel[1], children: [czLabel[0]] })] : []),
  ]
  const controls = []
  controls.push(Box({
    key: 'auto',
    flexDirection: 'column',
    rowGap: 1,
    marginTop: 1,
    children: [
      // Lite-Fassung: keine Schalter, die von selbst Anfragen senden
      ...(LITE ? [] : [
        schalter($, e, 'bro-keep', cfg.enabled, t('keepName'), [Text({ key: 'keep-state', children: [keepState] })], () => toggleWarm($), true),
        schalter($, e, 'bro-compact', cfg.compact, 'Auto-Compact', compactState, () => toggleCompact($)),
        ...(cz.note ? [Text({ key: 'compact-note', color: cz.state === 'fehler' ? RED : AMBER, children: [cz.note] })] : []),
        // Feierabend ist kein Schalter: „Einleiten“ startet, solange er laeuft steht dort „Abbrechen“
        knopfZeile($, e, 'bro-feierabend', t('fzName'), [
          fzLabel ? Text({ key: 'fz-state', color: fzLabel[1], children: [fzLabel[0]] }) : Text({ key: 'fz-help', children: [t('fzHelp')] }),
        ], fz.state === 'schliesst' ? t('fzClosing') : feierabendAn() ? t('fzCancel') : t('fzStart'), () => feierabendKnopf($)),
        knopfZeile($, e, 'bro-modell', t('modelName'), [Text({ key: 'bro-modell-cap-text', children: [wechsel ? t('modelBusy') : t('modelCap')] })], t('modelButton'), () => modellwechsel($)),
      ]),
      // Toene (nur Desktop-App): wie die anderen Schalter, mit Leuchte
      ...(e.surface === 'desktop' ? [schalter($, e, 'bro-sound', cfg.sound, t('soundName'), [Text({ key: 'bro-sound-cap-text', children: [t('soundCap')] })], () => toggleSound($))] : []),
    ],
  }))
  if (!LITE && fz.note) controls.push(Text({ key: 'fz-note', color: fz.state === 'gespeichert' ? SLATE : AMBER, children: [t('fzPrefix') + fz.note] }))

  // Leiser Knopf, der Pfeil zeigt, ob offen
  controls.push(Box({
    key: 'buttons',
    flexDirection: 'row',
    marginTop: 1,
    columnGap: 2,
    children: [
      Button({
        key: 'bro-more',
        label: t('more') + (more ? ' ▾' : ' ▸'),
        dimColor: true,
        onPress: () => {
          more = !more
          $.ui.invalidate('ui.render')
        },
      }),
    ],
  }))

  // Mehr: nur, was oben nicht schon steht – Feineinstellungen, Anzahl der Auffrischungen, Kosten, Tipp
  if (more) {
    const narrow = isNarrow(e)
    // Ohne Cache-Daten wie bei der Schaetzung mit dem 1-h-Cache rechnen
    const optTtl = ttlS || EST_TTL
    const moreRows = [
      ...(LITE ? [] : [
      trenner(Text, 'sec-warm', t('secWarm'), narrow),
      Box({
        key: 'opts',
        flexDirection: 'row',
        flexWrap: 'wrap',
        columnGap: 3,
        rowGap: 1,
        children: [
          Select({
            key: 'bro-lead',
            label: narrow ? t('leadLabelShort') : t('leadLabel'),
            options: leadOptions(optTtl),
            value: leadStep(cfg.lead),
            onSelect: async (v) => {
              cfg = { ...cfg, lead: String(v) }
              lastState = ''
              $.ui.invalidate('ui.render')
              await saveCfg($)
            },
          }),
          Select({
            key: 'bro-idle',
            label: narrow ? t('idleLabelShort') : t('idleLabel'),
            options: idleOptions(optTtl, leadSeconds(cfg.lead, optTtl)),
            value: idleStep(cfg.idle),
            onSelect: async (v) => {
              cfg = { ...cfg, idle: String(v) }
              lastState = ''
              $.ui.invalidate('ui.render')
              await saveCfg($)
            },
          }),
        ],
      }),
      Box({
        key: 'opts-help',
        flexDirection: 'column',
        children: [
          hilfe(Text, 'lead-help', ...t('helpLead')),
          hilfe(Text, 'idle-help', ...t('helpIdle')),
        ],
      }),
      trenner(Text, 'sec-compact', t('secCompact'), narrow),
      Select({
        key: 'bro-compact-at',
        label: t('compactAtLabel'),
        options: COMPACT_AT.map((v) => ({ value: String(v), label: v + ' %' + (v === COMPACT_AT_DEFAULT ? t('compactAtDefault') : '') })),
        value: String(COMPACT_AT.includes(cfg.compactAt) ? cfg.compactAt : COMPACT_AT_DEFAULT),
        onSelect: async (v) => {
          cfg = { ...cfg, compactAt: Number(v) }
          $.ui.invalidate('ui.render')
          await saveCfg($)
        },
      }),
      hilfe(Text, 'compact-at-help', ...t('helpCompactAt')),
      ]),
      trenner(Text, 'sec-rings', t('secRings'), narrow),
      Box({
        key: 'rings-help',
        flexDirection: 'column',
        rowGap: 1,
        children: [
          hilfe(Text, 'ring-cache-help', ...t('helpRingCache')),
          hilfe(Text, 'ring-last-help', ...t('helpRingLast')),
          hilfe(Text, 'ring-session-help', ...t('helpRingSession')),
          hilfe(Text, 'limit-help', ...t('helpLimit')),
        ],
      }),
    ]
    if (e.surface === 'desktop') {
      moreRows.push(trenner(Text, 'sec-sound', t('secSound'), narrow), Box({
        key: 'sound-opts',
        flexDirection: 'row',
        flexWrap: 'wrap',
        columnGap: 3,
        rowGap: 1,
        children: [
          Select({ key: 'bro-sound-wait', label: narrow ? t('soundWaitShort') : t('soundWaitLabel'), options: soundOptions('warten'), value: cfg.soundWait, onSelect: (v) => chooseSound($, 'warten', v) }),
          Select({ key: 'bro-sound-done', label: narrow ? t('soundDoneShort') : t('soundDoneLabel'), options: soundOptions('fertig'), value: cfg.soundDone, onSelect: (v) => chooseSound($, 'fertig', v) }),
          Select({ key: 'bro-sound-min', label: narrow ? t('soundMinShort') : t('soundMinLabel'), options: SOUND_MINS.map(([value, label]) => ({ value, label })), value: String(cfg.soundMin), onSelect: async (v) => { cfg = { ...cfg, soundMin: Number(v) }; $.ui.invalidate('ui.render'); await saveCfg($) } }),
          Select({ key: 'bro-sound-volume', label: narrow ? t('soundVolumeShort') : t('soundVolumeLabel'), options: SOUND_VOLUMES.map((value) => ({ value, label: value + ' %' })), value: String(soundVolume()), onSelect: async (v) => { cfg = { ...cfg, soundVolume: Number(v) }; $.ui.invalidate('ui.render'); await saveCfg($); ping($, 'fertig', undefined, true) } }),
          Select({ key: 'bro-sound-repeat', label: narrow ? t('soundRepeatShort') : t('soundRepeatLabel'), options: SOUND_REPEATS.map((value) => ({ value, label: t('soundRepeat')[value] })), value: String(Number(cfg.soundRepeat) || 0), onSelect: async (v) => { cfg = { ...cfg, soundRepeat: Number(v) }; $.ui.invalidate('ui.render'); await saveCfg($) } }),
        ],
      }), Box({
        key: 'sound-test',
        flexDirection: 'row',
        flexWrap: 'wrap',
        columnGap: 2,
        children: [
          Button({ key: 'bro-sound-test-wait', label: t('testWait'), onPress: () => { ping($, 'warten', undefined, true) } }),
          Button({ key: 'bro-sound-test-done', label: t('testDone'), onPress: () => { ping($, 'fertig', undefined, true) } }),
        ],
      }), Box({
        key: 'sound-help-box',
        flexDirection: 'column',
        children: [
          hilfe(Text, 'sound-help', ...t('helpSound')),
          hilfe(Text, 'sound-help-led', ...t('helpSoundLed')),
          hilfe(Text, 'sound-help-min', ...t('helpSoundMin')),
          hilfe(Text, 'sound-help-repeat', ...t('helpSoundRepeat')),
          ...(soundNote ? [hilfe(Text, 'sound-note', t('lastSound'), ' ' + soundNote)] : []),
        ],
      }))
    }
    moreRows.push(trenner(Text, 'sec-lang', t('secLang'), narrow), Select({
      key: 'bro-lang',
      label: t('secLang'),
      options: SPRACHEN.map(([value, label]) => ({ value, label })),
      value: lang,
      onSelect: async (v) => {
        setLang(String(v))
        cfg = { ...cfg, lang: lang }
        $.ui.invalidate('ui.render')
        await saveCfg($)
      },
    }))
    moreRows.push(trenner(Text, 'sec-currency', t('secCurrency'), narrow), Select({
      key: 'bro-currency',
      label: t('secCurrency'),
      options: CURRENCIES.map(([value, label]) => ({ value, label })),
      value: cfg.currency,
      onSelect: async (v) => {
        cfg = { ...cfg, currency: String(v) }
        $.ui.invalidate('ui.render')
        await saveCfg($)
      },
    }))
    {
      const f = curFactor()
      const rate = f ? '1 USD = ' + f.toFixed(3) + ' ' + cfg.currency : ''
      const note = cfg.currency === 'USD' ? t('currencyUsd', (kurse && kurse.stand) || '–')
        : !f ? t('currencyMissing') : ownRate ? t('currencyOwn', rate) : t('currencyHint', rate, (kurse && kurse.stand) || '–')
      moreRows.push(hilfe(Text, 'currency-help', note))
    }
    const hasInfo = (warm.count && !warming) || ((br.context || br.recache) && ttlS) || ttlS >= 3600
    if (hasInfo) moreRows.push(trenner(Text, 'sec-info', t('secInfo'), narrow))
    if (warm.count && !warming) {
      moreRows.push(Text({ key: 'status', color: SLATE, children: [t('refreshCount', warm.count, fmtClock(now - (warm.last_ok || now)))] }))
    }
    const ctxTok = br.context || br.recache || 0
    if (ctxTok && ttlS) {
      moreRows.push(Text({
        key: 'cost',
        dimColor: true,
        children: [t('costLine', fmtTok(ctxTok * readF), fmtTok(ctxTok * (WRITE_FACTOR[ttlS] || 1.25)), breakEven(ttlS))],
      }))
    }
    if (ttlS >= 3600) {
      moreRows.push(Text({
        key: 'tip',
        dimColor: true,
        children: [Text({ key: 'tip-b', color: CYAN, bold: true, children: [t('tipLabel')] }), t('tipText')],
      }))
    }
    controls.push(Box({ key: 'more-info', flexDirection: 'column', rowGap: 1, marginTop: 1, children: moreRows }))
  }
  // Der Bedienbereich lässt sich per ◆-Knopf neben dem Diamanten ausblenden; Status und Kreise bleiben
  if (!cfg.hidden) rows.push(...controls)
  else if (fzLabel) rows.push(Text({ key: 'fz-hidden', color: fzLabel[1], children: [t('fzPrefix') + fzLabel[0]] }))
  return Box({ flexDirection: 'column', children: rows })
}

// Abschnitts-Trenner im Bereich „Mehr“: Querbalken mit farbigem Titel
function trenner(Text, key, titel, narrow) {
  return Text({ key, children: [
    Text({ key: key + '-l', dimColor: true, children: ['── '] }),
    Text({ key: key + '-t', color: CYAN, bold: true, children: [titel] }),
    Text({ key: key + '-r', dimColor: true, children: [' ' + '─'.repeat(narrow ? 16 : 34)] }),
  ] })
}

// Erklärzeile: der Begriff, um den es geht, in Farbe, der Rest gedämpft
function hilfe(Text, key, begriff, rest) {
  return Text({ key, size: 'caption', children: [Text({ key: key + '-b', color: CYAN, bold: true, children: [begriff] }), Text({ key: key + '-r', dimColor: true, children: [rest] })] })
}

// Eine Schalter-Zeile: links Name (fett) und Zustand (klein, grau), rechts der Knopf An/Aus
function schalter($, e, key, on, name, state, onPress, autoFocus = false) {
  const { Box, Text, Button } = $.ui.resolve(e)
  return Box({
    key: key + '-box',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    columnGap: 2,
    children: [
      Box({
        key: key + '-text',
        flexDirection: 'column',
        flexShrink: 1,
        children: [
          Text({ key: key + '-name', bold: true, color: TEXT, children: [name] }),
          Text({ key: key + '-cap', size: 'caption', dimColor: true, children: state }),
        ],
      }),
      // Leuchte vor dem Knopf: gruen = an, rot = aus
      Box({
        key: key + '-ctl',
        flexDirection: 'row',
        alignItems: 'center',
        columnGap: 1,
        children: [
          Text({ key: key + '-led', color: on ? GEM_GREEN : GEM_RED, bold: true, children: ['●'] }),
          Button({
            key,
            variant: on ? 'primary' : 'secondary',
            autoFocus: autoFocus || undefined,
            label: on ? t('on') : t('off'),
            onPress,
          }),
        ],
      }),
    ],
  })
}

// Eine Knopf-Zeile (kein Schalter, keine Leuchte): links Name und Beschreibung, rechts ein Knopf mit Wort
function knopfZeile($, e, key, name, state, label, onPress) {
  const { Box, Text, Button } = $.ui.resolve(e)
  return Box({
    key: key + '-box',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    columnGap: 2,
    children: [
      Box({
        key: key + '-text',
        flexDirection: 'column',
        flexShrink: 1,
        children: [
          Text({ key: key + '-name', bold: true, color: TEXT, children: [name] }),
          Text({ key: key + '-cap', size: 'caption', dimColor: true, children: state }),
        ],
      }),
      Button({ key, variant: 'secondary', label, onPress }),
    ],
  })
}

// ---------- Teil 3: Feierabend ----------
//
// Schalter „Feierabend“ auf An oder /bro feierabend: Laeuft gerade eine Antwort, wird sie abgewartet.
// Dann arbeitet Claude den Plan weiter ab, solange es geht. Jede Antwort endet mit „FEIERABEND: weiter“,
// „FEIERABEND: gespeichert“ oder „FEIERABEND: nicht gespeichert – Grund“. Nach „weiter“ schickt die Mod die
// naechste Runde – oder die Anweisung abzuschliessen, wenn das 5-h-Limit fast voll ist, die Runden aufgebraucht
// sind oder der Schalter auf „aus“ gestellt wurde. Am Ende sind Cache, Compact und Feierabend aus.
// Leerlauf-Bremse: War eine Runde kurz und hat keine Datei geaendert, kommt die naechste erst nach einer Pause
// (2, 4, 8 Minuten); nach der dritten Leerrunde in Folge kommt nach der Pause der Abschluss.
// Fuer die Runden (FZ_RUNDEN) zaehlt nur Fortschritt.

// Die Anweisungen kommen je Sprache aus texte.js; die Schlusszeilen („FEIERABEND: weiter“ …) sind in jeder Sprache gleich.
// Die deutschen Fassungen bleiben als Konstanten (Tests, Dokumentation)
export const FEIERABEND_TEXT = TEXTE.de.fzText + TEXTE.de.fzRules
export const FEIERABEND_WEITER = TEXTE.de.fzNext + TEXTE.de.fzRules
export const FEIERABEND_SCHLUSS = TEXTE.de.fzClose
const fzText = () => t('fzText') + t('fzRules')
const fzNext = () => t('fzNext') + t('fzRules')
// Ab diesem Stand des 5-h-Limits wird abgeschlossen, und hoechstens so viele Runden
export const FZ_LIMIT = 90
export const FZ_RUNDEN = 20

// Liest das Ergebnis aus Claudes Antwort: { saved, reason, weiter }. word ist das Stichwort der Schlusszeile.
export function feierabendResult(answer, word = 'FEIERABEND') {
  const tag = new RegExp(word + ':', 'i')
  const lines = String(answer || '').split('\n').filter((l) => tag.test(l))
  const m = lines.length && lines[lines.length - 1].match(new RegExp(word + ':\\s*\\**\\s*(nicht gespeichert|gespeichert|weiter|wartet)\\s*\\**\\s*(?:[–-]\\s*(.+))?', 'i'))
  if (!m) return { saved: false, reason: 'Claude hat kein Ergebnis gemeldet', weiter: false }
  const w = m[1].toLowerCase()
  if (w === 'weiter') return { saved: false, reason: '', weiter: true }
  // wartet: Claude wartet auf ein Ergebnis, das von selbst zurueckkommt – keine neue Runde schicken
  if (w === 'wartet') return { saved: false, reason: '', weiter: true, warten: true }
  return w === 'gespeichert' ? { saved: true, reason: '', weiter: false } : { saved: false, reason: (m[2] || '').trim(), weiter: false }
}

// Soll nach einer Runde abgeschlossen werden?
export function feierabendSchluss({ runden, limit, stopp }) {
  return !!stopp || runden >= FZ_RUNDEN || (limit !== null && limit !== undefined && limit >= FZ_LIMIT)
}

// Leerlauf-Bremse: eine Runde unter FZ_LEER_S Sekunden ohne geschriebene Datei ist eine Leerrunde.
// Pause vor der naechsten Runde je Leerrunde in Folge (Minuten); nach der letzten Pause wird abgeschlossen.
export const FZ_LEER_S = 120
export const FZ_PAUSEN = [2, 4, 8]
export function feierabendLeer({ geschrieben, sekunden }) {
  return !geschrieben && (Number(sekunden) || 0) < FZ_LEER_S
}

let fz = { state: 'bereit', note: '', runden: 0, stopp: false }
let fzSending = false
let fzSchreibt = 0 // geschriebene/geaenderte Dateien insgesamt; fz.schreibt0 ist der Stand beim Start der Runde
let fzGen = 0 // jede neue Pause und jeder Abbruch macht eine wartende Pause ungueltig
let more = false

const FZ_LAEUFT = ['wartet', 'arbeitet', 'haelt', 'pausiert', 'schliesst']
function feierabendAn() {
  return FZ_LAEUFT.includes(fz.state)
}

function limit5h() {
  const l = st.limits.find((x) => x.kind === 'five_hour')
  return l ? l.percent : null
}

async function sendFz($, text, state) {
  fz = { ...fz, state, note: '', schreibt0: fzSchreibt }
  $.ui.invalidate('ui.render')
  fzSending = true
  try {
    await $.prompt.submit({ text, asUser: true })
  } catch {
    fz = { ...fz, state: 'nicht gespeichert', note: t('sendFailed') + '.' }
    $.ui.invalidate('ui.render')
  } finally {
    fzSending = false
  }
}

// Startet den Feierabend (Schalter oder /bro feierabend)
async function feierabend($) {
  if (feierabendAn()) {
    $.ui.toast(t('toastFzRunning'))
    return
  }
  if (wechsel) {
    $.ui.toast(t('toastFzNeedsModel'))
    return
  }
  fz = { state: 'bereit', note: '', runden: 0, stopp: false }
  if (turnRunning) {
    fz = { ...fz, state: 'wartet' }
    $.ui.toast(t('toastFzWaits'))
    $.ui.invalidate('ui.render')
    return
  }
  await sendFz($, fzText(), 'arbeitet')
}

// Der Schalter: an startet, aus beendet – sofort, solange noch nichts geschickt ist, sonst nach der laufenden Runde
async function feierabendKnopf($) {
  if (LITE) return
  if (!feierabendAn()) return feierabend($)
  if (fz.state === 'schliesst') {
    $.ui.toast(t('toastFzClosing'))
  } else {
    // Abbrechen: keine weitere Runde (auch nicht nach einer Pause), nichts wird abgeschlossen, alles bleibt wie es war
    fzGen++
    fz = { state: 'bereit', note: '', runden: 0, stopp: false }
    $.ui.toast(t('toastFzCancelled'))
  }
  $.ui.invalidate('ui.render')
}

// Nach jeder Antwort waehrend des Feierabends. Gibt true zurueck, wenn vor der naechsten Runde kompaktiert wird.
async function feierabendRunde($, e) {
  if (e.isAborted) {
    await feierabendEnde($, { saved: false, reason: t('reasonAborted') })
    return false
  }
  const r = feierabendResult(e.answer)
  if (!r.weiter || fz.state === 'schliesst') {
    await feierabendEnde($, r.weiter ? { saved: false, reason: t('reasonNotClosed') } : r)
    return false
  }
  // Claude wartet auf ein Ergebnis: keine Leerrunde schicken, die naechste Antwort kommt von selbst
  if (r.warten) {
    fz = { ...fz, state: 'haelt' }
    $.ui.invalidate('ui.render')
    return false
  }
  // Leerlauf-Bremse: nur Runden mit Fortschritt zaehlen, Leerrunden in Folge bremsen
  const leer = feierabendLeer({ geschrieben: fzSchreibt > (fz.schreibt0 || 0), sekunden: st.lastTurnS })
  fz = leer ? { ...fz, leer: (fz.leer || 0) + 1 } : { ...fz, leer: 0, runden: fz.runden + 1 }
  await measureLimit($)
  if (feierabendSchluss({ runden: fz.runden, limit: limit5h(), stopp: fz.stopp })) {
    await sendFz($, t('fzClose'), 'schliesst')
    return false
  }
  // Ist der Kontext fast voll, erst kompaktieren; danach geht die Runde von selbst weiter
  if (cfg.compact && compactNeeded(st.ctx && st.ctx.tokens, ctxThreshold, st.ctx && st.ctx.window, cfg.compactAt)) {
    await startCompact($)
    return true
  }
  if (leer) {
    feierabendPause($, fz.leer)
    return false
  }
  await sendFz($, fzNext(), 'arbeitet')
  return false
}

// Pause nach der n-ten Leerrunde in Folge, danach die naechste Runde – nach der letzten Pause die Anweisung
// abzuschliessen. Kommt in der Zeit eine Antwort von selbst (oder deine Nachricht), wird sie normal ausgewertet;
// die Pause verfaellt dann, ebenso bei Abbrechen.
function feierabendPause($, n) {
  const gen = ++fzGen
  const letzte = n >= FZ_PAUSEN.length
  fz = { ...fz, state: 'pausiert' }
  $.ui.invalidate('ui.render')
  $.clock.after(FZ_PAUSEN[Math.min(n, FZ_PAUSEN.length) - 1] * 60 * 1000, async () => {
    if (gen !== fzGen || fz.state !== 'pausiert' || turnRunning) return
    if (letzte) await sendFz($, t('fzClose'), 'schliesst')
    else await sendFz($, fzNext(), 'arbeitet')
  })
}

async function feierabendEnde($, r) {
  fz = { state: r.saved ? 'gespeichert' : 'nicht gespeichert', note: r.reason, runden: 0, stopp: false }
  // Damit danach nichts mehr verbraucht wird
  if (cfg.enabled || cfg.compact) {
    cfg = { ...cfg, enabled: false, compact: false }
    lastState = ''
    await saveCfg($)
  }
  $.ui.toast(r.saved ? t('toastFzSaved') : t('toastFzNotSaved', r.reason || t('reasonUnknown')))
  $.ui.invalidate('ui.render')
}

// ---------- Teil 5: Auto-Compact ----------
//
// Knopf „Compact: an“. Nach jeder fertigen Antwort prueft die Mod, wie voll der Kontext ist.
// Erst wenn er nahe an der Grenze ist, an der Claude Code selbst kompaktieren wuerde (Reserve 15 %),
// bekommt Claude die Anweisung, den Schritt sauber abzuschliessen und zu speichern. Danach kompaktiert
// die Mod selbst (wie /compact) und schickt „Mach weiter“. Darunter passiert nichts.
// Kompaktiert Claude Code doch vorher selbst, bekommt es dieselbe Behalte-Anweisung mit.

export const COMPACT_TEXT = TEXTE.de.compactText
export const WECHSEL_TEXT = TEXTE.de.modelText
export const COMPACT_KEEP = TEXTE.de.compactKeep
export const COMPACT_WEITER = TEXTE.de.compactContinue
export const COMPACT_RESERVE = 0.15
// true: nach dem Kompaktieren geht die Arbeit von selbst weiter; false: Claude wartet auf dich
const COMPACT_CONTINUE = true

// Grenze in Tokens: die von Claude Code, sonst 90 % des Fensters
export function compactLimit(threshold, window) {
  return threshold || Math.round((window || 200000) * 0.9)
}

// Ab dieser Token-Zahl kompaktiert die Mod selbst
// pct: gewaehlter Fuellstand in Prozent des Fensters (50, 60, 70); sonst (82 = Standard) die Grenze von Claude Code minus Reserve
export const COMPACT_AT = [50, 60, 70, 82]
export const COMPACT_AT_DEFAULT = 82
export function compactTrigger(threshold, window, pct) {
  if (pct && pct < COMPACT_AT_DEFAULT) return Math.round((window || 200000) * pct / 100)
  return Math.round(compactLimit(threshold, window) * (1 - COMPACT_RESERVE))
}

export function compactNeeded(tokens, threshold, window, pct) {
  return !!tokens && tokens >= compactTrigger(threshold, window, pct)
}

let cz = { state: 'bereit', note: '' }
let wechselWarm = false // das Warmhalten war vor dem Knopf an und wird bei Abbruch wieder eingeschaltet
let wechsel = false // true: der Compact laeuft auf Knopfdruck vor einem Modellwechsel, danach geht nichts von selbst weiter
let ctxThreshold = 0

async function measureLimit($) {
  try {
    const u = await $.session.usage({ breakdown: 'summary' })
    onUsage(u)
    const b = u && u.context && u.context.breakdown
    ctxThreshold = b && b.isAutoCompactEnabled ? b.autoCompactThreshold || 0 : 0
  } catch {}
}

// Der Grund eines Fehlers fuer die Anzeige, damit „✕ Fehler“ nicht ohne Erklaerung dasteht
export function errText(err) {
  const m = err && (err.message || err.reason || (typeof err === 'string' ? err : ''))
  return m ? ' – ' + short(String(m).replace(/\s+/g, ' '), 140) : t('noErrorText')
}

async function startCompact($, text = t('compactText')) {
  cz = { state: 'sichert', note: '' }
  $.ui.toast(wechsel ? t('toastModelStart') : t('toastCompactStart'))
  $.ui.invalidate('ui.render')
  try {
    await $.prompt.submit({ text, asUser: true })
  } catch (err) {
    cz = { state: 'fehler', note: t('sendFailed') + errText(err) }
    await wechselZurueck($)
    $.ui.invalidate('ui.render')
  }
}

// In der Desktop-App (Sitzung ohne Terminal) gibt es $.session.compact noch nicht: dort laeuft das Kompaktieren
// als Befehl „/compact“. $.prompt.submit nimmt keinen Text mit „/“ am Anfang, also startet $.command.run den Befehl,
// als haettest du ihn getippt; das Versprechen loest sich, wenn er durch ist.
const NO_DIRECT_COMPACT = /headless|not available/i
export function needsPromptCompact(err) {
  return !!err && NO_DIRECT_COMPACT.test(String((err && err.message) || err))
}

async function doCompact($, r) {
  try {
    const res = await $.session.compact({ instructions: t('compactKeep') })
    if (res && res.skip) {
      cz = { state: 'fehler', note: res.skip }
      await wechselZurueck($)
      $.ui.invalidate('ui.render')
      return
    }
  } catch (err) {
    if (needsPromptCompact(err)) {
      try {
        await $.command.run({ command: 'compact', args: t('compactKeep') })
        await finishCompact($, r)
        return
      } catch (err2) {
        err = err2
      }
    }
    cz = { state: 'fehler', note: t('compactFailed') + errText(err) }
    await wechselZurueck($)
    $.ui.invalidate('ui.render')
    return
  }
  await finishCompact($, r)
}

// Hinweiszeile im Chat (Claude liest sie nicht, es startet keine Antwort): Ergebnis und naechster Schritt
// $.ui.log schreibt eine gedimmte Zeile in den Chat (wie die grauen „bro-status …“-Zeilen)
function chatNotice($, r, next) {
  const why = short(String(r.reason || t('reasonUnknown')).replace(/\s+/g, ' '), 110)
  const mark = r.saved ? 'COMPACT: gespeichert' : 'COMPACT: nicht gespeichert – ' + why
  try {
    $.ui.log(mark + ' | ' + next)
  } catch {}
}

async function finishCompact($, r) {
  const vorher = r.saved ? '' : t('notSavedBefore', short(String(r.reason || t('reasonUnknown')).replace(/\s+/g, ' '), 70))
  try {
    onUsage(await $.session.usage())
  } catch {}
  if (wechsel) {
    wechsel = false
    wechselWarm = false
    cz = { state: 'fertig', note: t('modelDoneNote') + (vorher ? t('modelDoneBut', vorher) : '') }
    $.ui.toast(r.saved ? t('toastModelDone') : t('toastModelDoneNote', vorher))
    chatNotice($, r, t('noticeModel'))
    $.ui.invalidate('ui.render')
    return
  }
  cz = { state: 'fertig', note: vorher }
  $.ui.toast(r.saved ? t('toastCompactDone') : t('toastCompactDoneNote', cz.note))
  chatNotice($, r, COMPACT_CONTINUE || fz.state === 'arbeitet' ? t('noticeContinue') : t('noticeYourTurn'))
  $.ui.invalidate('ui.render')
  if (fz.state === 'arbeitet') await sendFz($, fzNext(), 'arbeitet')
  else if (COMPACT_CONTINUE) {
    try {
      await $.prompt.submit({ text: t('compactContinue'), asUser: true })
    } catch {}
  }
}

// Laeuft nach jeder fertigen Antwort der Hauptunterhaltung
async function checkCompact($, e, fzBefore) {
  if (cz.state === 'sichert') {
    if (e.isAborted) {
      cz = { state: 'bereit', note: '' }
      $.ui.toast(wechsel ? t('toastModelAbort') : t('toastCompactAbort'))
      await wechselZurueck($)
      $.ui.invalidate('ui.render')
      return
    }
    const r = feierabendResult(e.answer, 'COMPACT')
    cz = { state: 'kompaktiert', note: '' }
    $.ui.invalidate('ui.render')
    // Kompaktieren geht nur zwischen zwei Antworten
    $.clock.after(50, () => doCompact($, r))
    return
  }
  // Nach einem Fehler nicht jede Antwort neu versuchen (jeder Versuch schickt Claude wieder zum Speichern): erst Schalter aus und an
  if (!cfg.compact || e.isAborted || cz.state === 'kompaktiert' || cz.state === 'fehler') return
  // Waehrend eines Feierabends kompaktiert dessen Runde selbst; danach soll nichts mehr weiterlaufen
  if (FZ_LAEUFT.includes(fz.state) || FZ_LAEUFT.includes(fzBefore)) return
  await measureLimit($)
  if (compactNeeded(st.ctx && st.ctx.tokens, ctxThreshold, st.ctx && st.ctx.window, cfg.compactAt)) await startCompact($)
}

function czLabelFor(state) {
  return {
    sichert: [t('czSaving'), CYAN],
    kompaktiert: [t('czCompacting'), CYAN],
    fertig: [t('czDone'), GREEN],
    fehler: [t('czError'), RED],
  }[state] || null
}

// ---------- Schalter im Panel ----------

async function toggleWarm($) {
  if (LITE) return
  cfg = { ...cfg, enabled: !cfg.enabled }
  if (cfg.enabled) lastActivity = await nowS($)
  lastState = ''
  $.ui.invalidate('ui.render')
  await saveCfg($)
  await tick($)
}

// Knopf „Modellwechsel vorbereiten“: speichern, kompaktieren, Warmhalten aus; das Modell waehlt der Nutzer selbst
async function modellwechsel($) {
  if (LITE) return
  if (turnRunning || wechsel || cz.state === 'sichert' || cz.state === 'kompaktiert' || FZ_LAEUFT.includes(fz.state)) {
    $.ui.toast(t('toastModelBusy'))
    return
  }
  // vor dem ersten await sperren, damit ein zweiter Klick nichts doppelt schickt
  wechsel = true
  cz = { state: 'sichert', note: '' }
  wechselWarm = cfg.enabled
  if (cfg.enabled) {
    cfg = { ...cfg, enabled: false }
    lastState = ''
    await saveCfg($)
  }
  await startCompact($, t('modelText'))
}

// Abbruch oder Fehler vor dem Kompaktieren: Flag zurueck, Warmhalten wie vorher
async function wechselZurueck($) {
  const warmWar = wechsel && wechselWarm
  wechsel = false
  wechselWarm = false
  if (warmWar) {
    cfg = { ...cfg, enabled: true }
    lastState = ''
    await saveCfg($)
  }
}

async function toggleSound($) {
  cfg = { ...cfg, sound: !cfg.sound }
  $.ui.invalidate('ui.render')
  await saveCfg($)
  if (cfg.sound) ping($, 'fertig') // Hoerprobe beim Einschalten
}

async function chooseSound($, kind, v) {
  const id = String(v)
  cfg = kind === 'warten' ? { ...cfg, soundWait: id } : { ...cfg, soundDone: id }
  $.ui.invalidate('ui.render')
  await saveCfg($)
  ping($, kind, id, true) // Hoerprobe beim Auswaehlen
}

async function toggleCompact($) {
  if (LITE) return
  cfg = { ...cfg, compact: !cfg.compact }
  if (cz.state === 'fertig' || cz.state === 'fehler') cz = { state: 'bereit', note: '' }
  $.ui.invalidate('ui.render')
  await saveCfg($)
  if (cfg.compact) {
    await measureLimit($)
    $.ui.invalidate('ui.render')
  }
}

function stateDirFrom(root) {
  if (!root) return null
  const trimmed = String(root).replace(/[\\/]+$/, '')
  const s = trimmed.includes('\\') ? '\\' : '/'
  const idx = trimmed.lastIndexOf(s)
  return idx > 0 ? trimmed.slice(0, idx) + s + 'state' : null
}

// ---------- Hooks ----------

export function register(on) {
  on('session.start', async ($, e, next) => {
    stateDir = stateDirFrom($.plugin.root)
    surface = e.surface || ''
    st = newStatus()
    autoOpened = false
    try {
      onUsage(await $.session.usage())
    } catch {}
    await refreshModel($)
    await loadKurse($)
    await loadLite($)
    try {
      const saved = await $.store.get('cache-cfg')
      if (saved && typeof saved === 'object') cfg = { ...cfg, ...saved, lead: leadStep(saved.lead ?? cfg.lead), idle: idleStep(saved.idle) }
      if (LITE) cfg = { ...cfg, enabled: false, compact: false }
      setLang(cfg.lang)
    } catch {}
    await writeLang($)
    await ladeEigeneToene($)
    // Gibt es eigene Toene, werden sie einmalig zum Standard (z. B. ein eigener Ton „Machine“); danach frei waehlbar
    if (!cfg.eigenStandard && (eigeneToene.warten.length || eigeneToene.fertig.length)) {
      cfg = { ...cfg, eigenStandard: true,
        soundWait: eigeneToene.warten.length ? 'eigen:' + eigeneToene.warten[0] : cfg.soundWait,
        soundDone: eigeneToene.fertig.length ? 'eigen:' + eigeneToene.fertig[0] : cfg.soundDone }
      await saveCfg($)
    }
    if (cfg.compact) await measureLimit($)
    lastActivity = await nowS($)
    $.clock.every(1000, async () => {
      ticks += 1
      if (paneOpen) $.ui.invalidate('ui.render')
      if (ticks % 5 === 0 && !warming) await tick($)
    })
    try {
      await $.command.register({
        name: 'bro',
        description: t('cmdDescription'),
        argumentHint: '[feierabend]',
        immediate: true,
      })
    } catch {}
    // In der Desktop-App gibt es keine Statusline: dort steht das Panel von Anfang an da
    if (e.surface === 'desktop') autoOpen($, 'desktop')
    // Die Desktop-App laeuft als SDK-Sitzung: session.start kennt dort laut Schnittstelle keine Oberflaeche (null).
    // Live (2026-10-28) kam auch session.attach nicht an. Darum einige Sekunden lang die Liste der Oberflaechen lesen.
    else if (!e.surface) watchSurfaces($, 0)
    return next(e)
  })

  on('session.attach', async ($, e, next) => {
    autoOpen($, e.surface)
    return next(e)
  })

  // Zeichnet die Desktop-App die Arbeitsanzeige, ist sie sicher da (Rueckfall, falls surfaces() leer blieb)
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    autoOpen($, e.surface)
    return next(e)
  })

  // /clear beendet das Gespraech (ohne neues session.start): Anzeige des alten Gespraechs wegraeumen
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      st = newStatus()
      reset()
      subChecks.clear()
      sid = null
      warm = newWarm()
      bridge = null
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // /bro öffnet das Panel, /bro feierabend startet den Feierabend
  on('command.run', { command: 'bro' }, async ($, e) => {
    if (String(e.args || '').trim().toLowerCase() === 'feierabend') {
      // Waehrend der Befehl selbst laeuft, nimmt Claude Code keine neue Nachricht an
      $.clock.after(50, () => feierabend($))
      return {}
    }
    // /bro schaltet das Panel auf und zu
    if (paneOpen) {
      paneOpen = false
      await $.ui.close({ id: PANE })
      return {}
    }
    bridge = await readBridge($)
    paneOpen = true
    await $.ui.open({ id: PANE, title: TITLE, closeOnEscape: true })
    return {}
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) paneOpen = false
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      await refreshModel($)
      turnRunning = true
      st.status = 'arbeitet'
      st.turnStart = await nowS($)
      st.current = []
      st.waitLabel = ''
      st.check = null
    }
    return next(e)
  })

  // Freigabe-Frage an einen Menschen: Status „wartet auf Freigabe“
  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && e.tool_use_id && r && r.decision === 'ask' && e.approver !== 'host') {
      const label = describeTool(e.tool, e.input || {}).label
      if (onAsk('', e.tool_use_id, label)) meldeTon($, 'warten')
      $.ui.invalidate('ui.render')
      if (st.check && st.check.id === e.tool_use_id) {
        const id = e.tool_use_id
        watchHook($, id, label, Date.now() / 1000, 0)
        // Zeitprobe nur ohne hook.py: ist das Werkzeug nach CHECK_PROBE_S nicht fertig, wird eine Frage vermutet
        $.clock.after(CHECK_PROBE_S * 1000, async () => {
          if (!st.check || st.check.id !== id || st.check.hook) return
          const neu = askPerson(label, id)
          $.ui.invalidate('ui.render')
          if (neu) meldeTon($, 'warten')
        })
      }
    } else if (e.agentId && e.tool_use_id && r && r.decision === 'ask' && e.approver !== 'host') {
      // Ein Hilfs-Agent braucht eine Freigabe: auch das ist eine Frage an dich. Nur ueber die echte Meldung von hook.py,
      // keine Zeitprobe (Hilfs-Agenten laufen oft parallel und lange)
      const label = describeTool(e.tool, e.input || {}).label
      subChecks.add(e.tool_use_id)
      watchSub($, e.tool_use_id, label, Date.now() / 1000)
    }
    return r
  })

  // Die Frage-Auswahl (AskUserQuestion) wartet immer auf dich
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    if (!e.agentId && askPerson(t('questionLabel'))) {
      $.ui.invalidate('ui.render')
      meldeTon($, 'warten')
    }
    return next(e)
  })

  // Freigabe erteilt: tool.call feuert VOR tool.check (laut Schnittstelle), kann das Ende des Wartens also nicht melden.
  // Laeuft ein Befehl wirklich, zeichnet Claude Code darunter den Hinweis „im Hintergrund ausfuehren“ (ToolProgress) –
  // erst nach der Freigabe. Gilt nur fuer genau das wartende Werkzeug, damit ein paralleler Aufruf eine offene Frage nicht zudeckt.
  // Grenze: ToolProgress gibt es laut Schnittstelle nur im Terminal. In der Desktop-App endet das Warten erst mit dem Werkzeug (onToolDone).
  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    const id = e.props && e.props.tool_use_id
    if (endsWait(st.status, st.waitId, id)) {
      st.status = 'arbeitet'
      st.waitLabel = ''
      st.waitId = null
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    onToolCall(e, await nowS($))
    let r
    try {
      r = await next(e)
      return r
    } finally {
      onToolDone(e, await nowS($), r)
    }
  })

  // Kein on('session.compact'): „cc-plugin-sec-default“ laesst den Haken nie laufen, er erzeugte nur eine graue Zeile im Chat

  on('session.measure', async ($, e, next) => {
    onUsage(e)
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    if (e.surface) surface = e.surface // falls session.start sie nicht geliefert hat
    return renderPane($, e, await nowS($))
  })

  on('turn.complete', async ($, e, next) => {
    // API-Fehler (Limit, ueberlastet, Kontext voll) oder Ablehnung: keine fertige Antwort.
    // Feierabend und Auto-Compact behandeln das wie einen Abbruch.
    const fehl = endedWithError(e)
    const ab = fehl && !e.isAborted ? { ...e, isAborted: true } : e // nur fuer die Mod, an die Engine geht e
    if (!e.agentId) {
      const t = await nowS($)
      st.status = fehl ? 'fehler' : ab.isAborted ? 'abbruch' : 'fertig'
      st.background = []
      st.finishedAt = t
      st.lastTurnS = st.turnStart ? t - st.turnStart : 0
      // Fertig-Ton nach langer Arbeit, oder weil er auf das Ende der Hintergrund-Arbeit gewartet hat
      if (!ab.isAborted) watchBackground($, Date.now() / 1000, 0, fertigOffen || st.lastTurnS >= (Number(cfg.soundMin) || SOUND_MIN_S))
      st.current = []
      st.waitLabel = ''
      // ohne gezaehlte Anfrage (Fehler) ist der Cache nicht neu aufgebaut
      if (!fehl) st.cacheAt = t
      const hit = hitOf(e.usage)
      if (hit) {
        st.hitLast = hit.read / hit.total
        st.hitRead += hit.read
        st.hitTotal += hit.total
      }
      // Feierabend: naechste Runde oder Abschluss; ein wartender startet jetzt.
      // Die Antwort auf eine Compact-Anweisung gehoert dem Auto-Compact.
      const fzBefore = fz.state
      const compactAntwort = cz.state === 'sichert' || cz.state === 'kompaktiert'
      // startet die Feierabend-Runde selbst ein Compact, gehoert diese Antwort nicht dem Auto-Compact
      let compactGestartet = false
      if (!compactAntwort && ['arbeitet', 'haelt', 'pausiert', 'schliesst'].includes(fz.state)) {
        turnRunning = false
        compactGestartet = await feierabendRunde($, ab)
      } else if (fz.state === 'wartet') {
        turnRunning = false
        if (ab.isAborted) {
          fz = { ...fz, state: 'bereit', note: '' }
          $.ui.invalidate('ui.render')
        } else await sendFz($, fzText(), 'arbeitet')
      }
      turnRunning = false
      if (!compactGestartet) await checkCompact($, ab, fzBefore)
      lastActivity = await nowS($)
      if (!fehl) warm.cold = false // eine echte Anfrage hat den Cache wieder aufgebaut
      warm.note = ''
      lastState = ''
    }
    // Nur Antworten der Hauptunterhaltung, keine Subagents
    if (!e.agentId && !ab.isAborted) {
      const found = bandItems(e.answer)
      reset()
      items = found
      if (items.length) $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // Jede eigene Nachricht (auch die gesendeten Antworten) leert das Band. Nicht: Meldungen von Hintergrund-Aufgaben,
  // Weckern, anderen Sitzungen, Leerlauf-Hinweise und Slash-Befehle wie /bro – die kommen nicht von dir
  on('prompt.submit', async ($, e, next) => {
    if (!vonDir(e)) return next(e)
    stopRepeat() // du hast etwas gemacht: keine Ton-Wiederholung mehr
    const nowSubmit = await nowS($)
    // Eine echte Nachricht schliesst die Pause ab: die Zahl im Cache-Ring faengt wieder bei 0 an
    if (warm.streak > 0) {
      warm.streak = 0
      lastState = ''
      await persist($, 'an')
    }
    lastActivity = nowSubmit
    // Eine eigene neue Nachricht beendet die Anzeige eines abgeschlossenen Feierabends
    if (!fzSending && (fz.state === 'gespeichert' || fz.state === 'nicht gespeichert')) {
      fz = { state: 'bereit', note: '', runden: 0, stopp: false }
    }
    if (items.length) {
      reset()
      $.ui.invalidate('ui.render')
    }
    return next(e)
  }).catch(async ($, e, next) => {
    // Im Fehlerfall die Nachricht unveraendert durchlassen
    if (!next.called) return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!items.length || hidden || e.props.isWorking || e.props.hasSurvey) return next(e)
    bandId = e.requestId
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const width = Math.max(30, (e.props.bodyColumns || 80) - 2)
    const redraw = () => $.ui.invalidate('ui.render')
    const done = items.filter((it) => (answers[it.n] || '').trim()).length
    const single = items.length === 1 && !!items[0].single
    const yesno = single && !!items[0].yesno
    const wegOnly = items.every((it) => it.weg || it.kind)
    const sendNow = (text) => {
      reset()
      redraw()
      $.prompt.submit({ text, asUser: true }).catch(() => {})
    }

    const focusInput = () => {
      $.clock.after(30, () => {
        $.ui.focus({ requestId: bandId, key: 'bro-answer' }).catch(() => {})
      })
    }

    const header = Box({
      key: 'head',
      flexDirection: 'row',
      columnGap: 2,
      children: [
        Text({ color: CYAN, bold: true, children: [t('bandTitle')] }),
        wegOnly ? null : Text({ color: SLATE, children: [done ? t('bandAnswered', done, items.length) : single ? '' : t('bandPress')] }),
        wegOnly ? null : Button({
          key: 'bro-send',
          label: done ? `${t('bandSend')} (${done})` : t('bandSend'),
          plain: true,
          dimColor: !done,
          onPress: () => {
            const text = composeMessage(items, answers)
            if (!text) {
              $.ui.toast(t('bandNoAnswer'))
              return
            }
            reset()
            redraw()
            $.prompt.submit({ text, asUser: true }).catch(() => {})
          },
        }),
        Button({
          key: 'bro-hide',
          label: t('bandHide'),
          plain: true,
          dimColor: true,
          onPress: () => {
            hidden = true
            redraw()
          },
        }),
      ].filter(Boolean),
    })

    if (yesno) {
      return Box({
        flexDirection: 'column',
        children: [
          Box({
            key: 'head',
            flexDirection: 'row',
            columnGap: 2,
            children: [
              Text({ color: CYAN, bold: true, children: [t('bandTitle')] }),
              Button({ key: 'bro-yes', label: t('bandYes'), plain: true, onPress: () => sendNow(t('bandYes')) }),
              Button({ key: 'bro-no', label: t('bandNo'), plain: true, onPress: () => sendNow(t('bandNo')) }),
              Button({ key: 'bro-hide', label: t('bandHide'), plain: true, dimColor: true, onPress: () => { hidden = true; redraw() } }),
            ],
          }),
        ],
      })
    }

    const rows = items.map((it) => {
      const given = (answers[it.n] || '').trim()
      // Ohne Antwort bekommt der Punkt fast die ganze Breite, mit Antwort rund die Haelfte
      const label = it.kind ? t('band' + it.kind[0].toUpperCase() + it.kind.slice(1)) : it.weg ? wegLabel(it, width) : single ? t('bandAnswer') : short(itemName(it.text), Math.max(16, given ? Math.floor(width * 0.55) : width - 4))
      const kids = [
        Button({
          key: 'bro-item-' + it.n,
          label,
          plain: true,
          dimColor: !!given && active !== it.n,
          onPress: () => {
            if (it.kind) {
              sendNow(t('send' + it.kind[0].toUpperCase() + it.kind.slice(1)))
              return
            }
            if (it.weg) {
              sendNow(t('bandWay') + ' ' + it.n)
              return
            }
            active = it.n
            redraw()
            focusInput()
          },
        }),
      ]
      if (given) {
        kids.push(Text({ color: GREEN, wrap: 'truncate-end', children: ['✓ ' + given] }))
      }
      return Box({ key: 'row-' + it.n, flexDirection: 'row', columnGap: 2, children: kids })
    })

    const children = [header, ...rows]
    if (active !== null) {
      const it = items.find((x) => x.n === active)
      children.push(
        Input({
          key: 'bro-answer',
          label: single ? t('bandAnswer') : `${t('bandTo')} ${active}`,
          placeholder: short(it ? it.text : '', Math.max(16, width - 20)),
          value: answers[active] || '',
          submitLabel: t('bandAccept'),
          autoFocus: true,
          onSubmit: (value) => {
            answers[active] = String(value || '')
            // automatisch zum naechsten offenen Punkt springen
            const nextOpen = items.find((x) => x.n > active && !(answers[x.n] || '').trim())
            active = nextOpen ? nextOpen.n : null
            redraw()
            if (active !== null) focusInput()
          },
        }),
      )
    }
    return Box({ flexDirection: 'column', children })
  })
}
