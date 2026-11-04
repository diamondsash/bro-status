#!/usr/bin/env python3
"""BroStatus Hook-Handler.

Wird von Claude Code bei SessionStart, UserPromptSubmit, PreToolUse,
PostToolUse(+Failure), Notification, Stop und SessionEnd aufgerufen und
schreibt den Zustand in state/<session>.json. Die Statusline liest ihn.

Wichtig: Auf UserPromptSubmit/SessionStart wuerde Text auf stdout im
Kontext landen - deshalb gibt dieses Skript dort NICHTS aus.
"""
import json
import os
import re
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bro_common import (STATE_DIR, clean, fmt_dur, load_config, load_state, tx,  # noqa: E402
                        locked, new_state, save_state)

MODE_RANK = {"R": 1, "E": 2, "W": 3}


def bump(d, key, n=1):
    d[key] = d.get(key, 0) + n


def host_of(url):
    m = re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://([^/:?#]+)", url or "")
    return m.group(1) if m else (url or "?")[:30]


def record_file(st, path, mode):
    if not path:
        return
    cur = st["files"].get(path)
    if cur and MODE_RANK.get(cur.get("m"), 0) > MODE_RANK[mode]:
        mode = cur["m"]
    st["files"][path] = {"m": mode, "t": time.time()}


def classify(st, tool_name, ti):
    """Zaehlt den Aufruf ein und liefert ein kurzes Label fuer 'laeuft gerade'."""
    ti = ti if isinstance(ti, dict) else {}

    if tool_name.startswith("mcp__"):
        parts = tool_name.split("__")
        server = parts[1] if len(parts) > 1 else "?"
        tool = "__".join(parts[2:]) or "?"
        bump(st["mcp"], server)
        return "MCP %s:%s" % (server, tool)

    bump(st["tools"], tool_name)

    if tool_name == "Skill":
        name = ti.get("skill") or ti.get("command") or ti.get("name") or "?"
        bump(st["skills"], str(name))
        return "Skill %s" % name
    if tool_name == "WebFetch":
        h = host_of(ti.get("url", ""))
        bump(st["api"], h)
        return "WebFetch %s" % h
    if tool_name == "WebSearch":
        bump(st["api"], "web-search")
        return "WebSearch \u201e%s\u201c" % str(ti.get("query", ""))[:30]
    if tool_name in ("Bash", "PowerShell"):
        cmd = str(ti.get("command", ""))
        for h in set(re.findall(r"https?://([A-Za-z0-9.\-]+)", cmd)):
            bump(st["api"], h)
        first = cmd.strip().splitlines()[0] if cmd.strip() else ""
        return "%s %s" % (tool_name, first[:40])
    if tool_name in ("Agent", "Task"):
        kind = ti.get("subagent_type") or "agent"
        bump(st["agents"], str(kind))
        return "Agent %s: %s" % (kind, str(ti.get("description", ""))[:30])

    fp = ti.get("file_path") or ti.get("notebook_path")
    if fp:
        if tool_name == "Read":
            record_file(st, fp, "R")
        elif tool_name == "Write":
            record_file(st, fp, "W")
        elif tool_name in ("Edit", "MultiEdit", "NotebookEdit"):
            record_file(st, fp, "E")
        return "%s %s" % (tool_name, os.path.basename(fp))
    pat = ti.get("pattern")
    if pat:
        return "%s %s" % (tool_name, str(pat)[:30])
    return tool_name


def background_of(data):
    """Was laut Stop-Meldung noch im Hintergrund laeuft: Liste von {type, label} (hoechstens 5)."""
    out = []
    for b in data.get("background_tasks") or []:
        if not isinstance(b, dict) or str(b.get("status", "running")) not in ("running", "pending"):
            continue
        label = b.get("command") or b.get("description") or b.get("agent_type") or b.get("name") or b.get("type") or "?"
        first = str(label).strip().splitlines()[0] if str(label).strip() else "?"
        out.append({"type": str(b.get("type", "")), "label": first[:60]})
    return out[:5]


def remove_current(st, data):
    tid = data.get("tool_use_id")
    cur = st.get("current", [])
    if tid and any(c.get("id") == tid for c in cur):
        st["current"] = [c for c in cur if c.get("id") != tid]
        return
    name = data.get("tool_name")
    for i in range(len(cur) - 1, -1, -1):  # aeltesten gleichen Namens entfernen
        if cur[i].get("tool") == name:
            del cur[i]
            return


def osc_title(text):
    return "\033]2;%s\007" % clean(text)


def emit(seq):
    """terminalSequence: Claude Code schreibt das selbst ins Terminal."""
    if seq:
        sys.stdout.write(json.dumps({"terminalSequence": seq}))


def send_telegram_detached(cfg, text):
    if not (cfg.get("telegram_bot_token") and cfg.get("telegram_chat_id")):
        return
    # Der Text geht ueber stdin an den Hintergrundprozess, nicht als Argument (Argumente sieht jeder in der Prozessliste).
    kwargs = dict(stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                  stderr=subprocess.DEVNULL)
    if os.name == "nt":
        kwargs["creationflags"] = 0x00000008 | 0x00000200  # DETACHED | NEW_GROUP
    else:
        kwargs["start_new_session"] = True
    try:
        proc = subprocess.Popen([sys.executable, os.path.abspath(__file__),
                                 "--telegram"], **kwargs)
        proc.stdin.write(text.encode("utf-8"))
        proc.stdin.close()
    except Exception:
        pass


def telegram_done_text(cfg, text, data):
    """Text der Fertig-Meldung fuer Telegram: Antwortauszug und Rechnername nur, wenn du sie in config.json einschaltest."""
    tg = text
    last = clean(data.get("last_assistant_message") or "").strip() if cfg.get("telegram_include_answer") else ""
    if last:
        tg += "\n\n" + (last[:400] + ("…" if len(last) > 400 else ""))
    if cfg.get("telegram_include_host"):
        try:
            import socket
            tg += "\n\n\U0001f5a5 " + socket.gethostname()
        except Exception:
            pass
    return tg


def telegram_worker(text):
    import urllib.parse
    import urllib.request
    cfg = load_config()
    url = "https://api.telegram.org/bot%s/sendMessage" % cfg["telegram_bot_token"]
    body = urllib.parse.urlencode({"chat_id": cfg["telegram_chat_id"],
                                   "text": text}).encode()
    try:
        urllib.request.urlopen(url, data=body, timeout=8).read()
    except Exception:
        pass


def cleanup_old_states(days=7):
    try:
        limit = time.time() - days * 86400
        for p in STATE_DIR.glob("*"):
            if p.stat().st_mtime < limit and p.name not in ("sprache.json", "waehrung.json"):
                p.unlink()
    except Exception:
        pass


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "--telegram":
        telegram_worker(sys.stdin.buffer.read().decode("utf-8", "replace"))
        return

    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    event = data.get("hook_event_name", "")
    sid = data.get("session_id", "default")
    cfg = load_config()
    now = time.time()
    project = clean(os.path.basename(os.path.normpath(data.get("cwd") or ""))) or "Claude"
    out = ""

    # Subagent-Tool-Calls zaehlen mit, aendern aber nicht den Haupt-Status
    in_subagent = bool(data.get("agent_id"))

    with locked(sid):
        st = load_state(sid)

        if event == "SessionStart":
            if data.get("source") in ("startup", "clear", None):
                st = new_state()
            cleanup_old_states()

        elif event == "UserPromptSubmit":
            st["status"] = "working"
            st["turn_start"] = now
            st["current"] = []
            st["waiting_msg"] = ""
            st["prompts"] = st.get("prompts", 0) + 1

        elif event == "PreToolUse":
            label = clean(classify(st, data.get("tool_name", "?"), data.get("tool_input")))
            st["current"].append({"id": data.get("tool_use_id"),
                                  "tool": data.get("tool_name"),
                                  "label": label, "since": now,
                                  "sub": in_subagent})
            if not in_subagent:
                if st["status"] != "working":
                    st["status"] = "working"
                    st["turn_start"] = st.get("turn_start") or now
                if cfg.get("window_title"):
                    out = osc_title("\u25c6 %s \u00b7 \u2699 %s" % (project, label[:40]))

        elif event in ("PostToolUse", "PostToolUseFailure"):
            remove_current(st, data)
            if st["status"] == "waiting":
                st["status"] = "working"
                st["waiting_msg"] = ""

        elif event == "Notification":
            ntype = data.get("notification_type", "")
            msg = clean(data.get("message", ""))
            if ntype in ("permission_prompt", "elicitation_dialog",
                         "agent_needs_input") or "permission" in msg.lower():
                st["status"] = "waiting"
                st["waiting_msg"] = msg[:80]
                seq = ""
                if cfg.get("window_title"):
                    seq += osc_title("\u25c6 %s \u00b7 %s" % (project, tx("title_waiting")))
                if cfg.get("terminal_notify"):
                    seq += "\033]9;%s\007\007" % tx("notify_waiting", project)
                out = seq
                send_telegram_detached(cfg, tx("tg_waiting", project, msg))

        elif event in ("Stop", "StopFailure"):
            start = st.get("turn_start") or now
            dur = now - start
            st["status"] = "done" if event == "Stop" else "error"
            st["finished_at"] = now
            st["last_turn_secs"] = dur
            st["current"] = []
            st["waiting_msg"] = ""
            # Laeuft noch etwas im Hintergrund (Befehl, Hilfs-Agent ...), ist Claude nicht wirklich fertig:
            # Claude Code weckt die Sitzung, wenn es endet, und meldet danach wieder Stop (dann ohne Liste)
            st["background"] = background_of(data) if event == "Stop" else []
            seq = ""
            icon = "\u2713" if event == "Stop" else "\u2715"
            if cfg.get("window_title"):
                if st["background"]:
                    seq += osc_title("\u25c6 %s \u00b7 %s" % (project, tx("title_background", len(st["background"]))))
                else:
                    seq += osc_title("\u25c6 %s \u00b7 %s" % (project, tx("title_done", icon, fmt_dur(dur))))
            if dur >= cfg.get("notify_min_secs", 15) and not st["background"]:
                text = "\U0001f48e %s %s" % (icon, tx("notify_done", project, fmt_dur(dur)))
                if cfg.get("terminal_notify"):
                    seq += "\033]9;%s\007\007" % text
                tg = telegram_done_text(cfg, text, data)
                send_telegram_detached(cfg, tg)
            out = seq

        elif event == "SessionEnd":
            st["status"] = "ended"
            st["current"] = []

        save_state(sid, st)

    emit(out)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # Ein Hook darf Claude Code nie stoeren
    sys.exit(0)
