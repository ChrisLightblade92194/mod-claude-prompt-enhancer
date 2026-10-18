# Prompt Enhancer

A Claude Code mod that turns a rough prompt draft into a complete, ready-to-send prompt, without sending it.

It adds two buttons above the prompt box:

- **Migliora** (Improve) rewrites the draft in the prompt box, in place.
- **Invia** (Send) sends the current draft.

The rewritten prompt always has five sections:

1. **Goal**: your request, clarified, with every detail and constraint of the draft kept.
2. **Skills to use**: the installed skills that fit the task, each as `/skill-name` with one line on why.
3. **Project context**: the details of the current project that matter for the task.
4. **Decisions to ask before starting**: the key choices Claude must ask you about, with an explicit instruction to stop and wait for your answers.
5. **Expected result**: what the finished work looks like and how to check it.

The rewrite is written in the language of your draft. The button labels and status messages are in Italian.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install prompt-enhancer --marketplace ChrisLightblade92194/mod-claude-prompt-enhancer
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it available in every session).

From a shell:

```bash
claude plugin install prompt-enhancer --marketplace ChrisLightblade92194/mod-claude-prompt-enhancer
```

In the Claude desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `ChrisLightblade92194/mod-claude-prompt-enhancer`, then **Add plugin**.

## Usage

1. Write a draft in the prompt box.
2. Press **Migliora**. The status next to the buttons shows the progress, then the draft is replaced by the rewritten prompt.
3. Read and edit the result, then press **Invia** (or Enter).

You can also type `/migliora <draft>` and press Enter: the rewritten prompt appears in the prompt box, not sent.

If you edit the prompt box while a rewrite is running, the mod does not overwrite your text and shows an error instead.

## What is sent to the model

When you press **Migliora**, the mod collects context from the current project and sends it, together with your draft, to the model of your own Claude Code session. No external service is involved. The context is:

- the list of installed skills, with their descriptions where available;
- the working directory and the names of its top-level files and folders;
- the git branch, uncommitted changes (`git status --short`) and the last 5 commits;
- the first 3,000 characters of each of these files, when present: `CLAUDE.md`, `AGENTS.md`, `docs/wiki/INDEX.md`, `README.md`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `composer.json`.

The rewrite first asks a fork of the current conversation, which already knows your skills and what you discussed. In a session with no conversation yet, it falls back to a single completion with the `sonnet` model.

## Notes

- **Invia** sends the draft as your own words, but the transcript shows that the mod sent it. `@file` mentions and pasted images are not expanded when sent this way; for those prompts, press Enter instead.
- Claude Code's mod API is in early access and may change between releases.

## Development

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

## License

[MIT](LICENSE)
