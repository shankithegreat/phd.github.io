/* ============================================================
   Deck engine — navigation, theming, timer, overview, notes
   No dependencies. Works from file:// offline.
   ============================================================ */
(function () {
  "use strict";

  /* Accent palettes keyed by data-accent on each slide.
     Each entry: [primary, secondary, tertiary] */
  var PALETTES = {
    blue:   ["#0a84ff", "#5e5ce6", "#64d2ff"],
    indigo: ["#5e5ce6", "#bf5af2", "#0a84ff"],
    purple: ["#bf5af2", "#ff375f", "#5e5ce6"],
    pink:   ["#ff375f", "#ff9f0a", "#bf5af2"],
    red:    ["#ff453a", "#ff375f", "#ff9f0a"],
    orange: ["#ff9f0a", "#ff453a", "#ffd60a"],
    amber:  ["#ffb020", "#ff9f0a", "#30d158"],
    green:  ["#30d158", "#0a84ff", "#64d2ff"],
    teal:   ["#40c8e0", "#0a84ff", "#30d158"],
    mint:   ["#66d4cf", "#30d158", "#0a84ff"]
  };

  var deck = {
    slides: [],
    index: 0,
    timer: { total: 90 * 60, left: 90 * 60, running: false, tick: null }
  };

  /* ---------------- boot ---------------- */
  function init() {
    deck.slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
    if (!deck.slides.length) return;

    initTheme();
    buildOverview();
    bindChrome();
    bindKeys();
    bindSwipe();

    var start = parseInt((location.hash || "").replace("#", ""), 10);
    goTo(isFinite(start) && start > 0 ? start - 1 : 0, true);

    document.body.classList.add("is-ready");
  }

  /* ---------------- navigation ---------------- */
  function goTo(i, silent) {
    i = Math.max(0, Math.min(deck.slides.length - 1, i));

    deck.slides.forEach(function (s) { s.classList.remove("is-active"); });

    var slide = deck.slides[i];
    // Force animation restart on re-entry
    void slide.offsetWidth;
    slide.classList.add("is-active");
    slide.scrollTop = 0;
    var scroller = slide.querySelector(".slide__scroll");
    if (scroller) scroller.scrollTop = 0;

    deck.index = i;

    applyAccent(slide.dataset.accent || "blue");
    updateChrome(slide);
    runCounters(slide);
    closeOverview();

    try {
      history.replaceState(null, "", "#" + (i + 1));
    } catch (e) {
      // file:// in some browsers blocks replaceState — harmless, navigation still works
    }

    // Let per-slide widgets react to becoming visible
    document.dispatchEvent(new CustomEvent("slide:enter", {
      detail: { slide: slide, index: i, id: slide.id }
    }));
  }

  function next() { goTo(deck.index + 1); }
  function prev() { goTo(deck.index - 1); }

  /* ---------------- accent ---------------- */
  function applyAccent(name) {
    var p = PALETTES[name] || PALETTES.blue;
    var root = document.documentElement;
    root.style.setProperty("--accent", p[0]);
    root.style.setProperty("--accent-2", p[1]);
    root.style.setProperty("--accent-3", p[2]);
  }

  /* ---------------- chrome ---------------- */
  function updateChrome(slide) {
    var n = deck.index + 1;
    var total = deck.slides.length;

    var fill = document.querySelector(".progress__fill");
    if (fill) fill.style.width = (n / total) * 100 + "%";

    var counter = document.querySelector(".counter");
    if (counter) counter.innerHTML = "<b>" + pad(n) + "</b> / " + pad(total);

    var label = document.querySelector(".seclabel");
    if (label) label.textContent = slide.dataset.section || "";

    // The notes drawer doubles as a single-screen fallback, so it carries
    // the presenter-only cues as well as the delivery notes.
    var notesBody = document.querySelector(".notes__body");
    if (notesBody) {
      var src = slide.querySelector(".snotes");
      notesBody.innerHTML =
        '<div class="notes__cue notes__cue--laugh"><b>😂 Laugh line</b>' +
          cueHTML(slide, ".mod--laugh") + "</div>" +
        '<div class="notes__cue notes__cue--ask"><b>🙋 Ask the room</b>' +
          cueHTML(slide, ".mod--ask") + "</div>" +
        (src ? src.innerHTML : "<p class='dim'>No delivery notes for this slide.</p>");
    }

    document.querySelectorAll(".ovcard").forEach(function (c, i) {
      c.classList.toggle("is-current", i === deck.index);
    });

    updatePresenter();
  }

  function pad(x) { return x < 10 ? "0" + x : "" + x; }

  /* ---------------- animated number counters ---------------- */
  function runCounters(slide) {
    slide.querySelectorAll("[data-count]").forEach(function (el) {
      var target = parseFloat(el.dataset.count);
      var dec = parseInt(el.dataset.decimals || "0", 10);
      var prefix = el.dataset.prefix || "";
      var suffix = el.dataset.suffix || "";
      var dur = parseInt(el.dataset.dur || "1200", 10);
      var t0 = null;

      function frame(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        var val = target * eased;
        el.textContent = prefix + fmt(val, dec) + suffix;
        if (p < 1) requestAnimationFrame(frame);
      }
      el.textContent = prefix + fmt(0, dec) + suffix;
      requestAnimationFrame(frame);
    });
  }

  function fmt(v, dec) {
    var s = dec > 0 ? v.toFixed(dec) : Math.round(v).toString();
    var parts = s.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  }

  /* ---------------- theme ---------------- */
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem("deck-theme"); } catch (e) {}
    setTheme(saved || "dark");
  }

  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("deck-theme", t); } catch (e) {}
    var btn = document.getElementById("btn-theme");
    if (btn) {
      btn.textContent = t === "dark" ? "☀️" : "🌙";
      btn.title = t === "dark" ? "Switch to light mode (D)" : "Switch to dark mode (D)";
    }
  }

  function toggleTheme() {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  }

  /* ---------------- overview ---------------- */
  function buildOverview() {
    var grid = document.querySelector(".overview__grid");
    if (!grid) return;
    grid.innerHTML = "";

    deck.slides.forEach(function (s, i) {
      var b = document.createElement("button");
      b.className = "ovcard";
      b.innerHTML =
        '<span class="ovcard__n">' + pad(i + 1) + "</span>" +
        '<span class="ovcard__t">' + esc(s.dataset.title || "Slide " + (i + 1)) + "</span>" +
        '<span class="ovcard__s">' + esc(s.dataset.section || "") + "</span>";
      b.addEventListener("click", function () { goTo(i); });
      grid.appendChild(b);
    });

    var t = document.querySelector(".overview__count");
    if (t) t.textContent = deck.slides.length + " slides";
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function toggleOverview() {
    var o = document.querySelector(".overview");
    if (!o) return;
    o.classList.toggle("is-open");
    if (o.classList.contains("is-open")) {
      var cur = document.querySelectorAll(".ovcard")[deck.index];
      if (cur) cur.scrollIntoView({ block: "nearest" });
    }
  }

  function closeOverview() {
    var o = document.querySelector(".overview");
    if (o) o.classList.remove("is-open");
  }

  /* ============================================================
     PRESENTER WINDOW  (press P)
     Opens a second window that shows the laugh line, the
     ask-the-room prompts, the speaker notes and the timer.
     Drag it to your laptop screen while the projector shows the
     deck fullscreen — the audience never sees these cues.
     ============================================================ */
  var presenter = null;

  var PRESENTER_DOC =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<title>Presenter View</title><style>' +
    '*{box-sizing:border-box}' +
    'body{margin:0;padding:0 0 2rem;background:#0a0c14;color:#f2f5ff;' +
    'font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;' +
    '-webkit-font-smoothing:antialiased}' +
    'header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:1rem;' +
    'flex-wrap:wrap;padding:.85rem 1.2rem;background:rgba(12,14,24,.96);' +
    'border-bottom:1px solid rgba(255,255,255,.12)}' +
    '.pnav{display:flex;gap:.5rem}' +
    'button{font:inherit;font-weight:650;color:#fff;cursor:pointer;border:1px solid rgba(255,255,255,.18);' +
    'background:rgba(255,255,255,.08);border-radius:999px;padding:.5rem 1.1rem;transition:.2s}' +
    'button:hover{background:rgba(255,255,255,.18)}' +
    '#pTimerBtn.on{background:#0a84ff;border-color:#0a84ff}' +
    '.pmeta{display:flex;flex-direction:column;line-height:1.25;min-width:0}' +
    '#pCount{font-variant-numeric:tabular-nums;font-weight:800;font-size:1.05rem}' +
    '#pSection{font-size:.76rem;text-transform:uppercase;letter-spacing:.1em;color:#7f8bb5}' +
    '.ptime{margin-left:auto;display:flex;align-items:center;gap:.7rem}' +
    '#pTimer{font-variant-numeric:tabular-nums;font-weight:800;font-size:1.9rem;letter-spacing:-.02em}' +
    '#pTimer.over{color:#ff5566}' +
    'main{padding:1.1rem 1.2rem;display:flex;flex-direction:column;gap:.85rem}' +
    'h1{margin:0;font-size:1.5rem;line-height:1.2;letter-spacing:-.02em}' +
    '.card{border-radius:16px;padding:.9rem 1.1rem;border:1px solid rgba(255,255,255,.13);' +
    'background:rgba(255,255,255,.045)}' +
    '.card h2{margin:0 0 .5rem;font-size:.74rem;font-weight:800;letter-spacing:.13em;' +
    'text-transform:uppercase}' +
    '.laugh{background:linear-gradient(160deg,rgba(255,176,32,.14),transparent 70%),rgba(255,255,255,.045);' +
    'border-color:rgba(255,176,32,.4)} .laugh h2{color:#ffb020}' +
    '.ask{background:linear-gradient(160deg,rgba(120,118,245,.16),transparent 70%),rgba(255,255,255,.045);' +
    'border-color:rgba(130,128,250,.42)} .ask h2{color:#a9a7ff}' +
    '.notes h2{color:#5ce0a0}' +
    '.up{border-style:dashed} .up h2{color:#7f8bb5}' +
    '.body{font-size:1.02rem}' +
    '.ask .body{font-size:1.06rem}' +
    '.body ol,.body ul{margin:.2rem 0 0;padding-left:1.3em}' +
    '.body li+li{margin-top:.4em}' +
    '.body p+p{margin-top:.6em}' +
    '.body i{font-style:italic;color:#aab3d4}' +
    '.body b,.body strong{color:#fff}' +
    '.empty{color:#5e6a8f}' +
    '.hint{padding:0 1.2rem;font-size:.78rem;color:#6b7699}' +
    '.hint kbd{font-family:ui-monospace,Consolas,monospace;background:rgba(255,255,255,.1);' +
    'border:1px solid rgba(255,255,255,.16);border-radius:5px;padding:.1em .4em;font-size:.92em}' +
    '</style></head><body>' +
    '<header>' +
      '<div class="pnav"><button id="pPrev">&lsaquo; Prev</button>' +
      '<button id="pNext">Next &rsaquo;</button></div>' +
      '<div class="pmeta"><span id="pCount">—</span><span id="pSection"></span></div>' +
      '<div class="ptime"><span id="pTimer">90:00</span>' +
      '<button id="pTimerBtn">Start</button></div>' +
    '</header>' +
    '<main>' +
      '<h1 id="pTitle"></h1>' +
      '<div class="card laugh"><h2>&#128514; Laugh line</h2><div class="body" id="pLaugh"></div></div>' +
      '<div class="card ask"><h2>&#128587; Ask the room</h2><div class="body" id="pAsk"></div></div>' +
      '<div class="card notes"><h2>&#128209; Speaker notes</h2><div class="body" id="pNotes"></div></div>' +
      '<div class="card up"><h2>&#9197; Next up</h2><div class="body" id="pUp"></div></div>' +
    '</main>' +
    '<p class="hint">Arrow keys work here too. Keep this window on your laptop and the deck ' +
    'fullscreen on the projector <kbd>Windows</kbd>+<kbd>P</kbd> &rarr; <b>Extend</b>.</p>' +
    '</body></html>';

  function openPresenter() {
    if (presenter && !presenter.closed) { presenter.close(); presenter = null; syncPresenterBtn(); return; }

    presenter = window.open("", "deckPresenterView", "width=780,height=940,menubar=no,toolbar=no");

    if (!presenter) {
      toast("Your browser blocked the presenter window. Allow pop-ups for this page, then press <b>P</b> again.");
      return;
    }

    presenter.document.write(PRESENTER_DOC);
    presenter.document.close();

    var d = presenter.document;
    d.getElementById("pPrev").addEventListener("click", prev);
    d.getElementById("pNext").addEventListener("click", next);
    d.getElementById("pTimerBtn").addEventListener("click", toggleTimer);

    // Arrow keys inside the presenter window drive the main deck
    d.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); prev(); }
      else if (e.key === "t" || e.key === "T") { e.preventDefault(); toggleTimer(); }
    });

    presenter.addEventListener("beforeunload", function () {
      presenter = null;
      setTimeout(syncPresenterBtn, 0);
    });

    updatePresenter();
    renderTimer();
    syncPresenterBtn();
  }

  function syncPresenterBtn() {
    var b = document.getElementById("btn-presenter");
    if (b) b.classList.toggle("is-on", !!(presenter && !presenter.closed));
  }

  /* Pull a presenter cue out of a slide, minus its on-slide label */
  function cueHTML(slide, selector) {
    var el = slide.querySelector(selector);
    if (!el) return '<span class="empty">—</span>';
    var clone = el.cloneNode(true);
    var label = clone.querySelector(".mod__label");
    if (label) label.parentNode.removeChild(label);
    return clone.innerHTML;
  }

  function updatePresenter() {
    if (!presenter || presenter.closed) return;
    var d = presenter.document;
    if (!d || !d.getElementById("pTitle")) return;

    var slide = deck.slides[deck.index];
    var set = function (id, html) {
      var el = d.getElementById(id);
      if (el) el.innerHTML = html;
    };

    set("pCount", pad(deck.index + 1) + " / " + pad(deck.slides.length));
    set("pSection", esc(slide.dataset.section || ""));
    set("pTitle", esc(slide.dataset.title || ""));
    set("pLaugh", cueHTML(slide, ".mod--laugh"));
    set("pAsk", cueHTML(slide, ".mod--ask"));

    var notes = slide.querySelector(".snotes");
    set("pNotes", notes ? notes.innerHTML : '<span class="empty">No notes for this slide.</span>');

    var nxt = deck.slides[deck.index + 1];
    set("pUp", nxt
      ? "<b>" + pad(deck.index + 2) + " · " + esc(nxt.dataset.title || "") + "</b><br>" +
        '<i>' + esc(nxt.dataset.section || "") + "</i>"
      : "<b>End of deck</b><br><i>Q&amp;A — press &larr; to go back to any slide.</i>");
  }

  function updatePresenterTimer() {
    if (!presenter || presenter.closed) return;
    var d = presenter.document;
    var t = d.getElementById("pTimer");
    if (!t) return;
    var main = document.querySelector(".timer");
    t.textContent = main ? main.textContent : "";
    t.className = deck.timer.left < 0 ? "over" : "";
    var b = d.getElementById("pTimerBtn");
    if (b) {
      b.textContent = deck.timer.running ? "Pause" : "Start";
      b.className = deck.timer.running ? "on" : "";
    }
  }

  /* ---------------- inline cues (rehearsal only, press A) ---------------- */
  function toggleCues() {
    var root = document.documentElement;
    var on = root.getAttribute("data-cues") === "on";
    root.setAttribute("data-cues", on ? "off" : "on");
    toast(on
      ? "Presenter cues <b>hidden</b> from the deck. Press <b>P</b> for the presenter window."
      : "Presenter cues now <b>visible on the deck</b> — the audience can see them. Press <b>A</b> to hide.");
  }

  /* ---------------- reset one slide's interactions ---------------- */
  function resetSlide() {
    if (!window.Widgets || !window.Widgets.resetSlide) return;
    window.Widgets.resetSlide(deck.slides[deck.index]);
    toast("Interactions on this slide are <b>locked again</b> — polls, cards and reveals are back to their starting state.");
  }

  /* ---------------- toast ---------------- */
  var toastEl = null, toastTimer = null;

  function toast(html) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = html;
    void toastEl.offsetWidth;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 4200);
  }

  /* ---------------- notes ---------------- */
  function toggleNotes() {
    var n = document.querySelector(".notes");
    if (!n) return;
    n.classList.toggle("is-open");
    var b = document.getElementById("btn-notes");
    if (b) b.classList.toggle("is-on", n.classList.contains("is-open"));
  }

  /* ---------------- 90-minute timer ---------------- */
  function renderTimer() {
    var el = document.querySelector(".timer");
    if (!el) return;
    var neg = deck.timer.left < 0;
    var abs = Math.abs(deck.timer.left);
    var m = Math.floor(abs / 60);
    var s = abs % 60;
    el.textContent = (neg ? "+" : "") + pad(m) + ":" + pad(s);
    el.classList.toggle("is-over", neg);
    updatePresenterTimer();
  }

  function toggleTimer() {
    var t = deck.timer;
    var btn = document.getElementById("btn-timer");
    if (t.running) {
      clearInterval(t.tick);
      t.running = false;
      if (btn) btn.classList.remove("is-on");
    } else {
      t.running = true;
      if (btn) btn.classList.add("is-on");
      t.tick = setInterval(function () { t.left--; renderTimer(); }, 1000);
    }
  }

  function resetTimer() {
    clearInterval(deck.timer.tick);
    deck.timer.running = false;
    deck.timer.left = deck.timer.total;
    var btn = document.getElementById("btn-timer");
    if (btn) btn.classList.remove("is-on");
    renderTimer();
  }

  /* ---------------- fullscreen ---------------- */
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
    } else {
      (document.exitFullscreen || function () {}).call(document);
    }
  }

  /* ---------------- scoreboard ---------------- */
  var scores = { a: 0, b: 0 };

  function bumpScore(team, delta) {
    scores[team] = Math.max(0, scores[team] + delta);
    var el = document.querySelector('[data-score="' + team + '"]');
    if (el) {
      el.textContent = scores[team];
      el.classList.remove("score-pop");
      void el.offsetWidth;
      el.classList.add("score-pop");
    }
  }

  function toggleScoreboard() {
    var sb = document.querySelector(".scoreboard");
    if (!sb) return;
    sb.classList.toggle("is-on");
    var b = document.getElementById("btn-score");
    if (b) b.classList.toggle("is-on", sb.classList.contains("is-on"));
  }

  /* ---------------- bindings ---------------- */
  function bindChrome() {
    on("btn-next", next);
    on("btn-prev", prev);
    on("btn-theme", toggleTheme);
    on("btn-overview", toggleOverview);
    on("btn-notes", toggleNotes);
    on("btn-timer", toggleTimer);
    on("btn-full", toggleFullscreen);
    on("btn-score", toggleScoreboard);
    on("btn-presenter", openPresenter);
    on("btn-ov-close", closeOverview);

    // Don't leave an orphaned presenter window behind
    window.addEventListener("beforeunload", function () {
      if (presenter && !presenter.closed) presenter.close();
    });

    document.querySelectorAll("[data-goto]").forEach(function (el) {
      el.addEventListener("click", function () {
        goTo(parseInt(el.dataset.goto, 10) - 1);
      });
    });

    document.querySelectorAll("[data-bump]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        bumpScore(el.dataset.bump, 1);
      });
    });

    var tm = document.querySelector(".timer");
    if (tm) {
      tm.style.cursor = "pointer";
      tm.title = "Click to reset to 90:00";
      tm.addEventListener("click", resetTimer);
    }

    renderTimer();
  }

  function on(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  }

  function bindKeys() {
    document.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;

      var k = e.key;

      if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "Enter") {
        e.preventDefault(); next();
      } else if (k === "ArrowLeft" || k === "PageUp" || k === "Backspace") {
        e.preventDefault(); prev();
      } else if (k === "ArrowDown") {
        e.preventDefault(); next();
      } else if (k === "ArrowUp") {
        e.preventDefault(); prev();
      } else if (k === "Home") {
        e.preventDefault(); goTo(0);
      } else if (k === "End") {
        e.preventDefault(); goTo(deck.slides.length - 1);
      } else if (k === "Escape") {
        e.preventDefault();
        var ov = document.querySelector(".overview");
        var nt = document.querySelector(".notes");
        if (ov && ov.classList.contains("is-open")) closeOverview();
        else if (nt && nt.classList.contains("is-open")) toggleNotes();
        else toggleOverview();
      } else if (k === "o" || k === "O") {
        e.preventDefault(); toggleOverview();
      } else if (k === "s" || k === "S") {
        e.preventDefault(); toggleNotes();
      } else if (k === "d" || k === "D") {
        e.preventDefault(); toggleTheme();
      } else if (k === "t" || k === "T") {
        e.preventDefault(); toggleTimer();
      } else if (k === "f" || k === "F") {
        e.preventDefault(); toggleFullscreen();
      } else if (k === "k" || k === "K") {
        e.preventDefault(); toggleScoreboard();
      } else if (k === "p" || k === "P") {
        e.preventDefault(); openPresenter();
      } else if (k === "a" || k === "A") {
        e.preventDefault(); toggleCues();
      } else if (k === "r" || k === "R") {
        e.preventDefault(); resetSlide();
      } else if (k === "q" || k === "Q") {
        e.preventDefault(); bumpScore("a", 1);
      } else if (k === "w" || k === "W") {
        e.preventDefault(); bumpScore("b", 1);
      }
    });
  }

  function bindSwipe() {
    var x0 = null, y0 = null;
    document.addEventListener("touchstart", function (e) {
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      var dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 62 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        dx < 0 ? next() : prev();
      }
      x0 = y0 = null;
    }, { passive: true });
  }

  /* ---------------- expose ---------------- */
  window.Deck = {
    goTo: goTo, next: next, prev: prev,
    runCounters: function (slide) { runCounters(slide || deck.slides[deck.index]); },
    get index() { return deck.index; },
    get count() { return deck.slides.length; }
  };

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init)
    : init();
})();
