import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptSubmitResult } from 'claude-code'

const BAND = {
  plugin: 'prompt-enhancer',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

type Box = { draft: string; submitted: string[]; forkPrompt: string }

// Il fondo dell'engine simulato: casella di prompt, modello e un progetto vuoto.
function engine(on: On, box: Box, forkText: string, submit?: (text: string) => PromptSubmitResult | Promise<PromptSubmitResult>): void {
  on('prompt.read', () => ({ value: { text: box.draft, cursor: box.draft.length } }))
  on('prompt.fill', (_$, e) => {
    box.draft = e.text
    return { isFilled: true }
  })
  on('prompt.submit', (_$, e) => {
    if (submit) return submit(e.text)
    box.submitted.push(e.text)
    return { text: e.text }
  })
  on('model.fork', (_$, e) => {
    box.forkPrompt = e.prompt
    return { value: { isAnswered: true, text: forkText, usage: USAGE } }
  })
  on('session.cwd', () => ({ value: 'C:/progetto' }))
  on('session.usage', () => {
    throw new Error('non disponibile nel test')
  })
  on('fs.list', () => ({ value: [] }))
  on('fs.read', () => {
    throw new Error('assente')
  })
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('env.get', () => ({ value: undefined }))
  // Senza altre mod, sotto la nostra fascia c'è solo il segnaposto dell'engine.
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine', ref: 0 }))
}

async function mountBand($: Engine, surface: 'terminal' | 'desktop') {
  return $.ui.mount({ ...BAND, surface })
}

test('Migliora riscrive la bozza nella casella senza inviarla', async ($, on) => {
  const box: Box = { draft: 'aggiungi il login', submitted: [], forkPrompt: '' }
  engine(on, box, '```markdown\n## Obiettivo\nAggiungi il login.\n```')

  for (const surface of ['terminal', 'desktop'] as const) {
    box.draft = 'aggiungi il login'
    const ui = await mountBand($, surface)
    expect((await ui.find({ key: 'enhance' }))?.text).toContain('Migliora')
    expect((await ui.find({ key: 'send' }))?.text).toContain('Invia')

    await ui.press({ key: 'enhance' })

    expect(box.draft).toBe('## Obiettivo\nAggiungi il login.')
    expect(box.submitted).toEqual([])
    expect(box.forkPrompt).toContain('<bozza>\naggiungi il login\n</bozza>')
    expect(box.forkPrompt).toContain('## Decisioni da chiedermi prima di iniziare')
    await ui.unmount()
  }
})

test('Invia svuota la casella e invia la bozza come parole dell’utente', async ($, on) => {
  const box: Box = { draft: 'prompt finale', submitted: [], forkPrompt: '' }
  engine(on, box, 'non usato')

  const ui = await mountBand($, 'terminal')
  await ui.press({ key: 'send' })

  expect(box.submitted).toEqual(['prompt finale'])
  expect(box.draft).toBe('')
})

test('Perfeziona aggiunge le istruzioni da coach nascoste e invia la bozza', async ($, on) => {
  const box: Box = { draft: 'riassumi il file', submitted: [], forkPrompt: '' }
  engine(on, box, 'non usato')
  const session = mock.session(on)

  for (const surface of ['terminal', 'desktop'] as const) {
    box.draft = 'riassumi il file'
    box.submitted = []
    const before = session.appended().length
    const ui = await mountBand($, surface)
    expect((await ui.find({ key: 'refine' }))?.text).toContain('Perfeziona')

    await ui.press({ key: 'refine' })

    expect(box.draft).toBe('')
    expect(box.submitted).toHaveLength(1)
    expect(box.submitted[0]).toContain('<bozza>\nriassumi il file\n</bozza>')
    const rows = session.appended().slice(before)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.message.role).toBe('user')
    const hidden = JSON.stringify(rows[0]?.message.content)
    expect(hidden).toContain('una domanda alla volta')
    expect(hidden).toContain('claude-prompting-best-practices')
    await ui.unmount()
  }
})

test('Perfeziona conserva le modifiche scritte durante session.append e le segnala', async ($, on) => {
  const box: Box = { draft: 'riassumi il file', submitted: [], forkPrompt: '' }
  engine(on, box, 'non usato')
  const session = mock.session(on)
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  let entered!: () => void
  const appending = new Promise<void>(resolve => { entered = resolve })
  on('session.append', { door: 'note' }, async (_$, e, next) => {
    entered()
    await waiting
    return next(e)
  })

  const ui = await mountBand($, 'terminal')
  const pressing = ui.press({ key: 'refine' })
  await appending
  box.draft = 'riassumi il file e aggiungi le conclusioni'
  release()
  await pressing

  expect(box.draft).toBe('riassumi il file e aggiungi le conclusioni')
  expect(box.submitted).toHaveLength(1)
  expect(box.submitted[0]).toContain('<bozza>\nriassumi il file\n</bozza>')
  expect(session.appended()).toHaveLength(1)
  expect(toasts.join('\n')).toMatch(/modific|cambiat|conservat/i)
})

test('Perfeziona recupera la bozza se submit rifiuta e segnala le istruzioni già aggiunte', async ($, on) => {
  const box: Box = { draft: 'riassumi il file', submitted: [], forkPrompt: '' }
  engine(on, box, 'non usato', () => ({ drop: 'invio rifiutato nel test' }))
  const session = mock.session(on)
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  const ui = await mountBand($, 'terminal')
  await ui.press({ key: 'refine' })

  expect(box.draft).toBe('riassumi il file')
  expect(box.submitted).toEqual([])
  expect(session.appended()).toHaveLength(1)
  expect(toasts.join('\n')).toMatch(/fallit|rifiutat|errore|impossibile/i)
  expect(toasts.join('\n')).toMatch(/istruzioni.*già.*conversazione/i)
})

test('Perfeziona recupera la bozza se submit solleva un errore e lo segnala', async ($, on) => {
  const box: Box = { draft: 'riassumi il file', submitted: [], forkPrompt: '' }
  engine(on, box, 'non usato', () => { throw new Error('invio fallito nel test') })
  const session = mock.session(on)
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  const ui = await mountBand($, 'terminal')
  await ui.press({ key: 'refine' })

  expect(box.draft).toBe('riassumi il file')
  expect(session.appended()).toHaveLength(1)
  expect(toasts.join('\n')).toMatch(/fallit|rifiutat|errore|impossibile/i)
  expect(toasts.join('\n')).toMatch(/istruzioni.*già.*conversazione/i)
})

test('Perfeziona non sovrascrive il testo scritto durante un invio che fallisce', async ($, on) => {
  const box: Box = { draft: 'riassumi il file', submitted: [], forkPrompt: '' }
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  let entered!: () => void
  const submitting = new Promise<void>(resolve => { entered = resolve })
  engine(on, box, 'non usato', async () => {
    entered()
    await waiting
    return { drop: 'invio rifiutato nel test' }
  })
  const session = mock.session(on)
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  const ui = await mountBand($, 'terminal')
  const pressing = ui.press({ key: 'refine' })
  await submitting
  box.draft = 'una nuova richiesta'
  release()
  await pressing

  expect(box.draft).toBe('una nuova richiesta')
  expect(session.appended()).toHaveLength(1)
  expect(toasts.join('\n')).toMatch(/fallit|rifiutat|errore|impossibile/i)
  expect(toasts.join('\n')).toMatch(/istruzioni.*già.*conversazione/i)
})

test('Perfeziona con bozza invariata svuota la casella e invia esattamente la bozza letta', async ($, on) => {
  const box: Box = { draft: '  riassumi il file\n', submitted: [], forkPrompt: '' }
  engine(on, box, 'non usato')
  const session = mock.session(on)
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  const ui = await mountBand($, 'terminal')
  await ui.press({ key: 'refine' })

  expect(box.draft).toBe('')
  expect(box.submitted).toHaveLength(1)
  expect(box.submitted[0]).toContain('<bozza>\n  riassumi il file\n\n</bozza>')
  expect(session.appended()).toHaveLength(1)
  expect(toasts).toEqual([])
})

test('Perfeziona con la casella vuota non invia nulla', async ($, on) => {
  const box: Box = { draft: '   ', submitted: [], forkPrompt: '' }
  engine(on, box, 'non usato')
  const session = mock.session(on)
  on('ui.toast', () => ({ value: undefined }))

  const ui = await mountBand($, 'terminal')
  await ui.press({ key: 'refine' })

  expect(box.submitted).toEqual([])
  expect(session.appended()).toHaveLength(0)
})

test('Perfeziona durante un turno non invia nulla', async ($, on) => {
  const box: Box = { draft: 'riassumi il file', submitted: [], forkPrompt: '' }
  engine(on, box, 'non usato')
  const session = mock.session(on)
  on('ui.toast', () => ({ value: undefined }))

  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: true }, surface: 'terminal' })
  await ui.press({ key: 'refine' })

  expect(box.submitted).toEqual([])
  expect(box.draft).toBe('riassumi il file')
  expect(session.appended()).toHaveLength(0)
})

test('/migliora <bozza> riscrive la bozza nella casella senza inviarla', async ($, on) => {
  const box: Box = { draft: '', submitted: [], forkPrompt: '' }
  engine(on, box, '## Obiettivo\nAggiungi la ricerca.')
  const clock = mock.clock(on)

  const ran = await $.command.run({
    command: 'migliora',
    args: 'aggiungi la ricerca',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(ran.text).toBeUndefined()

  await clock.advance(1)
  expect(box.draft).toBe('## Obiettivo\nAggiungi la ricerca.')
  expect(box.forkPrompt).toContain('<bozza>\naggiungi la ricerca\n</bozza>')
  expect(box.submitted).toEqual([])
})

// Una mod che, come Replay Theater, disegna la fascia senza passare la mano.
const ALTRA_FASCIA = {
  name: 'altra-fascia',
  register: (on: On) => {
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return Text({ children: 'fascia di un’altra mod' })
    })
  },
}

test('la fascia convive con quella di un’altra mod', { plugins: [ALTRA_FASCIA] }, async ($, on) => {
  const box: Box = { draft: '', submitted: [], forkPrompt: '' }
  engine(on, box, 'non usato')

  const ui = await mountBand($, 'terminal')

  expect((await ui.find({ key: 'enhance' }))?.text).toContain('Migliora')
  expect(await ui.find({ text: /fascia di un’altra mod/ })).toBeDefined()
})

test('la fascia non annida il segnaposto dell’engine, che il desktop scarterebbe', async ($, on) => {
  const box: Box = { draft: '', submitted: [], forkPrompt: '' }
  engine(on, box, 'non usato')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountBand($, surface)
    expect((await ui.find({ key: 'enhance' }))?.text).toContain('Migliora')
    expect(JSON.stringify(await ui.drawn())).not.toContain('"engine"')
    await ui.unmount()
  }
})

test('/perfeziona <bozza> avvia il coaching come il pulsante', async ($, on) => {
  const box: Box = { draft: '', submitted: [], forkPrompt: '' }
  engine(on, box, 'non usato')
  const session = mock.session(on)
  const clock = mock.clock(on)

  const ran = await $.command.run({
    command: 'perfeziona',
    args: 'riassumi il file',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(ran.text).toBeUndefined()

  await clock.advance(1)
  expect(box.submitted).toHaveLength(1)
  expect(box.submitted[0]).toContain('<bozza>\nriassumi il file\n</bozza>')
  const rows = session.appended()
  expect(rows).toHaveLength(1)
  expect(JSON.stringify(rows[0]?.message.content)).toContain('una domanda alla volta')
})

test('/perfeziona gestisce un errore di submit con un toast senza promesse rifiutate non gestite', async ($, on) => {
  const box: Box = { draft: '', submitted: [], forkPrompt: '' }
  engine(on, box, 'non usato', () => { throw new Error('invio fallito nel test') })
  const session = mock.session(on)
  const clock = mock.clock(on)
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  const ran = await $.command.run({
    command: 'perfeziona',
    args: 'riassumi il file',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(ran.text).toBeUndefined()

  // L'orologio attende anche l'assestamento del lavoro avviato dal callback.
  // Non intercettiamo qui i rifiuti: devono essere gestiti dalla mod.
  await clock.advance(1)
  expect(box.draft).toBe('riassumi il file')
  expect(session.appended()).toHaveLength(1)
  expect(toasts.join('\n')).toMatch(/fallit|rifiutat|errore|impossibile/i)
  expect(toasts.join('\n')).toMatch(/istruzioni.*già.*conversazione/i)
})
