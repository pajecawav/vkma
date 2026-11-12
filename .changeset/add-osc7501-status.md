---
"@vkma.dev/deploy": minor
---

Terminal status reports via OSC 7501 (Program Status Protocol): the CLI now
tells compatible terminals what it is doing (working with upload progress,
blocked on prompts and phone confirmation, done/error/idle at the end).
Reports are opt-in and only fire on a real terminal: pass `--status` to turn
them on. `statusSequence()` is exported so library consumers can join in.
