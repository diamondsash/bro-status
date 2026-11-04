"""Gemeinsame Helfer fuer BroStatus (Statusline + Hooks)."""
import json
import os
import re
import time
from contextlib import contextmanager
from pathlib import Path

BASE = Path(__file__).resolve().parent
STATE_DIR = BASE / "state"
CONFIG_FILE = BASE / "config.json"


def clean(s):
    """Entfernt Steuerzeichen (ESC, BEL, Zeilenumbrueche ...) aus Fremdtexten, bevor sie ins Terminal gehen."""
    s = re.sub(r"[\r\n\t]+", " ", str(s))
    return "".join(ch for ch in s if ch >= " " and not ord(ch) == 127 and not 0x80 <= ord(ch) <= 0x9F)


DEFAULT_CONFIG = {
    # Ab wie vielen Sekunden Arbeit eine "Fertig"-Meldung kommt
    "notify_min_secs": 15,
    # Glocke / Desktop-Benachrichtigung im Terminal (OSC 9 + BEL)
    "terminal_notify": True,
    # Fenstertitel zeigt Status (arbeitet / fertig / wartet)
    "window_title": True,
    # Telegram-Push (z.B. ueber einen eigenen Bot). Leer = aus.
    "telegram_bot_token": "",
    "telegram_chat_id": "",
    # Was eine Telegram-Meldung zusaetzlich enthaelt (Standard: nichts davon)
    # Antwortauszug: die ersten 400 Zeichen von Claudes letzter Antwort bei "Fertig"
    "telegram_include_answer": False,
    # Rechnername am Ende der Meldung
    "telegram_include_host": False,
    # Eigener Umrechnungskurs: wie viele Einheiten der gewaehlten Waehrung 1 US-Dollar sind (leer = eingebauter Kurs aus kurse.json)
    "currency_rate": None,
    # Diamant-Signet links anzeigen
    "logo": True,
    # Farben: "truecolor" (Windows Terminal, die meisten Linux-Terminals) oder "256"
    "colors": "truecolor",
    # Dateien: "compact" (eine Zeile), "tree" (Baum darunter) oder "off"
    "files": "compact",
    "tree_max_lines": 8,
    # Kontext-Stufen in %: gelb (Aufgabe abschliessen), orange (/compact), rot (gleich Auto-Compact)
    "ctx_stages": [50, 70, 85],
    # Wie viele Eintraege pro Kategorie (Tools/MCP/...) angezeigt werden
    "max_items": 5,
}


# ---------- Sprache: die Mod schreibt die Wahl aus dem /bro-Panel nach state/sprache.json ----------

LANG_FILE = STATE_DIR / "sprache.json"
LANGS = ("de", "en", "es", "it", "fr")

# Gleiche Woerter wie im Panel (bro-status/hooks/texte.js)
TEXTE = {
    "de": {
        "working": "⚙ arbeitet", "thinking": " → denkt nach…", "parallel": " +%d parallel",
        "waiting": "‖ wartet auf dich", "done": "✓ fertig", "aborted": "✕ abgebrochen (API-Fehler)",
        "ago": "vor %s", "ran": " · lief %s", "ready": "○ bereit",
        "row_context": "kontext", "row_cache": "cache", "row_limit": "limit", "row_active": "aktiv", "row_files": "dateien",
        "ctx1": "Aufgabe abschließen", "ctx2": "/compact oder neuer Chat", "ctx3": "gleich Auto-Compact!",
        "cold_good": " (Cache kalt → guter Moment)", "cold": "kalt", "soon": " · läuft bald ab", "recache": " · neu ~%s",
        "hits": "treffer ", "hit_last": " letzte", "hit_session": " sitzung",
        "warm_an": "an", "warm_frischt auf": "frischt auf", "warm_pausiert": "pausiert", "warm_kalt": "kalt",
        "more_files": "   … +%d weitere", "limit_s": "S", "limit_w": "W", "warm_label": "WARM", "kalt_label": "KALT",
        "title_waiting": "⏸ wartet auf dich", "notify_waiting": "Claude wartet auf dich (%s)",
        "tg_waiting": "⏸ Claude wartet auf dich – %s\n%s", "title_done": "%s fertig (%s)",
        "notify_done": "Claude ist fertig – %s (%s)",
        "background": "◔ arbeitet im Hintergrund · %d", "title_background": "◔ arbeitet im Hintergrund (%d)",
    },
    "en": {
        "working": "⚙ working", "thinking": " → thinking…", "parallel": " +%d parallel",
        "waiting": "‖ waiting for you", "done": "✓ done", "aborted": "✕ canceled (API error)",
        "ago": "%s ago", "ran": " · ran %s", "ready": "○ ready",
        "row_context": "context", "row_cache": "cache", "row_limit": "limit", "row_active": "active", "row_files": "files",
        "ctx1": "finish the task", "ctx2": "/compact or new chat", "ctx3": "Auto-Compact soon!",
        "cold_good": " (cache cold → good moment)", "cold": "cold", "soon": " · expires soon", "recache": " · new ~%s",
        "hits": "hits ", "hit_last": " last", "hit_session": " session",
        "warm_an": "on", "warm_frischt auf": "refreshing", "warm_pausiert": "paused", "warm_kalt": "cold",
        "more_files": "   … +%d more", "limit_s": "S", "limit_w": "W", "warm_label": "WARM", "kalt_label": "COLD",
        "title_waiting": "⏸ waiting for you", "notify_waiting": "Claude is waiting for you (%s)",
        "tg_waiting": "⏸ Claude is waiting for you – %s\n%s", "title_done": "%s done (%s)",
        "notify_done": "Claude is done – %s (%s)",
        "background": "◔ working in the background · %d", "title_background": "◔ working in the background (%d)",
    },
    "es": {
        "working": "⚙ trabajando", "thinking": " → pensando…", "parallel": " +%d en paralelo",
        "waiting": "‖ esperándote", "done": "✓ listo", "aborted": "✕ cancelado (error de API)",
        "ago": "hace %s", "ran": " · duró %s", "ready": "○ preparado",
        "row_context": "contexto", "row_cache": "caché", "row_limit": "límite", "row_active": "activo", "row_files": "archivos",
        "ctx1": "terminar la tarea", "ctx2": "/compact o chat nuevo", "ctx3": "¡pronto Auto-Compact!",
        "cold_good": " (caché fría → buen momento)", "cold": "frío", "soon": " · caduca pronto", "recache": " · nuevo ~%s",
        "hits": "aciertos ", "hit_last": " última", "hit_session": " sesión",
        "warm_an": "activo", "warm_frischt auf": "refrescando", "warm_pausiert": "en pausa", "warm_kalt": "frío",
        "more_files": "   … +%d más", "limit_s": "S", "limit_w": "Sem", "warm_label": "CALIENTE", "kalt_label": "FRÍO",
        "title_waiting": "⏸ esperándote", "notify_waiting": "Claude te está esperando (%s)",
        "tg_waiting": "⏸ Claude te está esperando – %s\n%s", "title_done": "%s listo (%s)",
        "notify_done": "Claude ha terminado – %s (%s)",
        "background": "◔ trabajando en segundo plano · %d", "title_background": "◔ trabajando en segundo plano (%d)",
    },
    "it": {
        "working": "⚙ al lavoro", "thinking": " → sta pensando…", "parallel": " +%d in parallelo",
        "waiting": "‖ ti aspetta", "done": "✓ fatto", "aborted": "✕ annullato (errore API)",
        "ago": "%s fa", "ran": " · durato %s", "ready": "○ pronto",
        "row_context": "contesto", "row_cache": "cache", "row_limit": "limite", "row_active": "attivo", "row_files": "file",
        "ctx1": "concludere il compito", "ctx2": "/compact o nuova chat", "ctx3": "presto Auto-Compact!",
        "cold_good": " (cache fredda → buon momento)", "cold": "freddo", "soon": " · scade presto", "recache": " · nuovo ~%s",
        "hits": "successi ", "hit_last": " ultima", "hit_session": " sessione",
        "warm_an": "attivo", "warm_frischt auf": "aggiorna", "warm_pausiert": "in pausa", "warm_kalt": "freddo",
        "more_files": "   … +%d altri", "limit_s": "S", "limit_w": "Set", "warm_label": "CALDO", "kalt_label": "FREDDO",
        "title_waiting": "⏸ ti aspetta", "notify_waiting": "Claude ti sta aspettando (%s)",
        "tg_waiting": "⏸ Claude ti sta aspettando – %s\n%s", "title_done": "%s fatto (%s)",
        "notify_done": "Claude ha finito – %s (%s)",
        "background": "◔ al lavoro in background · %d", "title_background": "◔ al lavoro in background (%d)",
    },
    "fr": {
        "working": "⚙ au travail", "thinking": " → réfléchit…", "parallel": " +%d en parallèle",
        "waiting": "‖ vous attend", "done": "✓ terminé", "aborted": "✕ annulé (erreur d’API)",
        "ago": "il y a %s", "ran": " · a duré %s", "ready": "○ prêt",
        "row_context": "contexte", "row_cache": "cache", "row_limit": "limite", "row_active": "actif", "row_files": "fichiers",
        "ctx1": "terminer la tâche", "ctx2": "/compact ou nouveau chat", "ctx3": "bientôt Auto-Compact !",
        "cold_good": " (cache froid → bon moment)", "cold": "froid", "soon": " · expire bientôt", "recache": " · nouveau ~%s",
        "hits": "succès ", "hit_last": " dernière", "hit_session": " session",
        "warm_an": "actif", "warm_frischt auf": "rafraîchit", "warm_pausiert": "en pause", "warm_kalt": "froid",
        "more_files": "   … +%d autres", "limit_s": "S", "limit_w": "Sem", "warm_label": "CHAUD", "kalt_label": "FROID",
        "title_waiting": "⏸ vous attend", "notify_waiting": "Claude vous attend (%s)",
        "tg_waiting": "⏸ Claude vous attend – %s\n%s", "title_done": "%s terminé (%s)",
        "notify_done": "Claude a terminé – %s (%s)",
        "background": "◔ travaille en arrière-plan · %d", "title_background": "◔ travaille en arrière-plan (%d)",
    },
}

_lang = None


def load_lang():
    """Sprache aus state/sprache.json (von der Mod geschrieben), sonst Deutsch."""
    global _lang
    if _lang is None:
        d = read_json(LANG_FILE) or {}
        _lang = d.get("lang") if d.get("lang") in LANGS else "de"
    return _lang


# ---------- Waehrung: die Mod schreibt die Wahl aus dem /bro-Panel nach state/waehrung.json ----------

KURSE_FILE = BASE / "kurse.json"  # eingebaute Kurse (EZB-Referenzkurse) mit Datum und Quelle
CURRENCY_FILE = STATE_DIR / "waehrung.json"
CURRENCIES = {"USD": "$", "EUR": "€", "GBP": "£", "CHF": "CHF "}


def currency_factor(code, pro_eur, override=None):
    """Wie viele Einheiten der Waehrung ein US-Dollar sind; None, wenn kein Kurs bekannt ist."""
    if code == "USD":
        return 1.0
    try:
        if override is not None and float(override) > 0:
            return float(override)
        usd = float((pro_eur or {}).get("USD") or 0)
        if usd <= 0:
            return None
        if code == "EUR":
            return 1.0 / usd
        r = float((pro_eur or {}).get(code) or 0)
        return r / usd if r > 0 else None
    except (TypeError, ValueError):
        return None


def fmt_money(usd, code, factor):
    """Schaetzwert mit ≈; ohne Kurs oder bei Dollar bleibt es beim Dollar."""
    sym = CURRENCIES.get(code)
    if not sym or code == "USD" or not factor or factor <= 0:
        return "≈$%.2f" % usd
    return "≈%s%.2f" % (sym, usd * factor)


def money_text(usd):
    """Der API-Wert in der gewaehlten Waehrung (Wahl aus state/waehrung.json, Kurs aus kurse.json oder config.json)."""
    code = (read_json(CURRENCY_FILE) or {}).get("code")
    if code not in CURRENCIES:
        code = "USD"
    pro_eur = (read_json(KURSE_FILE) or {}).get("pro_eur")
    return fmt_money(usd, code, currency_factor(code, pro_eur, load_config().get("currency_rate")))


def tx(key, *args):
    """Text in der gewaehlten Sprache; fehlt er dort, der deutsche."""
    s = TEXTE[load_lang()].get(key, TEXTE["de"][key])
    return s % args if args else s


def load_config():
    cfg = dict(DEFAULT_CONFIG)
    try:
        with open(CONFIG_FILE, encoding="utf-8") as f:
            cfg.update(json.load(f))
    except Exception:
        pass
    return cfg


def _safe(sid):
    s = "".join(c for c in str(sid or "") if c.isalnum() or c in "-_")
    return s or "default"


def state_path(sid):
    return STATE_DIR / (_safe(sid) + ".json")


def new_state():
    return {
        "status": "idle",          # idle | working | waiting | done | ended
        "turn_start": None,
        "finished_at": None,
        "last_turn_secs": None,
        "waiting_msg": "",
        "prompts": 0,
        "current": [],             # laufende Tool-Calls
        "tools": {},
        "skills": {},
        "mcp": {},
        "api": {},
        "agents": {},
        "files": {},               # pfad -> {"m": R|E|W, "t": ts}
        "background": [],          # bei Stop noch laufende Hintergrund-Aufgaben [{type, label}]
        "updated": time.time(),
    }


def load_state(sid):
    try:
        with open(state_path(sid), encoding="utf-8") as f:
            st = json.load(f)
        base = new_state()
        base.update(st)
        return base
    except Exception:
        return new_state()


def save_state(sid, st):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    st["updated"] = time.time()
    p = state_path(sid)
    tmp = p.with_suffix(".tmp%d" % os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False)
    os.replace(tmp, p)


@contextmanager
def locked(sid):
    """Sperre pro Session, weil parallele Tool-Calls parallele Hooks ausloesen."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    lock_file = STATE_DIR / (_safe(sid) + ".lock")
    fh = open(lock_file, "a+")
    try:
        try:
            import fcntl
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        except ImportError:  # Windows
            try:
                import msvcrt
                fh.seek(0)
                msvcrt.locking(fh.fileno(), msvcrt.LK_LOCK, 1)
            except Exception:
                pass
        yield
    finally:
        try:
            fh.close()
        except Exception:
            pass


def fmt_dur(secs):
    secs = int(max(0, secs or 0))
    if secs < 60:
        return "%ds" % secs
    m, s = divmod(secs, 60)
    if m < 60:
        return "%dm %02ds" % (m, s)
    h, m = divmod(m, 60)
    if h < 24:
        return "%dh %02dm" % (h, m)
    dd, h = divmod(h, 24)
    return "%dd %02dh" % (dd, h)


def fmt_tokens(n):
    n = int(n or 0)
    if n >= 1_000_000:
        return "%.1fM" % (n / 1_000_000)
    if n >= 1000:
        return "%dk" % round(n / 1000)
    return str(n)


# ---------- Prompt-Cache: gemeinsame Helfer fuer Statusline und Mod-Bruecke ----------

def ttl_seconds(ttl):
    return {"5m": 300, "1h": 3600}.get(str(ttl or ""), 0)


def soon_threshold(ttl_s):
    """Ab wann der Cache als 'laeuft bald ab' gilt (Sekunden Restzeit)."""
    return 600 if ttl_s >= 3600 else 60


def read_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def write_json_if_changed(path, data):
    """Schreibt nur, wenn sich der Inhalt geaendert hat (Statusline laeuft jede Sekunde)."""
    try:
        if read_json(path) == data:
            return
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = Path(str(path) + ".tmp%d" % os.getpid())
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.replace(tmp, path)
    except Exception:
        pass


def cache_bridge_path(sid):
    return STATE_DIR / (_safe(sid) + ".cache.json")


def warm_path(sid):
    return STATE_DIR / (_safe(sid) + ".warm.json")


def last_request_hit(d):
    """Trefferquote der letzten Anfrage aus context_window.current_usage (0..1) oder None."""
    cu = (d.get("context_window") or {}).get("current_usage") or {}
    read = cu.get("cache_read_input_tokens") or 0
    total = read + (cu.get("cache_creation_input_tokens") or 0) + (cu.get("input_tokens") or 0)
    return (read / total) if total else None


def cache_view(d, warm, now):
    """Fasst prompt_cache und die Warmhalte-Daten des Mods zusammen.

    Liefert dict: observed, ttl, ttl_s, expires_at, left, warm, soon, by_mod,
    hit_session, hit_last, recache.
    """
    pc = d.get("prompt_cache") or {}
    ttl = pc.get("ttl")
    ttl_s = ttl_seconds(ttl)
    exp = pc.get("expires_at") if pc.get("warm") else None
    by_mod = False
    w = warm or {}
    ok_at = w.get("last_ok")
    # Hat der Mod den Cache nach der letzten Anfrage aufgefrischt, laeuft der Timer ab dort
    if ttl_s and ok_at and ok_at + ttl_s > (exp or 0) and ok_at + ttl_s > now and not w.get("cold"):
        exp = ok_at + ttl_s
        by_mod = True
    left = (exp - now) if exp else 0
    return {
        "observed": bool(pc.get("caching_observed")),
        "ttl": ttl, "ttl_s": ttl_s,
        "expires_at": exp, "left": max(0, left),
        "warm": left > 0,
        "soon": 0 < left < soon_threshold(ttl_s or 300),
        "by_mod": by_mod,
        "hit_session": pc.get("hit_ratio"),
        "hit_last": last_request_hit(d),
        "recache": pc.get("recache_tokens_if_cold"),
        "requests": pc.get("requests"),
    }


def fmt_clock(secs):
    secs = int(max(0, secs))
    m, s = divmod(secs, 60)
    return "%d:%02d" % (m, s)
