# Änderungen / Changelog

Hier steht, was sich in jeder Version ändert. Wer mir einen Hinweis oder eine Fehlermeldung schickt und im Issue das Kästchen ankreuzt, wird bei der Änderung genannt. Das kannst du jederzeit im Issue widerrufen; dann entferne ich den Namen (in der Git-Historie kann eine Kopie bleiben). Einen festen Rhythmus gibt es nicht; ein Update kommt, wenn es etwas zu verbessern gibt.

Here you can read what changes in every version. Hints and bug reports from the community are credited if the person allowed it (checkbox in the issue). You can withdraw this at any time in the issue; I will then remove the name (a copy may remain in the Git history). There is no fixed update schedule; an update comes when there is something to improve.

Neue Versionen erscheinen unter [Releases](https://github.com/diamondsash/bro-status/releases). Wenn du benachrichtigt werden möchtest, klicke oben auf **Watch** → **Custom** → **Releases** (GitHub schickt dann eine Nachricht bei jeder neuen Version).

## v1.0.0 (04.11.2026)

Erste öffentliche Version. Frühere Fassungen waren nur bei mir und einer weiteren Person im Einsatz. / First public version. Earlier versions were only used by me and one more person.

- Statusline mit Diamant, Kontext-Ampel, Prompt-Cache (Restzeit), Limits, genutzten Werkzeugen und Dateien, in fünf Sprachen.
- Panel `/bro`: Status, drei Kreise (Cache, letzte Anfrage, Sitzung), Töne (Desktop-App), Währung und Sprache.
- Diese Fassung enthält keine Funktionen, die von selbst Anfragen über dein Konto senden (Cache warmhalten, Auto-Compact, Feierabend, Modellwechsel). Sie folgen, sobald geklärt ist, ob sie zu den Nutzungsbedingungen von Anthropic passen.
- Antwort-Knöpfe: Ja und Nein, WEG 1 und WEG 2 bei genannten Wegen, Knöpfe unter Berichten.
- Währungsauswahl (Dollar, Euro, Pfund, Franken) mit eingebautem EZB-Referenzkurs (Stand 28.10.2026) und eigenem Kurs in `config.json`.
- Zeile „kosten“ mit ≈ für Schätzwerte; Cache-Lesefaktor je nach Modell (Quelle: Anthropics Preisliste, Stand 29.10.2026).
- Hinweis „Freigabe oder läuft seit …“ bei langem Warten auf eine Freigabe.
- Hinweis zu den Nutzungsbedingungen von Anthropic in der README und in der LICENSE.
- Telegram läuft nur mit deinem eigenen Bot. Antwortauszug und Rechnername werden nur gesendet, wenn du sie einschaltest (Standard aus).
- Dateirechte für Konfiguration und Statusdateien unter Linux und macOS; Steuerzeichen werden aus Dateinamen und Meldungen entfernt.
- Der Installer schreibt `settings.json` so, dass bei einem Abbruch keine halbe Datei entsteht, und behält höchstens fünf Backups.
- Läuft auch in VS Code mit der Claude-Code-Erweiterung (Windows, am 29.10.2026 getestet: Panel, Status, Währung).
- Installer für Windows (getestet), Mac (von einer anderen Person im Terminal ausprobiert) und Linux (ungetestet), mit Prüfsummen in `Installer/SHA256SUMS.txt`.

**English**

- Status line with diamond, context traffic light, prompt cache (time left), limits, tools used and files, in five languages.
- `/bro` panel: status, three circles (cache, last request, session), sounds (desktop app), currency and language.
- This edition contains no features that send requests on their own through your account (keep cache warm, Auto-Compact, Wrap-up, model switch). They will follow once it is clarified whether they fit Anthropic's terms of use.
- Answer buttons: Yes and No, WAY 1 and WAY 2 for named ways, buttons under reports.
- Currency choice (dollar, euro, pound, franc) with a built-in ECB reference rate (as of 28 Oct 2026) and your own rate in `config.json`.
- Cost row with ≈ for estimates; cache-read factor per model (source: Anthropic's price list, as of 29 Oct 2026).
- Notice “awaiting approval or running for …” when waiting long for an approval.
- Notice about Anthropic's terms of use in the README and in the LICENSE.
- Telegram only works with your own bot. Answer excerpt and computer name are only sent if you switch them on (off by default).
- File permissions for configuration and state files on Linux and macOS; control characters are removed from file names and messages.
- The installer writes `settings.json` so that an interrupted run cannot leave a half-written file, and keeps at most five backups.
- Also runs in VS Code with the Claude Code extension (Windows, tested on 29 Oct 2026: panel, status, currency).
- Installers for Windows (tested), Mac (tried by another person in the terminal) and Linux (untested), with checksums in `Installer/SHA256SUMS.txt`.

## Danke / Thanks

Hier stehen später alle, deren Hinweis zu einer Änderung geführt hat und die genannt werden wollen. / Everyone whose reports led to a change will be listed here in the future (only with their permission).
