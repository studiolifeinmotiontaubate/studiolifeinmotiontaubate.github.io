(function () {
  "use strict";
  var K_HIST = "lim:historico:v1", K_LAST = "lim:ultimas:v1", K_OPT = "lim:opcoes:v1", K_SESS = "lim:sessao:v1:";
  function ld(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function sv(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function rm(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  var opt = ld(K_OPT, { auto: true, som: true, tela: false });
  function saveOpt() { sv(K_OPT, opt); }

  /* ---------- cronômetro de descanso ---------- */
  var tb = $("#tbar"), tt = $("#tbar-t"), tl = $("#tbar-l"), fim = 0, iv = null, ctx = null, hideT = null;
  function unlock() {
    try {
      if (!ctx) { var A = window.AudioContext || window.webkitAudioContext; if (A) ctx = new A(); }
      if (ctx && ctx.state === "suspended") ctx.resume();
    } catch (e) {}
  }
  function beep() {
    if (!opt.som || !ctx) return;
    try {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.2;
      o.start(); o.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }
  function show(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); tt.textContent = pad(Math.floor(s / 60)) + ":" + pad(s % 60); }
  function tick() {
    var r = fim - Date.now();
    if (r <= 0) {
      clearInterval(iv); iv = null; show(0); tb.classList.add("fim"); tl.textContent = "Descanso concluído";
      beep(); if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      hideT = setTimeout(function () { tb.classList.remove("on", "fim"); }, 4000);
    } else show(r);
  }
  function start(sec, label) {
    if (!tb) return;
    unlock(); clearInterval(iv); clearTimeout(hideT);
    tb.classList.remove("fim"); tb.classList.add("on"); tl.textContent = label || "Descanso";
    fim = Date.now() + sec * 1000; show(sec * 1000); iv = setInterval(tick, 250);
  }
  if (tb) {
    $("#tbar-mais").addEventListener("click", function () { if (iv) { fim += 15000; tick(); } });
    $("#tbar-pular").addEventListener("click", function () { clearInterval(iv); iv = null; clearTimeout(hideT); tb.classList.remove("on", "fim"); });
  }
  window.LIMTimer = { start: start };

  /* ---------- manter a tela ligada ---------- */
  var wl = null, ativo = false;
  function wake(on) {
    try {
      if (on && navigator.wakeLock) { navigator.wakeLock.request("screen").then(function (l) { wl = l; }).catch(function () {}); }
      else if (wl) { wl.release(); wl = null; }
    } catch (e) {}
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && ativo && opt.tela) wake(true); });

  /* ---------- página de treino ---------- */
  var root = $("[data-treino]");
  if (root) {
    var slug = root.getAttribute("data-slug"), nome = root.getAttribute("data-nome");
    var S = ld(K_SESS + slug, { inicio: null, series: {}, notas: {} });
    var LAST = ld(K_LAST, {});
    var exs = $$(".ex", root);
    function persist() { sv(K_SESS + slug, S); }

    var op = $("#opts");
    if (op) {
      op.hidden = false;
      [["o-auto", "auto"], ["o-som", "som"], ["o-tela", "tela"]].forEach(function (p) {
        var el = $("#" + p[0]); if (!el) return;
        el.checked = !!opt[p[1]];
        el.addEventListener("change", function () {
          opt[p[1]] = el.checked; saveOpt();
          if (p[1] === "tela") { ativo = true; wake(el.checked); }
          if (p[1] === "som" && el.checked) unlock();
        });
      });
    }

    exs.forEach(function (ex) {
      var key = ex.getAttribute("data-key"), tot = +ex.getAttribute("data-series"), rest = +ex.getAttribute("data-rest");
      var tools = $(".ex-tools", ex), dots = $(".dots", ex), btn = $(".b-serie", ex), und = $(".b-desf", ex), inp = $(".nota", ex), hint = $(".hint", ex);
      tools.hidden = false;
      for (var i = 0; i < tot; i++) dots.appendChild(document.createElement("span"));
      if (LAST[key]) hint.textContent = "Última vez: " + LAST[key];
      inp.value = S.notas[key] || "";
      function paint() {
        var n = S.series[key] || 0;
        $$("span", dots).forEach(function (d, i) { d.className = i < n ? "on" : ""; });
        ex.classList.toggle("done", n >= tot);
        btn.textContent = n >= tot ? "Todas as séries feitas ✓" : "Fiz a série " + (n + 1) + " de " + tot;
        btn.disabled = n >= tot;
        und.hidden = n === 0;
      }
      btn.addEventListener("click", function () {
        var n = S.series[key] || 0; if (n >= tot) return;
        if (!S.inicio) S.inicio = Date.now();
        S.series[key] = n + 1; persist(); paint(); unlock();
        if (opt.tela) { ativo = true; wake(true); }
        if (opt.auto && n + 1 < tot && rest) start(rest, "Descanso: " + ex.getAttribute("data-nome"));
      });
      und.addEventListener("click", function () { var n = S.series[key] || 0; if (n > 0) { S.series[key] = n - 1; persist(); paint(); } });
      inp.addEventListener("input", function () { S.notas[key] = inp.value; persist(); });
      paint();
    });

    var fin = $("#concluir");
    if (fin) fin.addEventListener("click", function () {
      var feitas = 0, plan = 0, notas = {};
      exs.forEach(function (ex) {
        var k = ex.getAttribute("data-key"); feitas += S.series[k] || 0; plan += +ex.getAttribute("data-series");
        var t = (S.notas[k] || "").trim(); if (t) { notas[k] = { n: ex.getAttribute("data-nome"), t: t }; LAST[k] = t; }
      });
      if (!feitas && !confirm("Você ainda não marcou nenhuma série. Registrar mesmo assim?")) return;
      var sens = $("input[name=sens]:checked");
      var h = ld(K_HIST, []);
      h.unshift({ id: Date.now(), d: new Date().toISOString(), slug: slug, nome: nome, feitas: feitas, plan: plan, min: S.inicio ? Math.max(1, Math.round((Date.now() - S.inicio) / 60000)) : null, sens: sens ? sens.value : "", notas: notas });
      if (h.length > 500) h.length = 500;
      var ok = sv(K_HIST, h); sv(K_LAST, LAST); rm(K_SESS + slug);
      var msg = $("#msg-fim");
      msg.hidden = false;
      msg.innerHTML = ok ? "Treino registrado! 💪 <a href=\"../historico/\">Ver meu histórico</a>" : "Não foi possível salvar neste navegador. Verifique se o armazenamento está liberado.";
      ativo = false; wake(false); fin.disabled = true;
      if (tb) tb.classList.remove("on", "fim");
    });
  }

  /* ---------- biblioteca: filtros e cronômetro avulso ---------- */
  var fil = $(".fil");
  if (fil) {
    $$("button", fil).forEach(function (b) {
      b.addEventListener("click", function () {
        var f = b.getAttribute("data-f");
        $$("button", fil).forEach(function (x) { x.classList.toggle("on", x === b); });
        $$("[data-obj]").forEach(function (c) { c.hidden = !(f === "todos" || (" " + c.getAttribute("data-obj") + " ").indexOf(" " + f + " ") > -1); });
      });
    });
  }
  $$("[data-rest-btn]").forEach(function (b) {
    b.addEventListener("click", function () { start(+b.getAttribute("data-rest-btn"), "Descanso"); });
  });

  /* ---------- histórico ---------- */
  var H = $("#hist");
  if (H) {
    var SENS = { leve: "Leve", mod: "Moderado", pes: "Pesado" };
    var mondayOf = function (d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
    var render = function () {
      var hist = ld(K_HIST, []);
      var st = $("#h-stats"), ch = $("#h-chart"), ls = $("#h-list"), em = $("#h-empty"), tl2 = $("#h-tools");
      if (!hist.length) { em.hidden = false; st.hidden = ch.hidden = ls.hidden = tl2.hidden = true; return; }
      em.hidden = true; st.hidden = ch.hidden = ls.hidden = tl2.hidden = false;
      var now = new Date(), m0 = mondayOf(now), sem = 0, mes = 0;
      hist.forEach(function (e) { var d = new Date(e.d); if (d >= m0) sem++; if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) mes++; });
      st.innerHTML = "<div><strong>" + sem + "</strong>nesta semana</div><div><strong>" + mes + "</strong>neste mês</div><div><strong>" + hist.length + "</strong>no total</div>";
      var W = [], i;
      for (i = 7; i >= 0; i--) { var s = new Date(m0); s.setDate(s.getDate() - 7 * i); W.push({ s: s, n: 0 }); }
      hist.forEach(function (e) { var d = new Date(e.d); for (var j = W.length - 1; j >= 0; j--) { if (d >= W[j].s) { W[j].n++; break; } } });
      var mx = Math.max.apply(null, W.map(function (w) { return w.n; }).concat([1])), svg = "";
      W.forEach(function (w, k) {
        var h = Math.round(w.n / mx * 80), x = 12 + k * 38;
        svg += '<rect x="' + x + '" y="' + (100 - h) + '" width="28" height="' + Math.max(h, 2) + '" rx="5" fill="#a6ce39"' + (w.n ? "" : ' opacity=".35"') + "/>";
        if (w.n) svg += '<text x="' + (x + 14) + '" y="' + (94 - h) + '" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">' + w.n + "</text>";
        svg += '<text x="' + (x + 14) + '" y="118" text-anchor="middle" font-size="9" fill="currentColor" opacity=".7">' + pad(w.s.getDate()) + "/" + pad(w.s.getMonth() + 1) + "</text>";
      });
      ch.innerHTML = '<h3>Treinos por semana</h3><svg viewBox="0 0 320 126" role="img" aria-label="Gráfico de treinos por semana, últimas 8 semanas">' + svg + "</svg>";
      ls.innerHTML = hist.slice(0, 40).map(function (e) {
        var d = new Date(e.d), t = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
        var notas = Object.keys(e.notas || {}).map(function (k) { return "<li><b>" + esc(e.notas[k].n) + ":</b> " + esc(e.notas[k].t) + "</li>"; }).join("");
        return "<details><summary><b>" + esc(t) + "</b> · " + esc(e.nome) + (e.sens ? ' <span class="tag">' + SENS[e.sens] + "</span>" : "") + "</summary><div class=\"det\"><p>Séries feitas: " + e.feitas + " de " + e.plan + (e.min ? " · " + e.min + " min" : "") + "</p>" + (notas ? "<ul>" + notas + "</ul>" : "") + '<button type="button" class="btn ghost sm" data-del="' + e.id + '">Excluir este registro</button></div></details>';
      }).join("");
    };
    H.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-del]"); if (!b) return;
      if (!confirm("Excluir este registro?")) return;
      var id = +b.getAttribute("data-del");
      sv(K_HIST, ld(K_HIST, []).filter(function (e) { return e.id !== id; })); render();
    });
    $("#h-copiar").addEventListener("click", function () {
      var hist = ld(K_HIST, []).slice(0, 10);
      var txt = "Meu histórico de treinos — Studio Life in Motion\n" + hist.map(function (e) {
        var d = new Date(e.d);
        return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + " — " + e.nome + " — " + e.feitas + "/" + e.plan + " séries" + (e.sens ? " — " + SENS[e.sens] : "");
      }).join("\n");
      var m = $("#h-msg");
      function ok() { m.hidden = false; m.textContent = "Resumo copiado. Agora é só colar no WhatsApp."; }
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(ok).catch(function () { prompt("Copie o resumo:", txt); });
      else prompt("Copie o resumo:", txt);
    });
    $("#h-limpar").addEventListener("click", function () {
      if (confirm("Apagar todo o histórico deste aparelho? Isso não pode ser desfeito.")) { rm(K_HIST); rm(K_LAST); render(); }
    });
    render();
  }
})();
