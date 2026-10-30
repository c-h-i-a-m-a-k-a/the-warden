// The "missed out" cutaway: a short TV segment showing the bunnies living the life the
// user is skipping. Written, drawn and narrated once at session start, then cached.
// Every model, endpoint, key and voice comes from the local, gitignored .env.local.

async function loadEnv() {
  try {
    const res = await fetch(chrome.runtime.getURL(".env.local"));
    if (!res.ok) return null;
    const env = {};
    for (const line of (await res.text()).split("\n")) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (m) env[m[1]] = m[2].trim();
    }
    const needed = ["MODEL_API_KEY", "MODEL_API_BASE_URL", "MODEL_TEXT_NAME", "MODEL_IMAGE_NAME", "MODEL_API_LIVE_URL", "MODEL_NAME"];
    return needed.every((k) => env[k]) ? env : null;
  } catch {
    return null;
  }
}

const toBase64 = (bytes) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function generate(env, model, parts, modalities) {
  const res = await fetch(`${env.MODEL_API_BASE_URL}/models/${model}:generateContent?key=${env.MODEL_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: modalities } }),
  });
  if (!res.ok) throw new Error(`request failed ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts ?? [];
}

/** 1. Write the segment: what they're missing, a TV headline, and the narration. */
async function writeSegment(env, task, motivation) {
  const prompt = `You write a short, outrageous "flash-forward" TV news segment for a productivity app.
The user is supposed to be doing this: "${task}".${motivation ? ` Their motivation: "${motivation}".` : ""}
They just got caught slacking off. Show them what everyone who DID finish is getting, happening right now without them.
GAS IT UP. Make the reward absurdly, superhumanly, impossibly epic, starting from their motivation (or, if none is given, the obvious reward of the task) and escalating way past it. Think: a legendary NBA superstar pulled up and personally handed every bunny $1 million, money raining from the sky, private jets, fireworks spelling their names, a parade, a marching band, a golden trophy the size of a house, a dolphin choir. Stack two or three ridiculous escalations. The bigger and more over-the-top, the better.
End with the petty twist: one bunny wasn't there because they were still slacking off on their task. Never mean about the person themselves.
The world is populated by cute bunnies. Refer to the user as "one bunny" in the narration.
Reply with JSON only, no code fences:
{"scene": "a vivid one-paragraph description of a single illustration of the bunnies losing their minds celebrating the epic reward, plus one visible sign that one bunny is missing (an empty seat, a name card, a gap in the group photo). Any celebrity appears only as a generic bunny (a "superstar bunny" in a plain jersey), never as a real person or their likeness", "headline": "a short, hyped TV news headline in caps, under 8 words", "narration": "a breathless, hyped breaking-news report, 3 sentences, under 50 words, starting with 'Breaking news' and ending with the line about one bunny"}`;
  const parts = await generate(env, env.MODEL_TEXT_NAME, [{ text: prompt }], ["TEXT"]);
  const text = parts.map((p) => p.text ?? "").join("").replace(/^```(json)?|```$/g, "").trim();
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}

/** 2. Draw the scene in the same style as the extension's characters. */
async function drawScene(env, scene) {
  const ref = new Uint8Array(await (await fetch(chrome.runtime.getURL("art/sprite-sheet.png"))).arrayBuffer());
  const prompt = `The reference image shows our characters in a minimal, flat style: simple rounded shapes, flat colors, an even dark outline, tiny dot eyes, no shading or texture (ignore its magenta background).
Draw ONE new illustration in exactly that style, landscape 16:9, with a full scene background. Use cute bunnies of different colors, absolutely losing their minds celebrating, with as much over-the-top spectacle as fits (confetti, money, fireworks). Every single character is a cute bunny in this exact simple style. Absolutely no humans, human faces or realistic people. If the scene mentions a celebrity, draw a generic bunny athlete or star in a plain outfit with no name, number or real person's likeness. Absolutely no words, letters, names, captions or logos anywhere in the image (fireworks, banners and signs stay wordless); only plain numbers on money or checks are allowed.
Scene: ${scene}`;
  const parts = await generate(env, env.MODEL_IMAGE_NAME, [{ text: prompt }, { inline_data: { mime_type: "image/png", data: toBase64(ref) } }], ["TEXT", "IMAGE"]);
  const img = parts.map((p) => p.inlineData || p.inline_data).find(Boolean);
  if (!img) throw new Error("no image");
  return { image: img.data, mime: img.mimeType || img.mime_type || "image/png" };
}

/** 3. Voice the narration with the live voice model, as a deadpan news anchor. */
function narrate(env, narration) {
  const direction = `You are a TV news anchor reading breaking news that is the most incredible thing that has ever happened: breathless, hyped and building with excitement, like a sports commentator at the buzzer. Then deliver the final sentence about the one missing bunny dry and deadpan. Read the text you are given exactly, word for word, and nothing else.`;
  return new Promise((resolve) => {
    const ws = new WebSocket(`${env.MODEL_API_LIVE_URL}?key=${env.MODEL_API_KEY}`);
    const chunks = [];
    let rate = 24000;
    const done = (result) => { clearTimeout(timer); try { ws.close(); } catch {} resolve(result); };
    const timer = setTimeout(() => done(null), 40000);
    ws.onopen = () => ws.send(JSON.stringify({
      setup: {
        model: env.MODEL_NAME,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: env.MODEL_NARRATOR_VOICE || "Charon" } } },
        },
        systemInstruction: { parts: [{ text: direction }] },
      },
    }));
    ws.onmessage = async (ev) => {
      const msg = JSON.parse(typeof ev.data === "string" ? ev.data : await ev.data.text());
      if (msg.setupComplete) {
        ws.send(JSON.stringify({ clientContent: { turns: [{ role: "user", parts: [{ text: narration }] }], turnComplete: true } }));
      }
      for (const part of msg.serverContent?.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) {
          const m = /rate=(\d+)/.exec(part.inlineData.mimeType ?? "");
          if (m) rate = +m[1];
          chunks.push(fromBase64(part.inlineData.data));
        }
      }
      if (msg.serverContent?.turnComplete) done(chunks.length ? wav(chunks, rate) : null);
    };
    ws.onerror = () => done(null);
  });
}

function wav(chunks, rate) {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(44 + len);
  const v = new DataView(out.buffer);
  const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + len, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, len, true);
  let o = 44;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return { audio: toBase64(out), durationMs: Math.round((len / 2 / rate) * 1000) };
}

/** Returns { headline, narration, image, mime, audio, durationMs }, or null if anything is missing. */
export async function makeFuture(task, motivation) {
  const env = await loadEnv();
  if (!env) return null;
  try {
    const segment = await writeSegment(env, task, motivation);
    const [art, voice] = await Promise.all([drawScene(env, segment.scene), narrate(env, segment.narration)]);
    if (!voice) return null;
    return { headline: segment.headline, narration: segment.narration, ...art, ...voice };
  } catch {
    return null;
  }
}
