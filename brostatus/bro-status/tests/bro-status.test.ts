import { expect, mock, test } from 'claude-code/testing'
import { TEXTE, SPRACHEN } from '../hooks/texte.js'
import { basisVon, idleStep, eigeneAusListe, setzeEigeneToene, soundOptions, soundVolume, SOUND_VOLUMES, SOUND_VOLUME_DEFAULT, endsWait, t, setLang, needsPromptCompact, CHECK_PROBE_S, HOOK_POLL_MS, hookWaiting, parseItems, bandItems, waitHint, reportKind, readFactor, currencyFactor, fmtMoney, closingQuestion, itemName, short, composeMessage, decide, leadSeconds, leadStep, leadOptions, idleLimit, idleOptions, breakEven, feierabendResult, gemColor, compactNeeded, compactTrigger, nextCost, soundAsset, feierabendSchluss, feierabendLeer, FEIERABEND_TEXT, FEIERABEND_WEITER, FEIERABEND_SCHLUSS, FZ_LIMIT, FZ_RUNDEN, FZ_LEER_S, FZ_PAUSEN, warmZahl, ringSvg } from '../hooks/register.js'

const BAND = {
  plugin: 'bro-status',
  component: 'AbovePrompt',
  requestId: 'band',
  surface: 'terminal',
  viewport: { columns: 120, rows: 40 },
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 110, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

const ANSWER = 'Fast fertig. Offen ist noch:\n\n1. Es fehlen noch **4 Bilder**\n2. Du musst das noch machen\n\nWomit fange ich an?'

test('liest die letzte nummerierte Liste', () => {
  expect(parseItems(ANSWER)).toEqual([
    { n: 1, text: 'Es fehlen noch 4 Bilder' },
    { n: 2, text: 'Du musst das noch machen' },
  ])
  expect(parseItems('kein Punkt hier')).toEqual([])
  expect(parseItems('1. nur einer')).toEqual([])
  expect(parseItems('```\n1. a\n2. b\n```\nText')).toEqual([])
  const two = parseItems('1. alt\n2. alt\n\nZwischentext\n\n1. neu\n   mehr Text\n2. neu zwei\n3. drei\n\nWas meinst du?')
  expect(two.map((x) => x.text)).toEqual(['neu', 'neu zwei', 'drei'])
})

test('Band nur, wenn die Liste etwas fragt', () => {
  // Anleitung ohne Frage: kein Band
  expect(parseItems('So geht es:\n\n1. Link öffnen\n2. Anmelden\n3. Code einfügen\n\nDanach bist du angemeldet.')).toEqual([])
  // Fragezeichen in einem Punkt
  expect(parseItems('Offen:\n1. Welche Farbe nimmst du?\n2. Logo links oder rechts').length).toBe(2)
  // Frage direkt davor
  expect(parseItems('Was soll ich zuerst machen?\n\n1. Bilder\n2. Texte').length).toBe(2)
  // Frage oder Bitte danach
  expect(parseItems('Zwei Wege:\n1. schnell\n2. gründlich\n\nWelchen willst du?').length).toBe(2)
  // Nur ein Fragezeichen löst das Band aus, „Gib mir Bescheid“ allein nicht
  expect(parseItems('Offen:\n1. Bilder\n2. Texte\n\nGib mir Bescheid.')).toEqual([])
  // Ein Fragezeichen in Anführungszeichen ist ein Zitat, keine Frage
  expect(parseItems('Es bleibt dabei:\n- Der Stern-Knopf steht beim Thema „gefällt es dir?“.\n- Der Absatz steht unter „Sicherheit“.\n\nSag Bescheid.')).toEqual([])
  expect(parseItems('Es bleibt dabei:\n- Der Knopf heißt "gefällt es dir?".\n- Der Absatz steht unten.\n\nSag Bescheid.')).toEqual([])
  expect(parseItems('Offen:\n- Der Knopf „Stern“ bleibt.\n- Welche Farbe nimmst du?').length).toBe(2)
  // Aufzählungen mit - oder * zählen wie nummerierte Punkte, die Mod nummeriert sie
  expect(parseItems('Womit weiter?\n\n- Bilder\n- Texte\n- Ton')).toEqual([{ n: 1, text: 'Bilder' }, { n: 2, text: 'Texte' }, { n: 3, text: 'Ton' }])
  expect(parseItems('Zum Testen:\n\n- Auto prüft\n- Compact\n\nDas Video bleibt blockiert.')).toEqual([])
  expect(parseItems('Offen:\n- Farbe?\n  nested\n- Logo')).toEqual([{ n: 1, text: 'Farbe?' }, { n: 2, text: 'Logo' }])
  // Aufzählung mit „-“ als Übersicht: eine Frage erst am Ende der Antwort löst kein Band aus
  expect(parseItems('Stand:\n\n- Aufgabe A fertig\n- Aufgabe B offen\n\nStartbar ist nur B.\n\nWomit machen wir weiter?')).toEqual([])
  // direkt danach gefragt: Band
  expect(parseItems('Stand:\n\n- Aufgabe A\n- Aufgabe B\n\nWelche zuerst?')).toEqual([{ n: 1, text: 'Aufgabe A' }, { n: 2, text: 'Aufgabe B' }])
  // Schritte einer Anleitung mit „ich warte auf deine Rückmeldung“ meinen nicht die einzelnen Punkte: kein Band
  expect(parseItems('Gut. Ich warte auf deine Rückmeldung. In der neuen Sitzung:\n\n1. Tipp /bro in das Chatfenster.\n2. Klick auf Mehr.\n3. Wähl eine Sprache.\n\nErscheint nichts, sag mir das als Erstes.')).toEqual([])
  // „entscheiden“ im Berichtstext ist keine Frage an dich, nur der Befehl „entscheide“ zählt
  expect(parseItems('Geändert sind:\n\n- a.js\n- b.js\n\nMax sollte erst entscheiden, ob das zum Zweig gehört.')).toEqual([])
  expect(parseItems('Geändert sind:\n\n- a.js\n- b.js\n\nEntscheide du.')).toEqual([])
  expect(parseItems('Geändert sind:\n\n- a.js\n- b.js\n\nWelche Datei zuerst?').length).toBe(2)
  // Beschreibende Punkte mit fetter Überschrift („**Sprache:** … ?“) sind keine Fragen an dich: kein Band (Fehlalarm vom 27.10.)
  expect(parseItems('Er prüft sechs Punkte:\n\n1. **Länge:** Was versteht ein Besucher in 30 Sekunden, wo lässt sich kürzen?\n2. **Sprache:** Rechtschreibung und Begriffe.\n3. **GitHub:** Funktionieren alle Links, fehlt etwas Übliches?\n\nEr macht nur Vorschläge.')).toEqual([])
  // … fragt die Antwort aber direkt danach, gibt es weiter Knöpfe
  expect(parseItems('Zwei Wege:\n\n1. **Schnell:** nur das Nötigste?\n2. **Gründlich:** alles prüfen\n\nWelchen willst du?').length).toBe(2)
  // echte Fragen als Punkte (ohne Überschrift) zählen weiter
  expect(parseItems('Offen:\n1. **Soll ich die Farbe ändern?**\n2. Logo links oder rechts').length).toBe(2)
  // Eine Frage weit vor der Liste zählt nicht
  expect(parseItems('Alles klar?\n\nDann so:\n\n1. Link öffnen\n2. Anmelden')).toEqual([])
})

test('Ja/Nein-Frage nach einer Aufzählung: kein Band mit Punkten, nur ein Antwort-Knopf', () => {
  const erklaerung = 'Ich würde mit der Lautstärke anfangen.\n\n**So würde ich sie bauen:**\n\n- Unter „Mehr → Töne“ gibt es feste Stufen.\n- Die Töne spielt BroStatus mit dem SoundPlayer ab.\n- Als Standard würde ich 50 % vorschlagen.\n\nSoll ich so mit task-1-1 anfangen?'
  expect(parseItems(erklaerung)).toEqual([])
  expect(closingQuestion(erklaerung)).toBe('Soll ich so mit task-1-1 anfangen?')
  // auch nach einer nummerierten Liste
  expect(parseItems('Plan:\n\n1. Bauen\n2. Prüfen\n\nPasst der Plan so?')).toEqual([])
  // Auswahl-Fragen bleiben ein Band
  expect(parseItems('Stand:\n\n- Aufgabe A\n- Aufgabe B\n\nWelche zuerst?').length).toBe(2)
  expect(parseItems('Zwei Wege:\n1. schnell\n2. gründlich\n\nSoll es schnell oder gründlich sein?').length).toBe(2)
  // keine Schlussfrage: kein Antwort-Knopf
  expect(closingQuestion('Alles erledigt.')).toBe('')
  expect(closingQuestion('Frage am Anfang?\n\nDanach ein Bericht.')).toBe('')
})

test('Band-Szenarien: wann es erscheint und welche Knöpfe es zeigt', () => {
  const einzel = (a: string) => bandItems(a).length === 1 && !!bandItems(a)[0].single
  // offene Fragen ohne Auswahl: kein Band (der Fall aus einem Screenshot)
  expect(bandItems('Aufgabe task-1-2: README prüfen, nur Vorschläge.\n\nWie soll ich das umsetzen?')).toEqual([])
  expect(bandItems('Womit machen wir weiter?')).toEqual([])
  expect(bandItems('Welche Farbe soll das Logo haben?')).toEqual([])
  expect(bandItems('Soll das Logo links oder rechts stehen?')).toEqual([])
  expect(bandItems('Was möchtest du mit diesem Projekt erreichen?')).toEqual([])
  // Ja/Nein-Schlussfrage: ein einziger Antwort-Knopf
  expect(einzel('Ich habe es gebaut.\n\nSoll ich es speichern?')).toBe(true)
  expect(einzel('Plan:\n\n1. Bauen\n2. Prüfen\n\nPasst der Plan so?')).toBe(true)
  // Auswahl-Liste: ein Knopf pro Punkt
  expect(bandItems('Welche zuerst?\n\n1. Bilder\n2. Texte').length).toBe(2)
  expect(bandItems('Womit weiter?\n\n- Bilder\n- Texte\n- Ton').length).toBe(3)
  expect(bandItems('Offen:\n1. Welche Farbe nimmst du?\n2. Logo links oder rechts').length).toBe(2)
  expect(bandItems('Stand:\n\n- Aufgabe A\n- Aufgabe B\n\nWelche zuerst?').length).toBe(2)
  // Anleitung, Bericht und Aufzählung ohne Frage: kein Band
  expect(bandItems('So geht es:\n\n1. Link öffnen\n2. Anmelden\n\nDanach bist du angemeldet.')).toEqual([])
  expect(bandItems('Alles erledigt, die Tests sind grün.')).toEqual([])
  expect(bandItems('Gut. Ich warte auf deine Rückmeldung.')).toEqual([])
  // Frage mitten im Text und Code-Block: kein Band
  expect(bandItems('Frage am Anfang?\n\nDanach ein Bericht.')).toEqual([])
  expect(bandItems('```\n1. a\n2. b\n```\nFertig.')).toEqual([])
  // leere oder fehlende Antwort
  expect(bandItems('')).toEqual([])
  // Überschrift, die etwas von dir verlangt (Bild 4): Knopf je Punkt, auch ohne „?“
  const bedarf = [
    'Was ich ohne dich umsetzen kann:', '', '- M1: Tageslimit', '- N1: höchstens 20 Anzeigen', '',
    'Was ich von dir brauche:', '', '1. **Entscheidung zu H3:** ein Schalter, standardmäßig aus.',
    '2. **Später, für den Test:** die Nummer einer entfernten Stelle.', '', 'Danach stelle ich die Prüfung bereit.',
  ].join('\n')
  expect(bandItems(bedarf).map((i) => i.n)).toEqual([1, 2])
  expect(bandItems('Offene Fragen:\n\n1. Farbe\n2. Logo').length).toBe(2)
  expect(bandItems('What I need from you:\n\n1. A decision on H3\n2. A job number').length).toBe(2)
  expect(bandItems('Ce dont j’ai besoin de toi :\n\n1. Une décision\n2. Un numéro').length).toBe(2)
  // Bericht über erledigte Punkte bleibt ohne Band
  expect(bandItems('Was ich gemacht habe:\n\n1. Tests ergänzt\n2. Mod installiert')).toEqual([])
})

test('Ja/Nein-Schlussfrage: JA- und NEIN-Knopf, auch unter Status-Liste, Schrittliste und fetten Überschriften', () => {
  const jn = (a: string) => bandItems(a).length === 1 && !!bandItems(a)[0].yesno
  expect(jn('Stand der Aufgaben:\n\n- task-1-3 erledigt\n- task-1-4 offen\n\nSoll ich sie noch einmal als Auswahl stellen?')).toBe(true)
  expect(jn('So geht es:\n\n1. Ordner öffnen\n2. Datei speichern\n3. Programm neu starten\n\nSoll ich das für dich erledigen?')).toBe(true)
  expect(jn('- **Sprache:** Deutsch\n- **Ton:** kurz und sachlich\n\nSoll ich damit weitermachen?')).toBe(true)
  expect(jn('Die Änderung ist klein.\n\nSoll ich so anfangen?')).toBe(true)
  expect(bandItems('- Variante A\n- Variante B\n\nWelche nehmen wir zuerst?').some((i) => i.yesno)).toBe(false)
  expect(bandItems('Was ich von dir brauche:\n\n- Name\n- Ordner').length).toBe(2)
  expect(bandItems('Es gibt zwei Wege.\n\nWie soll ich das umsetzen?')).toEqual([])
  expect(bandItems('- Test geschrieben\n- Regel angepasst\n- alles grün')).toEqual([])
})

test('WEG-Knöpfe: genannte Wege plus offene Frage bekommen je Weg einen Knopf, die Empfehlung ist markiert', () => {
  const a = bandItems('Aufgabe task-1-5.\n\nWeg 1 (empfohlen): Knöpfe nur, wenn die Antwort die Wege nennt\nWeg 2: Knöpfe immer, ich rate die Wege\n\nWie soll ich das umsetzen?')
  expect(a.map((i) => i.n)).toEqual([1, 2])
  expect(a.map((i) => !!i.weg)).toEqual([true, true])
  expect(a.map((i) => !!i.empfohlen)).toEqual([true, false])
  expect(bandItems('Es gibt mehrere Möglichkeiten.\n\nWie soll ich das umsetzen?')).toEqual([])
  expect(bandItems('Way 1 (recommended): small change\nWay 2: full rebuild\n\nHow should I do it?').map((i) => !!i.empfohlen)).toEqual([true, false])
  expect(bandItems('- Variante A\n- Variante B\n\nWelche nehmen wir zuerst?').some((i) => i.weg)).toBe(false)
})

test('Lange Freigabe-Wartezeit: erst nach 30 s ein Hinweis, Cache-Warnung kurz vor dem Ablauf und danach', () => {
  expect(waitHint(10, 3000, 3600)).toEqual({ long: false, cache: '' })
  expect(waitHint(31, 3000, 3600)).toEqual({ long: true, cache: '' })
  expect(waitHint(600, 500, 3600)).toEqual({ long: true, cache: 'soon' })
  expect(waitHint(5800, 0, 3600)).toEqual({ long: true, cache: 'cold' })
  expect(waitHint(5800, 0, 0)).toEqual({ long: true, cache: '' })
  expect(waitHint(10, 0, 3600)).toEqual({ long: false, cache: '' })
})

test('Berichts-Knöpfe: fertiger Bericht drei Knöpfe, Zwischenstand einen, kurze Antwort und Fragen keinen', () => {
  const fertig = 'task-1-6 ist geprüft, alle Tests sind grün und der Pull Request ist gemergt. Die Mod ist neu installiert.'
  expect(bandItems(fertig).map((i) => i.kind)).toEqual(['next', 'save', 'open'])
  const zwischen = 'Ich habe den Test geschrieben und gesehen, dass er rot ist. Die Reparatur folgt als Nächstes, danach prüfe ich alles.'
  expect(bandItems(zwischen).map((i) => i.kind)).toEqual(['open'])
  expect(bandItems('Ja, das stimmt.')).toEqual([])
  expect(bandItems('Es gibt viel zu sagen, aber nichts davon ist ein Ergebnis oder ein Stand, nur eine längere Erklärung ohne Marker.')).toEqual([])
  expect(bandItems(fertig + '\n\nSoll ich weitermachen?').map((i) => !!i.yesno)).toEqual([true])
  expect(reportKind('')).toBe('')
})

test('Cache-Lesefaktor je Modell nach Anthropics Preisseite, unbekannt = 0,1', () => {
  // 0,025: Fable 5.1 und Mythos 5.1; 0,05: Opus 5.5 und Sonnet 5.5; sonst 0,1
  for (const m of ['claude-fable-5-1', 'Fable 5.1', 'claude-mythos-5-1', 'Mythos 5.1']) expect(readFactor(m)).toBe(0.025)
  for (const m of ['claude-opus-5-5', 'Opus 5.5', 'claude-sonnet-5-5', 'Sonnet 5.5', 'claude-sonnet-5-5[1m]', 'claude-sonnet-5-5-20261001']) expect(readFactor(m)).toBe(0.05)
  for (const m of ['claude-fable-5', 'Fable 5', 'claude-opus-5', 'claude-opus-4-5', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-5-5', 'Opus', 'sonnet', '', undefined]) expect(readFactor(m as any)).toBe(0.1)
  // nextCost und breakEven rechnen mit dem Faktor: warm = Kontext mal Faktor, Neuaufbau (1 h) = Kontext mal 2
  expect(nextCost(100000, 3600, 100, 0.1)!.tokens).toBe(10000)
  expect(nextCost(100000, 3600, 100, 0.05)!.tokens).toBe(5000)
  expect(nextCost(100000, 3600, 0, 0.05)!.tokens).toBe(200000)
  expect(breakEven(3600, 0.1)).toBe(20)
  expect(breakEven(3600, 0.05)).toBe(40)
})

test('Währung: Kurs aus den EZB-Referenzkursen, eigener Kurs hat Vorrang, ohne Kurs bleibt es beim Dollar', () => {
  const kurse = { USD: 1.1133, GBP: 0.83785, CHF: 0.9247 }
  expect(currencyFactor('USD', kurse, null)).toBe(1)
  expect(Math.abs((currencyFactor('EUR', kurse, null) as number) - 1 / 1.1133) < 1e-9).toBe(true)
  expect(Math.abs((currencyFactor('GBP', kurse, null) as number) - 0.83785 / 1.1133) < 1e-9).toBe(true)
  expect(Math.abs((currencyFactor('CHF', kurse, null) as number) - 0.9247 / 1.1133) < 1e-9).toBe(true)
  expect(currencyFactor('EUR', kurse, 0.9)).toBe(0.9)
  expect(currencyFactor('EUR', null, null)).toBeNull()
  expect(currencyFactor('XYZ', kurse, null)).toBeNull()
  expect(fmtMoney(7.86, 'EUR', currencyFactor('EUR', kurse, null))).toBe('≈€7.06')
  expect(fmtMoney(7.86, 'USD', 1)).toBe('≈$7.86')
  expect(fmtMoney(7.86, 'EUR', null)).toBe('≈$7.86')
  expect(fmtMoney(7.86, 'CHF', 0.5)).toBe('≈CHF 3.93')
})

test('Währung unter Mehr: Auswahl da, ohne Kurs bleibt es beim Dollar und der Hinweis sagt es', async ($, on) => {
  mock.clock(on)
  cacheStubs(on, () => BR(100), () => null)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ key: 'bro-currency' })).toBeUndefined()
  await ui.press({ key: 'bro-more' })
  expect(await ui.find({ key: 'bro-currency' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Keine Umrechnung/ })).toBeDefined()
  await ui.select({ key: 'bro-currency', value: 'EUR' })
  expect(await ui.find({ type: 'Text', text: /kein Kurs bekannt/ })).toBeDefined()
  await ui.unmount()
})

test('Einzelner Antwort-Knopf schickt nur den eigenen Text', () => {
  expect(composeMessage([{ n: 1, text: 'Soll ich anfangen?', single: true }], { 1: ' ja bitte ' })).toBe('ja bitte')
  expect(composeMessage([{ n: 1, text: 'Soll ich anfangen?', single: true }], {})).toBe('')
})

test('Kurzname: nur „Schritt 5“, ohne den Text dahinter', () => {
  expect(itemName('Schritt 5 (nach git log): Was stand im Panel?')).toBe('Schritt 5')
  expect(itemName('Farbe: blau oder rot')).toBe('Farbe')
  expect(itemName('Es fehlen noch 4 Bilder')).toBe('Es fehlen noch 4 Bilder')
})

test('Freigabe: „wartet auf dich“ endet, sobald genau das wartende Werkzeug startet', () => {
  expect(endsWait('wartet', 'tool-1', 'tool-1')).toBe(true)
  // ein anderer, paralleler Aufruf deckt die offene Frage nicht zu
  expect(endsWait('wartet', 'tool-1', 'tool-2')).toBe(false)
  // ohne bekannte Kennung bleibt es, wie es war
  expect(endsWait('wartet', null, 'tool-1')).toBe(false)
  expect(endsWait('arbeitet', 'tool-1', 'tool-1')).toBe(false)
})

test('Freigabe: die Zeitprobe gibt dem Auto-Prüfer genug Zeit', () => {
  // Der Modus kommt nicht an; die Prüfung eines längeren Befehls dauert oft länger als 10 s und ist keine Frage an dich
  expect(CHECK_PROBE_S).toBeGreaterThanOrEqual(30)
})

test('kürzt am Wortende', () => {
  expect(short('kurz', 10)).toBe('kurz')
  expect(short('Im Browser mit deinem Claude-Konto anmelden und autorisieren', 40)).toBe('Im Browser mit deinem Claude-Konto …')
  expect(short('Donaudampfschifffahrtsgesellschaftskapitän', 20)).toBe('Donaudampfschifffah …')
})

test('baut die Nachricht nur aus beantworteten Punkten', () => {
  const items = parseItems(ANSWER)
  expect(composeMessage(items, { 1: 'sind schon im Ordner' })).toBe('Zu 1 (Es fehlen noch 4 Bilder): sind schon im Ordner')
})

test('Knopf → Textfeld → Haken → Senden als Nutzer', async ($, on) => {
  const clock = mock.clock(on)
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['nichts'] }))
  on('ui.focus', () => ({ value: undefined }))
  const sent: any[] = []
  on('prompt.submit', ($, e) => { sent.push(e); return { text: e.text } })
  on('ui.toast', () => ({ value: undefined }))

  // Vor einer Antwort zeigt das Band nichts eigenes
  let ui = await $.ui.mount({ ...BAND })
  expect(await ui.find({ key: 'bro-item-1' })).toBeUndefined()
  await ui.unmount()

  await $.turn.complete({ turnId: 't1', answer: ANSWER, durationMs: 1000, isAborted: false, usage: null })
  ui = await $.ui.mount({ ...BAND })
  expect(await ui.find({ key: 'bro-item-1' })).toBeDefined()
  expect(await ui.find({ key: 'bro-item-2' })).toBeDefined()

  await ui.press({ key: 'bro-item-1' })
  await clock.advance(50)
  expect(await ui.find({ key: 'bro-answer' })).toBeDefined()
  await ui.input({ key: 'bro-answer', text: 'sind schon im Ordner' })
  // springt automatisch zu Punkt 2
  await ui.input({ key: 'bro-answer', text: 'ist erledigt' })
  expect(await ui.find({ type: 'Text', text: '✓ ist erledigt' })).toBeDefined()

  await ui.press({ key: 'bro-send' })
  await clock.settle()
  await ui.unmount()
  expect(sent.length).toBe(1)
  expect(sent[0].origin.asUser).toBe(true)
  expect(sent[0].text).toBe('Zu 1 (Es fehlen noch 4 Bilder): sind schon im Ordner\nZu 2 (Du musst das noch machen): ist erledigt')
})

test('Band-Knöpfe senden sofort: JA, WEG 1 und die Berichts-Knöpfe', async ($, on) => {
  const clock = mock.clock(on)
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['nichts'] }))
  on('ui.focus', () => ({ value: undefined }))
  const sent: any[] = []
  on('prompt.submit', ($, e) => { sent.push(e); return { text: e.text } })
  on('ui.toast', () => ({ value: undefined }))
  const fall = async (answer: string, key: string) => {
    await $.turn.complete({ turnId: 't' + sent.length, answer, durationMs: 1000, isAborted: false, usage: null })
    const ui = await $.ui.mount({ ...BAND })
    await ui.press({ key })
    await clock.settle()
    await ui.unmount()
  }
  await fall('Stand:\n\n- A erledigt\n- B offen\n\nSoll ich weitermachen?', 'bro-yes')
  await fall('Weg 1 (empfohlen): klein\nWeg 2: gross\n\nWie soll ich das umsetzen?', 'bro-item-1')
  await fall('task-1-6 ist geprüft, alle Tests sind grün und der Pull Request ist gemergt. Die Mod ist neu installiert.', 'bro-item-2')
  expect(sent.map((e) => e.text)).toEqual(['Ja', 'Weg 1', 'Speichere jetzt: prüfen, committen, Pull Request.'])
})

test('während Claude arbeitet bleibt das Band zu', async ($, on) => {
  mock.clock(on)
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['nichts'] }))
  await $.turn.complete({ turnId: 't1', answer: ANSWER, durationMs: 1000, isAborted: false, usage: null })
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: true } })
  expect(await ui.find({ key: 'bro-item-1' })).toBeUndefined()
})


// ---------- Cache warmhalten ----------

const BR = (expires: number, ttl = '5m') => ({ ttl, expires_at: expires, observed: true, hit_session: 0.9, hit_last: 0.99, context: 150000 })
const W = () => ({ last_ok: null, cold: false })
const CFG = { enabled: true, lead: 'auto', idle: '10800' }

test('Entscheidung: aus, unbekannt, warten, auffrischen, kalt, pausiert', () => {
  expect(decide({ now: 0, cfg: { ...CFG, enabled: false }, bridge: BR(100), warm: W(), lastActivity: 0, turnRunning: false }).action).toBe('off')
  expect(decide({ now: 0, cfg: CFG, bridge: null, warm: W(), lastActivity: 0, turnRunning: false }).action).toBe('unknown')
  expect(decide({ now: 0, cfg: CFG, bridge: BR(100), warm: W(), lastActivity: 0, turnRunning: true }).action).toBe('wait')
  // 5-min-Cache, Vorlauf automatisch 45 s: bei 50 s Restzeit noch warten, bei 40 s auffrischen
  expect(decide({ now: 50, cfg: CFG, bridge: BR(100), warm: W(), lastActivity: 0, turnRunning: false }).action).toBe('wait')
  expect(decide({ now: 60, cfg: CFG, bridge: BR(100), warm: W(), lastActivity: 0, turnRunning: false }).action).toBe('warm')
  expect(decide({ now: 120, cfg: CFG, bridge: BR(100), warm: W(), lastActivity: 0, turnRunning: false }).action).toBe('cold')
  // Aufgefrischt bei 60 s -> laeuft bis 360 s
  expect(decide({ now: 120, cfg: CFG, bridge: BR(100), warm: { last_ok: 60, cold: false }, lastActivity: 0, turnRunning: false }).nextAt).toBe(315)
  // Leerlauf beim 1-h-Cache: Mod hat bis 7100 s warmgehalten, letzte echte Aktivitaet bei 0 s
  const w2 = { last_ok: 7100, cold: false }
  expect(decide({ now: 12000, cfg: { ...CFG, idle: '10800' }, bridge: BR(100, '1h'), warm: { last_ok: 11900, cold: false }, lastActivity: 0, turnRunning: false }).action).toBe('pause')
  expect(decide({ now: 7200, cfg: { ...CFG, idle: '10800' }, bridge: BR(100, '1h'), warm: w2, lastActivity: 0, turnRunning: false }).action).toBe('wait')
  // Beim 5-min-Cache wird 3 h auf die Lohnt-sich-Grenze (51 min) gekuerzt
  expect(decide({ now: 7200, cfg: { ...CFG, idle: '10800' }, bridge: BR(100), warm: { last_ok: 7100, cold: false }, lastActivity: 0, turnRunning: false }).action).toBe('pause')
})

test('Kostenrechnung und Vorlauf', () => {
  expect(breakEven(3600)).toBe(20)
  expect(breakEven(300)).toBe(12)
  expect(leadSeconds('auto', 3600)).toBe(180)
  expect(leadSeconds('auto', 300)).toBe(45)
  // Stufen je Cache-Dauer, frueher gespeicherte Minuten werden zu Stufen
  expect([leadSeconds('mehr', 3600), leadSeconds('viel', 3600)]).toEqual([300, 600])
  expect([leadSeconds('mehr', 300), leadSeconds('viel', 300)]).toEqual([60, 120])
  expect([leadStep('300'), leadStep('600'), leadStep('quatsch')]).toEqual(['mehr', 'viel', 'auto'])
  expect(leadSeconds('600', 300)).toBe(120)
  expect(leadOptions(3600).map((o) => o.label)).toEqual(['automatisch · 3 min vorher', '5 min vorher', '10 min vorher'])
  expect(leadOptions(300).map((o) => o.label)).toEqual(['automatisch · 45 s vorher', '1 min vorher', '2 min vorher'])
  // Feste Zeiten nie ueber der Lohnt-sich-Grenze: beim 5-min-Cache 12 h -> 51 min (12 Auffrischungen à 255 s), beim 1-h-Cache bleibt 12 h
  expect(idleLimit('43200', 300, 45)).toBe(3060)
  expect(idleLimit('43200', 3600, 180)).toBe(43200)
  // Alte Werte („auto“, 1 h, 8 h) fallen auf 3 h zurueck
  expect(idleStep('auto')).toBe('10800')
  expect(idleStep('28800')).toBe('10800')
  expect(idleStep('21600')).toBe('21600')
  expect(idleLimit('auto', 3600, 180)).toBe(10800)
  expect(idleOptions(3600, 180).map((o) => o.label)).toEqual(['3 Stunden', '6 Stunden', '12 Stunden'])
  expect(idleOptions(300, 45)[2].label).toBe('12 Stunden (→ ~51 min, sonst teurer)')
})

function cacheStubs(on: any, bridgeFor: () => any, forkUsage: () => any) {
  const files = new Map<string, string>()
  const forks: any[] = []
  const store = new Map<string, unknown>()
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('store.get', ($: any, e: any) => ({ value: store.get(e.key) }))
  on('store.set', ($: any, e: any) => { store.set(e.key, e.value); return { value: undefined } })
  on('session.id', () => ({ value: 'abc' }))
  on('fs.read', ($: any, e: any) => {
    if (String(e.path).endsWith('abc.cache.json')) return { value: JSON.stringify(bridgeFor()) }
    if (String(e.path).endsWith('lite.json') && LITE_DATEI.value) return { value: '{"lite":true}' }
    // Statusdatei von hook.py (Hooks aus settings.json), nur wenn ein Test sie setzt
    if (String(e.path).endsWith('abc.json') && HOOK_STATE.value) return { value: JSON.stringify(HOOK_STATE.value) }
    return { deny: 'nicht gefunden' }
  })
  on('fs.write', ($: any, e: any) => { files.set(String(e.path), String(e.text ?? e.content ?? e.data ?? '')); return { value: undefined } })
  on('model.fork', ($: any, e: any) => { forks.push(e); return { value: { isAnswered: true, text: 'ok', usage: forkUsage() } } })
  // die Frage-Auswahl zeichnet die Engine selbst, sonst ein leerer Platzhalter
  on('ui.render', ($: any, e: any) => (e.component === 'AskUserQuestion' ? { type: 'engine', ref: 0 } : { type: 'Text', props: {}, children: ['nichts'] }))
  const opened: any[] = []
  on('ui.open', ($: any, e: any) => { opened.push(e); return { value: { isPlaced: true } } })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.focus', () => ({ value: undefined }))
  on('command.run', () => ({ text: '' }))
  return { files, forks, store, opened }
}

// Was hook.py gerade in state/<Sitzung>.json stehen hat; null = keine Datei
const HOOK_STATE: { value: any } = { value: null }
// true: die Mod findet brostatus/lite.json (Lite-Installer)
const LITE_DATEI = { value: false }

const PANE = {
  plugin: 'bro-status', component: 'Pane', requestId: 'bro-cache', surface: 'terminal',
  viewport: { columns: 120, rows: 40 },
  props: { title: '◆ Cache', isFocused: true, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 14 }, view: {} },
} as const

test('NEXT: warm kostet Lesen, kalt den Neuaufbau, ohne Cache-Daten keine Zahl', () => {
  expect(nextCost(150000, 3600, 900)).toEqual({ tokens: 15000, warm: true })
  expect(nextCost(100000, 300, 0)).toEqual({ tokens: 125000, warm: false })
  expect(nextCost(100000, 3600, 0)).toEqual({ tokens: 200000, warm: false })
  expect(nextCost(100000, 0, 0)).toBeNull()
  expect(nextCost(0, 3600, 100)).toBeNull()
})

test('NEXT: das Panel zeigt zwischen Kontext und Limit „· nächste Nachricht ≈ … Token“ eingerückt unter kontext, nach Ablauf teurer', async ($, on) => {
  const clock = mock.clock(on)
  cacheStubs(on, () => BR(100), () => null)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  let ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: '· nächste Nachricht ≈ 15k Token' })).toBeDefined()
  await ui.unmount()
  // nach Ablauf (Restzeit 0): kalt, Neuaufbau 1,25 × 150k
  await clock.advance(120000)
  ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: '· nächste Nachricht ≈ 188k Token · Cache kalt, teurer' })).toBeDefined()
  await ui.unmount()
})

test('Ohne Brückendatei (Desktop-App) frischt das Warmhalten nach der Antwort trotzdem auf', { timeoutMs: 60000 }, async ($, on) => {
  const clock = mock.clock(on)
  const { forks } = cacheStubs(on, () => ({}), () => ({ input_tokens: 50, output_tokens: 2, cache_read_input_tokens: 150000, cache_creation_input_tokens: 0 }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...DESK })
  await ui.press({ key: 'bro-keep' })
  await ui.unmount()
  await clock.advance(1000)
  await $.turn.complete({ turnId: 't1', answer: 'fertig', durationMs: 1000, isAborted: false, usage: null })
  // geschätzter 1-h-Cache, Vorlauf 3 min: nach 50 min noch nichts, nach 58 min eine Auffrischung
  await clock.advance(3000 * 1000)
  expect(forks.length).toBe(0)
  await clock.advance(500 * 1000)
  expect(forks.length).toBe(1)
})

test('Warmhalten-Kosten: „WARM | … / KALT | …“ erscheint mit dem Warmhalten (erst 0), zählt jede Auffrischung', { timeoutMs: 60000 }, async ($, on) => {
  const clock = mock.clock(on)
  const { files } = cacheStubs(on, () => BR(100), () => ({ input_tokens: 50, output_tokens: 2, cache_read_input_tokens: 150000, cache_creation_input_tokens: 0 }))
  on('prompt.submit', () => ({ text: '' }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  let ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: /WARM \|/ })).toBeUndefined()
  await ui.press({ key: 'bro-keep' })
  expect(await ui.find({ type: 'Text', text: /^· WARM \| 0 Token \/ KALT \| (≈\d+k|–) Token$/ })).toBeDefined()
  await clock.advance(60000)
  // 5-min-Cache: Auffrischungen bei 55 s und 310 s, je 150k lesen × 10 % + 50 neu
  await clock.advance(340000)
  await $.prompt.submit({ text: 'weiter', asUser: true } as any)
  const w = JSON.parse([...files.entries()].find(([k]) => k.endsWith('abc.warm.json'))![1])
  expect(w.kosten).toBe(30100)
  expect(w.streak).toBe(0)
  await ui.unmount()
  ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: /^· WARM \| ≈30k Token \/ KALT \| ≈\d+k Token$/ })).toBeDefined()
  await ui.unmount()
})

// Unter Windows heißt der Ordner C:\Users\…\brostatus\state: der Ordner darüber muss auch mit \ gefunden werden (Lite-Marke, Kurse, Töne)
test('Ordner über state/: Windows-Pfad mit \\ und Unix-Pfad mit /', () => {
  expect(basisVon('C:\\Users\\Sash\\.claude\\brostatus\\state')).toBe('C:\\Users\\Sash\\.claude\\brostatus')
  expect(basisVon('/home/sash/.claude/brostatus/state')).toBe('/home/sash/.claude/brostatus')
  expect(basisVon('/home/sash/state-alt')).toBe('/home/sash/state-alt')
})

test('Lite-Fassung: keine Schalter für Warmhalten, Auto-Compact, Feierabend, Modellwechsel; alte Einstellungen lösen nichts aus (task-6-42)', { timeoutMs: 60000 }, async ($, on) => {
  const clock = mock.clock(on)
  const { forks, store } = cacheStubs(on, () => BR(100), () => ({ input_tokens: 50, output_tokens: 2, cache_read_input_tokens: 150000, cache_creation_input_tokens: 0 }))
  // eine frühere volle Installation hatte beides eingeschaltet
  store.set('cache-cfg', { enabled: true, compact: true })
  LITE_DATEI.value = true
  try {
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    await $.command.run({ command: 'bro', args: '' })
    const ui = await $.ui.mount({ ...PANE })
    expect(await ui.find({ type: 'Text', text: 'Cache · 5 min' })).toBeDefined()
    for (const key of ['bro-keep', 'bro-compact', 'bro-feierabend', 'bro-modell']) {
      expect(await ui.find({ key })).toBeUndefined()
    }
    await ui.press({ key: 'bro-more' })
    for (const key of ['bro-lead', 'bro-idle', 'bro-compact-at']) {
      expect(await ui.find({ key })).toBeUndefined()
    }
    // trotz gespeichertem enabled: kein Auffrischen
    await clock.advance(300000)
    expect(forks.length).toBe(0)
    await ui.unmount()
  } finally {
    LITE_DATEI.value = false
  }
})

test('Warmhalten: Panel einschalten, kurz vor Ablauf auffrischen, Zustand speichern', { timeoutMs: 60000 }, async ($, on) => {
  const clock = mock.clock(on)
  const { files, forks, store } = cacheStubs(on, () => BR(100), () => ({ input_tokens: 50, output_tokens: 2, cache_read_input_tokens: 150000, cache_creation_input_tokens: 0 }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Button', key: 'bro-keep' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Cache · 5 min' })).toBeDefined()
  // Ampel unter dem Kreis: warm ist gruen
  const zustand = await ui.find({ type: 'Text', text: 'warm' })
  expect(zustand).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '99,00 %' })).toBeDefined()
  await ui.press({ key: 'bro-keep' })
  expect((store.get('cache-cfg') as any).enabled).toBe(true)
  // 0..50 s: noch nichts; ab 55 s (100 - 45) wird aufgefrischt
  await clock.advance(50000)
  expect(forks.length).toBe(0)
  await clock.advance(10000)
  expect(forks.length).toBe(1)
  const warmFile = [...files.entries()].find(([k]) => k.endsWith('abc.warm.json'))
  expect(warmFile).toBeDefined()
  const w = JSON.parse(warmFile![1])
  expect(w.enabled).toBe(true)
  expect(w.count).toBe(1)
  expect(w.last_ok).toBe(55)
  // Danach erst wieder 45 s vor 55 + 300 s, also bei 310 s
  await clock.advance(200000)
  expect(forks.length).toBe(1)
  await clock.advance(60000)
  expect(forks.length).toBe(2)
  // Im Terminal (ohne Ring) steht hinter dem Zustand, wie oft aufgefrischt wurde
  expect(await ui.find({ type: 'Text', text: /· 2×$/ })).toBeDefined()
  await ui.unmount()
})

test('Warmhalten-Zahl: im Ring „3×“, ohne Auffrischung leer', () => {
  expect(warmZahl(0)).toBe('')
  expect(warmZahl(undefined)).toBe('')
  expect(warmZahl(3)).toBe('3×')
  expect(warmZahl(250)).toBe('99+')
  expect(ringSvg(0.5, '#22c55e', '3×')).toContain('>3×</text>')
  expect(ringSvg(0.5, '#22c55e')).not.toContain('<text')
})

test('Warmhalten: war der Cache schon kalt, hört es auf und meldet das', { timeoutMs: 60000 }, async ($, on) => {
  const clock = mock.clock(on)
  const { files, forks } = cacheStubs(on, () => BR(100), () => ({ input_tokens: 150000, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'bro-keep' })
  await clock.advance(60000)
  expect(forks.length).toBe(1)
  await clock.advance(120000)
  expect(forks.length).toBe(1)
  const w = JSON.parse([...files.entries()].find(([k]) => k.endsWith('abc.warm.json'))![1])
  expect(w.cold).toBe(true)
  expect(w.state).toBe('kalt')
  expect(await ui.find({ type: 'Text', text: /schon abgelaufen/ })).toBeDefined()
  await ui.unmount()
})

test('Warmhalten aus: es wird nie aufgefrischt', async ($, on) => {
  const clock = mock.clock(on)
  const { forks } = cacheStubs(on, () => BR(100), () => ({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1, cache_creation_input_tokens: 0 }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(400000)
  expect(forks.length).toBe(0)
})

// ---------- Mehr-Knopf und Feierabend ----------

test('/bro schaltet das Panel auf und zu', async ($, on) => {
  mock.clock(on)
  const { opened } = cacheStubs(on, () => BR(100), () => null)
  const closed: any[] = []
  on('ui.close', ($: any, e: any, next: any) => { closed.push(e); return next(e) })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  expect(opened.length).toBe(1)
  await $.command.run({ command: 'bro', args: '' })
  expect(closed.map((c) => c.id)).toEqual(['bro-cache'])
  await $.command.run({ command: 'bro', args: '' })
  expect(opened.length).toBe(2)
})

test('Mehr klappt Details auf und zu', async ($, on) => {
  mock.clock(on)
  cacheStubs(on, () => BR(100), () => null)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: /Auffrischen ≈/ })).toBeUndefined()
  await ui.press({ key: 'bro-more' })
  expect(await ui.find({ type: 'Text', text: /Auffrischen ≈/ })).toBeDefined()
  // unter Mehr werden die drei Kreise erklärt
  expect(await ui.find({ type: 'Text', text: /^Cache \(Uhr\):/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Letzte Anfrage \(Trefferquote\):/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Sitzung:/ })).toBeDefined()
  await ui.press({ key: 'bro-more' })
  expect(await ui.find({ type: 'Text', text: /Auffrischen ≈/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^Letzte Anfrage \(Trefferquote\):/ })).toBeUndefined()
  await ui.unmount()
})

test('Knopf vor den Kreisen blendet den Bedienbereich aus und ein, Status und Kreise bleiben', async ($, on) => {
  mock.clock(on)
  cacheStubs(on, () => BR(100), () => null)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Button', key: 'bro-keep' })).toBeDefined()
  await ui.press({ key: 'bro-hide' })
  expect(await ui.find({ type: 'Button', key: 'bro-keep' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'bro-more' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'bro-hide' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /letzte Anfrage/ })).toBeDefined()
  await ui.press({ key: 'bro-hide' })
  expect(await ui.find({ type: 'Button', key: 'bro-keep' })).toBeDefined()
  await ui.unmount()
})

test('Ergebnis aus Claudes Schlusszeile lesen', () => {
  expect(feierabendResult('Alles erledigt.\n\nFEIERABEND: gespeichert')).toEqual({ saved: true, reason: '', weiter: false })
  expect(feierabendResult('FEIERABEND: nicht gespeichert – Prüfung rot')).toEqual({ saved: false, reason: 'Prüfung rot', weiter: false })
  expect(feierabendResult('**FEIERABEND: gespeichert**')).toEqual({ saved: true, reason: '', weiter: false })
  expect(feierabendResult('Aufgabe 2 fertig.\nFEIERABEND: weiter')).toEqual({ saved: false, reason: '', weiter: true })
  expect(feierabendResult('kein Ergebnis').saved).toBe(false)
  expect(feierabendResult('Die andere Sitzung läuft noch.\nFEIERABEND: wartet')).toEqual({ saved: false, reason: '', weiter: true, warten: true })
})

function feierabendStubs(on: any) {
  const s = cacheStubs(on, () => BR(100), () => null)
  const sent: any[] = []
  on('prompt.submit', ($: any, e: any) => { sent.push(e); return { text: e.text } })
  on('turn.start', ($: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  // eine Änderung gelingt (gezählt wird erst nach dem Ergebnis)
  on('tool.call', () => ({ result: 'ok' }))
  return { ...s, sent }
}

const TURN = (answer: string, isAborted = false) => ({ turnId: 't', answer, durationMs: 1000, isAborted, usage: null })
// Eine Runde mit Fortschritt: Claude ändert eine Datei
const SCHREIBT = ($: any) => $.tool.call({ tool: 'Edit', file_path: '/work/a.ts', old_string: 'a', new_string: 'b' } as any).catch(() => {})
// Eine ganze Runde: Antwort beginnt, optional mit geänderter Datei, und ist fertig
async function runde($: any, answer: string, schreibt = false) {
  await $.turn.start({ turnId: 't' } as any)
  if (schreibt) await SCHREIBT($)
  await $.turn.complete(TURN(answer))
}

test('Feierabend: wartet auf die laufende Antwort, arbeitet Runden ab, schaltet am Ende alles aus', async ($, on) => {
  mock.clock(on)
  const { sent, store } = feierabendStubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'bro-keep' })
  await ui.press({ key: 'bro-compact' })
  expect((store.get('cache-cfg') as any).enabled).toBe(true)
  await $.turn.start({ turnId: 't0' } as any)
  // Ein Klick reicht; laeuft eine Antwort, wird sie abgewartet
  await ui.press({ key: 'bro-feierabend' })
  expect(sent.length).toBe(0)
  expect((await ui.find({ type: 'Button', key: 'bro-feierabend' })).text).toMatch(/^Abbrechen$/)
  expect(await ui.find({ type: 'Text', text: 'wartet auf Antwort …' })).toBeDefined()
  await $.turn.complete(TURN('Zwischenstand'))
  expect(sent.length).toBe(1)
  expect(sent[0].origin.asUser).toBe(true)
  expect(sent[0].text).toBe(FEIERABEND_TEXT)
  expect(await ui.find({ type: 'Text', text: 'arbeitet …' })).toBeDefined()
  // „weiter“ → naechste Runde
  await SCHREIBT($)
  await $.turn.complete(TURN('Aufgabe 1 erledigt.\nFEIERABEND: weiter'))
  expect(sent.length).toBe(2)
  expect(sent[1].text).toBe(FEIERABEND_WEITER)
  // „wartet“ → keine Leerrunde, die naechste Antwort kommt von selbst (z. B. wenn eine andere Sitzung fertig ist)
  await $.turn.complete(TURN('Die andere Sitzung läuft noch.\nFEIERABEND: wartet'))
  expect(sent.length).toBe(2)
  expect(await ui.find({ type: 'Text', text: 'wartet auf Ergebnis …' })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'bro-feierabend' })).text).toMatch(/^Abbrechen$/)
  await SCHREIBT($)
  await $.turn.complete(TURN('Ergebnis geprüft und gespeichert.\nFEIERABEND: weiter'))
  expect(sent.length).toBe(3)
  expect(sent[2].text).toBe(FEIERABEND_WEITER)
  // „gespeichert“ → Ende, alles aus
  await $.turn.complete(TURN('Nichts mehr offen.\nFEIERABEND: gespeichert'))
  expect(sent.length).toBe(3)
  expect(await ui.find({ type: 'Text', text: '✓ gespeichert' })).toBeDefined()
  const c = store.get('cache-cfg') as any
  expect(c.enabled).toBe(false)
  expect(c.compact).toBe(false)
  expect((await ui.find({ type: 'Button', key: 'bro-feierabend' })).text).toMatch(/^Einleiten$/)
  await ui.unmount()
})

test('Feierabend: Einleiten startet, Abbrechen gilt vor dem Start und mitten in der Arbeit', async ($, on) => {
  mock.clock(on)
  const { sent } = feierabendStubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  const ui = await $.ui.mount({ ...PANE })
  const knopf = async () => (await ui.find({ type: 'Button', key: 'bro-feierabend' })).text
  expect(await knopf()).toBe('Einleiten')
  // Kein Schalter: keine Leuchte vor dem Knopf
  expect(await ui.find({ key: 'bro-feierabend-led' })).toBeUndefined()
  await $.turn.start({ turnId: 't0' } as any)
  await ui.press({ key: 'bro-feierabend' }) // einleiten, wartet auf die laufende Antwort
  expect(await knopf()).toBe('Abbrechen')
  await ui.press({ key: 'bro-feierabend' }) // abbrechen, noch nichts geschickt
  expect(await knopf()).toBe('Einleiten')
  await $.turn.complete(TURN('Zwischenstand'))
  expect(sent.length).toBe(0)
  // Ohne laufende Antwort geht es sofort los
  await ui.press({ key: 'bro-feierabend' })
  expect(sent.length).toBe(1)
  // Mitten in der Arbeit abbrechen: keine weitere Runde, alles läuft normal weiter
  await ui.press({ key: 'bro-feierabend' })
  expect(await knopf()).toBe('Einleiten')
  await $.turn.complete(TURN('Aufgabe 1 erledigt.\nFEIERABEND: weiter'))
  expect(sent.length).toBe(1)
  await ui.unmount()
})

test('Eigene Nachricht leert das Antwort-Band und räumt einen beendeten Feierabend weg', async ($, on) => {
  mock.clock(on)
  feierabendStubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  await $.turn.complete({ turnId: 't1', answer: ANSWER, durationMs: 1000, isAborted: false, usage: null })
  let band = await $.ui.mount({ ...BAND })
  expect(await band.find({ key: 'bro-item-1' })).toBeDefined()
  await band.unmount()
  await $.prompt.submit({ text: 'mach weiter', asUser: true } as any)
  band = await $.ui.mount({ ...BAND })
  expect(await band.find({ key: 'bro-item-1' })).toBeUndefined()
  await band.unmount()
  // Beendeter Feierabend: die Anzeige „✓ gespeichert“ verschwindet mit deiner nächsten Nachricht
  let ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'bro-feierabend' })
  await runde($, 'Nichts mehr offen.\nFEIERABEND: gespeichert')
  expect(await ui.find({ type: 'Text', text: '✓ gespeichert' })).toBeDefined()
  await ui.unmount()
  await $.prompt.submit({ text: 'neue Aufgabe', asUser: true } as any)
  ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: '✓ gespeichert' })).toBeUndefined()
  await ui.unmount()
})

test('Feierabend: Leerrunde heißt kurz und ohne geänderte Datei', () => {
  expect(feierabendLeer({ geschrieben: false, sekunden: 24 })).toBe(true)
  expect(feierabendLeer({ geschrieben: false, sekunden: null as any })).toBe(true)
  expect(feierabendLeer({ geschrieben: true, sekunden: 24 })).toBe(false)
  expect(feierabendLeer({ geschrieben: false, sekunden: FZ_LEER_S })).toBe(false)
  expect(FZ_PAUSEN).toEqual([2, 4, 8])
})

test('Feierabend: Leerlauf-Bremse wartet 2, 4, 8 Minuten und schließt nach der dritten Leerrunde ab', { timeoutMs: 60000 }, async ($, on) => {
  const clock = mock.clock(on)
  const { sent } = feierabendStubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'bro-feierabend' })
  expect(sent.length).toBe(1)
  // Fehlerbericht: Claude prüft nur den Stand und schreibt trotzdem „weiter“
  await runde($, 'Nebensitzung läuft noch.\nFEIERABEND: weiter')
  expect(sent.length).toBe(1)
  expect(await ui.find({ type: 'Text', text: 'Leerlauf – Pause …' })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'bro-feierabend' })).text).toMatch(/^Abbrechen$/)
  await clock.advance(2 * 60 * 1000 - 1000)
  expect(sent.length).toBe(1)
  await clock.advance(1000)
  expect(sent.length).toBe(2)
  expect(sent[1].text).toBe(FEIERABEND_WEITER)
  await runde($, 'Unverändert.\nFEIERABEND: weiter')
  await clock.advance(4 * 60 * 1000 - 1000)
  expect(sent.length).toBe(2)
  await clock.advance(1000)
  expect(sent.length).toBe(3)
  expect(sent[2].text).toBe(FEIERABEND_WEITER)
  // Dritte Leerrunde: nach 8 Minuten kommt nicht die nächste Runde, sondern der Abschluss
  await runde($, 'Unverändert.\nFEIERABEND: weiter')
  await clock.advance(8 * 60 * 1000 - 1000)
  expect(sent.length).toBe(3)
  await clock.advance(1000)
  expect(sent.length).toBe(4)
  expect(sent[3].text).toBe(FEIERABEND_SCHLUSS)
  await runde($, 'Alles gesichert.\nFEIERABEND: gespeichert')
  expect(await ui.find({ type: 'Text', text: '✓ gespeichert' })).toBeDefined()
  await ui.unmount()
})

test('Feierabend: Fortschritt setzt die Bremse zurück, eine Antwort in der Pause zählt, Abbrechen gilt in der Pause', { timeoutMs: 60000 }, async ($, on) => {
  const clock = mock.clock(on)
  const { sent } = feierabendStubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  const ui = await $.ui.mount({ ...PANE })
  const knopf = async () => (await ui.find({ type: 'Button', key: 'bro-feierabend' })).text
  await ui.press({ key: 'bro-feierabend' })
  await runde($, 'Nichts geändert.\nFEIERABEND: weiter')
  expect(sent.length).toBe(1)
  // In der Pause meldet sich z. B. die Nebensitzung: die Antwort mit Fortschritt wird sofort ausgewertet
  await runde($, 'Ergebnis eingebaut.\nFEIERABEND: weiter', true)
  expect(sent.length).toBe(2)
  expect(await ui.find({ type: 'Text', text: 'arbeitet …' })).toBeDefined()
  // Die alte Pause verfällt und schickt nichts doppelt
  await clock.advance(2 * 60 * 1000)
  expect(sent.length).toBe(2)
  // Mit Fortschritt beginnt die Bremse wieder bei 2 Minuten
  await runde($, 'Aufgabe fertig.\nFEIERABEND: weiter', true)
  expect(sent.length).toBe(3)
  await runde($, 'Nichts geändert.\nFEIERABEND: weiter')
  await clock.advance(2 * 60 * 1000)
  expect(sent.length).toBe(4)
  // Abbrechen in der Pause: danach kommt nichts mehr
  await runde($, 'Nichts geändert.\nFEIERABEND: weiter')
  expect(await knopf()).toBe('Abbrechen')
  await ui.press({ key: 'bro-feierabend' })
  expect(await knopf()).toBe('Einleiten')
  await clock.advance(10 * 60 * 1000)
  expect(sent.length).toBe(4)
  await ui.unmount()
})

test('Feierabend: schließt ab, wenn das 5-h-Limit fast voll ist oder die Runden aufgebraucht sind', () => {
  expect(feierabendSchluss({ runden: 1, limit: 40, stopp: false })).toBe(false)
  expect(feierabendSchluss({ runden: 1, limit: null, stopp: false })).toBe(false)
  expect(feierabendSchluss({ runden: 1, limit: FZ_LIMIT, stopp: false })).toBe(true)
  expect(feierabendSchluss({ runden: FZ_RUNDEN, limit: 10, stopp: false })).toBe(true)
  expect(feierabendSchluss({ runden: 1, limit: 10, stopp: true })).toBe(true)
})

test('Panel auf Desktop mit Ringen, im Terminal ohne', async ($, on) => {
  mock.clock(on)
  cacheStubs(on, () => BR(100), () => null)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Button', key: 'bro-keep' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'bro-more' })).toBeDefined()
    const ring = await ui.find({ type: 'Svg' })
    if (surface === 'desktop') expect(ring).toBeDefined()
    else expect(ring).toBeUndefined()
    await ui.unmount()
  }
})

test('/bro feierabend startet den Feierabend ohne Panel', async ($, on) => {
  const clock = mock.clock(on)
  const { sent } = feierabendStubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: 'Feierabend' })
  await clock.advance(100)
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Text', text: /konnte nicht gesendet/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'arbeitet …' })).toBeDefined()
  expect(sent.length).toBe(1)
  expect(sent[0].text).toBe(FEIERABEND_TEXT)
})

// ---------- Status oben im Panel ----------

function statusStubs(on: any) {
  const s = cacheStubs(on, () => null, () => null)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 116000, window: 200000, percent: 58 }, rateLimits: [{ kind: 'five_hour', percentUsed: 23 }, { kind: 'seven_day', percentUsed: 71 }], cost: { usd: 1.5 } } }))
  on('turn.start', ($: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  return s
}

const DESK = { ...PANE, surface: 'desktop' } as const

test('Status: Desktop öffnet das Panel selbst, zeigt Kontext, Limits und Kosten', async ($, on) => {
  mock.clock(on)
  const { opened } = statusStubs(on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  expect(opened.length).toBe(1)
  expect(opened[0].title).toBe('◆ BroStatus')
  const ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: '○ bereit' })).toBeDefined()
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' 58%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' ▸ Aufgabe abschließen' })).toBeDefined()
  // · S | 5h / 23%  · W | 7d / 71%: S = Sitzungslimit, W = Wochenlimit
  expect(await ui.find({ type: 'Text', text: '· S | 5h / ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '· W | 7d / ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '71%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^gem/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '· API | ≈$1.50' })).toBeDefined()
  // API und SAVE stehen eine Zeile unter „limit“, in der Zeile „kosten“
  expect(await ui.find({ type: 'Box', key: 'kosten-lb' })).toBeDefined()
  await ui.unmount()
})

test('Status: im Terminal öffnet sich das Panel nicht von selbst', async ($, on) => {
  mock.clock(on)
  const { opened } = statusStubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(opened.length).toBe(0)
})

test('Status: arbeitet, wartet auf Freigabe, arbeitet weiter, fertig mit Dateien', { timeoutMs: 60000 }, async ($, on) => {
  const clock = mock.clock(on)
  statusStubs(on)
  on('tool.check', () => ({ decision: 'ask' }))
  // Das Freigabe-Fenster ist offen: Claude Code nimmt die Zeile darunter an
  on('ui.notice', () => ({ value: undefined }))
  let finish: () => void = () => {}
  const finished = new Promise<void>((r) => { finish = r })
  on('classic.PermissionRequest', async () => {
    await finished
    return { decision: { behavior: 'allow' } }
  })
  on('tool.call', async () => {
    await finished
    return { result: 'ok' }
  })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(1000)
  await $.turn.start({ turnId: 't1' } as any)
  const call = $.tool.call({ tool: 'Bash', command: 'git push' } as any)
  await clock.advance((CHECK_PROBE_S + 1) * 1000)

  let ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: '‖ wartet auf dich' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' – Bash git push freigeben?' })).toBeDefined()
  await ui.unmount()

  // Ein Ereignis „Freigabe erteilt“ gibt es nicht: der Status springt zurück, sobald das Werkzeug fertig ist
  finish()
  await call
  ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: '‖ wartet auf dich' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '⚙ arbeitet' })).toBeDefined()
  await ui.unmount()
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'a', new_string: 'b' } as any).catch(() => {})
  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 1000, isAborted: false, usage: { input_tokens: 100, output_tokens: 5, cache_read_input_tokens: 9900, cache_creation_input_tokens: 0 } } as any)
  ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: '✓ fertig' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /app\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /bash/ })).toBeDefined()
  // ohne Brückendatei: geschätzter 1-h-Cache und Trefferquote aus der Antwort
  expect(await ui.find({ type: 'Text', text: 'Cache · 1 h · geschätzt' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '99,00 %' })).toBeDefined()
  await ui.unmount()
})

// „ask“ ist erst eine Frage an dich, wenn das Freigabe-Fenster offen ist; vorher prüft der Auto-Prüfer.
function askStubs(on: any, dialog: { open: boolean }) {
  statusStubs(on)
  on('tool.check', () => ({ decision: 'ask' }))
  on('ui.notice', () => (dialog.open ? { value: undefined } : { deny: 'no dialog is open for this call' }))
  let finish: () => void = () => {}
  const finished = new Promise<void>((r) => { finish = r })
  on('classic.PermissionRequest', async () => {
    await finished
    return { decision: { behavior: 'allow' } }
  })
  on('tool.call', async () => {
    await finished
    return { result: 'ok' }
  })
  return { finish }
}

test('Freigabe wartet lange: nach 30 s steht „Freigabe oder läuft seit …“ im Panel, vorher nicht', { timeoutMs: 60000 }, async ($, on) => {
  const clock = mock.clock(on)
  statusStubs(on)
  on('tool.check', () => ({ decision: 'ask' }))
  on('ui.notice', () => ({ value: undefined }))
  let finish: () => void = () => {}
  const finished = new Promise<void>((r) => { finish = r })
  on('classic.PermissionRequest', async () => {
    await finished
    return { decision: { behavior: 'allow' } }
  })
  on('tool.call', async () => {
    await finished
    return { result: 'ok' }
  })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(1000)
  await $.turn.start({ turnId: 't1' } as any)
  const call = $.tool.call({ tool: 'Bash', command: 'git push' } as any)
  await clock.advance((CHECK_PROBE_S + 1) * 1000)
  let ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: '‖ wartet auf dich' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' · Freigabe oder läuft seit 0s' })).toBeUndefined()
  await ui.unmount()
  await clock.advance(40 * 1000)
  ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: ' · Freigabe oder läuft seit 40s' })).toBeDefined()
  await ui.unmount()
  finish()
  await call
})

test('Freigabe: prüft der Auto-Prüfer, erst nach CHECK_PROBE_S „wartet auf dich“ mit Ton', { timeoutMs: 60000 }, async ($, on) => {
  const clock = mock.clock(on)
  const dialog = { open: false }
  const { finish } = askStubs(on, dialog)
  const played = soundStubs(on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await $.turn.start({ turnId: 't1' } as any)
  const call = $.tool.call({ tool: 'Bash', command: 'git push' } as any)
  // 20 s: der Auto-Prüfer arbeitet noch, das ist keine Frage an dich
  await clock.advance(20000)
  let ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: '‖ wartet auf dich' })).toBeUndefined()
  await ui.unmount()
  expect(played).toEqual([])
  // nach der Zeitprobe wartet es auf dich, mit Ton
  await clock.advance((CHECK_PROBE_S - 20 + 1) * 1000)
  ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: '‖ wartet auf dich' })).toBeDefined()
  await ui.unmount()
  expect(played).toEqual(['sounds/warten-doppelton.wav'])
  finish()
  await call
})

test('Freigabe: hookWaiting liest nur ein frisches „waiting“ aus der Statusdatei von hook.py', () => {
  expect(hookWaiting({ status: 'waiting', updated: 1000 }, 1000)).toBe(true)
  expect(hookWaiting({ status: 'waiting', updated: 990 }, 1000)).toBe(false)
  expect(hookWaiting({ status: 'working', updated: 1000 }, 1000)).toBe(false)
  expect(hookWaiting(null, 1000)).toBe(false)
})

test('Freigabe: meldet hook.py „waiting“, sofort „wartet auf dich“ mit Ton; ohne Meldung erst nach CHECK_PROBE_S', async ($, on) => {
  const clock = mock.clock(on)
  const { finish } = askStubs(on, { open: false })
  const played = soundStubs(on)
  HOOK_STATE.value = { status: 'working', updated: Date.now() / 1000 }
  try {
    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
    await $.turn.start({ turnId: 't1' } as any)
    const call = $.tool.call({ tool: 'Bash', command: 'git push' } as any)
    await clock.advance(3 * HOOK_POLL_MS)
    expect(played).toEqual([])
    // jetzt kommt das Freigabe-Fenster: hook.py schreibt „waiting“
    HOOK_STATE.value = { status: 'waiting', updated: Date.now() / 1000 + 1 }
    await clock.advance(HOOK_POLL_MS + 100)
    const ui = await $.ui.mount({ ...DESK })
    expect(await ui.find({ type: 'Text', text: '‖ wartet auf dich' })).toBeDefined()
    await ui.unmount()
    expect(played).toEqual(['sounds/warten-doppelton.wav'])
    finish()
    await call
  } finally {
    HOOK_STATE.value = null
  }
})

test('Freigabe: läuft hook.py, ist ein langer, vom Auto-Prüfer freigegebener Befehl kein „wartet auf dich“', { timeoutMs: 60000 }, async ($, on) => {
  const clock = mock.clock(on)
  const { finish } = askStubs(on, { open: false })
  const played = soundStubs(on)
  HOOK_STATE.value = { status: 'working', updated: Date.now() / 1000 }
  try {
    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
    await $.turn.start({ turnId: 't1' } as any)
    const call = $.tool.call({ tool: 'PowerShell', command: 'node scripts/brostatus-pruefen.cjs' } as any)
    // 13 Minuten Prüflauf, hook.py meldet nie „waiting“
    await clock.advance((CHECK_PROBE_S + 60) * 1000)
    const ui = await $.ui.mount({ ...DESK })
    expect(await ui.find({ type: 'Text', text: '‖ wartet auf dich' })).toBeUndefined()
    await ui.unmount()
    expect(played).toEqual([])
    // kommt doch noch eine echte Freigabe-Frage (Auto-Prüfer lehnt spät ab), erscheint sie sofort
    HOOK_STATE.value = { status: 'waiting', updated: Date.now() / 1000 + 1 }
    await clock.advance(HOOK_POLL_MS + 100)
    const ui2 = await $.ui.mount({ ...DESK })
    expect(await ui2.find({ type: 'Text', text: '‖ wartet auf dich' })).toBeDefined()
    await ui2.unmount()
    finish()
    await call
  } finally {
    HOOK_STATE.value = null
  }
})

test('Freigabe: nach „waiting“ von hook.py endet „wartet auf dich“, sobald der freigegebene Befehl startet', async ($, on) => {
  const clock = mock.clock(on)
  // tool.call feuert vor tool.check; der Befehl läuft nach der Freigabe lange weiter (finish erst am Ende)
  let toolId = ''
  statusStubs(on)
  on('tool.check', (_$: any, e: any) => {
    toolId = e.tool_use_id
    return { decision: 'ask' }
  })
  on('ui.notice', () => ({ value: undefined }))
  let finish: () => void = () => {}
  const finished = new Promise<void>((r) => { finish = r })
  on('classic.PermissionRequest', async () => {
    await finished
    return { decision: { behavior: 'allow' } }
  })
  on('tool.call', async () => {
    await finished
    return { result: 'ok' }
  })
  soundStubs(on)
  HOOK_STATE.value = { status: 'working', updated: Date.now() / 1000 }
  try {
    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
    await $.turn.start({ turnId: 't1' } as any)
    const call = $.tool.call({ tool: 'Bash', command: 'npx tsc --noEmit' } as any)
    HOOK_STATE.value = { status: 'waiting', updated: Date.now() / 1000 + 1 }
    await clock.advance(HOOK_POLL_MS + 100)
    let ui = await $.ui.mount({ ...DESK })
    expect(await ui.find({ type: 'Text', text: '‖ wartet auf dich' })).toBeDefined()
    await ui.unmount()
    // ein anderer, paralleler Befehl läuft: die offene Frage bleibt
    await $.ui.render({ component: 'ToolProgress', surface: 'desktop', props: { tool_use_id: 'anderer', kind: 'background_hint', hint: '' } } as any).catch(() => {})
    ui = await $.ui.mount({ ...DESK })
    expect(await ui.find({ type: 'Text', text: '‖ wartet auf dich' })).toBeDefined()
    await ui.unmount()
    // du gibst frei, der Befehl läuft: Claude Code zeigt darunter „im Hintergrund ausführen“
    await $.ui.render({ component: 'ToolProgress', surface: 'desktop', props: { tool_use_id: toolId, kind: 'background_hint', hint: '' } } as any).catch(() => {})
    ui = await $.ui.mount({ ...DESK })
    expect(await ui.find({ type: 'Text', text: '‖ wartet auf dich' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '⚙ arbeitet' })).toBeDefined()
    await ui.unmount()
    finish()
    await call
  } finally {
    HOOK_STATE.value = null
  }
})

test('Hintergrund: meldet hook.py nach der Antwort laufende Aufgaben, steht „arbeitet im Hintergrund“ mit je einer Zeile, der Fertig-Ton wartet', async ($, on) => {
  const clock = mock.clock(on)
  statusStubs(on)
  const played = soundStubs(on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(1000) // Testuhr steht sonst bei 0, das gilt als „keine Startzeit“
  await $.turn.start({ turnId: 't1' } as any)
  await clock.advance(20000) // lange Arbeit: eigentlich käme jetzt der Fertig-Ton
  HOOK_STATE.value = { status: 'done', finished_at: Date.now() / 1000, background: [{ type: 'shell', label: 'npm run haupt && npm run teaser' }, { type: 'subagent', label: 'Anleitung übersetzen' }] }
  try {
    await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 20000, isAborted: false } as any)
    await clock.advance(1100)
    await clock.advance(10000)
    expect(played).toEqual([]) // es läuft noch etwas: kein Fertig-Ton
    let ui = await $.ui.mount({ ...DESK })
    expect(await ui.find({ type: 'Text', text: '◔ arbeitet im Hintergrund · 2' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /npm run haupt/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Anleitung übersetzen/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '✓ fertig' })).toBeUndefined()
    await ui.unmount()
    // die Aufgabe ist fertig: Claude Code weckt die Sitzung, danach meldet hook.py keine Hintergrund-Arbeit mehr
    await $.turn.start({ turnId: 't2' } as any)
    HOOK_STATE.value = { status: 'done', finished_at: Date.now() / 1000, background: [] }
    await $.turn.complete({ turnId: 't2', answer: 'ok', durationMs: 1000, isAborted: false } as any)
    await clock.advance(1100)
    expect(played).toEqual(['sounds/fertig-glocke.wav']) // jetzt ist alles durch, auch nach kurzer Weck-Runde
    ui = await $.ui.mount({ ...DESK })
    expect(await ui.find({ type: 'Text', text: '✓ fertig' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /arbeitet im Hintergrund/ })).toBeUndefined()
    await ui.unmount()
  } finally {
    HOOK_STATE.value = null
  }
})

test('Eigene Töne: warten-/fertig-<Name>.wav werden erkannt, stehen hinter den eingebauten und liefern ihren Pfad', () => {
  expect(eigeneAusListe(['warten-Machine doppelt schnell.wav', 'warten-Machine.wav', 'fertig-Machine tief.wav', 'fertig-Machine.wav', 'LIESMICH.txt', 'fertig-Gong.WAV'])).toEqual({ warten: ['Machine', 'Machine doppelt schnell'], fertig: ['Gong', 'Machine', 'Machine tief'] })
  setzeEigeneToene('C:/x/brostatus/toene', { warten: ['Machine'], fertig: ['Machine'] })
  try {
    expect(soundOptions('warten').map((o: any) => o.value)).toEqual(['doppelton', 'klingel', 'dreiklang', 'eigen:Machine'])
    expect(soundAsset('warten', 'eigen:Machine')).toBe('C:/x/brostatus/toene/warten-Machine.wav')
    // ein eigener Ton, den es nicht gibt, faellt auf den ersten eingebauten zurueck
    expect(soundAsset('fertig', 'eigen:Fehlt')).toBe('sounds/fertig-glocke.wav')
  } finally {
    setzeEigeneToene(null, { warten: [], fertig: [] })
  }
})

test('Eigene Töne: liegen welche im Ordner toene, werden sie einmal zum Standard, die eingebauten bleiben wählbar', async ($, on) => {
  mock.clock(on)
  const { store } = cacheStubs(on, () => null, () => null)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 200000, percent: 1 }, rateLimits: [], cost: { usd: 1 } } }))
  on('fs.list', ($: any, e: any) => (String(e.path).endsWith('toene') ? { value: [{ name: 'warten-Machine.wav', kind: 'file' }, { name: 'fertig-Machine.wav', kind: 'file' }] } : { deny: 'nicht gefunden' }))
  try {
    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
    const cfg = store.get('cache-cfg') as any
    expect([cfg.soundWait, cfg.soundDone, cfg.eigenStandard]).toEqual(['eigen:Machine', 'eigen:Machine', true])
    const ui = await $.ui.mount({ ...DESK })
    await ui.press({ key: 'bro-more' })
    const sel = await ui.find({ type: 'Select', key: 'bro-sound-wait' }) as any
    expect(sel.props.options.map((o: any) => o.label)).toEqual(['Doppelton', 'Klingel', 'Dreiklang', 'Machine'])
    await ui.select({ plugin: 'bro-status', key: 'bro-sound-wait', value: 'klingel' })
    expect((store.get('cache-cfg') as any).soundWait).toBe('klingel')
    await ui.unmount()
  } finally {
    setzeEigeneToene(null, { warten: [], fertig: [] })
  }
})

test('Frage-Auswahl (AskUserQuestion): wartet sofort auf dich, mit Ton', async ($, on) => {
  mock.clock(on)
  statusStubs(on)
  const played = soundStubs(on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await $.turn.start({ turnId: 't1' } as any)
  await $.ui.render({ component: 'AskUserQuestion', surface: 'desktop', props: { tool: 'AskUserQuestion', questions: [] } } as any).catch(() => {})
  const ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: '‖ wartet auf dich' })).toBeDefined()
  await ui.unmount()
  expect(played).toEqual(['sounds/warten-doppelton.wav'])
})

function soundStubs(on: any) {
  const played: string[] = []
  on('audio.play', ($: any, e: any) => { played.push(e.clip.asset); return { value: undefined } })
  // Unter Windows spielt die Mod über PowerShell statt über audio.play
  on('process.run', ($: any, e: any) => {
    const wav = String((e.init && e.init.env && e.init.env.BRO_WAV) || '')
    if (wav) played.push(wav.slice(wav.lastIndexOf('sounds')).replace(/\\/g, '/'))
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  return played
}

test('Ton: Desktop spielt bei „wartet auf dich“ den Warnton, nach langer Arbeit leise „fertig“, nicht nach kurzer', async ($, on) => {
  const clock = mock.clock(on)
  statusStubs(on)
  const played = soundStubs(on)
  on('tool.check', () => ({ decision: 'ask' }))
  on('ui.notice', () => ({ value: undefined }))
  let finish: () => void = () => {}
  const finished = new Promise<void>((r) => { finish = r })
  on('classic.PermissionRequest', async () => {
    await finished
    return { decision: { behavior: 'allow' } }
  })
  on('tool.call', async () => {
    await finished
    return { result: 'ok' }
  })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await $.turn.start({ turnId: 't1' } as any)
  const call = $.tool.call({ tool: 'Bash', command: 'git push' } as any)
  await clock.advance((CHECK_PROBE_S + 1) * 1000)
  finish()
  await call
  expect(played).toEqual(['sounds/warten-doppelton.wav'])
  // kurze Antwort: kein „fertig“-Ton
  await clock.advance(5000)
  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 5000, isAborted: false } as any)
  expect(played).toEqual(['sounds/warten-doppelton.wav'])
  // lange Antwort: leiser Ton
  await $.turn.start({ turnId: 't2' } as any)
  await clock.advance(20000)
  await $.turn.complete({ turnId: 't2', answer: 'ok', durationMs: 20000, isAborted: false } as any)
  // ohne Statusdatei von hook.py kommt der Fertig-Ton nach den Versuchen (gut 6 s)
  await clock.advance(7000)
  expect(played).toEqual(['sounds/warten-doppelton.wav', 'sounds/fertig-glocke.wav'])
})

test('Ton wiederholen: Auswahl unter Mehr, wird gespeichert', async ($, on) => {
  mock.clock(on)
  const { store } = statusStubs(on)
  soundStubs(on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...DESK })
  await ui.press({ key: 'bro-more' })
  expect(await ui.find({ type: 'Select', key: 'bro-sound-repeat' })).toBeDefined()
  await ui.select({ plugin: 'bro-status', key: 'bro-sound-repeat', value: '120' })
  expect((store.get('cache-cfg') as any).soundRepeat).toBe(120)
  await ui.unmount()
})

test('Ton wiederholen: im gewählten Takt höchstens 3-mal, hört bei einer eigenen Nachricht auf', { timeoutMs: 60000 }, async ($, on) => {
  const clock = mock.clock(on)
  const { store } = statusStubs(on)
  on('prompt.submit', () => ({ text: '' }))
  on('ui.notice', () => ({ value: undefined }))
  const played = soundStubs(on)
  store.set('cache-cfg', { sound: true, soundDone: 'glocke', soundMin: 15, soundRepeat: 120 })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  // kurze erste Runde (wie im Ton-Test oben): noch kein Fertig-Ton
  await $.turn.start({ turnId: 't0' } as any)
  await clock.advance(1000)
  await $.turn.complete({ turnId: 't0', answer: 'ok', durationMs: 1000, isAborted: false } as any)
  expect(played.length).toBe(0)
  // lange Arbeit, fertig: Ton, dann alle 2 min noch einmal, höchstens 3-mal
  await $.turn.start({ turnId: 't1' } as any)
  await clock.advance(20000)
  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 20000, isAborted: false } as any)
  await clock.advance(7000) // erster Ton nach gut 6 s (keine Statusdatei von hook.py)
  expect(played.length).toBe(1)
  await clock.advance(118000)
  expect(played.length).toBe(1)
  await clock.advance(2000)
  expect(played.length).toBe(2)
  await clock.advance(10 * 120000)
  expect(played).toEqual(Array(4).fill('sounds/fertig-glocke.wav'))
  // nächste Runde: nach einer Wiederholung schreibst du etwas, dann kommt keine mehr
  await $.turn.start({ turnId: 't2' } as any)
  await clock.advance(20000)
  await $.turn.complete({ turnId: 't2', answer: 'ok', durationMs: 20000, isAborted: false } as any)
  await clock.advance(7000)
  await clock.advance(121000)
  expect(played.length).toBe(6)
  await $.prompt.submit({ text: 'weiter', asUser: true } as any)
  await clock.advance(10 * 120000)
  expect(played.length).toBe(6)
})

test('Ton: Oberfläche aus dem Panel lesen, wenn session.start sie nicht lieferte', async ($, on) => {
  mock.clock(on)
  statusStubs(on)
  const played = soundStubs(on)
  await $.session.start({ isInteractive: true, cwd: '/work' } as any)
  const ui = await $.ui.mount({ ...DESK })
  await ui.press({ key: 'bro-more' })
  await ui.press({ key: 'bro-sound-test-wait' })
  expect(played).toEqual(['sounds/warten-doppelton.wav'])
  await ui.unmount()
})

test('Ton: Schalter schaltet aus, im Terminal gibt es keinen Ton', async ($, on) => {
  const clock = mock.clock(on)
  statusStubs(on)
  const played = soundStubs(on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Button', key: 'bro-sound' })).toBeDefined()
  // Leuchte: gruen = an, rot = aus
  expect(((await ui.findAll({ type: 'Text', text: /^●$/ })).pop() as any).props.color).toBe('#22c55e')
  await ui.press({ key: 'bro-sound' }) // aus
  expect(((await ui.findAll({ type: 'Text', text: /^●$/ })).pop() as any).props.color).toBe('#ef4444')
  expect(played).toEqual([])
  await $.turn.start({ turnId: 't1' } as any)
  await clock.advance(20000)
  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 20000, isAborted: false } as any)
  expect(played).toEqual([])
  await ui.press({ key: 'bro-sound' }) // an: Hörprobe
  expect(played).toEqual(['sounds/fertig-glocke.wav'])
  await ui.unmount()
})

test('Ton: Einstellungen unter Mehr, Auswahl spielt eine Probe und bleibt gespeichert', async ($, on) => {
  mock.clock(on)
  const { store } = cacheStubs(on, () => null, () => null)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 200000, percent: 1 }, rateLimits: [], cost: { usd: 1 } } }))
  on('turn.start', ($: any, e: any) => ({ turnId: e.turnId }))
  const played = soundStubs(on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  let ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Select', key: 'bro-sound-wait' })).toBeUndefined()
  await ui.press({ key: 'bro-more' })
  expect(await ui.find({ type: 'Select', key: 'bro-sound-wait' })).toBeDefined()
  expect(await ui.find({ type: 'Select', key: 'bro-sound-done' })).toBeDefined()
  expect(await ui.find({ type: 'Select', key: 'bro-sound-min' })).toBeDefined()
  await ui.select({ plugin: 'bro-status', key: 'bro-sound-wait', value: 'klingel' })
  expect(played).toEqual(['sounds/warten-klingel.wav'])
  await ui.select({ plugin: 'bro-status', key: 'bro-sound-done', value: 'tick' })
  expect(played).toEqual(['sounds/warten-klingel.wav', 'sounds/fertig-tick.wav'])
  const cfg = store.get('cache-cfg') as any
  expect([cfg.soundWait, cfg.soundDone]).toEqual(['klingel', 'tick'])
  // auch bei ausgeschaltetem Ton gibt es die Probe, sonst kann man nichts auswählen
  await ui.press({ key: 'bro-sound' })
  await ui.select({ plugin: 'bro-status', key: 'bro-sound-wait', value: 'dreiklang' })
  expect(played[played.length - 1]).toBe('sounds/warten-dreiklang.wav')
  // Test-Knöpfe spielen den gewählten Ton, auch bei ausgeschaltetem Ton
  await ui.press({ key: 'bro-sound-test-done' })
  expect(played[played.length - 1]).toBe('sounds/fertig-tick.wav')
  await ui.press({ key: 'bro-sound-test-wait' })
  expect(played[played.length - 1]).toBe('sounds/warten-dreiklang.wav')
  await ui.unmount()
})

test('Sprachen: jede Sprache hat alle Texte der deutschen Vorlage, die festen Schlusszeilen bleiben gleich', () => {
  expect(SPRACHEN.map(([k]) => k)).toEqual(['de', 'en', 'es', 'it', 'fr'])
  for (const [k] of SPRACHEN) {
    const tx = TEXTE[k] as any
    expect(Object.keys(tx).sort()).toEqual(Object.keys(TEXTE.de).sort())
    for (const key of Object.keys(TEXTE.de) as string[]) {
      const de = (TEXTE.de as any)[key]
      expect(typeof tx[key]).toBe(typeof de)
      if (typeof de === 'function') expect(tx[key].length).toBe(de.length)
      if (Array.isArray(de)) expect(tx[key].length).toBe(de.length)
      if (typeof de === 'string') expect(tx[key].trim()).not.toBe('')
    }
    // Schlusszeilen, die Claude schreiben soll und die eingelesen werden
    for (const key of ['fzRules', 'fzClose']) for (const w of ['FEIERABEND: gespeichert', 'FEIERABEND: nicht gespeichert']) expect(tx[key]).toContain(w)
    expect(tx.fzRules).toContain('FEIERABEND: weiter')
    expect(tx.fzRules).toContain('FEIERABEND: wartet')
    for (const key of ['compactText', 'modelText']) for (const w of ['COMPACT: gespeichert', 'COMPACT: nicht gespeichert']) expect(tx[key]).toContain(w)
  }
  // Unbekannte Sprache fällt auf Deutsch zurück
  setLang('xx')
  expect(t('fzStart')).toBe('Einleiten')
  setLang('de')
})

test('Sprache: Auswahl unter Mehr wechselt Panel und Meldungen und bleibt gespeichert', async ($, on) => {
  mock.clock(on)
  const { store, files } = cacheStubs(on, () => null, () => null)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 200000, percent: 1 }, rateLimits: [], cost: { usd: 1 } } }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  // Statusline und hook.py lesen die Sprache aus state/sprache.json
  const sprache = () => JSON.parse([...files.entries()].find(([k]) => k.endsWith('sprache.json'))![1]).lang
  expect(sprache()).toBe('de')
  const ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: 'Cache warmhalten' })).toBeDefined()
  expect(await ui.find({ type: 'Select', key: 'bro-lang' })).toBeUndefined()
  await ui.press({ key: 'bro-more' })
  const sel = await ui.find({ type: 'Select', key: 'bro-lang' }) as any
  expect(sel.props.options.map((o: any) => o.label)).toEqual(['Deutsch', 'English', 'Español', 'Italiano', 'Français'])
  expect(sel.props.value).toBe('de')
  await ui.select({ plugin: 'bro-status', key: 'bro-lang', value: 'fr' })
  expect((store.get('cache-cfg') as any).lang).toBe('fr')
  expect(sprache()).toBe('fr')
  expect(await ui.find({ type: 'Text', text: 'Garder le cache chaud' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Cache warmhalten' })).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: 'bro-feierabend' })).text).toBe('Lancer')
  await ui.select({ plugin: 'bro-status', key: 'bro-lang', value: 'en' })
  expect(await ui.find({ type: 'Text', text: 'Keep cache warm' })).toBeDefined()
  await ui.select({ plugin: 'bro-status', key: 'bro-lang', value: 'de' })
  expect(await ui.find({ type: 'Text', text: 'Cache warmhalten' })).toBeDefined()
  expect((store.get('cache-cfg') as any).lang).toBe('de')
  await ui.unmount()
})

test('Sprache: die gespeicherte Wahl gilt beim nächsten Start', async ($, on) => {
  mock.clock(on)
  const { store } = cacheStubs(on, () => null, () => null)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 200000, percent: 1 }, rateLimits: [], cost: { usd: 1 } } }))
  store.set('cache-cfg', { lang: 'es' })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: 'Mantener caché caliente' })).toBeDefined()
  await ui.unmount()
  setLang('de')
})

test('Ton: Datei je Art und Auswahl, Unbekanntes fällt auf den ersten Ton zurück', () => {
  expect(soundAsset('warten', 'klingel')).toBe('sounds/warten-klingel.wav')
  expect(soundAsset('fertig', 'tick')).toBe('sounds/fertig-tick.wav')
  expect(soundAsset('warten', 'quatsch')).toBe('sounds/warten-doppelton.wav')
  expect(soundAsset('fertig', undefined)).toBe('sounds/fertig-glocke.wav')
})

test('Ton: im Terminal kein Schalter und kein Ton', async ($, on) => {
  const clock = mock.clock(on)
  statusStubs(on)
  const played = soundStubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  const ui = await $.ui.mount({ ...PANE })
  expect(await ui.find({ type: 'Button', key: 'bro-sound' })).toBeUndefined()
  await $.turn.start({ turnId: 't1' } as any)
  await clock.advance(20000)
  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 20000, isAborted: false } as any)
  expect(played).toEqual([])
  await ui.unmount()
})

test('Diamant: Farbe wie in der Statusline, im Terminal als Braille', async ($, on) => {
  mock.clock(on)
  statusStubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  const ui = await $.ui.mount({ ...PANE })
  const gem = await ui.find({ type: 'Text', text: '⠈⠪⡙⡍⠉⢩⢋⠕⠁' })
  expect(gem).toBeDefined()
  // Kontext 58 %: orange wie in der Statusline
  expect(gem.props.color).toBe('#f97316')
  await ui.unmount()
  expect(gemColor('arbeitet', 20, {})).toBe('#3b82f6')
  expect(gemColor('wartet', 60, {})).toBe('#cbd5e1')
  expect(gemColor('fertig', 20, { urgent: true })).toBe('#ef4444')
  expect(gemColor('bereit', null, {})).toBe('#22c55e')
})

// ---------- Nur Knöpfe ----------

test('Kein Knopf in Panel und Band hat ein Tastenkürzel', async ($, on) => {
  mock.clock(on)
  const { opened } = statusStubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  // /bro öffnet ohne Fokus: Tippen geht weiter ins Eingabefeld
  expect(opened[0].focus).toBeUndefined()
  let ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'bro-more' })
  for (const key of ['bro-keep', 'bro-compact', 'bro-feierabend', 'bro-more']) {
    const b = await ui.find({ type: 'Button', key })
    expect(b).toBeDefined()
    expect(b.props.hotkey).toBeUndefined()
  }
  expect(await ui.find({ type: 'Button', key: 'bro-cache-hide' })).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: 'bro-keep' })).text).toMatch(/^Aus$/)
  // Leuchte vor jedem Schalter: rot = aus
  expect(((await ui.findAll({ type: 'Text', text: /^●$/ }))[0] as any).props.color).toBe('#ef4444')
  await ui.unmount()
  await $.turn.complete({ turnId: 't1', answer: ANSWER, durationMs: 1000, isAborted: false, usage: null } as any)
  ui = await $.ui.mount({ ...BAND })
  for (const key of ['bro-send', 'bro-hide', 'bro-item-1', 'bro-item-2']) {
    const b = await ui.find({ type: 'Button', key })
    expect(b).toBeDefined()
    expect(b.props.hotkey).toBeUndefined()
  }
  expect((await ui.find({ type: 'Button', key: 'bro-send' })).props.label).toBe('Send')
  await ui.unmount()
})

// ---------- Auto-Compact ----------

test('Auto-Compact: erst nahe der Grenze nötig', () => {
  expect(compactTrigger(160000, 200000)).toBe(136000)
  expect(compactTrigger(0, 200000)).toBe(153000)
  expect(compactNeeded(135999, 160000, 200000)).toBe(false)
  expect(compactNeeded(136000, 160000, 200000)).toBe(true)
  expect(compactNeeded(undefined, 160000, 200000)).toBe(false)
  expect(feierabendResult('x\nCOMPACT: nicht gespeichert – Test rot', 'COMPACT')).toEqual({ saved: false, reason: 'Test rot', weiter: false })
})

function compactStubs(on: any, ctx: { tokens: number }) {
  const s = feierabendStubs(on)
  const compacts: any[] = []
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: ctx.tokens, window: 200000, percent: Math.round(ctx.tokens / 2000), breakdown: { isAutoCompactEnabled: true, autoCompactThreshold: 160000 } }, rateLimits: [], cost: { usd: 1 } } }))
  on('session.compact', ($: any, e: any) => { compacts.push(e); ctx.tokens = 20000; return { messages: [{ role: 'user', text: 'Zusammenfassung', toolUses: [] }] } })
  return { ...s, compacts }
}

test('Auto-Compact: wählbare Schwelle 50, 60, 70 Prozent, 82 bleibt der Standard', () => {
  expect(compactTrigger(160000, 200000, 50)).toBe(100000)
  expect(compactTrigger(160000, 200000, 60)).toBe(120000)
  expect(compactTrigger(160000, 200000, 70)).toBe(140000)
  // 82 und ohne Angabe: Grenze von Claude Code minus Reserve wie bisher
  expect(compactTrigger(160000, 200000, 82)).toBe(136000)
  expect(compactTrigger(160000, 200000)).toBe(136000)
  expect(compactNeeded(120000, 160000, 200000, 60)).toBe(true)
  expect(compactNeeded(119999, 160000, 200000, 60)).toBe(false)
  expect(compactNeeded(120000, 160000, 200000)).toBe(false)
})

test('Auto-Compact: Schwelle unter Mehr wählen, wird gespeichert und im Panel gezeigt', async ($, on) => {
  mock.clock(on)
  const { store } = cacheStubs(on, () => null, () => null)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 200000, percent: 1 }, rateLimits: [], cost: { usd: 1 } } }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...DESK })
  await ui.press({ key: 'bro-compact' })
  // ohne Angabe von Claude Code gilt 90 % des Fensters minus 15 % Reserve = 76,5 %, angezeigt als 77 %
  expect((await ui.find({ type: 'Box', key: 'bro-compact-text' })).text).toMatch(/ab 77 %/)
  await ui.press({ key: 'bro-more' })
  const sel = await ui.find({ type: 'Select', key: 'bro-compact-at' }) as any
  expect(sel.props.options.map((o: any) => o.label)).toEqual(['50 %', '60 %', '70 %', '82 % (Standard)'])
  expect(sel.props.value).toBe('82')
  await ui.select({ plugin: 'bro-status', key: 'bro-compact-at', value: '60' })
  expect((store.get('cache-cfg') as any).compactAt).toBe(60)
  expect((await ui.find({ type: 'Box', key: 'bro-compact-text' })).text).toMatch(/ab 60 %/)
  await ui.select({ plugin: 'bro-status', key: 'bro-compact-at', value: '82' })
  expect((store.get('cache-cfg') as any).compactAt).toBe(82)
  await ui.unmount()
})

test('Auto-Compact: aus oder nicht nötig → nichts passiert', async ($, on) => {
  mock.clock(on)
  const ctx = { tokens: 150000 }
  const { sent, compacts } = compactStubs(on, ctx)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.turn.complete(TURN('fertig'))
  expect(sent.length).toBe(0)
  await $.command.run({ command: 'bro', args: '' })
  const ui = await $.ui.mount({ ...PANE })
  ctx.tokens = 100000
  await ui.press({ key: 'bro-compact' })
  await $.turn.complete(TURN('fertig'))
  expect(sent.length).toBe(0)
  expect(compacts.length).toBe(0)
  expect((await ui.find({ type: 'Box', key: 'bro-compact-text' })).text).toMatch(/● ab 68 %/)
  await ui.unmount()
})

test('Auto-Compact: nötig → speichern, kompaktieren, weitermachen', async ($, on) => {
  const clock = mock.clock(on)
  const ctx = { tokens: 100000 }
  const { sent, compacts, store } = compactStubs(on, ctx)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'bro-compact' })
  expect((store.get('cache-cfg') as any).compact).toBe(true)
  ctx.tokens = 140000
  await $.turn.complete(TURN('Schritt fertig'))
  expect(sent.length).toBe(1)
  expect(sent[0].text).toMatch(/^Auto-Compact:/)
  expect(sent[0].origin.asUser).toBe(true)
  expect(await ui.find({ type: 'Text', text: 'speichert …' })).toBeDefined()
  await $.turn.complete(TURN('Gespeichert.\nCOMPACT: gespeichert'))
  expect(compacts.length).toBe(0)
  await clock.advance(100)
  expect(compacts.length).toBe(1)
  expect(compacts[0].instructions).toMatch(/^Behalte:/)
  expect(sent.length).toBe(2)
  expect(sent[1].text).toBe('Mach dort weiter, wo du vor dem Kompaktieren warst.')
  expect(await ui.find({ type: 'Text', text: '✓ kompaktiert' })).toBeDefined()
  // nach dem Kompaktieren ist wieder Platz: kein zweites Mal
  await $.turn.complete(TURN('weiter gearbeitet'))
  expect(sent.length).toBe(2)
  await ui.unmount()
})

test('Modellwechsel vorbereiten: speichern, kompaktieren, Warmhalten aus, danach wartet Claude auf dich', async ($, on) => {
  const clock = mock.clock(on)
  const ctx = { tokens: 100000 }
  const { sent, compacts, store } = compactStubs(on, ctx)
  const notices: string[] = []
  on('ui.log', ($: any, e: any) => { if (e.to === 'transcript') notices.push(e.text); return { value: undefined } })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'bro-keep' }) // Warmhalten an
  expect((store.get('cache-cfg') as any).enabled).toBe(true)
  const knopf = await ui.find({ type: 'Button', key: 'bro-modell' })
  expect(knopf.props.hotkey).toBeUndefined()
  await ui.press({ key: 'bro-modell' })
  await ui.press({ key: 'bro-modell' }) // zweiter Klick schickt nichts doppelt
  expect((store.get('cache-cfg') as any).enabled).toBe(false)
  expect(sent.length).toBe(1)
  expect(sent[0].text).toMatch(/^Modellwechsel:/)
  expect(sent[0].origin.asUser).toBe(true)
  await $.turn.complete(TURN('Gespeichert.\nCOMPACT: gespeichert'))
  await clock.advance(100)
  expect(compacts.length).toBe(1)
  expect(compacts[0].instructions).toMatch(/^Behalte:/)
  // kein „Mach weiter“: das neue Modell wählst du selbst
  expect(sent.length).toBe(1)
  expect(await ui.find({ type: 'Text', text: /Fertig – jetzt Modell wählen/ })).toBeDefined()
  // Im Panel nur der kurze Satz, ohne langen Grund
  expect((await ui.find({ type: 'Text', text: /Fertig – jetzt Modell wählen/ }) as any).text).toBe('Fertig – jetzt Modell wählen.')
  // Im Chat steht Ergebnis und nächster Schritt (gedimmte Zeile per ui.log, Claude liest sie nicht)
  expect(notices).toEqual(['COMPACT: gespeichert | Du kannst das Modell jetzt wechseln'])
  await ui.unmount()
})

test('Desktop-App: die Fehlermeldung „nicht verfügbar in einer Sitzung ohne Terminal“ wird erkannt', () => {
  expect(needsPromptCompact(new Error('$.session.compact: not available in a headless (-p / SDK) session yet: compaction here runs inside a turn (a /compact prompt)'))).toBe(true)
  expect(needsPromptCompact('bro-status: $.session.compact: not available in a headless session')).toBe(true)
  expect(needsPromptCompact(new Error('Prompt ist zu lang'))).toBe(false)
  expect(needsPromptCompact(null)).toBe(false)
})

test('Auto-Compact: Fehler zeigt den Grund unter dem Schalter und versucht es nicht bei jeder Antwort neu', async ($, on) => {
  const clock = mock.clock(on)
  const ctx = { tokens: 100000 }
  const { sent } = feierabendStubs(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: ctx.tokens, window: 200000, percent: Math.round(ctx.tokens / 2000), breakdown: { isAutoCompactEnabled: true, autoCompactThreshold: 160000 } }, rateLimits: [], cost: { usd: 1 } } }))
  let versuche = 0
  on('session.compact', () => { versuche++; return { skip: 'Prompt ist zu lang' } })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'bro-compact' })
  ctx.tokens = 140000
  await $.turn.complete(TURN('Schritt fertig'))
  await $.turn.complete(TURN('Gespeichert.\nCOMPACT: gespeichert'))
  await clock.advance(100)
  expect(versuche).toBe(1)
  expect(await ui.find({ type: 'Text', text: '✕ Fehler' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Prompt ist zu lang' })).toBeDefined()
  // die nächste Antwort löst keinen neuen Speicher-Auftrag aus
  const vorher = sent.length
  await $.turn.complete(TURN('weiter gearbeitet'))
  expect(sent.length).toBe(vorher)
  expect(versuche).toBe(1)
  await ui.unmount()
})

test('Auto-Compact: wartet nicht, solange ein Feierabend läuft', async ($, on) => {
  mock.clock(on)
  const ctx = { tokens: 100000 }
  const { sent } = compactStubs(on, ctx)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  const ui = await $.ui.mount({ ...PANE })
  await ui.press({ key: 'bro-compact' })
  ctx.tokens = 150000
  await ui.press({ key: 'bro-feierabend' })
  expect(sent.length).toBe(1)
  await $.turn.complete(TURN('FEIERABEND: gespeichert'))
  expect(sent.length).toBe(1)
  await ui.unmount()
})

// ---------- Panel-Anordnung ----------

const SCHMAL = { ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 30 } } as const

for (const [name, mount] of [['Terminal', PANE], ['Desktop schmal', SCHMAL]] as const) {
  test('Panel-Anordnung (' + name + '): drei Kreise, Schalter-Liste, Mehr ohne Doppeltes, kein Exit', async ($, on) => {
    mock.clock(on)
    const { store } = statusStubs(on)
    await $.session.start({ surface: mount.surface === 'desktop' ? 'desktop' : 'terminal', isInteractive: true, cwd: '/work' })
    const ui = await $.ui.mount({ ...mount })
    // Alle Status-Zeilen haben dieselbe Beschriftungsbreite
    for (const k of ['kontext', 'limit', 'aktiv', 'dateien']) expect((await ui.find({ type: 'Box', key: k + '-lb' })).props.width).toBe(8)
    const big = await ui.find({ type: 'Box', key: 'big' })
    expect(big.text).toContain('Cache')
    expect(big.text).toContain('letzte Anfrage')
    expect(big.text).toContain('Sitzung')
    expect(big.text).not.toContain('▱')
    // Je Modus eine Zeile: Name links, Schalter rechts, untereinander
    const auto = await ui.find({ type: 'Box', key: 'auto' })
    expect(auto.props.flexDirection).toBe('column')
    expect(JSON.stringify(auto).match(/"key":"bro-(keep|compact|feierabend)"/g)).toEqual(['bro-keep', 'bro-compact', 'bro-feierabend'].map((k) => '"key":"' + k + '"'))
    for (const [k, n] of [['bro-keep', 'Cache warmhalten'], ['bro-compact', 'Auto-Compact'], ['bro-feierabend', 'Feierabend']]) {
      const row = await ui.find({ type: 'Box', key: k + '-box' })
      expect(row.props.flexDirection).toBe('row')
      expect(row.props.justifyContent).toBe('space-between')
      expect((await ui.find({ type: 'Box', key: k + '-text' })).text.startsWith(n)).toBe(true)
      const b = await ui.find({ type: 'Button', key: k })
      expect(b.props.label).toBe(k === 'bro-feierabend' ? 'Einleiten' : 'Aus')
      expect(b.props.variant).toBe('secondary')
    }
    expect((await ui.find({ type: 'Box', key: 'bro-keep-text' })).text).toContain('hält den Prompt-Cache warm')
    expect((await ui.find({ type: 'Box', key: 'bro-compact-text' })).text).toContain('fasst zusammen, bevor der Kontext voll ist')
    expect((await ui.find({ type: 'Box', key: 'bro-feierabend-text' })).text).toContain('Plan abarbeiten, dann speichern')
    expect(await ui.find({ type: 'Button', key: 'bro-warm-now' })).toBeUndefined()
    // Kein Exit mehr; Erklaerungen und Auswahlfelder erst unter Mehr
    expect(await ui.find({ type: 'Button', key: 'bro-cache-hide' })).toBeUndefined()
    expect(await ui.find({ key: 'bro-lead' })).toBeUndefined()
    await ui.press({ key: 'bro-keep' })
    expect((store.get('cache-cfg') as any).enabled).toBe(true)
    const keep = await ui.find({ type: 'Button', key: 'bro-keep' })
    expect(keep.props.label).toBe('An')
    expect(keep.props.variant).toBe('primary')
    expect((await ui.find({ type: 'Button', key: 'bro-more' })).props.label).toBe('Mehr ▸')
    await ui.press({ key: 'bro-more' })
    expect((await ui.find({ type: 'Button', key: 'bro-more' })).props.label).toBe('Mehr ▾')
    const info = await ui.find({ type: 'Box', key: 'more-info' })
    expect(info.text).not.toContain('Exit')
    // Nichts doppelt: keine Erklaerungssaetze und kein Warte-Hinweis unter Mehr
    expect(info.text).not.toContain('Cache: ')
    expect(info.text).not.toMatch(/[Ww]artet auf Cache-Daten/)
    expect(await ui.find({ type: 'Button', key: 'bro-cache-hide' })).toBeUndefined()
    // Beide Felder sind erklaert, die Auswahl zeigt echte Zeiten (hier 5-min-Cache aus der Brueckendatei oder 1 h geschaetzt)
    const help = await ui.find({ type: 'Box', key: 'opts-help' })
    expect(help.text).toContain('Auffrischen: wie lange vor Ablauf')
    expect(help.text).toContain('Stopp: wann das Warmhalten aufhört')
    expect((await ui.find({ key: 'bro-lead' })).props.options[0].label).toMatch(/^automatisch · /)
    expect((await ui.find({ key: 'bro-lead' })).props.label).toBe(mount.surface === 'desktop' ? 'Auffrischen' : 'Auffrischen vor Ablauf')
    await ui.unmount()
  })
}

test('Lautstärke: Standard 50 %, vier feste Stufen', () => {
  expect(SOUND_VOLUME_DEFAULT).toBe(50)
  expect(SOUND_VOLUMES).toEqual(['25', '50', '75', '100'])
  expect(soundVolume()).toBe(50)
})

test('Machine-Varianten erscheinen je für warten und fertig, der Grundton zuerst', () => {
  const namen = ['Einzelton', 'Doppelton', 'Dreifachton', 'doppelt schnell', 'leise']
  const dateien = ['Machine', ...namen.map((n) => 'Machine ' + n)].flatMap((n) => ['warten-' + n + '.wav', 'fertig-' + n + '.wav'])
  const l = eigeneAusListe(dateien)
  for (const art of ['warten', 'fertig'] as const) {
    expect(l[art].length).toBe(6)
    expect(l[art][0]).toBe('Machine')
    for (const n of namen) expect(l[art]).toContain('Machine ' + n)
  }
})

// ---------- Befunde der Profi-Prüfung ----------

test('Prüfung: während der Auto-Prüfer prüft, steht „Auto prüft: …“, nicht die Werkzeug-Zeit', async ($, on) => {
  const clock = mock.clock(on)
  const { finish } = askStubs(on, { open: false })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await $.turn.start({ turnId: 't1' } as any)
  const call = $.tool.call({ tool: 'Bash', command: 'git push' } as any)
  await clock.advance(2000)
  const ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: 'Auto prüft: Bash git push' })).toBeDefined()
  await ui.unmount()
  finish()
  await call
})

test('Prüfung: braucht ein Hilfs-Agent eine Freigabe, steht „wartet auf dich“ mit Ton, bis sein Werkzeug fertig ist', async ($, on) => {
  const clock = mock.clock(on)
  const { finish } = askStubs(on, { open: true })
  const played = soundStubs(on)
  HOOK_STATE.value = { status: 'working', updated: Date.now() / 1000 }
  try {
    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
    await $.turn.start({ turnId: 't1' } as any)
    const call = $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'agent-1' } as any)
    HOOK_STATE.value = { status: 'waiting', updated: Date.now() / 1000 + 1 }
    await clock.advance(HOOK_POLL_MS + 100)
    let ui = await $.ui.mount({ ...DESK })
    expect(await ui.find({ type: 'Text', text: '‖ wartet auf dich' })).toBeDefined()
    await ui.unmount()
    expect(played).toEqual(['sounds/warten-doppelton.wav'])
    finish()
    await call
    ui = await $.ui.mount({ ...DESK })
    expect(await ui.find({ type: 'Text', text: '‖ wartet auf dich' })).toBeUndefined()
    await ui.unmount()
  } finally {
    HOOK_STATE.value = null
  }
})

test('Prüfung: endet die Antwort mit API-Fehler, steht „Fehler“ statt „fertig“, ohne Fertig-Ton', async ($, on) => {
  const clock = mock.clock(on)
  statusStubs(on)
  const played = soundStubs(on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(1000)
  await $.turn.start({ turnId: 't1' } as any)
  await clock.advance(20000)
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 20000, isAborted: false, reason: 'error' } as any)
  await clock.advance(6000)
  const ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: '✕ Fehler – Antwort nicht fertig' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '✓ fertig' })).toBeUndefined()
  await ui.unmount()
  expect(played).toEqual([])
})

test('Prüfung: Meldungen von Hintergrund-Aufgaben und anderen Sitzungen leeren das Antwort-Band nicht, deine Nachricht schon', async ($, on) => {
  mock.clock(on)
  feierabendStubs(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'bro', args: '' })
  await $.turn.complete({ turnId: 't1', answer: ANSWER, durationMs: 1000, isAborted: false, usage: null })
  await $.prompt.submit({ text: 'Aufgabe fertig', origin: { kind: 'task-notification' } } as any)
  await $.prompt.submit({ text: 'Hallo von nebenan', origin: { kind: 'peer' } } as any)
  let band = await $.ui.mount({ ...BAND })
  expect(await band.find({ key: 'bro-item-1' })).toBeDefined()
  await band.unmount()
  await $.prompt.submit({ text: 'mach weiter', origin: { kind: 'composer' } } as any)
  band = await $.ui.mount({ ...BAND })
  expect(await band.find({ key: 'bro-item-1' })).toBeUndefined()
  await band.unmount()
})

test('Prüfung: kennt session.start die Oberfläche nicht (Desktop-App), öffnet session.attach das Panel einmal', async ($, on) => {
  mock.clock(on)
  const { opened } = statusStubs(on)
  on('session.attach', ($: any, e: any) => ({ clientId: e.clientId }))
  await $.session.start({ surface: null, isInteractive: false, cwd: '/work' } as any)
  expect(opened.length).toBe(0)
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' } as any)
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:2' } as any)
  expect(opened.length).toBe(1)
})

test('Prüfung: nach /clear zeigt das Panel nicht mehr die Dateien des alten Gesprächs', async ($, on) => {
  mock.clock(on)
  statusStubs(on)
  on('tool.call', () => ({ result: 'ok' }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await $.turn.start({ turnId: 't1' } as any)
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'a', new_string: 'b' } as any).catch(() => {})
  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 1000, isAborted: false } as any)
  let ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: /app\.ts/ })).toBeDefined()
  await ui.unmount()
  await $.session.end({ reason: 'clear' } as any).catch(() => {})
  ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: /app\.ts/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '○ bereit' })).toBeDefined()
  await ui.unmount()
})

test('Prüfung: eine abgelehnte Änderung zählt nicht als geschrieben', async ($, on) => {
  mock.clock(on)
  statusStubs(on)
  on('tool.call', () => ({ deny: 'abgelehnt' }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await $.turn.start({ turnId: 't1' } as any)
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/app.ts', old_string: 'a', new_string: 'b' } as any).catch(() => {})
  await $.turn.complete({ turnId: 't1', answer: 'ok', durationMs: 1000, isAborted: false } as any)
  const ui = await $.ui.mount({ ...DESK })
  expect(await ui.find({ type: 'Text', text: /app\.ts/ })).toBeUndefined()
  await ui.unmount()
})

// ---------- Panel in der Desktop-App von selbst ----------

test('Desktop: ohne Oberfläche beim Start öffnet die Mod das Panel, sobald surfaces() die Desktop-App nennt', async ($, on) => {
  const clock = mock.clock(on)
  const { opened } = statusStubs(on)
  let list: string[] = []
  on('session.surfaces', () => ({ value: list }))
  await $.session.start({ surface: null, isInteractive: false, cwd: '/work' } as any)
  await clock.advance(3000)
  expect(opened.length).toBe(0)
  list = ['desktop']
  await clock.advance(1100)
  expect(opened.length).toBe(1)
  await clock.advance(5000)
  expect(opened.length).toBe(1)
})

test('Desktop: zeichnet die Desktop-App die Arbeitsanzeige, geht das Panel einmal auf; geschlossen bleibt es zu', async ($, on) => {
  const clock = mock.clock(on)
  const { opened } = statusStubs(on)
  on('session.surfaces', () => ({ value: [] }))
  on('ui.close', () => ({ value: undefined }))
  await $.session.start({ surface: null, isInteractive: false, cwd: '/work' } as any)
  await $.ui.render({ component: 'Spinner', surface: 'desktop', props: { word: 'Working', message: null, suffix: '…', mode: 'requesting' } } as any).catch(() => {})
  expect(opened.length).toBe(1)
  // du schliesst es mit /bro: es bleibt zu, auch beim naechsten Zeichnen
  await $.command.run({ command: 'bro', args: '' })
  await $.ui.render({ component: 'Spinner', surface: 'desktop', props: { word: 'Working', message: null, suffix: '…', mode: 'requesting' } } as any).catch(() => {})
  await clock.advance(5000)
  expect(opened.length).toBe(1)
})
