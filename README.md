# The Warden

A Chrome extension that keeps you on task, or sends the warden after you.

1. Set what you're supposed to be doing and for how long (say, study for 5 hours). Add a motivation if you have one.
2. The timer only counts time spent off distracting sites. On YouTube, Netflix, TikTok, Instagram and the like, it pauses.
3. Stay too long and a fellow prisoner pops up to whisper that the warden is coming, then ducks away. Go back to work and nothing happens.
4. Ignore it and the warden pops up, pointing right at you, and the bars come down.
5. She turns on the TV: a breaking-news broadcast of everyone who finished getting something absurdly epic, drawn and narrated just for you. To get out, write "I will [your task]" 5 times and close the distracting tab. The timer picks back up.
6. Hit your goal and the warden lets you go: your bail has been posted.

## Install

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder.
3. Pin **The Warden** and click it to start a session.

## Settings

| Setting | What it does |
|---------|--------------|
| What are you supposed to be doing? | The task in your lines ("I will …") |
| Motivation (optional) | Why you're doing it. The TV broadcast shows everyone else enjoying it without you. For example, "summer break" becomes a beach party where one bunny is still inside retaking organic chemistry. |
| For how long? | Your goal. Only time off distracting sites counts. |
| Distracting sites | Click **Edit** to add or remove domains. Subdomains count too. |
| Warning after | Seconds on a distracting site before the warning |
| Warden arrives | Seconds after the warning before the warden shows up |

For a quick demo, set the warning to a few seconds and the warden to a few seconds after that.

## Sound

Voice audio (the prisoner's whisper and the TV narration) is generated with the Gemini Live API. The prisoner's warning plays from `audio/warning.wav`. If it's missing, the browser's built-in voice reads the line instead. Sound effects are generated in the browser.

The TV broadcast is written, illustrated and narrated by AI models when you press Start, then cached for the session. It needs a `.env.local` file in this folder (never commit it):

```
MODEL_API_KEY=...
MODEL_API_BASE_URL=...   # REST endpoint for the text and image models
MODEL_TEXT_NAME=...
MODEL_IMAGE_NAME=...
MODEL_API_LIVE_URL=...   # streaming endpoint for the voice model
MODEL_NAME=...           # the voice model
MODEL_NARRATOR_VOICE=...
```

Without it, everything else still works and the broadcast is skipped.
