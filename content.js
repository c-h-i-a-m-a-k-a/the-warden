// The Warden's on-page overlay: the bunny's warning, the warden's
// entrance, jail (bars plus writing lines) and bail. The background script decides when;
// this file decides how it looks.
(() => {
  if (window.__wardenLoaded) return;
  window.__wardenLoaded = true;
  // Clear out an overlay left behind by a previous version of the extension.
  document.querySelectorAll("warden-overlay").forEach((n) => n.remove());

  const art = (name) => chrome.runtime.getURL(`art/frames/${name}.png`);
  const sound = (name) => chrome.runtime.sendMessage({ type: "sound", name }).catch(() => {});
  const tell = (type) => chrome.runtime.sendMessage({ type }).catch(() => {});
  const myHost = location.hostname.replace(/^www\./, "");

  const host = document.createElement("warden-overlay");
  host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${CSS()}</style><div class="layer" id="layer"></div>`;
  document.documentElement.appendChild(host);
  const layer = root.getElementById("layer");

  let state = "idle"; // idle | distracted | warning | warden | jailed | bail
  let current = null; // the last "distracted" message
  let timers = [];
  let videoLock = null;
  let countdown = null;
  let tvShown = false;

  const later = (ms, fn) => timers.push(setTimeout(fn, Math.max(0, ms)));
  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
    clearInterval(countdown);
  };
  const el = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  const blockPage = (on) => (host.style.pointerEvents = on ? "auto" : "none");
  const siteName = (h) => h.replace(/\.(com|tv|org|net)$/, "");
  const nice = (h) => {
    const n = siteName(h);
    return { youtube: "YouTube", netflix: "Netflix", tiktok: "TikTok", instagram: "Instagram", x: "X", twitter: "Twitter", reddit: "Reddit", facebook: "Facebook", twitch: "Twitch", hulu: "Hulu", disneyplus: "Disney+", max: "Max" }[n] ?? h;
  };

  // Keep videos paused while the warden is here.
  function lockVideos(on) {
    clearInterval(videoLock);
    if (!on) return;
    const pause = () => document.querySelectorAll("video, audio").forEach((m) => !m.paused && m.pause());
    pause();
    videoLock = setInterval(pause, 300);
  }

  function shakePage(on) {
    let style = document.getElementById("warden-shake-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "warden-shake-style";
      style.textContent = `@keyframes warden-shake { 0%{transform:translate(0,0)} 25%{transform:translate(-6px,3px)} 50%{transform:translate(5px,-3px)} 75%{transform:translate(-4px,-2px)} 100%{transform:translate(0,0)} }
        html.warden-shaking { animation: warden-shake .1s linear infinite !important; }`;
      (document.head || document.documentElement).appendChild(style);
    }
    document.documentElement.classList.toggle("warden-shaking", on);
    layer.classList.toggle("shaking", on);
  }

  function reset() {
    clearTimers();
    shakePage(false);
    lockVideos(false);
    blockPage(false);
    layer.innerHTML = "";
    state = "idle";
    current = null;
  }

  // ---------- Warning: the bunny peeks in ----------

  function showWarning(msg) {
    state = "warning";
    // Load the warden's frames now so her entrance doesn't stutter.
    ["warden-point", "warden-angry"]
      .forEach((n) => (new Image().src = art(n)));
    const bunny = el(`<div class="bunny" id="bunny"><img id="bunnyImg" src="${art("bunny-peek")}" alt=""></div>`);
    layer.appendChild(bunny);
    requestAnimationFrame(() => requestAnimationFrame(() => bunny.classList.add("in")));
    // Alternate between peeking and whispering.
    let whisper = false;
    countdown = setInterval(() => {
      const img = root.getElementById("bunnyImg");
      if (!img) return clearInterval(countdown);
      whisper = !whisper;
      img.src = art(whisper ? "bunny-whisper" : "bunny-peek");
    }, 1100);
    sound("warning");
    // Say the line, then duck back out. The warden still comes on schedule if you stay.
    later(5200, hideWarning);
  }

  function hideWarning() {
    clearInterval(countdown);
    const bunny = root.getElementById("bunny");
    if (bunny) {
      bunny.classList.remove("in");
      setTimeout(() => bunny.remove(), 500);
    }
  }

  // ---------- The warden walks in ----------

  function startWarden(msg) {
    state = "warden";
    clearInterval(countdown);
    tell("warden");
    blockPage(true);
    lockVideos(true);
    layer.innerHTML = "";
    // She pops in on the right, calls you out, and the bars drop.
    layer.append(
      el(`<div class="soft-dim"></div>`),
      el(`<div class="side-warden" id="sideWarden"><img id="sideWardenImg" src="${art("warden-point")}" alt="">
        <span class="anger a1"><svg viewBox="0 0 24 24"><path d="M9 2.5c0 3.6-1.4 5.8-6.5 6.5M15 2.5c0 3.6 1.4 5.8 6.5 6.5M9 21.5c0-3.6-1.4-5.8-6.5-6.5M15 21.5c0-3.6 1.4-5.8 6.5-6.5"/></svg></span><span class="anger a2"><svg viewBox="0 0 24 24"><path d="M9 2.5c0 3.6-1.4 5.8-6.5 6.5M15 2.5c0 3.6 1.4 5.8 6.5 6.5M9 21.5c0-3.6-1.4-5.8-6.5-6.5M15 21.5c0-3.6 1.4-5.8 6.5-6.5"/></svg></span><span class="anger a3"><svg viewBox="0 0 24 24"><path d="M9 2.5c0 3.6-1.4 5.8-6.5 6.5M15 2.5c0 3.6 1.4 5.8 6.5 6.5M9 21.5c0-3.6-1.4-5.8-6.5-6.5M15 21.5c0-3.6 1.4-5.8 6.5-6.5"/></svg></span></div>`),
    );
    later(2000, () => {
      layer.querySelector(".soft-dim")?.remove();
      showJail(msg.task, { host: msg.host, linesDone: false }, true);
      tell("jailed");
    });
  }

  // ---------- Jail ----------

  function target(task) {
    return `I will ${task.trim().replace(/[.!]+$/, "")}`;
  }
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  function showJail(task, jail, slam) {
    clearTimers();
    state = "jailed";
    blockPage(true);
    lockVideos(true);
    let cell = root.getElementById("cell");
    if (!cell) {
      if (!slam) layer.innerHTML = "";
      cell = el(`
        <div class="cell" id="cell">
          ${slam ? "" : '<div class="dim"></div>'}
          <div class="bars ${slam ? "" : "down"}" id="bars">${'<i></i>'.repeat(11)}<b class="rail top"></b><b class="rail mid"></b></div>
          ${root.getElementById("sideWarden") ? "" : `<img class="guard" src="${art("warden-angry")}" alt="">`}
          <div class="card" id="card"></div>
        </div>`);
      layer.appendChild(cell);
      const side = root.getElementById("sideWarden");
      if (side) layer.appendChild(side); // keep her in front of the bars
      if (slam) {
        sound("bars");
        requestAnimationFrame(() => requestAnimationFrame(() => root.getElementById("bars").classList.add("down")));
        // The slam lands with the bars, then the lock clunks.
        later(400, () => {
          shakePage(true);
          later(350, () => shakePage(false));
        });
        later(1150, () => {
          shakePage(true);
          later(90, () => shakePage(false));
        });
        // Before the lines: the TV shows what they're about to miss.
        later(1400, () => showTV());
      } else {
        root.getElementById("card").classList.add("in");
      }
    }
    renderCard(task, jail);
  }

  function renderCard(task, jail) {
    const card = root.getElementById("card");
    const line = target(task);
    const here = jail.host && (myHost === jail.host || myHost.endsWith("." + jail.host));
    if (jail.linesDone) {
      card.innerHTML = `
        <div class="card-icon">🗝️</div>
        <div class="card-title">Okay. Now you <i>actually</i> have to close the tab.</div>
        <div class="card-sub">${here ? "Close this tab to walk free." : `Close the ${escape(nice(jail.host))} tab to walk free.`}</div>`;
      return;
    }
    if (card.dataset.task === task) return;
    card.dataset.task = task;
    card.innerHTML = `
      <div class="card-icon">🔒</div>
      <div class="card-title">You've been jailed</div>
      <div class="card-sub">${jail.host ? `Caught on ${escape(nice(jail.host))}. ` : ""}Write this 5 times to get out:</div>
      <div class="card-target">“${escape(line)}”</div>
      <div class="lines">${[1, 2, 3, 4, 5].map((n) => `<label class="line"><span class="num">${n}</span><input data-n="${n}" spellcheck="false" autocomplete="off" placeholder="${escape(line)}"><span class="ok">✓</span></label>`).join("")}</div>`;
    const inputs = [...card.querySelectorAll("input")];
    inputs.forEach((input, i) => {
      input.addEventListener("paste", (e) => e.preventDefault());
      input.addEventListener("keydown", (e) => e.stopPropagation(), true);
      input.addEventListener("input", () => {
        const good = normalize(input.value) === normalize(line);
        input.parentElement.classList.toggle("good", good);
        if (good && inputs[i + 1]) inputs[i + 1].focus();
        if (inputs.every((x) => x.parentElement.classList.contains("good"))) tell("linesDone");
      });
    });
    setTimeout(() => inputs[0].focus(), 300);
  }

  // ---------- The TV: what you're missing ----------

  async function showTV() {
    const showCard = () => root.getElementById("card")?.classList.add("in");
    if (tvShown) return showCard();
    tvShown = true;
    const ask = () => chrome.runtime.sendMessage({ type: "getFuture" }).catch(() => null);
    let future = await ask();
    if (!future || future.status === "failed" || state !== "jailed") return showCard();
    const cell = root.getElementById("cell");
    const side = root.getElementById("sideWarden");
    const stage = el(`
      <div class="tv-stage" id="tvStage">
        <div class="tv-wrap">
          <div class="tv">
            <div class="antenna"><i></i><i></i></div>
            <div class="tv-screen">
              <img class="tv-image" id="tvImage" alt="">
              <div class="tv-lower"><span class="live-badge">LIVE</span><span id="tvHeadline"></span></div>
              <div class="static"></div>
              <div class="standby" id="standby">PLEASE STAND BY</div>
            </div>
            <div class="tv-base"><i></i><i></i></div>
          </div>
        </div>
        <div class="tv-caption" id="tvCaption"></div>
      </div>`);
    cell.appendChild(stage);
    requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.add("in")));
    // The warden, still on the right, presses play.
    later(400, () => side?.classList.add("press"));
    later(600, () => {
      stage.classList.add("on");
      sound("tvon");
    });
    // If the broadcast is still being made, sit on static until it's ready.
    const started = Date.now();
    while (future.status === "pending" && Date.now() - started < 60000) {
      root.getElementById("standby")?.classList.add("in");
      await new Promise((r) => setTimeout(r, 1000));
      if (state !== "jailed") return;
      future = (await ask()) ?? { status: "failed" };
    }
    if (future.status !== "ready") {
      stage.remove();
      return showCard();
    }
    root.getElementById("standby")?.classList.remove("in");
    root.getElementById("tvImage").src = `data:${future.mime};base64,${future.image}`;
    root.getElementById("tvHeadline").textContent = future.headline || "";
    const wait = Math.max(0, 1200 - (Date.now() - started));
    later(wait, () => {
      stage.classList.add("playing");
      sound("narration");
    });
    const end = wait + future.durationMs + 400;
    later(end, () => {
      const caption = root.getElementById("tvCaption");
      caption.innerHTML = "Want to avoid this reality? <b>Get back to work.</b>";
      caption.classList.add("in");
    });
    // Then the TV clears away and the lines come up.
    later(end + 2600, () => {
      stage.classList.remove("in");
      // She settles into arms-crossed while you write your lines.
      if (side) {
        root.getElementById("sideWardenImg").src = art("warden-angry");
        side.querySelectorAll(".anger").forEach((n) => n.remove());
      }
      setTimeout(() => stage.remove(), 400);
      showCard();
    });
  }

  function release() {
    clearTimers();
    const bars = root.getElementById("bars");
    const card = root.getElementById("card");
    card?.classList.remove("in");
    bars?.classList.add("up");
    setTimeout(reset, 900);
  }

  // ---------- Bail ----------

  function showBail(msg) {
    reset();
    state = "bail";
    blockPage(true);
    const confetti = Array.from({ length: 80 }, (_, i) => {
      const colors = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#ff9f1c", "#ffffff"];
      return `<i style="left:${Math.random() * 100}%; background:${colors[i % colors.length]}; animation-delay:${Math.random() * 1.2}s; animation-duration:${2.2 + Math.random() * 1.6}s; transform: rotate(${Math.random() * 360}deg)"></i>`;
    }).join("");
    layer.append(
      el(`<div class="dim soft"></div>`),
      el(`<div class="confetti">${confetti}</div>`),
      el(`
        <div class="bail">
          <div class="bail-art">
            <img class="bail-warden" src="${art("warden-pleased")}" alt="">
            <img class="bail-bunny" src="${art("bunny-cheer")}" alt="">
          </div>
          <div class="bail-title">Your bail has been posted.</div>
          <div class="bail-sub">${escape(msg.goal)} of ${escape(msg.task)}. Done.</div>
          <button class="bail-btn" id="bailBtn">Walk free</button>
        </div>`),
    );
    root.getElementById("bailBtn").onclick = reset;
    sound("bail");
  }

  // ---------- Messages from the background ----------

  chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.type) {
      case "distracted": {
        if (state === "warden" || state === "jailed" || state === "bail") return;
        if (current && current.wardenAt === msg.wardenAt) return; // already counting down
        clearTimers();
        current = msg;
        if (state === "idle") state = "distracted";
        const t = Date.now();
        if (msg.warnAt <= t) {
          if (!root.getElementById("bunny")) showWarning(msg);
        } else {
          later(msg.warnAt - t, () => showWarning(msg));
        }
        later(msg.wardenAt - t, () => startWarden(current));
        break;
      }
      case "clear":
        if (state === "distracted" || state === "warning") {
          clearTimers();
          hideWarning();
          state = "idle";
          current = null;
        }
        break;
      case "jail":
        showJail(msg.task, msg.jail, false);
        break;
      case "released":
        if (state === "jailed") release();
        break;
      case "bail":
        showBail(msg);
        break;
    }
  });

  tell("hello");

  function escape(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  function CSS() {
    return `
      :host { all: initial; }
      * { box-sizing: border-box; }
      .layer { position: fixed; inset: 0; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif; overflow: hidden; }
      .layer.shaking { animation: shake .1s linear infinite; }
      @keyframes shake { 0%{transform:translate(0,0)} 25%{transform:translate(-5px,3px)} 50%{transform:translate(5px,-3px)} 75%{transform:translate(-3px,-2px)} 100%{transform:translate(0,0)} }
      .layer.bump { animation: bump .25s ease-out; }
      @keyframes bump { 30% { transform: translateY(4px); } }

      /* Bunny warning: small, in the lower-left corner, facing into the screen */
      .bunny { position: absolute; left: 2vw; bottom: 0; transform: translateY(110%); transition: transform .5s cubic-bezier(.2,1.2,.3,1); }
      .bunny.in { transform: translateY(0); }
      .bunny img { display: block; height: 20vh; filter: drop-shadow(0 6px 12px rgba(0,0,0,.25)); animation: bob 1.1s ease-in-out infinite; transform-origin: 50% 100%; }
      @keyframes bob { 50% { transform: translateY(-5px) rotate(-2deg); } }

      /* The warden */
      .dim { position: absolute; inset: 0; background: rgba(0,0,0,.5); animation: fade .4s both; }
      .dim.soft { background: rgba(0,0,0,.35); }
      @keyframes fade { from { opacity: 0; } }
      .soft-dim { position: absolute; inset: 0; background: rgba(255,246,236,.82); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); animation: fade .35s both; }
      .side-warden { position: absolute; right: 3vw; bottom: 0; height: 52vh; animation: popside .45s cubic-bezier(.2,1.6,.4,1) both; }
      .side-warden img { height: 100%; filter: drop-shadow(0 14px 22px rgba(60,40,20,.3)); transform-origin: 50% 95%; animation: sass 1.2s ease-in-out infinite; }
      .side-warden.press img { animation: press .4s ease-out, sass 1.2s .4s ease-in-out infinite; }
      @keyframes popside { from { transform: translateY(70%) scale(.8); } }
      @keyframes sass { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg) translateY(-1%); } }
      @keyframes press { 50% { transform: translateX(-4%) rotate(-8deg); } }
      .anger { position: absolute; width: 9vh; height: 9vh; animation: throb .35s ease-in-out infinite alternate; }
      .anger svg { width: 100%; height: 100%; fill: none; stroke: #e5484d; stroke-width: 3.2; stroke-linecap: round; }
      .anger.a1 { left: -3vh; top: 8vh; width: 7vh; height: 7vh; }
      .anger.a2 { right: -3vh; top: 2vh; width: 7vh; height: 7vh; animation-delay: .12s; }
      .anger.a3 { right: 0; top: 18vh; width: 5vh; height: 5vh; animation-delay: .24s; }
      @keyframes throb { from { transform: scale(.8) rotate(-8deg); } to { transform: scale(1.15) rotate(8deg); } }
      @keyframes pop { from { transform: scale(.3); opacity: 0; } }

      /* Jail */
      .cell { position: absolute; inset: 0; }
      .bars { position: absolute; inset: 0; display: flex; justify-content: space-evenly; transform: translateY(-105%);
        transition: transform .42s cubic-bezier(.55,0,.75,1.15); }
      .bars.down { transform: translateY(0); }
      .bars.up { transition: transform .8s cubic-bezier(.5,0,.3,1); transform: translateY(-105%); }
      .bars i { width: 2.4vw; height: 100%; border-radius: 1.2vw; background: linear-gradient(90deg, #2c2c2e, #8e8e93 35%, #d1d1d6 50%, #636366 70%, #1c1c1e);
        box-shadow: 6px 0 14px rgba(0,0,0,.45); }
      .rail { position: absolute; left: 0; right: 0; height: 2.6vh; background: linear-gradient(180deg, #48484a, #aeaeb2 45%, #3a3a3c); box-shadow: 0 6px 14px rgba(0,0,0,.45); }
      .rail.top { top: 7vh; }
      .rail.mid { bottom: 18vh; }
      .guard { position: absolute; right: 3vw; bottom: 0; height: 40vh; filter: drop-shadow(0 16px 30px rgba(0,0,0,.5)); animation: fade .6s .5s both; }
      .card { position: absolute; left: 50%; top: 50%; width: min(560px, 90vw); transform: translate(-50%, -46%) scale(.96); opacity: 0;
        background: rgba(255,255,255,.97); color: #1d1d1f; border-radius: 28px; padding: 30px 32px 28px; box-shadow: 0 30px 80px rgba(0,0,0,.45);
        transition: opacity .35s, transform .45s cubic-bezier(.2,1.2,.3,1); text-align: center; }
      .card.in { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      .card-icon { font-size: 40px; }
      .card-title { font-size: 30px; font-weight: 800; letter-spacing: -.02em; margin-top: 4px; }
      .card-sub { font-size: 16px; color: #6e6e73; margin-top: 6px; }
      .card-hint { font-size: 14px; color: #8e8e93; margin-top: 10px; }
      .card-target { font-size: 20px; font-weight: 700; margin: 14px 0 16px; }
      .lines { display: flex; flex-direction: column; gap: 8px; text-align: left; }
      .line { display: flex; align-items: center; gap: 10px; background: #f2f2f7; border-radius: 14px; padding: 4px 12px; border: 2px solid transparent; transition: border-color .2s, background .2s; }
      .line.good { border-color: #34c759; background: #eefaf1; }
      .num { width: 18px; color: #8e8e93; font-weight: 700; font-size: 14px; }
      .line input { all: unset; flex: 1; font-size: 16px; padding: 9px 0; color: #1d1d1f; font-family: inherit; }
      .line input::placeholder { color: #c7c7cc; }
      .ok { color: #34c759; font-weight: 800; opacity: 0; transform: scale(.4); transition: all .25s cubic-bezier(.2,1.6,.3,1); }
      .line.good .ok { opacity: 1; transform: none; }

      /* The TV */
      .tv-stage { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3vh; padding-right: 16vw;
        background: rgba(30,22,16,.55); opacity: 0; transition: opacity .4s; }
      .tv-stage.in { opacity: 1; }
      .tv-wrap { position: relative; transform: translateY(30px); transition: transform .5s cubic-bezier(.2,1.2,.3,1); }
      .tv-stage.in .tv-wrap { transform: none; }
      .tv { position: relative; width: min(58vw, 860px); padding: 22px 22px 18px; background: #f2e3cf; border: 4px solid #3a2c24; border-radius: 34px;
        box-shadow: 0 30px 60px rgba(0,0,0,.4); }
      .antenna { position: absolute; left: 50%; top: -70px; width: 0; height: 70px; }
      .antenna i { position: absolute; bottom: 0; width: 5px; height: 80px; background: #3a2c24; border-radius: 3px; transform-origin: bottom; }
      .antenna i:first-child { transform: rotate(-32deg); }
      .antenna i:last-child { transform: rotate(32deg); }
      .tv-screen { position: relative; aspect-ratio: 16 / 9; border-radius: 22px; overflow: hidden; background: #111; border: 4px solid #3a2c24; }
      .tv-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .3s; }
      .tv-stage.playing .tv-image { opacity: 1; }
      .static { position: absolute; inset: 0; opacity: 0; mix-blend-mode: normal;
        background: repeating-radial-gradient(circle at 20% 30%, #ddd 0 1px, #333 1px 3px), repeating-radial-gradient(circle at 70% 60%, #fff 0 1px, transparent 1px 2px);
        animation: snow .08s steps(3) infinite; }
      @keyframes snow { 33% { background-position: 7px 3px, -5px 8px; } 66% { background-position: -6px -4px, 4px -7px; } }
      .tv-stage.on .static { opacity: 1; }
      .tv-stage.playing .static { opacity: 0; transition: opacity .25s; }
      .standby { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font-weight: 800; letter-spacing: .12em;
        font-size: clamp(16px, 2.2vw, 30px); text-shadow: 0 2px 0 #000, 0 0 12px rgba(0,0,0,.8); opacity: 0; transition: opacity .3s; }
      .standby.in { opacity: 1; animation: blink 1.2s steps(2) infinite; }
      @keyframes blink { 50% { opacity: .25; } }
      .tv-stage.playing .standby { opacity: 0; }
      .tv-lower { position: absolute; left: 3%; right: 3%; bottom: 5%; display: flex; align-items: center; gap: 10px; padding: 8px 14px;
        background: rgba(255,253,249,.95); color: #3a2c24; border-radius: 10px; font-weight: 800; font-size: clamp(13px, 1.6vw, 22px);
        letter-spacing: .02em; transform: translateY(160%); transition: transform .45s .4s cubic-bezier(.2,1.2,.3,1); }
      .tv-stage.playing .tv-lower { transform: none; }
      .live-badge { background: #d93a2b; color: #fff; padding: 2px 8px; border-radius: 5px; font-size: .8em; }
      .tv-base { display: flex; justify-content: space-between; padding: 10px 18px 0; }
      .tv-base i { width: 22px; height: 22px; border-radius: 50%; background: #e8742c; border: 3px solid #3a2c24; }
      .tv-caption { color: #fff; font-size: clamp(18px, 2.4vw, 32px); font-weight: 700; opacity: 0; transform: translateY(8px); transition: all .4s; text-shadow: 0 2px 10px rgba(0,0,0,.4); }
      .tv-caption.in { opacity: 1; transform: none; }
      .tv-caption b { color: #ffb37a; }
      .guard.gone { opacity: 0; transition: opacity .3s; }

      /* Bail */
      .confetti { position: absolute; inset: 0; overflow: hidden; }
      .confetti i { position: absolute; top: -20px; width: 10px; height: 16px; border-radius: 2px; animation: fall linear forwards; }
      @keyframes fall { to { top: 110%; transform: rotate(720deg) translateX(40px); } }
      .bail { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(620px, 92vw); text-align: center;
        background: #fff; color: #1d1d1f; border-radius: 32px; padding: 26px 32px 30px; box-shadow: 0 30px 80px rgba(0,0,0,.4);
        animation: pop .55s cubic-bezier(.2,1.4,.3,1) both; }
      .bail-art { display: flex; justify-content: center; align-items: flex-end; gap: 10px; height: 230px; }
      .bail-warden { height: 230px; }
      .bail-bunny { height: 190px; animation: hop .6s ease-in-out infinite alternate; }
      @keyframes hop { to { transform: translateY(-18px) rotate(4deg); } }
      .bail-title { font-size: 32px; font-weight: 800; letter-spacing: -.02em; margin-top: 10px; }
      .bail-sub { font-size: 17px; color: #6e6e73; margin-top: 6px; }
      .bail-btn { all: unset; cursor: pointer; margin-top: 20px; display: inline-block; background: #1d1d1f; color: #fff; border-radius: 999px; padding: 13px 30px; font-size: 17px; font-weight: 600; }
    `;
  }
})();
