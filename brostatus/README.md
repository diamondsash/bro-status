# BroStatus – Live-Statusanzeige für Claude Code

*Das ist die technische Beschreibung. Für den Einstieg lies die [README im Hauptordner](../README.md).*

**Fassungen:** Diese Beschreibung gilt für die **volle** Fassung. Die **Lite-Fassung** (öffentlicher Bau, erkennbar an der Datei `lite.json` im Ordner `brostatus`) enthält Warmhalten, Auto-Compact, Feierabend und Modellwechsel nicht; die Abschnitte dazu unten gelten dort nicht. Lite sendet nichts von selbst über dein Konto. Die volle Fassung folgt, sobald geklärt ist, ob diese Funktionen zu den Nutzungsbedingungen von Anthropic passen.

Statusline im Navy/Cyan-Look mit Diamant-Signet links:

```
⠀⠀⠀⠀⠀⠀⠀⠀⠀  ✓ fertig vor 12s · lief 3m 20s · opus/high
⣠⡊⢉⠏⠉⠹⡉⢑⣄  kontext ▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱ 76% 152k/200k ▸ /compact oder neuer Chat
⠈⠪⡙⡍⠉⢩⢋⠕⠁  cache   ◷ 40:39 1h   treffer 99% letzte · 91% session   limit · S | 5h / 23%  · W | 7d / 71%   #tools_changed×2
⠀⠀⠈⠺⣤⠗⠁⠀⠀  aktiv   edit×6  read×4  bash×2  webfetch   ◇ frontend-design   ⌁ figma   ↗ docs.python.org
⠀⠀⠀⠀⠀⠀⠀⠀⠀  dateien ✎ utils.py  + neu.md  ✎ Header.tsx  · package.json
```

**Der Diamant hat eine Farbe – die wichtigste Sache gewinnt:**

| Farbe | Bedeutung | Wann |
| --- | --- | --- |
| rot | kritisch | API-Fehler, Kontext ab 85 %, oder Cache läuft in den letzten 2 min (1 h) bzw. 30 s (5 min) ab |
| grau (silber) | du musst jetzt handeln | Claude wartet auf deine Freigabe oder Antwort |
| orange | bald handeln | Kontext ab 50 %, oder Cache läuft bald ab (1 h: unter 10 min, 5 min: unter 1 min) |
| blau | Claude arbeitet | – |
| grün | fertig, alles okay | auch bei frischer Session |

Ist das Warmhalten an, färbt ein ablaufender Cache den Diamanten nicht, denn die Mod hält ihn warm.

| Zeile | Inhalt |
|---|---|
| 1 | Status, Laufzeit, aktuelles Tool, Modell |
| 2 | Kontext-Ampel mit Hinweis |
| 3 | Cache: Countdown, Dauer (1h/5m), „läuft bald ab“, Trefferquote letzte Anfrage + Sitzung, ♨ Warmhalten, Limits, Cache-Tags |
| 4 | Genutzte Tools · ◇ Skills · ⌁ MCP-Server · ↗ APIs/Hosts · ⬡ Subagents |
| 5 | Dateien: ✎ geändert · + neu · · gelesen |

### Kontext-Ampel

| Füllstand | Farbe | Hinweis |
|---|---|---|
| bis 50 % | cyan | alles gut |
| ab 50 % | gelb | Aufgabe abschließen, keine große neue Aufgabe mehr starten |
| ab 70 % | orange | /compact oder neuer Chat |
| ab 85 % | rot | gleich Auto-Compact! |

Steht dahinter „Cache kalt → guter Moment“, kostet `/compact` oder ein neuer Chat kaum mehr als der ohnehin fällige Neuaufbau, weil die nächste Anfrage sowieso alles neu einlesen müsste.

Zusätzlich, wenn Claude fertig ist oder auf dich wartet: Der Fenstertitel wechselt, zum Beispiel zu „◆ projekt · ✓ fertig“. Läuft danach noch etwas im Hintergrund, steht dort „◆ projekt · ◔ arbeitet im Hintergrund (2)“. Dazu kommen ein Ton, eine Meldung im Terminal (je nach Terminal) und optional eine Telegram-Nachricht über einen eigenen Bot.

## Antwort-Knöpfe (Mod „bro-status“)

Endet Claudes Antwort mit einer nummerierten Liste oder Aufzählung (- …), die etwas von dir wissen will, erscheint über dem Eingabefeld ein Band. Dafür muss ein „?“ vorkommen: in einem Punkt, in der Zeile direkt davor oder im Absatz direkt danach (bei Aufzählungen mit „-“ zählt nur der Absatz direkt danach). Eine Überschrift direkt davor wie „Was ich von dir brauche:“ oder „Offene Fragen:“ zählt auch. Wörter wie „Gib mir Bescheid“ allein lösen kein Band aus, reine Anleitungen bekommen keins. Eine offene Frage ohne Auswahl („Wie soll ich das umsetzen?“, „Links oder rechts?“) bekommt ebenfalls kein Band, die beantwortest du im Eingabefeld; eine Ja/Nein-Frage am Ende („Passt der Plan so?“) bekommt zwei Knöpfe Ja und Nein, ein Klick sendet sofort. Nennt Claude Wege als eigene Zeilen („Weg 1 (empfohlen): …“) und fragt offen, gibt es je Weg einen Knopf WEG 1, WEG 2 (Klick sendet sofort „Weg 1“). Unter einem Bericht ohne Frage stehen NÄCHSTE AUFGABE, SPEICHERN und WAS IST OFFEN? (bei Zwischenstand nur WAS IST OFFEN?; kurze Antworten bekommen nichts):

```
◆ Antworten   1/2 beantwortet   [ Send (1) ]   [ Hide ]
[ Es fehlen noch 4 Bilder ]       ✓ sind schon im Ordner
[ Du musst das noch machen ]
Zu 2: Du musst das noch machen ⏎ übernehmen
```

1. Knopf des Punkts anklicken
2. Antwort ins Feld „Zu 1“ tippen, Enter – es springt automatisch zum nächsten offenen Punkt
3. „Send“ – alle Antworten gehen gesammelt als deine Nachricht raus:
   `Zu 1 (Es fehlen noch 4 Bilder): sind schon im Ordner`
4. „Hide“ blendet das Band bis zur nächsten Antwort aus

Ohne Maus: Strg+X, dann Tab zu den Knöpfen und Enter, Esc zurück ins Eingabefeld. Die Knöpfe haben bewusst keine Tastenkürzel, damit beim Schreiben nichts aus Versehen ausgelöst wird.

**Wo es läuft:** nur in Claude Code – im Terminal (`claude`) unter Windows, Mac und Linux, in der Claude-Desktop-App im Bereich „Code“ und in Editoren wie VS Code mit der Claude-Code-Erweiterung (unter Windows am 29.10.2026 getestet: Panel, Status und Währung). Im normalen Claude-Chat und in anderen KI-Werkzeugen (zum Beispiel Cursor, Codex, Gemini) läuft es nicht.

Braucht eine Claude-Code-Version mit Mod-Unterstützung (getestet mit 2.1.310, ältere Versionen nicht geprüft). Der Installer trägt die Mod über `CLAUDE_CODE_PLUGIN_DIRS` ein; mit `/plugin` siehst du „1 mod active · bro-status“.

## Panel `/bro`: Status, Cache und Warmhalten

`/bro` öffnet ein Panel. Oben steht der Status wie in der Statusline, mit Diamant und denselben Farben. In der Desktop-App, wo keine Statusline läuft, ist das Panel von Anfang an offen. „Wartet auf dich“ kommt aus der Freigabe-Prüfung von Claude Code und bleibt in der Desktop-App stehen, bis das Werkzeug fertig ist (die App meldet die Freigabe nicht zurück). Nach 30 Sekunden steht dahinter „Freigabe oder läuft seit …“ mit hochzählender Zeit, kurz vor und nach dem Cache-Ablauf zusätzlich eine Cache-Warnung. Im Auto-Modus steht, solange der Auto-Prüfer prüft, „Auto prüft: …“ mit dem Werkzeug; „wartet auf dich“ kommt nur, wenn wirklich du gefragt wirst. Läuft keine Statusline, wird der Cache-Ablauf auf 1 Stunde ab der letzten Anfrage geschätzt und als „geschätzt“ markiert.

Darunter der Cache (in der Desktop-App mit Ringen für die Trefferquoten):

```
◔ 8:07                ◔ 99,20 %          ◔ 89,52 %
  Cache · 1 h           letzte Anfrage     Sitzung
  ● läuft bald ab

Cache warmhalten                         [ An ]
  nächste Auffrischung in 5:07
Auto-Compact                             [ An ]
  ● ab 82 % · jetzt 31 %
Feierabend                               [ Einleiten ]
  Plan abarbeiten, dann speichern
Modellwechsel                            [ Vorbereiten ]
  speichern, Verlauf verkleinern, Warmhalten aus – dann Modell wählen
Töne                                     [ An ]
  Warnton bei „wartet auf dich“, leiser Ton bei „fertig“

[ Mehr ▸ ]
```

**Warmhalten** (Schalter „Cache warmhalten“, Standard: aus – bleibt gespeichert). Der Cache-Kreis zeigt die Restzeit, die Zeile darunter den Zustand als Ampel: grün: warm, gelb: läuft bald ab, rot: läuft gleich ab oder ist kalt. Ist ein Schalter aus, steht unter dem Namen, wofür er ist; ist er an, was er gerade tut. „Mehr“ klappt auf (der Pfeil zeigt, ob offen): Warmhalten („Auffrischen vor Ablauf“, „Stopp nach Leerlauf“, wie oft schon aufgefrischt wurde), Auto-Compact („Beginnt bei“), die drei Kreise erklärt, Töne, Sprache, Kosten und Tipp; nichts davon steht oben schon. Der kleine Knopf „◆ ▾“ links vor den Kreisen blendet Schalter und Mehr aus und wieder ein (Status und Kreise bleiben, der Zustand wird gemerkt). Alles läuft über Knöpfe, die keine eigenen Tastenkürzel haben. `/bro` öffnet das Panel, ohne dir das Eingabefeld wegzunehmen, ein zweites `/bro` schließt es wieder (Esc geht auch).

**Feierabend** (Knopf „Einleiten“ bei „Feierabend“ oder `/bro feierabend`; solange er läuft, steht dort „Abbrechen“): wartet die laufende Antwort ab, dann arbeitet Claude die geplanten Aufgaben weiter ab, solange es geht. Jede Runde endet mit „FEIERABEND: weiter“, BroStatus schickt dann die nächste. Bei 90 % des 5-h-Limits oder nach 20 Runden schließt Claude sauber ab und speichert. Am Ende meldet Claude „FEIERABEND: gespeichert“ oder „FEIERABEND: nicht gespeichert – Grund“, und Warmhalten, Auto-Compact und Feierabend sind aus. „Abbrechen“ verhindert jede weitere Runde: die laufende Antwort wird noch fertig, danach wird nichts abgeschlossen oder gespeichert, alles bleibt, wie es war.

**Modellwechsel** (Zeile unter Feierabend, Knopf „Vorbereiten“): speichert den Stand, kompaktiert den Verlauf und schaltet das Warmhalten aus. Dann meldet das Panel „Fertig – jetzt Modell wählen“. Das Modell wählst du selbst in der App. Je kleiner der Verlauf vorher ist, desto billiger wird der Neuaufbau beim Wechsel, weil der Cache nur für ein Modell gilt. Gesperrt, solange Claude arbeitet oder ein Feierabend läuft.

**Auto-Compact** (Schalter „Auto-Compact“): Nach jeder Antwort prüft die Mod, wie voll der Kontext ist. Erst ab dem Füllstand, den du unter „Mehr“ bei „Beginnt bei“ wählst (50, 60, 70 oder 82 % des Kontexts; Standard ist die Stufe 82 %, also 15 % vor der Grenze, an der Claude Code selbst kompaktieren würde; der genaue Wert hängt von dieser Grenze ab), lässt sie Claude den Schritt sauber abschließen und speichern, kompaktiert dann selbst wie `/compact` und schickt „Mach dort weiter, wo du vor dem Kompaktieren warst.“ Claude meldet „COMPACT: gespeichert“ oder „COMPACT: nicht gespeichert – Grund“.

**So funktioniert das Warmhalten**: Das Warmhalten ist für Lücken gedacht, nicht für den Dauerbetrieb: etwa wenn du kurz abgelenkt bist oder Claude früher fertig wird als angekündigt, während du noch nicht zurück bist (Claude kündigt 1 Stunde Arbeit an und ist nach 20 Minuten fertig). Dann hält es den Cache für diese Lücke warm. Für Arbeit über Nacht oder über mehrere Tage ist es nicht gedacht; die Stufen bei „Stopp“ geben nur an, wie lange es höchstens läuft, nicht wie lange es sinnvoll ist. Kurz vor Ablauf schickt die Mod eine winzige Anfrage über die bestehende Unterhaltung. Sie liest den Cache und setzt dessen Timer zurück, taucht nicht im Chat auf, soll den Cache nur lesen (so ist es im Code ausgelegt) und kann keine Tools benutzen. Nach meiner Messung in einem Einzelfall: ab der zweiten Auffrischung rund 99,9 % Treffer und keine neu geschriebenen Tokens (nicht allgemein belegt).

- **Auffrischen vor Ablauf:** wie lange vor Ablauf aufgefrischt wird – mehr Vorlauf ist sicherer, frischt aber öfter auf. Drei Stufen, passend zur Cache-Dauer: automatisch (1-h-Cache 3 min, 5-min-Cache 45 s), 5 min bzw. 1 min, 10 min bzw. 2 min vorher. Die Auswahl zeigt die echte Zeit.
- **Die drei Kreise** (unter Mehr in Kurzform erklärt): *Cache* zeigt, wie lange Claude den bisherigen Verlauf günstig aus dem Zwischenspeicher liest („geschätzt“ = noch keine echten Daten, gerechnet mit 1 Stunde; „warm“ = gefüllt). *Letzte Anfrage* ist die Trefferquote der letzten Antwort: wie viel des Verlaufs aus dem Cache kam (gelesen ÷ (gelesen + neu geschrieben + normal eingelesen)). *Session* ist dieselbe Quote über die ganze Sitzung. 99 % heißt: fast alles kam günstig aus dem Cache; grün ab 80 %, gelb ab 50 %, darunter rot. Sie fällt nach einer Pause über der Cache-Dauer oder wenn sich der Anfang des Verlaufs ändert (Kompaktieren, geänderte Werkzeuge).
- **Stopp nach Leerlauf:** wann das Warmhalten aufhört, wenn du nichts schreibst; deine nächste Nachricht startet es wieder. Zur Wahl stehen 3, 6 und 12 Stunden (Standard 3 Stunden); Zeiten, die länger wären, als sich das Warmhalten lohnt, werden gekürzt, weil Auffrischen dann mehr kostet als ein Neuaufbau (1-h-Cache bei Faktor 0,1 ~19 h, bei 0,05 ~38 h; 5-min-Cache ~51 min bzw. ~1 h 46 min; BroStatus rechnet mit dem Faktor deines Modells aus Anthropics Preisliste, Stand 29.10.2026). Beim 5-min-Cache steht dann die gekürzte Zeit dabei (zum Beispiel „→ ~51 min, sonst teurer“). Ob automatisches Warmhalten über so lange Zeit zu den Nutzungsbedingungen von Anthropic für dein Abo passt, prüfst du selbst.
- **API und WARM / KALT:** Im Panel steht in der Zeile „kosten“ unter „limit“ `· API | ≈$3.00` (in der Statusline hinter den Limits), der geschätzte API-Wert der Sitzung (Listenpreis; mit Abo zahlst du ihn nicht, dein Kontingent zeigen 5h und 7d). Daneben, sobald das Warmhalten an ist: `· WARM | ≈9k Token / KALT | ≈180k Token`. WARM ist, was alle Auffrischungen der Sitzung zusammen gekostet haben (je Auffrischung der gelesene Cache × Lesefaktor des Modells (0,05 bei Opus 5.5 und Sonnet 5.5, 0,025 bei Fable 5.1 und Mythos 5.1, sonst 0,1), plus neu eingelesene Token). KALT ist, was ein kalter Neustart beim jetzigen Kontext kosten würde (Kontext × 1,25 beim 5-min-Cache bzw. × 2 beim 1-h-Cache), also das, wovor das Warmhalten schützt, wenn du länger weg bist, als der Cache hält. Beides in Input-Token-Gegenwert und geschätzt. Eine echte Ersparnis lässt sich nicht messen, weil man nicht sieht, was ohne Warmhalten passiert wäre.
- **Töne (nur Desktop-App):** Im Terminal piept die Terminal-Glocke, in der Desktop-App spielt die Mod eigene, selbst berechnete Töne: auffällig bei „wartet auf dich“, leise bei „fertig“ nach Arbeit ab einer Mindestdauer (Standard 15 s). Die Zeile „Töne“ mit Leuchte und An/Aus schaltet alles (Standard: an); die Leuchte zeigt es sofort (grün = an, rot = aus). Unter „Mehr“ wählst du je Anlass aus drei Tönen (Doppelton, Klingel, Dreiklang bzw. Glöckchen, Tick, Dreiklang leise) und die Mindestdauer; beim Auswählen hörst du eine Probe. „Ton wiederholen“ (Aus, alle 2 min, alle 5 min) spielt einen verpassten Ton höchstens 3-mal erneut und hört auf, sobald du schreibst, freigibst oder auswählst. „Lautstärke der Töne“ (25, 50, 75, 100 %, Standard 50 %) gilt für alle Töne, auch eigene, und wirkt unter Windows; auf Mac und Linux spielt die App den Ton in ihrer eigenen Lautstärke. Unter Windows spielt PowerShell die Töne, weil die Schnittstelle dort keinen Player hat. Die Töne sind selbst berechnet.
- **Eigene Töne (nur Windows):** Lege WAV-Dateien in den Ordner `toene` neben `state` (`%USERPROFILE%\.claude\brostatus\toene`): `warten-<Name>.wav` für den Warnton, `fertig-<Name>.wav` für den Fertig-Ton. In einer neuen Sitzung stehen sie unter „Mehr“ → Töne hinter den eingebauten, beim ersten Mal sind sie Standard. Ein Update löscht sie nicht.
- **Währung:** Unter „Mehr“ wählst du Dollar, Euro, Pfund oder Franken. Der API-Wert in der Zeile „kosten“ wird mit einem eingebauten Kurs umgerechnet (EZB-Referenzkurse, abgerufen am 28.10.2026, in `kurse.json`, Datum und Quelle stehen im Panel). Einen eigenen Kurs trägst du in `config.json` ein (`currency_rate`). BroStatus lädt keine Kurse aus dem Netz; der Wert bleibt Claude Codes Schätzung (≈), kein Rechnungsbetrag.
- **Sprache:** Unter „Mehr“ → Sprache wählst du Deutsch (Standard), English, Español, Italiano oder Français. Die Wahl gilt für Panel, Antwort-Band, Meldungen und auch für die Statusline und bleibt gespeichert. Bis du umstellst, ist alles deutsch (nur „Send“ und „Hide“ bleiben englisch).
- **Nächste Nachricht:** Im Panel steht eingerückt unter „kontext“ `· nächste Nachricht ≈ 15k Token` (kalt mit „· Cache kalt, teurer“) und zeigt, was die nächste Nachricht laut Cache-Zustand kostet (auch per „Jetzt senden“ in der Desktop-App): warm etwa ein Zehntel des Kontexts (Lesen), kalt der Neuaufbau (1,25-fach bzw. 2-fach). Eine Schätzung im Input-Token-Gegenwert; ohne Cache-Daten steht keine Zahl da. Den Knopf der App selbst kann die Mod nicht beschriften.
- **Kosten:** Jede Auffrischung liest den ganzen Kontext aus dem Cache – das kostet etwa ein Zehntel normaler Eingabe (je nach Modell weniger, siehe unten) und zählt beim Abo aufs Kontingent. Alle Werte in der Zeile „kosten“ sind Schätzungen und tragen deshalb ein ≈: BroStatus liest das Modell der Sitzung und rechnet beim Lesen mit dessen Faktor (Anthropics Preisliste, Stand 29.10.2026: 0,05 bei Opus 5.5 und Sonnet 5.5, 0,025 bei Fable 5.1 und Mythos 5.1, sonst 0,1; unbekanntes Modell: 0,1); der API-Wert kommt von Claude Code, das ihn lokal aus den Token zum Listenpreis ausrechnet; mit Abo zahlst du ihn nicht. Ein Neuaufbau kostet das 1,25-Fache (5 min) bzw. 2-Fache (1 h). Beim 1-h-Cache lohnt es sich fast immer, beim 5-min-Cache nur für kurze Pausen.
- **War der Cache schon abgelaufen**, merkt die Mod das an der Antwort, hört auf und meldet es. Deine nächste Nachricht baut ihn ohnehin neu auf.
- **1-h-Cache:** Claude Code kompaktiert lange Unterhaltungen nach ~1 h Leerlauf von selbst („idle compaction“) – unabhängig vom Warmhalten. Wer das nicht will: `"idleCompaction": false` in `~/.claude/settings.json`.

Wie lange der Cache hält, hängt von der Abrechnung ab: Claude-Abo innerhalb des Kontingents = 1 Stunde, API-Key / Cloud / Zusatz-Guthaben = 5 Minuten. Selbst festlegen geht mit `"promptCacheTtl": "1h"` oder `"5m"` in der `settings.json`.

## Voraussetzungen

- Claude Code mit Mod-Unterstützung (getestet mit 2.1.310)
- Python 3.8+ (Ubuntu hat das schon; unter Windows installiert der Installer es selbst über winget, falls es fehlt)

## Installation

| System | Datei | So geht's |
| --- | --- | --- |
| Windows | `Installer/Windows/BroStatus-Install.exe` (oder `.cmd`) | Doppelklicken. Bei der Windows-Warnung „Weitere Informationen“ → „Trotzdem ausführen“ |
| Apple | `Installer/Mac/BroStatus-Mac.zip` → `BroStatus-Install.app` | Entpacken und öffnen; unsigniert, macOS warnt (je nach Version Rechtsklick → „Öffnen“ oder Systemeinstellungen → Datenschutz & Sicherheit → „Dennoch öffnen“) |
| Linux | `Installer/Linux/brostatus-install.sh` | `bash brostatus-install.sh` |

Der Installer fragt (Windows), wohin installiert werden soll: Enter = bisheriger Ort bzw. Standard `C:\Users\<Name>\.claude\brostatus` (Mac/Linux: `~/.claude/brostatus`), oder einen eigenen Ordner eingeben – dann landet alles darin im Unterordner `brostatus`. Auf Mac/Linux geht das mit `--ziel`:

```bash
bash brostatus-install.sh --ziel <ordner>
```

Updates bleiben automatisch am gewählten Ort. Der Ordner bekommt das BroStatus-Icon (Bro mit dem Diamanten). Die Claude-Code-Einstellungen (`~/.claude/settings.json`) bleiben immer an ihrem festen Platz; der Installer legt vorher ein Backup an und lässt deine anderen Einstellungen in Ruhe.

## Telegram aktivieren (optional)

`~/.claude/brostatus/config.json` öffnen und eintragen:

```json
"telegram_bot_token": "123456:ABC...",
"telegram_chat_id": "deine-chat-id"
```

Deine Chat-ID findest du, indem du deinem Bot eine Nachricht schickst und dann diese Adresse im Browser öffnest (Token einsetzen):

```
https://api.telegram.org/bot<TOKEN>/getUpdates
```

Dort steht unter `"chat":{"id": ...}` die Zahl.

**Was die Telegram-Meldung enthält:** Projektname und die Meldung von Claude Code („Fertig“ oder „wartet auf dich“). Zwei Dinge schickt BroStatus nur, wenn du sie selbst in `config.json` einschaltest (Standard: aus): `"telegram_include_answer": true` hängt bei „Fertig“ die ersten 400 Zeichen von Claudes letzter Antwort an (die können Code, Pfade oder Geschäftsdaten enthalten), `"telegram_include_host": true` den Rechnernamen.

**Der Bot-Token ist wie ein Passwort:** Er steht im Klartext in `config.json`. Unter Linux und macOS setzt der Installer die Datei auf „nur für dich lesbar“. Gib die Datei nicht weiter und teile sie nicht in Fehlermeldungen.

**Was lokal gespeichert wird:** In `state/` liegen je Sitzung der Status, vollständige Dateipfade, die ersten Zeichen von Befehlen, Suchbegriffen und Aufgabenbeschreibungen, Hostnamen aus Aufrufen, die Namen verwendeter Skills, MCP-Server und Hilfs-Agenten (mit Zähler) und die letzte Warte-Meldung. Die Dateien bleiben auf deinem Rechner und werden nach 7 Tagen beim nächsten Sitzungsstart gelöscht. Steht in der ersten Zeile eines Befehls ein Geheimnis, kann ein Stück davon dort landen.

## Weitere Einstellungen (`config.json`)

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `notify_min_secs` | 15 | Erst ab so vielen Sekunden Arbeit kommt eine „Fertig“-Meldung |
| `terminal_notify` | true | Ton + Desktop-Benachrichtigung |
| `window_title` | true | Status im Fenstertitel |
| `logo` | true | Diamant-Signet links |
| `colors` | "truecolor" | Auf "256" stellen, falls die Farben komisch aussehen |
| `ctx_stages` | [50, 70, 85] | Grenzen der Kontext-Ampel in % (gelb, orange, rot) |
| `files` | "compact" | "compact" = eine Zeile, "tree" = Dateibaum darunter, "off" = aus |
| `tree_max_lines` | 8 | Max. Zeilen für den Baum |
| `max_items` | 5 | Wie viele Tools/MCPs/APIs pro Zeile |
| `currency_rate` | leer | Eigener Umrechnungskurs für die Währung unter „Mehr“: wie viele Einheiten der gewählten Währung ein US-Dollar sind. Leer = eingebauter Kurs aus `kurse.json` (EZB-Referenzkurse, Datum steht im Panel) |

Änderungen wirken sofort, ohne Neustart (nur der eigene Kurs wird beim Start der Mod gelesen).

## Deinstallieren

Mac und Linux:

```bash
python3 ~/.claude/brostatus/install.py --uninstall   # bzw. aus deinem gewählten Ordner
```

Windows:

```powershell
python $HOME\.claude\brostatus\install.py --uninstall
```

## Gut zu wissen

- Der Diamant (3 Zeilen, mittig) besteht aus Braille-Punktzeichen. Windows Terminal und die üblichen Linux-Terminals zeigen die an. Im alten Windows-Konsolenfenster (conhost/cmd) erscheinen evtl. Kästchen – dann Windows Terminal nutzen oder `"logo": false` setzen.

- Die Statusline erscheint im **Terminal**. Steuerst du einen Linux-Server per Remote Control vom Handy, siehst du sie dort nicht – dafür ist die Telegram-Meldung da.
- Die Einträge mit ↗ in der Aktiv-Zeile sind Webadressen: Hosts aus WebFetch, Websuchen (als `web-search`) und Adressen (`http://…`, `https://…`) in Bash- und PowerShell-Befehlen. Anfragen an Claude selbst werden nicht gezählt.
- Cache-Tags: `#tools_changed` = Tools haben sich geändert, `#system_prompt_changed`, `#ttl_expired_5m` = zu lange Pause, `#rebuild` = Neuaufbau nach Kompaktierung (normal).
- Läuft gar nichts? Einmal testen:
  ```bash
  echo '{"session_id":"test","model":{"display_name":"Opus"}}' | python3 ~/.claude/brostatus/statusline.py
  ```
