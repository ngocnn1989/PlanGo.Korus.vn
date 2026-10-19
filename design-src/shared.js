// Dựng bảng Gantt minh họa (dữ liệu demo). bars: [line, startDay, len, colorVar, label, flags]
// flags: 'fc' = dự báo, 'warn' = xung đột; gaps: [line, startDay, len]
window.renderGantt = function renderGantt(el, opts) {
  const { lines, days, bars = [], gaps = [], dayW, rowH = 40, labelW = 84, today = null, showDays = true } = opts;
  el.style.setProperty('--day-w', dayW + 'px');
  el.style.setProperty('--row-h', rowH + 'px');
  el.style.setProperty('--label-w', labelW + 'px');
  const head = document.createElement('div');
  head.className = 'g-head';
  head.innerHTML = '<div class="g-label" style="color:#94A3B8;font-weight:600">Chuyền</div>';
  const dh = document.createElement('div');
  dh.className = 'g-days';
  dh.style.gridTemplateColumns = `repeat(${days}, ${dayW}px)`;
  for (let d = 1; d <= days; d++) dh.insertAdjacentHTML('beforeend', `<span>${showDays && (d === 1 || d % 5 === 0) ? d : ''}</span>`);
  head.appendChild(dh);
  el.appendChild(head);
  lines.forEach((line) => {
    const row = document.createElement('div');
    row.className = 'g-row';
    row.innerHTML = `<div class="g-label">${line}</div><div class="g-track"></div>`;
    const track = row.lastChild;
    gaps.filter((g) => g[0] === line).forEach(([, s, n]) => {
      track.insertAdjacentHTML('beforeend', `<div class="gap" style="left:${(s - 1) * dayW + 2}px;width:${n * dayW - 4}px"></div>`);
    });
    bars.filter((b) => b[0] === line).forEach(([, s, n, c, label, flags = '']) => {
      track.insertAdjacentHTML('beforeend', `<div class="bar ${flags}" style="left:${(s - 1) * dayW + 2}px;width:${n * dayW - 4}px;background-color:var(${c})">${label || ''}</div>`);
    });
    if (today) track.insertAdjacentHTML('beforeend', `<div class="today" style="left:${(today - 1) * dayW}px"></div>`);
    el.appendChild(row);
  });
};
