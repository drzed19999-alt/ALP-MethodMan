/**
 * Single source of truth for per-page action permissions.
 *
 * Structure:
 *   PAGE_ACTIONS = {
 *     [pageKey]: {
 *       label:   'Human page name',
 *       section: 'UI grouping label',
 *       actions: [{ key: 'create', label: 'Create website', verb: 'create' }, ...],
 *     },
 *     ...
 *   }
 *
 * pageKey — must match the frontend route + requirePage(pageKey) middleware.
 * actions — every write endpoint that god should be able to grant / revoke
 *           independently of read access. Keep the list flat: one guard per verb.
 *
 * Rule: adding a new mutating endpoint means (a) picking one of the action
 * keys here (or adding a new one), and (b) putting `requireAction(page, key)`
 * on the route so god's toggle in the drawer actually enforces something.
 */
'use strict';

const PAGE_ACTIONS = {
  'demo-pages': {
    label: 'Websites',
    section: 'Control',
    actions: [
      { key: 'create',         label: 'Create website'          },
      { key: 'edit',           label: 'Edit website'            },
      { key: 'delete',         label: 'Delete website'          },
      { key: 'toggle',         label: 'Toggle online/offline'   },
      { key: 'upload',         label: 'Upload files / pages'    },
      { key: 'regenerate-key', label: 'Regenerate API key'      },
      { key: 'ai-create',      label: 'AI-generate website'     },
      { key: 'tg-config',      label: 'Configure Telegram bot'  },
      { key: 'sync-pages',     label: 'Sync xPages to VPS'      },
    ],
  },
  sessions: {
    label: 'Live Sessions',
    section: 'Monitoring',
    actions: [
      { key: 'redirect',  label: 'Redirect visitor'  },
      { key: 'advance',   label: 'Advance funnel'    },
      { key: 'end',       label: 'End session'       },
      { key: 'delete',    label: 'Delete session'    },
      { key: 'clear-all', label: 'Clear all sessions' },
    ],
  },
  domains: {
    label: 'Domains',
    section: 'Control',
    actions: [
      { key: 'create',      label: 'Add domain'         },
      { key: 'adopt',       label: 'Adopt domain'       },
      { key: 'import',      label: 'Import domains'     },
      { key: 'delete',      label: 'Delete domain'      },
      { key: 'recheck',     label: 'Re-run health check' },
      { key: 'reconfigure', label: 'Reconfigure DNS'    },
      { key: 'assign',      label: 'Assign to website'  },
      { key: 'override',    label: 'Manual override'    },
      { key: 'health-scan', label: 'Run global health scan' },
    ],
  },
  vps: {
    label: 'VPS Control',
    section: 'Control',
    actions: [
      { key: 'control', label: 'Run VPS action (deploy / restart / sync)' },
    ],
  },
  'ip-blocking': {
    label: 'IP Blocking',
    section: 'Security',
    actions: [
      { key: 'create', label: 'Block an IP'   },
      { key: 'delete', label: 'Unblock an IP' },
    ],
  },
  notifications: {
    label: 'Notifications',
    section: 'System',
    actions: [
      { key: 'create',   label: 'Create notification'    },
      { key: 'mark-read', label: 'Mark read'             },
      { key: 'delete',   label: 'Delete notification'    },
    ],
  },
  settings: {
    label: 'Settings',
    section: 'System',
    actions: [
      { key: 'edit',  label: 'Edit settings'  },
      { key: 'reset', label: 'Reset settings' },
      { key: 'view-general',  label: 'View General section'  },
      { key: 'view-telegram', label: 'View Telegram section' },
      { key: 'view-discord',  label: 'View Discord section'  },
      { key: 'view-mail',     label: 'View Mail section'     },
      { key: 'view-websites', label: 'View Websites section' },
      { key: 'view-danger',   label: 'View Danger Zone'      },
    ],
  },
  logs: {
    label: 'Audit Logs',
    section: 'System',
    actions: [
      { key: 'clear',     label: 'Clear filtered logs' },
      { key: 'clear-all', label: 'Clear ALL logs'      },
    ],
  },
  funnels: {
    label: 'Funnels',
    section: 'Control',
    actions: [
      { key: 'create',      label: 'Create funnel'      },
      { key: 'edit',        label: 'Edit funnel'        },
      { key: 'delete',      label: 'Delete funnel'      },
      { key: 'bulk-edit',   label: 'Bulk edit'          },
      { key: 'bulk-delete', label: 'Bulk delete'        },
    ],
  },
};

/** Flat list of `${page}.${action}` strings — handy for validation / audit. */
function allActionIds() {
  const out = [];
  for (const [page, def] of Object.entries(PAGE_ACTIONS)) {
    for (const a of def.actions) out.push(`${page}.${a.key}`);
  }
  return out;
}

module.exports = { PAGE_ACTIONS, allActionIds };
