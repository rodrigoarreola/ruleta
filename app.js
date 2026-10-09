(() => {
  const MAX_NUMBERS = 5000;
  const COLORS = ['#ffd6e0', '#ffe8c2', '#fff6b8', '#d4f5c9', '#c7f0f2', '#cfe0ff', '#e4d4ff', '#fbd3f2'];
  const STORE = 'ruleta-rifa-v1';

  const $ = (id) => document.getElementById(id);
  const canvas = $('wheel'), ctx = canvas.getContext('2d');
  const startEl = $('start'), endEl = $('end'), spinBtn = $('spin');
  const infoEl = $('info'), errorEl = $('error'), historyEl = $('history');
  const toggleBtn = $('remove-winners'), dialog = $('winner-dialog');

  let numbers = [];       // números actualmente en la ruleta
  let winners = [];       // historial
  let removeWinners = false;
  let angle = 0;          // rotación actual (rad)
  let spinning = false;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        start: startEl.value, end: endEl.value, winners, removeWinners,
      }));
    } catch {}
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      if (!s) return;
      startEl.value = s.start; endEl.value = s.end;
      winners = Array.isArray(s.winners) ? s.winners : [];
      removeWinners = !!s.removeWinners;
    } catch {}
  }

  function randInt(n) {
    const max = Math.floor(2 ** 32 / n) * n;
    const buf = new Uint32Array(1);
    do { crypto.getRandomValues(buf); } while (buf[0] >= max);
    return buf[0] % n;
  }

  function readRange() {
    const a = Number(startEl.value), b = Number(endEl.value);
    if (startEl.value === '' || endEl.value === '') return { error: 'Escribe ambos números.' };
    if (!Number.isInteger(a) || !Number.isInteger(b)) return { error: 'Usa solo números enteros.' };
    if (a > b) return { error: 'El número inicial debe ser menor o igual al final.' };
    if (b - a + 1 > MAX_NUMBERS) return { error: `El rango máximo es de ${MAX_NUMBERS} números.` };
    return { a, b };
  }

  function rebuild(keepOrder = false) {
    const r = readRange();
    errorEl.textContent = r.error || '';
    if (r.error) { numbers = []; spinBtn.disabled = true; infoEl.textContent = ''; draw(); return; }
    const out = removeWinners ? new Set(winners) : new Set();
    if (keepOrder && numbers.length) {
      numbers = numbers.filter((n) => !out.has(n));
    } else {
      numbers = [];
      for (let n = r.a; n <= r.b; n++) if (!out.has(n)) numbers.push(n);
    }
    spinBtn.disabled = spinning || numbers.length < 1;
    infoEl.textContent = numbers.length
      ? `${numbers.length} número${numbers.length === 1 ? '' : 's'} en la ruleta (${r.a} a ${r.b}).`
      : 'Ya salieron todos los números.';
    draw();
  }

  function draw() {
    const W = canvas.width, c = W / 2, R = c - 8;
    ctx.clearRect(0, 0, W, W);
    const n = numbers.length;
    if (!n) {
      ctx.fillStyle = '#e5e7f0'; ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const step = (Math.PI * 2) / n;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(angle);
    ctx.lineWidth = n > 300 ? 0 : 1;
    ctx.strokeStyle = '#ffffffaa';
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, i * step, (i + 1) * step);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      if (ctx.lineWidth) ctx.stroke();
    }
    // etiquetas solo si caben (alto del sector >= ~14px)
    const fontPx = Math.min(36, (step * R * 0.8) * 0.75);
    if (fontPx >= 10) {
      ctx.fillStyle = '#2b2d42';
      ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < n; i++) {
        ctx.save();
        ctx.rotate((i + 0.5) * step);
        ctx.fillText(String(numbers[i]), R - 16, 0);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // El puntero está a la derecha (ángulo 0). El sector i cubre [i*step,(i+1)*step] + angle.
  function spin() {
    if (spinning || !numbers.length) return;
    spinning = true; spinBtn.disabled = true;
    const n = numbers.length, step = (Math.PI * 2) / n;
    const idx = randInt(n);
    const jitter = (0.1 + Math.random() * 0.8) * step;       // evita caer justo en una línea
    const target = -(idx * step + jitter);                    // deja el sector idx bajo el puntero
    const turns = 6 + Math.floor(Math.random() * 3);
    const from = angle;
    let delta = (target - from) % (Math.PI * 2);
    if (delta > 0) delta -= Math.PI * 2;
    const to = from + delta - turns * Math.PI * 2;
    const dur = reduceMotion ? 0 : 5000;
    const t0 = performance.now();

    const frame = (now) => {
      const t = dur ? Math.min(1, (now - t0) / dur) : 1;
      const ease = 1 - Math.pow(1 - t, 4);
      angle = from + (to - from) * ease;
      draw();
      if (t < 1) return requestAnimationFrame(frame);
      angle = ((to % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      finish(numbers[idx]);
    };
    requestAnimationFrame(frame);
  }

  function finish(num) {
    spinning = false;
    winners.push(num);
    renderHistory();
    $('winner-number').textContent = num;
    if (dialog.showModal) dialog.showModal(); else alert(`Ganador: ${num}`);
    save();
    if (removeWinners) { angle = 0; }
    rebuild(true);
  }

  function renderHistory() {
    historyEl.replaceChildren(...winners.map((w) => {
      const li = document.createElement('li'); li.textContent = w; return li;
    }));
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  function onRangeChange() { angle = 0; save(); rebuild(); }

  startEl.addEventListener('input', onRangeChange);
  endEl.addEventListener('input', onRangeChange);
  $('range-form').addEventListener('submit', (e) => e.preventDefault());
  spinBtn.addEventListener('click', spin);
  canvas.addEventListener('click', spin);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') spin();
  });
  toggleBtn.addEventListener('click', () => {
    removeWinners = !removeWinners;
    toggleBtn.setAttribute('aria-pressed', removeWinners);
    save(); rebuild();
  });
  $('shuffle').addEventListener('click', () => {
    if (spinning) return;
    for (let i = numbers.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    angle = 0; draw();
  });
  $('sort').addEventListener('click', () => {
    if (spinning) return;
    numbers.sort((a, b) => a - b);
    angle = 0; draw();
  });
  $('clear').addEventListener('click', () => {
    winners = []; renderHistory(); save(); rebuild();
  });

  load();
  toggleBtn.setAttribute('aria-pressed', removeWinners);
  renderHistory();
  rebuild();
})();
