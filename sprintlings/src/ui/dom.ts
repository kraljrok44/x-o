type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & { class?: string; style?: string; onClick?: (e: MouseEvent) => void };

/** Tiny DOM builder: h('div', { class: 'x', onClick }, child, ...). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'onClick') el.addEventListener('click', v as EventListener);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k === 'html') el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function coinChip(n: number | string): HTMLElement {
  return h('span', { class: 'chip chip--coin' }, h('i', { class: 'ico-coin' }), String(n));
}

export function gemChip(n: number | string): HTMLElement {
  return h('span', { class: 'chip chip--gem' }, h('i', { class: 'ico-gem' }), String(n));
}

export function priceChip(currency: 'coins' | 'gems', amount: number): HTMLElement {
  return currency === 'coins' ? coinChip(amount.toLocaleString()) : gemChip(amount.toLocaleString());
}

export function progressBar(value: number, max: number, kind = ''): HTMLElement {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 100;
  return h('div', { class: `progress ${kind}` }, h('div', { style: `width:${pct}%` }));
}
