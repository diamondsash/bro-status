#!/usr/bin/env python3
"""Installiert BroStatus und traegt Statusline + Hooks in ~/.claude/settings.json
ein (vorher wird ein Backup angelegt).

    python3 install.py                       # installieren / aktualisieren
    python3 install.py --ziel <ordner>        # in <ordner>/brostatus installieren
    python3 install.py --uninstall           # wieder austragen

Ohne --ziel: bisheriger Ort (aus settings.json erkannt), sonst ~/.claude/brostatus.
"""
import json
import os
import re
import shutil
import sys
import time
from pathlib import Path

SRC = Path(__file__).resolve().parent
CLAUDE_DIR = Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")
DEFAULT_TARGET = CLAUDE_DIR / "brostatus"
TARGET = DEFAULT_TARGET  # wird in main() festgelegt
SETTINGS = CLAUDE_DIR / "settings.json"
FILES = ["bro_common.py", "hook.py", "statusline.py", "brostatus.ico", "icon.png", "kurse.json"]
MARK = "brostatus"
MOD = "bro-status"
OLD_MODS = ("bro-antwort", "bro-status")
SEP = ";" if os.name == "nt" else ":"

# Event -> braucht Matcher?
EVENTS = {
    "SessionStart": False,
    "UserPromptSubmit": False,
    "PreToolUse": True,
    "PostToolUse": True,
    "PostToolUseFailure": True,
    "Notification": False,
    "Stop": False,
    "StopFailure": False,
    "SessionEnd": False,
}


def py_cmd(script):
    exe = Path(sys.executable).as_posix()
    return '"%s" "%s"' % (exe, (TARGET / script).as_posix())


def arg_value(name):
    for i, a in enumerate(sys.argv):
        if a == name and i + 1 < len(sys.argv):
            return sys.argv[i + 1]
        if a.startswith(name + "="):
            return a.split("=", 1)[1]
    return None


def detect_installed(settings):
    """Bisherigen Installationsort aus dem statusLine-Befehl lesen."""
    cmd = str((settings.get("statusLine") or {}).get("command", ""))
    m = re.search(r'"([^"]+)/statusline\.py"', cmd)
    if m:
        p = Path(m.group(1))
        # Nur ein echter BroStatus-Ordner zaehlt (Name und hook.py), sonst wird nichts geloescht
        if p.name.lower() == MARK and (p / "hook.py").exists():
            return p
    return None


def resolve_target(settings):
    wanted = arg_value("--ziel") or arg_value("--target")
    if wanted and wanted.strip():
        p = Path(os.path.expandvars(wanted.strip().strip('"'))).expanduser()
        # Ordner heisst immer "brostatus", damit Updates/Deinstallieren ihn wiederfinden
        return p if p.name.lower() == "brostatus" else p / "brostatus"
    return detect_installed(settings) or DEFAULT_TARGET


def load_settings():
    if not SETTINGS.exists():
        return {}
    with open(SETTINGS, encoding="utf-8") as f:
        txt = f.read().strip()
    return json.loads(txt) if txt else {}


def backup(keep=5):
    if SETTINGS.exists():
        b = SETTINGS.with_name("settings.json.bak-%s" % time.strftime("%Y%m%d-%H%M%S"))
        shutil.copy2(SETTINGS, b)
        print("Backup:", b)
        # Nur die letzten Sicherungen behalten
        for old in sorted(SETTINGS.parent.glob("settings.json.bak-*"))[:-keep]:
            try:
                old.unlink()
            except OSError:
                pass


def write_settings(settings):
    """Schreibt settings.json atomar: erst in eine Temp-Datei, dann austauschen."""
    tmp = SETTINGS.with_name("settings.json.tmp-%d" % os.getpid())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)
    os.replace(tmp, SETTINGS)


def is_ours(command):
    """Gehoert dieser Hook-Befehl BroStatus? Nur Skripte im Ordner brostatus zaehlen."""
    return re.search(r"/brostatus/(hook|statusline)\.py", str(command).replace("\\", "/")) is not None


def strip_ours(settings):
    hooks = settings.get("hooks") or {}
    for ev in list(hooks):
        groups = []
        for g in hooks[ev]:
            hs = [h for h in g.get("hooks", []) if not is_ours(h.get("command", ""))]
            if hs:
                g["hooks"] = hs
                groups.append(g)
        if groups:
            hooks[ev] = groups
        else:
            del hooks[ev]
    if hooks:
        settings["hooks"] = hooks
    else:
        settings.pop("hooks", None)
    sl = settings.get("statusLine") or {}
    if is_ours(sl.get("command", "")):
        settings.pop("statusLine", None)
    env = settings.get("env") or {}
    dirs = [d for d in str(env.get("CLAUDE_CODE_PLUGIN_DIRS", "")).split(SEP) if d and not (Path(d).name in OLD_MODS and Path(d).parent.name.lower() == MARK)]
    if dirs:
        env["CLAUDE_CODE_PLUGIN_DIRS"] = SEP.join(dirs)
    else:
        env.pop("CLAUDE_CODE_PLUGIN_DIRS", None)
    if env:
        settings["env"] = env
    else:
        settings.pop("env", None)
    return settings


def set_folder_icon(folder):
    """Diamant als Ordner-Icon setzen (Windows, macOS, Linux-Desktop). Fehler werden ignoriert."""
    import subprocess
    quiet = dict(stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        if os.name == "nt" and (folder / "brostatus.ico").exists():
            ini = folder / "desktop.ini"
            if ini.exists():
                subprocess.run(["attrib", "-h", "-s", str(ini)], **quiet)
            ini.write_text("[.ShellClassInfo]\r\nIconResource=brostatus.ico,0\r\n"
                           "InfoTip=BroStatus fuer Claude Code\r\n", encoding="ascii")
            subprocess.run(["attrib", "+h", "+s", str(ini)], **quiet)
            subprocess.run(["attrib", "+r", str(folder)], **quiet)
        elif sys.platform == "darwin" and (folder / "icon.png").exists():
            # Pfade als Argumente (argv), nicht im Skripttext: ein Apostroph im Pfad bricht nichts
            js = ("function run(argv){ObjC.import('AppKit');"
                  "var img=$.NSImage.alloc.initWithContentsOfFile(argv[0]);"
                  "$.NSWorkspace.sharedWorkspace.setIconForFileOptions(img,argv[1],0);}")
            subprocess.run(["osascript", "-l", "JavaScript", "-e", js, str(folder / "icon.png"), str(folder)],
                           timeout=15, **quiet)
        elif shutil.which("gio") and (folder / "icon.png").exists():
            subprocess.run(["gio", "set", str(folder), "metadata::custom-icon",
                            (folder / "icon.png").as_uri()], timeout=15, **quiet)
    except Exception:
        pass


def install():
    previous = detect_installed(load_settings())
    TARGET.mkdir(parents=True, exist_ok=True)
    (TARGET / "state").mkdir(exist_ok=True)
    if SRC == TARGET:
        print("Bitte aus dem entpackten Download-Ordner installieren, nicht aus", TARGET)
        return
    for f in FILES + ["install.py", "README.md"]:
        if not (SRC / f).exists():
            continue
        shutil.copy2(SRC / f, TARGET / f)
        if os.name != "nt" and f.endswith(".py"):
            os.chmod(TARGET / f, 0o755)
    # Lite-Fassung (ohne Funktionen, die von selbst Anfragen senden): lite.json im Paket setzt sie, ohne die Datei gilt die volle Fassung
    if (SRC / "lite.json").exists():
        shutil.copy2(SRC / "lite.json", TARGET / "lite.json")
    elif (TARGET / "lite.json").exists():
        (TARGET / "lite.json").unlink()
    # Mod "bro-status" (Antwort-Knoepfe) mitkopieren, alte Version "bro-antwort" entfernen
    if (TARGET / "bro-antwort").is_dir():
        shutil.rmtree(TARGET / "bro-antwort")
    if (SRC / MOD).is_dir():
        dst = TARGET / MOD
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(SRC / MOD, dst)
    # Mitgelieferte eigene Toene (nur in der Freunde-Fassung): vorhandene Dateien bleiben unangetastet
    if (SRC / "toene").is_dir():
        (TARGET / "toene").mkdir(exist_ok=True)
        for p in (SRC / "toene").iterdir():
            if p.is_file() and not (TARGET / "toene" / p.name).exists():
                shutil.copy2(p, TARGET / "toene" / p.name)
    set_folder_icon(TARGET)
    cfg = TARGET / "config.json"
    if not cfg.exists():
        sys.path.insert(0, str(TARGET))
        from bro_common import DEFAULT_CONFIG
        with open(cfg, "w", encoding="utf-8") as fh:
            json.dump(DEFAULT_CONFIG, fh, indent=2, ensure_ascii=False)
        print("Config angelegt:", cfg)
    if os.name != "nt":
        # Konfig (kann ein Telegram-Token enthalten) und Statusdateien nur fuer dich lesbar
        try:
            os.chmod(cfg, 0o600)
            os.chmod(TARGET / "state", 0o700)
        except OSError:
            pass

    settings = load_settings()
    old_sl = settings.get("statusLine")
    if old_sl and not is_ours(old_sl.get("command", "")):
        print("Hinweis: vorhandene Statusline wird ersetzt (steht im Backup):",
              old_sl.get("command"))
    backup()
    settings = strip_ours(settings)
    settings["statusLine"] = {
        "type": "command",
        "command": py_cmd("statusline.py"),
        "padding": 0,
        "refreshInterval": 1,
    }
    hooks = settings.setdefault("hooks", {})
    for ev, needs_matcher in EVENTS.items():
        group = {"hooks": [{"type": "command", "command": py_cmd("hook.py"),
                            "timeout": 10}]}
        if needs_matcher:
            group["matcher"] = "*"
        hooks.setdefault(ev, []).append(group)

    if (TARGET / MOD).is_dir():
        env = settings.setdefault("env", {})
        dirs = [d for d in str(env.get("CLAUDE_CODE_PLUGIN_DIRS", "")).split(SEP) if d]
        dirs.append(str(TARGET / MOD))
        env["CLAUDE_CODE_PLUGIN_DIRS"] = SEP.join(dirs)

    CLAUDE_DIR.mkdir(parents=True, exist_ok=True)
    write_settings(settings)
    print("BroStatus installiert in", TARGET)
    if (TARGET / MOD).is_dir():
        print("Mod bro-status aktiv (Antwort-Knöpfe über dem Eingabefeld)")
    print("Settings aktualisiert:", SETTINGS)
    if previous and previous.resolve() != TARGET.resolve():
        print("Hinweis: Der alte Ordner", previous, "wird nicht mehr benutzt und kann gelöscht werden.")
    print("Claude Code neu starten (oder neue Session), dann ist die Statusline da.")
    print("Danach im Terminal 'claude' starten und dort /bro eingeben (nicht direkt in PowerShell).")
    path_hint()


def path_hint():
    """Meldet, wenn der Befehl 'claude' installiert, aber nicht im PATH ist."""
    if shutil.which("claude"):
        return
    local_bin = Path.home() / ".local" / "bin"
    if not any((local_bin / n).exists() for n in ("claude", "claude.exe")):
        return
    print()
    print("Hinweis: Claude Code liegt in", local_bin, "– dieser Ordner fehlt aber im PATH,")
    print("deshalb meldet das Terminal 'claude wird nicht erkannt'. Einmal ausführen, dann Terminal neu öffnen:")
    if os.name == "nt":
        print("  [Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User')"
              " + \";$env:USERPROFILE\\.local\\bin\", 'User')")
    else:
        print("  echo 'export PATH=\"$HOME/.local/bin:$PATH\"' >> ~/.bashrc")


def uninstall():
    settings = load_settings()
    backup()
    settings = strip_ours(settings)
    write_settings(settings)
    print("Statusline und Hooks ausgetragen. Ordner bleibt:", TARGET)


if __name__ == "__main__":
    TARGET = resolve_target(load_settings())
    if "--zeige-ziel" in sys.argv:
        print(TARGET)
        sys.exit(0)
    if "--uninstall" in sys.argv:
        uninstall()
    else:
        install()
