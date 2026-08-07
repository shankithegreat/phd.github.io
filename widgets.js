/* ============================================================
   Interactive widgets — declarative, driven by data-attributes
   ============================================================ */
(function () {
  "use strict";

  /* Every widget registers how to put itself back to its untouched state, so a
     rehearsal doesn't leave the deck fully revealed when the talk starts. */
  var resetters = [];

  function onReset(el, fn) { resetters.push({ el: el, fn: fn }); }

  function resetSlide(slide) {
    if (!slide) return;
    resetters.forEach(function (r) {
      if (slide.contains(r.el)) r.fn();
    });
    animateFunnels(slide);
    if (window.Deck && window.Deck.runCounters) window.Deck.runCounters(slide);
  }

  document.addEventListener("DOMContentLoaded", function () {
    initFlips();
    initPolls();
    initGates();
    initRevealBoxes();
    initChecks();
    initWhys();
    initRice();
    initTabs();
    initCountdowns();
    initCrazy8();
    initOrbit();
  });

  /* ------------------------------------------------------------
     1. FLIP CARDS  (Real or Fake ice-breaker)
     ------------------------------------------------------------ */
  function initFlips() {
    document.querySelectorAll(".flip").forEach(function (f) {
      f.addEventListener("click", function () {
        f.classList.toggle("is-flipped");
        checkFlipGate(f.closest("[data-gate-key]"));
      });
      onReset(f, function () { f.classList.remove("is-flipped"); });
    });

    document.querySelectorAll("[data-flip-all]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var scope = document.querySelector(btn.dataset.flipAll);
        if (!scope) return;
        var cards = Array.prototype.slice.call(scope.querySelectorAll(".flip"));
        var anyUnflipped = cards.some(function (c) { return !c.classList.contains("is-flipped"); });
        // Cascade so the reveal lands as a wave, not all at once
        cards.forEach(function (c, i) {
          setTimeout(function () {
            c.classList.toggle("is-flipped", anyUnflipped);
            if (i === cards.length - 1) checkFlipGate(scope.closest("[data-gate-key]") || scope);
          }, i * 110);
        });
        btn.innerHTML = anyUnflipped ? "🔄 Hide all" : "👀 Reveal all";
      });
      onReset(btn, function () { btn.innerHTML = "👀 Reveal all"; });
    });
  }

  /* A debrief that gives away the game stays locked until every card is turned */
  function checkFlipGate(scope) {
    if (!scope || !scope.dataset.gateKey) return;
    var cards = Array.prototype.slice.call(scope.querySelectorAll(".flip"));
    var allFlipped = cards.length && cards.every(function (c) {
      return c.classList.contains("is-flipped");
    });
    if (allFlipped) openGate(scope.dataset.gateKey, 420);
  }

  /* ------------------------------------------------------------
     2. POLLS  — click an option, bars animate to real-world data
     ------------------------------------------------------------ */
  function initPolls() {
    document.querySelectorAll(".poll").forEach(function (poll) {
      var opts = Array.prototype.slice.call(poll.querySelectorAll(".pollopt"));

      onReset(poll, function () {
        poll.classList.remove("is-revealed");
        opts.forEach(function (o) {
          o.classList.remove("is-answer");
          var bar = o.querySelector(".pollopt__bar");
          if (bar) bar.style.width = "0";
          var lab = o.querySelector(".pollopt__pct");
          if (lab) lab.textContent = "";
        });
      });

      opts.forEach(function (opt) {
        opt.addEventListener("click", function () {
          if (poll.classList.contains("is-revealed")) return;
          poll.classList.add("is-revealed");

          opts.forEach(function (o, i) {
            var pct = parseFloat(o.dataset.pct || "0");
            setTimeout(function () {
              var bar = o.querySelector(".pollopt__bar");
              if (bar) bar.style.width = pct + "%";
              var lab = o.querySelector(".pollopt__pct");
              if (lab) lab.textContent = pct + "%";
              if (o.dataset.answer === "true") o.classList.add("is-answer");
            }, i * 130);
          });

          if (poll.dataset.gateKey) openGate(poll.dataset.gateKey, opts.length * 130);
        });
      });
    });
  }

  /* ------------------------------------------------------------
     2b. GATES — content that must not be on screen before the room
         has committed to an answer
     ------------------------------------------------------------ */
  function initGates() {
    document.querySelectorAll("[data-gate-lock]").forEach(function (btn) {
      btn.addEventListener("click", function () { openGate(btn.dataset.gateLock, 0); });
    });

    document.querySelectorAll("[data-gate]").forEach(function (gate) {
      onReset(gate, function () {
        gate.classList.remove("is-open");
        document.querySelectorAll('[data-gate-lock="' + gate.dataset.gate + '"]').forEach(function (b) {
          b.classList.remove("is-hidden");
        });
      });
    });
  }

  function openGate(key, delay) {
    var gate = document.querySelector('[data-gate="' + key + '"]');
    if (!gate || gate.classList.contains("is-open")) return;

    setTimeout(function () {
      gate.classList.add("is-open");
      document.querySelectorAll('[data-gate-lock="' + key + '"]').forEach(function (b) {
        b.classList.add("is-hidden");
      });

      // The bars and counters ran while the gate was closed, so replay them
      var slide = gate.closest(".slide");
      if (!slide) return;
      animateFunnels(slide);
      if (window.Deck && window.Deck.runCounters) window.Deck.runCounters(slide);
    }, delay || 0);
  }

  function animateFunnels(slide) {
    slide.querySelectorAll(".funnel__bar[data-w]").forEach(function (bar, i) {
      bar.style.width = "0%";
      setTimeout(function () { bar.style.width = bar.dataset.w + "%"; }, 180 + i * 130);
    });
  }

  /* ------------------------------------------------------------
     3. TAP-TO-REVEAL BOXES
     ------------------------------------------------------------ */
  function initRevealBoxes() {
    document.querySelectorAll(".reveal-box").forEach(function (b) {
      b.addEventListener("click", function () { b.classList.add("is-open"); });
      onReset(b, function () { b.classList.remove("is-open"); });
    });
  }

  /* ------------------------------------------------------------
     4. TAKEAWAY CHECKLIST
     ------------------------------------------------------------ */
  function initChecks() {
    document.querySelectorAll(".check").forEach(function (c) {
      c.addEventListener("click", function () {
        c.classList.toggle("is-done");
        var all = document.querySelectorAll(".check");
        var done = document.querySelectorAll(".check.is-done");
        if (all.length && done.length === all.length) burst();
      });
      onReset(c, function () { c.classList.remove("is-done"); });
    });
  }

  /* ------------------------------------------------------------
     5. FIVE WHYS — progressive drill-down
     ------------------------------------------------------------ */
  function initWhys() {
    document.querySelectorAll("[data-whys]").forEach(function (wrap) {
      var steps = Array.prototype.slice.call(wrap.querySelectorAll(".why"));
      var btn = document.querySelector(wrap.dataset.whysBtn);
      var i = 0;

      function step() {
        if (i < steps.length) {
          steps[i].classList.add("is-shown");
          i++;
          if (btn) {
            btn.innerHTML = i >= steps.length
              ? "↺ Reset"
              : "👇 Ask &ldquo;why?&rdquo; again <span class='dim'>(" + i + "/" + steps.length + ")</span>";
          }
        } else {
          steps.forEach(function (s) { s.classList.remove("is-shown"); });
          i = 0;
          if (btn) btn.innerHTML = "👇 Ask &ldquo;why?&rdquo;";
        }
      }
      if (btn) btn.addEventListener("click", step);
      wrap.addEventListener("click", function (e) {
        if (e.target.closest(".why")) step();
      });

      onReset(wrap, function () {
        steps.forEach(function (s) { s.classList.remove("is-shown"); });
        i = 0;
        if (btn) btn.innerHTML = "👇 Ask &ldquo;why?&rdquo;";
      });
    });
  }

  /* ------------------------------------------------------------
     6. RICE CALCULATOR
     ------------------------------------------------------------ */
  function initRice() {
    var wrap = document.querySelector("[data-rice]");
    if (!wrap) return;

    var inputs = wrap.querySelectorAll('input[type="range"]');
    var out = wrap.querySelector(".ricescore__n");
    var verdict = wrap.querySelector(".ricescore__v");
    var formula = wrap.querySelector(".ricescore__f");

    function calc() {
      var v = {};
      inputs.forEach(function (inp) {
        v[inp.dataset.k] = parseFloat(inp.value);
        var lab = wrap.querySelector('[data-out="' + inp.dataset.k + '"]');
        if (lab) {
          lab.textContent = inp.dataset.k === "confidence"
            ? inp.value + "%"
            : inp.dataset.k === "effort"
              ? inp.value + " wk"
              : inp.value;
        }
      });

      var score = (v.reach * v.impact * (v.confidence / 100)) / Math.max(0.5, v.effort);
      if (out) out.textContent = Math.round(score).toLocaleString("en-IN");

      if (formula) {
        formula.textContent =
          "(" + v.reach + " × " + v.impact + " × " + v.confidence + "%) ÷ " + v.effort + " wk";
      }

      if (verdict) {
        var t, c;
        if (score >= 900)      { t = "🚀 Build this first";        c = "#30d182"; }
        else if (score >= 300) { t = "✅ Strong candidate";         c = "#66d4cf"; }
        else if (score >= 90)  { t = "🤔 Worth a cheap experiment"; c = "#ffb020"; }
        else                   { t = "🪦 Park it. Not now.";        c = "#ff5566"; }
        verdict.textContent = t;
        verdict.style.color = c;
        if (out) out.style.color = c;
      }
    }

    inputs.forEach(function (inp) { inp.addEventListener("input", calc); });
    calc();
  }

  /* ------------------------------------------------------------
     7. TABS  (Idea → Concept → Product stepper)
     ------------------------------------------------------------ */
  function initTabs() {
    document.querySelectorAll("[data-tabs]").forEach(function (group) {
      var btns = Array.prototype.slice.call(group.querySelectorAll("[data-tab]"));
      var panels = Array.prototype.slice.call(group.querySelectorAll("[data-panel]"));

      function show(key) {
        btns.forEach(function (b) { b.classList.toggle("is-on", b.dataset.tab === key); });
        panels.forEach(function (p) {
          var match = p.dataset.panel === key;
          p.style.display = match ? "" : "none";
          if (match) {
            p.style.animation = "none";
            void p.offsetWidth;
            p.style.animation = "reveal-up 0.55s cubic-bezier(0.16,1,0.3,1) both";
          }
        });
      }

      btns.forEach(function (b) {
        b.addEventListener("click", function () { show(b.dataset.tab); });
      });
      if (btns.length) show(btns[0].dataset.tab);
    });
  }

  /* ------------------------------------------------------------
     8. COUNTDOWNS (workshop timers)
     ------------------------------------------------------------ */
  function initCountdowns() {
    document.querySelectorAll("[data-countdown]").forEach(function (el) {
      var total = parseInt(el.dataset.countdown, 10);
      var display = el.querySelector(".bigtimer");
      var btn = el.querySelector("[data-cd-btn]");
      var left = total;
      var tick = null;

      function render() {
        var m = Math.floor(Math.abs(left) / 60);
        var s = Math.abs(left) % 60;
        if (display) {
          display.textContent = (left < 0 ? "-" : "") + m + ":" + (s < 10 ? "0" + s : s);
          display.classList.toggle("is-warn", left <= 30 && left > 0);
          display.classList.toggle("is-done", left <= 0);
        }
      }

      function start() {
        if (tick) {
          clearInterval(tick); tick = null;
          if (btn) btn.textContent = "▶ Resume";
          return;
        }
        if (left <= 0) { left = total; render(); }
        if (btn) btn.textContent = "⏸ Pause";
        tick = setInterval(function () {
          left--;
          render();
          if (left <= 0) {
            clearInterval(tick); tick = null;
            if (btn) btn.textContent = "↺ Restart";
            burst();
          }
        }, 1000);
      }

      if (btn) btn.addEventListener("click", start);
      render();
    });
  }

  /* ------------------------------------------------------------
     9. CRAZY 8s — 8 boxes, 60 seconds each
     ------------------------------------------------------------ */
  function initCrazy8() {
    var wrap = document.querySelector("[data-c8]");
    if (!wrap) return;

    var boxes = Array.prototype.slice.call(wrap.querySelectorAll(".c8__box"));
    var display = wrap.querySelector(".bigtimer");
    var btn = wrap.querySelector("[data-c8-btn]");
    var per = parseInt(wrap.dataset.c8 || "60", 10);
    var idx = 0, left = per, tick = null;

    function render() {
      if (display) {
        display.textContent = "0:" + (left < 10 ? "0" + left : left);
        display.classList.toggle("is-warn", left <= 10);
      }
      boxes.forEach(function (b, i) {
        b.classList.toggle("is-live", i === idx && tick !== null);
        b.classList.toggle("is-done", i < idx);
      });
    }

    function run() {
      if (tick) {
        clearInterval(tick); tick = null;
        if (btn) btn.textContent = "▶ Resume";
        render();
        return;
      }
      if (idx >= boxes.length) { idx = 0; left = per; }
      if (btn) btn.textContent = "⏸ Pause";
      tick = setInterval(function () {
        left--;
        if (left <= 0) {
          idx++;
          left = per;
          if (idx >= boxes.length) {
            clearInterval(tick); tick = null;
            idx = boxes.length;
            if (btn) btn.textContent = "↺ Run again";
            burst();
          }
        }
        render();
      }, 1000);
      render();
    }

    if (btn) btn.addEventListener("click", run);
    render();
  }

  /* ------------------------------------------------------------
     10. TITLE-SLIDE FLOATING EMOJI
     ------------------------------------------------------------ */
  function initOrbit() {
    document.querySelectorAll(".orbit").forEach(function (o) {
      // Array.from keeps multi-byte emoji intact (split("") would shred surrogate pairs)
      var set = Array.from(o.dataset.emoji || "💡🚀🧠🔍⚙️🎯📈🧪");
      // Fixed positions so nothing ever lands behind the headline
      var spots = [
        [7, 16], [88, 12], [13, 74], [83, 78], [46, 7], [95, 46], [4, 45], [55, 90]
      ];
      set.forEach(function (ch, i) {
        var s = document.createElement("span");
        s.textContent = ch;
        var p = spots[i % spots.length];
        s.style.left = p[0] + "%";
        s.style.top = p[1] + "%";
        s.style.animationDelay = (i * 0.72) + "s";
        s.style.animationDuration = (7.5 + (i % 4)) + "s";
        o.appendChild(s);
      });
    });
  }

  /* ------------------------------------------------------------
     CONFETTI
     ------------------------------------------------------------ */
  function burst() {
    var box = document.createElement("div");
    box.className = "confetti";
    document.body.appendChild(box);

    var colors = ["#0a84ff", "#5e5ce6", "#ff375f", "#30d158", "#ffb020", "#bf5af2", "#64d2ff"];
    for (var i = 0; i < 90; i++) {
      var p = document.createElement("i");
      p.style.left = Math.random() * 100 + "%";
      p.style.background = colors[(Math.random() * colors.length) | 0];
      p.style.animationDuration = (2.1 + Math.random() * 1.9) + "s";
      p.style.animationDelay = (Math.random() * 0.5) + "s";
      p.style.transform = "rotate(" + Math.random() * 360 + "deg)";
      if (Math.random() > 0.6) p.style.borderRadius = "50%";
      box.appendChild(p);
    }
    setTimeout(function () { box.remove(); }, 4600);
  }

  /* Fire confetti when the closing slide is reached */
  document.addEventListener("slide:enter", function (e) {
    if (e.detail.slide.dataset.confetti === "true") setTimeout(burst, 320);

    // Animate funnel bars from zero each time the slide is entered
    animateFunnels(e.detail.slide);
  });

  window.confettiBurst = burst;
  window.Widgets = { resetSlide: resetSlide };
})();
