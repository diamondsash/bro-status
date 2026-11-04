#!/usr/bin/env python3
"""BroStatus Statusline fuer Claude Code - Navy/Cyan-Look, Diamant-Signet.

Links der Diamant (4 Zeilen, Braille-Punkte), rechts:
  1  Status: arbeitet / wartet / fertig + Modell
  2  Kontext-Balken, Cache-Countdown, Limits
  3  Aktiv: Tools, Skills, MCP, APIs, Agents
  4  Dateien: zuletzt geaenderte/gelesene Dateien
Der Diamant zeigt den Status selbst: Glanz laeuft durch (arbeitet),
pink (wartet), cyan (fertig), gedimmt (bereit).
"""
import json
import os
import re
import sys
import time
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bro_common import (TEXTE, cache_bridge_path, cache_view, clean, fmt_clock, money_text, fmt_dur, tx,  # noqa: E402
                        fmt_tokens, load_config, load_state, read_json, warm_path,
                        write_json_if_changed)

# Diamant nach Vorlage von DiamondSash, 9x3 Zeichen (18x12 Punkte), mittig neben den Infozeilen
GEM = ['⣠⡊⢉⠏⠉⠹⡉⢑⣄', '⠈⠪⡙⡍⠉⢩⢋⠕⠁', '⠀⠀⠈⠺⣤⠗⠁⠀⠀']

# Palette
CYAN = "#22d3ee"
CYAN_L = "#67e8f9"
CYAN_D = "#0891b2"
TEXT = "#e2e8f0"
LABEL = "#64748b"
TRACK = "#1e3a5f"
AMBER = "#fbbf24"
GREEN = "#34d399"
PINK = "#f472b6"
ORANGE = "#fb923c"
RED = "#f87171"
INDIGO = "#a5b4fc"
WHITE = "#f0fdff"

# Diamant: oben der Status (was Claude tut), unten die Dringlichkeit, dazwischen Verlauf
GEM_TOP = {
    "arbeitet": ("#60a5fa", "#2563eb"),   # blau  – in Arbeit (hell, dunkel)
    "fertig": ("#4ade80", "#16a34a"),     # gruen – fertig / bereit
    "wartet": ("#f87171", "#dc2626"),     # rot   – wartet auf dich / Fehler
    "leer": ("#64748b", "#3b4a5f"),       # grau  – noch keine Daten
}
GEM_URGENT = {"orange": "#f97316", "rot": "#ef4444"}
SHINE = "#e0f2fe"


def _lin(v):
    v /= 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def _unlin(v):
    v = 12.92 * v if v <= 0.0031308 else 1.055 * max(v, 0) ** (1 / 2.4) - 0.055
    return max(0, min(255, round(v * 255)))


def _oklab(h):
    r, g, b = (_lin(v) for v in _rgb(h))
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


def mix(a, b, t):
    """Farbverlauf im OKLCH-Raum: bleibt kraeftig (gruen->gelb->rot statt Schlamm)."""
    import math
    A, B = _oklab(a), _oklab(b)
    ca, cb = math.hypot(A[1], A[2]), math.hypot(B[1], B[2])
    ha, hb = math.atan2(A[2], A[1]), math.atan2(B[2], B[1])
    dh = (hb - ha + math.pi) % (2 * math.pi) - math.pi
    L, C, H = A[0] + (B[0] - A[0]) * t, ca + (cb - ca) * t, ha + dh * t
    oa, ob = C * math.cos(H), C * math.sin(H)
    l = (L + 0.3963377774 * oa + 0.2158037573 * ob) ** 3
    m = (L - 0.1055613458 * oa - 0.0638541728 * ob) ** 3
    s_ = (L - 0.0894841775 * oa - 1.2914855480 * ob) ** 3
    rgb = (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s_,
           -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s_,
           -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s_)
    return "#%02x%02x%02x" % tuple(_unlin(v) for v in rgb)


GREEN_D = "#059669"
GREEN_L = "#6ee7b7"

R = "\033[0m"
BOLD = "\033[1m"
ANSI_RE = re.compile(r"\033\[[0-9;]*m|\033\][^\007]*\007")
MODE = "truecolor"


def _rgb(h):
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def fg(h):
    r, g, b = _rgb(h)
    if MODE == "256":
        q = lambda v: 0 if v < 48 else 1 if v < 115 else (v - 35) // 40
        return "\033[38;5;%dm" % (16 + 36 * q(r) + 6 * q(g) + q(b))
    return "\033[38;2;%d;%d;%dm" % (r, g, b)


def c(h, txt, bold=False):
    return (BOLD if bold else "") + fg(h) + txt + R


def lab(txt):
    return c(LABEL, txt.ljust(8))


def char_w(ch):
    if unicodedata.combining(ch) or ch in "️‍":
        return 0
    return 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1


def vis_len(s):
    return sum(char_w(ch) for ch in ANSI_RE.sub("", s))


def fit(line, cols):
    out, w, i = [], 0, 0
    while i < len(line):
        m = ANSI_RE.match(line, i)
        if m:
            out.append(m.group(0))
            i = m.end()
            continue
        cw = char_w(line[i])
        if w + cw > cols - 1:
            out.append("…" + R)
            return "".join(out)
        out.append(line[i])
        w += cw
        i += 1
    return "".join(out) + R


def urgency(d, st, warm, now, limits):
    """Ampel fuer den Diamanten: (stufe, grund). Die hoechste Stufe gewinnt."""
    from bro_common import cache_view
    status = st.get("status", "idle")
    level, why = "gruen", "alles in Ordnung"
    # grau = du bist dran (Claude wartet auf dich) – wichtiger als orange, rot bleibt ganz oben
    rank = {"gruen": 1, "orange": 2, "grau": 3, "rot": 4}

    def up(lv, reason):
        nonlocal level, why
        if rank[lv] > rank[level]:
            level, why = lv, reason

    if status == "waiting":
        up("grau", "Claude wartet auf dich – du musst jetzt handeln")
    if status == "error":
        up("rot", "Abbruch durch API-Fehler")

    pct = (d.get("context_window") or {}).get("used_percentage")
    if pct is not None:
        stage = ctx_stage(pct, limits)
        if stage >= 3:
            up("rot", "Kontext fast voll")
        elif stage >= 1:
            up("orange", "Kontext wird voll")

    v = cache_view(d, warm, now)
    w = warm or {}
    keeper = w.get("enabled") and w.get("state") in ("an", "frischt auf")
    if v["warm"] and not keeper:
        urgent = v["left"] < (120 if v["ttl_s"] >= 3600 else 30)
        if urgent:
            up("rot", "Cache läuft gleich ab")
        elif v["soon"]:
            up("orange", "Cache läuft bald ab")

    return level, why


# Eine Farbe fuer den ganzen Diamanten, die wichtigste Sache gewinnt:
# rot (kritisch) > grau (du bist dran) > orange (langsam handeln) > blau (arbeitet) > gruen (fertig)
GEM_COLOR = {"rot": "#ef4444", "orange": "#f97316", "blau": "#3b82f6", "gruen": "#22c55e", "grau": "#cbd5e1"}


def gem_color(status, level):
    if level in ("rot", "orange"):
        return level
    if level == "grau":
        return "grau"
    return "blau" if status == "working" else "gruen"


def gem_lines(status, level, now):
    col = GEM_COLOR[gem_color(status, level)]
    return [c(col, row) for row in GEM]


CTX_STAGES = [  # (Farbe, Textschluessel des Hinweises) fuer Stufe 0..3
    (CYAN, ""),
    (AMBER, "ctx1"),
    (ORANGE, "ctx2"),
    (RED, "ctx3"),
]


def ctx_stage(pct, limits):
    stage = 0
    for i, lim in enumerate(limits[:3]):
        if pct >= lim:
            stage = i + 1
    return stage


def bar(pct, col, width=16):
    pct = max(0.0, min(100.0, float(pct)))
    filled = int(round(pct * width / 100))
    return c(col, "▰" * filled) + c(TRACK, "▱" * (width - filled))


def short(name, n=22):
    name = clean(name)
    return name if len(name) <= n else name[: n - 1] + "…"


def top(d, n, color=TEXT):
    items = sorted(d.items(), key=lambda kv: (-kv[1], kv[0]))
    parts = [c(color, "%s×%d" % (clean(k), v) if v > 1 else clean(k)) for k, v in items[:n]]
    if len(items) > n:
        parts.append(c(LABEL, "+%d" % (len(items) - n)))
    return "  ".join(parts)


# ---------- Zeilen ----------

def line_status(d, st, now):
    status = st.get("status", "idle")
    cur = [x for x in st.get("current", []) if not x.get("sub")] or st.get("current", [])
    if status == "working":
        s = c(GREEN, tx("working"), True) + " " + c(TEXT, fmt_dur(now - (st.get("turn_start") or now)))
        if cur:
            x = cur[-1]
            s += c(LABEL, " → ") + c(CYAN_L, short(x.get("label", "?"), 40))
            s += c(LABEL, " %s" % fmt_dur(now - x.get("since", now)))
            if len(cur) > 1:
                s += c(LABEL, tx("parallel", len(cur) - 1))
        else:
            s += c(LABEL, tx("thinking"))
    elif status == "waiting":
        s = c(RED, tx("waiting"), True)
        if st.get("waiting_msg"):
            s += c(LABEL, " – " + short(st["waiting_msg"], 50))
    elif status == "done" and st.get("background"):
        # Claude hat geantwortet, im Hintergrund laeuft aber noch etwas: nicht „fertig“
        bg = st["background"]
        s = c(CYAN_L, tx("background", len(bg)), True)
        s += c(LABEL, " → ") + c(TEXT, short(bg[0].get("label", "?"), 40))
        if len(bg) > 1:
            s += c(LABEL, " +%d" % (len(bg) - 1))
        s += c(LABEL, " · " + tx("ago", fmt_dur(now - (st.get("finished_at") or now))))
    elif status in ("done", "error"):
        if status == "done":
            s = c(CYAN_L, tx("done"), True)
        else:
            s = c(RED, tx("aborted"), True)
        s += " " + c(TEXT, tx("ago", fmt_dur(now - (st.get("finished_at") or now))))
        if st.get("last_turn_secs") is not None:
            s += c(LABEL, tx("ran", fmt_dur(st["last_turn_secs"])))
    else:
        s = c(LABEL, tx("ready"))

    model = ((d.get("model") or {}).get("display_name") or "?").lower()
    eff = (d.get("effort") or {}).get("level")
    meta = model + ("/" + eff if eff else "")
    if d.get("session_name"):
        meta += " · " + short(d["session_name"], 24)
    return s + c(LABEL, " · " + meta)


def line_metrics(d, st, now, limits):
    cw = d.get("context_window") or {}
    pct = cw.get("used_percentage")
    pc = d.get("prompt_cache")
    if pct is None:
        s = lab(tx("row_context")) + c(LABEL, "–")
    else:
        size = cw.get("context_window_size") or 200000
        used = cw.get("total_input_tokens") or 0
        stage = ctx_stage(pct, limits)
        col, hint = CTX_STAGES[stage]
        hint = tx(hint) if hint else ""
        s = lab(tx("row_context")) + bar(pct, col) + " " + c(col if stage else TEXT, "%d%%" % int(pct), True)
        s += c(LABEL, " %s/%s" % (fmt_tokens(used), fmt_tokens(size)))
        if hint:
            s += " " + c(col, "▸ " + hint, stage >= 2)
            cold = bool(pc) and pc.get("caching_observed") and not (
                pc.get("warm") and (pc.get("expires_at") or 0) > now)
            if stage >= 2 and cold and st.get("status") != "working":
                s += c(GREEN, tx("cold_good"))
    return s


def pct(x):
    return "%d%%" % round(x * 100)


def line_cache(d, now, warm):
    pc = d.get("prompt_cache")
    s = lab(tx("row_cache"))
    v = cache_view(d, warm, now)
    if not pc or not v["observed"]:
        s += c(LABEL, "–")
    else:
        if v["warm"]:
            left = v["left"]
            col = RED if left < 60 or (v["ttl_s"] >= 3600 and left < 120) else AMBER if v["soon"] else CYAN_L
            s += c(col, "◷ " + fmt_clock(left), True)
        else:
            s += c(LABEL, "◷ " + tx("cold"))
        if v["ttl"]:
            s += c(LABEL, " " + v["ttl"])
        if v["soon"]:
            s += c(AMBER, tx("soon"))
        elif not v["warm"] and v["recache"]:
            s += c(LABEL, tx("recache", fmt_tokens(v["recache"])))
        hits = []
        if v["hit_last"] is not None:
            hits.append(c(TEXT, pct(v["hit_last"])) + c(LABEL, tx("hit_last")))
        if v["hit_session"] is not None:
            hits.append(c(TEXT, pct(v["hit_session"])) + c(LABEL, tx("hit_session")))
        if hits:
            s += "   " + c(LABEL, tx("hits")) + c(LABEL, " · ").join(hits)

    w = warm or {}
    if w.get("enabled"):
        state = w.get("state", "an")
        col = {"an": GREEN, "frischt auf": GREEN, "pausiert": LABEL, "kalt": AMBER}.get(state, GREEN)
        # Die Mod schreibt den Zustand auf Deutsch (an, frischt auf, pausiert, kalt); angezeigt wird er uebersetzt
        shown = tx("warm_" + state) if ("warm_" + state) in TEXTE["de"] else state
        s += "   " + c(col, "♨ " + shown)

    rl = d.get("rate_limits") or {}
    lims = []
    # Wie im Panel, jede Angabe mit Punkt: · S | 5h / 33%  · W | 7d / 24%  · API | ≈$0.13  · WARM | ≈9k Token / KALT | ≈180k Token
    # S = Sitzungslimit (5 Stunden), W = Wochenlimit (7 Tage)
    for key, letter, span in (("five_hour", tx("limit_s"), "5h"), ("seven_day", tx("limit_w"), "7d")):
        p = (rl.get(key) or {}).get("used_percentage")
        if p is not None:
            lims.append(c(LABEL, "· %s | %s / " % (letter, span))
                        + c(RED if p >= 85 else AMBER if p >= 65 else TEXT, "%d%%" % p))
    if lims:
        s += "   " + c(LABEL, tx("row_limit") + " ") + "  ".join(lims)
    # Kosten: geschaetzter API-Wert der Sitzung
    cost = (d.get("cost") or {}).get("total_cost_usd")
    if isinstance(cost, (int, float)):
        s += "  " + c(LABEL, "· API | %s" % money_text(cost))
    # Warmhalten wie im Panel: WARM = was die Auffrischungen gekostet haben, KALT = was ein kalter Neustart kosten wuerde
    kosten = w.get("kosten")
    if w.get("enabled") or kosten:
        kalt = (pc or {}).get("recache_tokens_if_cold")
        # ≈ = Schaetzung; bei 0 und ohne Wert (–) steht es nicht
        s += "  " + c(LABEL, "· %s | %s%s Token / %s | %s%s Token" % (
            tx("warm_label"), "≈" if kosten else "", fmt_tokens(kosten or 0),
            tx("kalt_label"), "≈" if kalt else "", fmt_tokens(kalt) if kalt else "–"))

    if pc:
        tags = ["#%s%s" % (k, "×%d" % n if n > 1 else "")
                for k, n in sorted((pc.get("miss_causes") or {}).items(), key=lambda kv: -kv[1])]
        if tags:
            s += "   " + c(INDIGO, " ".join(tags))
    return s


def write_bridge(d, sid):
    """Gibt dem Mod (Cache-Panel / Warmhalten) die Cache-Daten weiter."""
    pc = d.get("prompt_cache")
    if not pc:
        return
    cw = d.get("context_window") or {}
    from bro_common import last_request_hit
    hl = last_request_hit(d)
    write_json_if_changed(cache_bridge_path(sid), {
        "ttl": pc.get("ttl"),
        "expires_at": pc.get("expires_at") if pc.get("warm") else None,
        "observed": bool(pc.get("caching_observed")),
        "hit_session": round(pc["hit_ratio"], 4) if pc.get("hit_ratio") is not None else None,
        "hit_last": round(hl, 4) if hl is not None else None,
        "recache": pc.get("recache_tokens_if_cold"),
        "context": cw.get("total_input_tokens"),
    })


def line_active(st, d, n):
    parts = []
    tools = {k: v for k, v in st.get("tools", {}).items() if k not in ("Skill", "Agent", "Task")}
    if tools:
        parts.append(top({k.lower(): v for k, v in tools.items()}, n))
    if st.get("skills"):
        parts.append(c(INDIGO, "◇ ") + top(st["skills"], n, INDIGO))
    if st.get("mcp"):
        parts.append(c(CYAN, "⌁ ") + top(st["mcp"], n, CYAN))
    if st.get("api"):
        parts.append(c(CYAN_D, "↗ ") + top(st["api"], n, CYAN_D))
    if st.get("agents"):
        parts.append(c(GREEN, "⬡ ") + top(st["agents"], n, GREEN))
    return lab(tx("row_active")) + ("   ".join(parts) if parts else c(LABEL, "–"))


def short_path(path, base):
    try:
        rel = os.path.relpath(path, base)
    except ValueError:
        rel = path
    if rel.startswith(".."):
        home = os.path.expanduser("~")
        rel = "~" + path[len(home):] if path.startswith(home) else path
    return rel.replace("\\", "/")


MARK = {"W": (GREEN, "+"), "E": (AMBER, "✎"), "R": (LABEL, "·")}


def line_files(st, width):
    files = st.get("files") or {}
    if not files:
        return lab(tx("row_files")) + c(LABEL, "–")
    # geaenderte zuerst, jeweils die neuesten vorne
    items = sorted(files.items(), key=lambda kv: (kv[1].get("m") == "R", -kv[1].get("t", 0)))
    s = lab(tx("row_files"))
    used = vis_len(s)
    shown = 0
    for path, meta in items:
        col, sym = MARK.get(meta.get("m", "R"), MARK["R"])
        name = os.path.basename(path)
        piece = c(col, sym) + " " + c(TEXT if sym != "·" else LABEL, short(name, 24)) + "  "
        if used + vis_len(piece) + 4 > width and shown:
            break
        s += piece
        used += vis_len(piece)
        shown += 1
    if shown < len(items):
        s += c(LABEL, "+%d" % (len(items) - shown))
    return s


def tree_lines(st, base, max_lines, indent):
    files = st.get("files") or {}
    if not files:
        return []
    items = sorted(files.items(), key=lambda kv: (kv[1].get("m") == "R", -kv[1].get("t", 0)))

    def build(sel):
        root = {}
        for path, meta in sel:
            parts = [p for p in short_path(path, base).split("/") if p]
            node = root
            for p in parts[:-1]:
                node = node.setdefault(p + "/", {})
            node[parts[-1] if parts else path] = meta
        out = []

        def walk(node, prefix):
            keys = sorted(node, key=lambda k: (not k.endswith("/"), k.lower()))
            for i, k in enumerate(keys):
                last = i == len(keys) - 1
                con = "└─ " if last else "├─ "
                v = node[k]
                if k.endswith("/"):
                    name, sub = k, v
                    while len(sub) == 1 and list(sub)[0].endswith("/"):
                        nk = list(sub)[0]
                        name, sub = name + nk, sub[nk]
                    out.append(indent + c(TRACK, prefix + con) + c(CYAN_D, clean(name)))
                    walk(sub, prefix + ("   " if last else "│  "))
                else:
                    col, sym = MARK.get(v.get("m", "R"), MARK["R"])
                    out.append(indent + c(TRACK, prefix + con) + c(col, sym + " ") + c(TEXT, clean(k)))
        walk(root, "")
        return out

    sel = items
    lines = build(sel)
    while len(lines) > max_lines and len(sel) > 1:
        sel = sel[:-1]
        lines = build(sel)
    if len(items) > len(sel):
        lines.append(indent + c(LABEL, tx("more_files", len(items) - len(sel))))
    return lines


def main():
    global MODE
    # Windows liest/schreibt über Pipes sonst in cp1252 – Braille-Diamant und Umlaute brauchen UTF-8.
    for stream in (sys.stdin, sys.stdout):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    try:
        d = json.load(sys.stdin)
    except Exception:
        d = {}
    cfg = load_config()
    MODE = cfg.get("colors", "truecolor")
    sid = d.get("session_id", "default")
    st = load_state(sid)
    warm = read_json(warm_path(sid))
    write_bridge(d, sid)
    now = time.time()
    try:
        cols = int(os.environ.get("COLUMNS") or 120)
    except ValueError:
        cols = 120
    n = int(cfg.get("max_items", 5))
    logo = cfg.get("logo", True)
    gap = "  "
    left_w = (len(GEM[0]) + len(gap)) if logo else 0

    files_mode = cfg.get("files", "compact")
    limits = cfg.get("ctx_stages", [50, 70, 85])
    info = [line_status(d, st, now), line_metrics(d, st, now, limits), line_cache(d, now, warm),
            line_active(st, d, n),
            line_files(st, cols - left_w) if files_mode != "off" else ""]
    if logo:
        level, _why = urgency(d, st, warm, now, limits)
        # Laeuft noch Hintergrund-Arbeit, ist der Diamant blau wie beim Arbeiten
        gem_status = "working" if st.get("status") == "done" and st.get("background") else st.get("status", "idle")
        gem = gem_lines(gem_status, level, now)
        top = (len(info) - len(GEM)) // 2
        # Unsichtbares Braille-Zeichen statt Leerzeichen: Claude Code schneidet fuehrende Leerzeichen ab,
        # dann stuenden Zeilen ohne Diamant-Teil nicht buendig
        blank = "⠀" * len(GEM[0])
        lines = [(gem[i - top] if 0 <= i - top < len(GEM) else blank) + gap + info[i]
                 for i in range(len(info))]
    else:
        lines = info

    if files_mode == "tree":
        base = (d.get("workspace") or {}).get("project_dir") or d.get("cwd") or os.getcwd()
        indent = ("⠀" * len(GEM[0]) + gap) if logo else ""
        lines += tree_lines(st, base, int(cfg.get("tree_max_lines", 8)), indent)

    sys.stdout.write("\n".join(fit(l, cols) for l in lines) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("BroStatus-Fehler: %s" % e)
    sys.exit(0)
