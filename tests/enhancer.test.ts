import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

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
function engine(on: On, box: Box, forkText: string): void {
  on('prompt.read', () => ({ value: { text: box.draft, cursor: box.draft.length } }))
  on('prompt.fill', (_$, e) => {
    box.draft = e.text
    return { isFilled: true }
  })
  on('prompt.submit', (_$, e) => {
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
