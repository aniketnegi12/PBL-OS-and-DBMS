/**
 * views/logs.js — Audit Log Stream View
 */
import { Store } from '../store.js';
import { fmtDateTime } from '../data.js';

export function renderLogs(state) {
  const s = state || Store.getInstance().getState();
  _renderLogStream(s.logs);
  _populateFilter(s);
}

function _renderLogStream(logs) {
  const stream = document.getElementById('log-stream');
  if (!stream) return;

  if (logs.length === 0) {
    stream.innerHTML = `
      <div class="empty-state">
        <p class="empty-state__icon" aria-hidden="true">⬡</p>
        <p class="empty-state__text">No log events yet. Start a container to generate events.</p>
      </div>
    `;
    return;
  }

  stream.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table" aria-label="Audit logs">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Container</th>
            <th scope="col">Old Status</th>
            <th scope="col">New Status</th>
            <th scope="col">Message</th>
          </tr>
        </thead>
        <tbody>
          ${logs.map(l => `
            <tr class="log-entry-row" style="animation:log-slide-in var(--dur-base) var(--ease-out) both">
              <td class="td-mono">${fmtDateTime(l.time)}</td>
              <td class="td-name">${esc(l.containerName)} <span style="color:var(--color-text-muted);font-size:var(--text-xs)">#${l.containerId}</span></td>
              <td>
                ${l.oldStatus
                  ? `<span class="badge badge--status-${l.oldStatus}">${l.oldStatus}</span>`
                  : '<span style="color:var(--color-text-muted);font-size:var(--text-xs)">—</span>'
                }
              </td>
              <td><span class="badge badge--status-${l.newStatus}">${l.newStatus}</span></td>
              <td style="color:var(--color-text-sub);font-size:var(--text-sm)">${esc(l.message)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function _populateFilter(state) {
  const select = document.getElementById('log-filter-container');
  if (!select || select.options.length > 1) return;

  state.containers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (#${c.id})`;
    select.appendChild(opt);
  });

  select.addEventListener('change', () => {
    const val = select.value;
    const store = Store.getInstance();
    const allLogs = store.getState().logs;
    if (val === 'all') {
      _renderLogStream(allLogs);
    } else {
      _renderLogStream(allLogs.filter(l => l.containerId === +val));
    }
  });

  document.getElementById('clear-logs')?.addEventListener('click', () => {
    document.getElementById('log-stream').innerHTML = `
      <div class="empty-state">
        <p class="empty-state__icon" aria-hidden="true">⬡</p>
        <p class="empty-state__text">Logs cleared</p>
      </div>
    `;
  });
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
