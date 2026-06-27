export type NodeType =
  | 'actor' | 'webclient' | 'service' | 'database'
  | 'system' | 'network' | 'ecosystem';

export type Protocol = 'HTTPS' | 'HTTP' | 'AMQP' | 'JDBC' | 'TCP' | 'interacts' | 'deployed-in';

export const NODE_COLORS: Record<NodeType, string> = {
  actor:     '#60a5fa',
  webclient: '#34d399',
  service:   '#a78bfa',
  database:  '#f59e0b',
  system:    '#fb923c',
  network:   '#94a3b8',
  ecosystem: '#22d3ee',
};

export const NODE_SIZES: Record<NodeType, number> = {
  actor:     6,
  webclient: 6,
  service:   10,
  database:  8,
  system:    8,
  network:   5,
  ecosystem: 8,
};

export const EDGE_COLORS: Record<Protocol, string> = {
  HTTPS:       '#e2e8f0',
  HTTP:        '#94a3b8',
  AMQP:        '#fb923c',
  JDBC:        '#f59e0b',
  TCP:         '#64748b',
  interacts:   '#60a5fa',
  'deployed-in': '#1e293b',
};

export const EDGE_WIDTHS: Record<string, number> = {
  high:   3,
  medium: 2,
  low:    1,
  default: 1.5,
};

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  actor:     'Actor',
  webclient: 'Web Client',
  service:   'Service',
  database:  'Database',
  system:    'System',
  network:   'Network',
  ecosystem: 'External',
};

export const PROTOCOL_LABELS: Record<Protocol, string> = {
  HTTPS:       'HTTPS (sync)',
  HTTP:        'HTTP (sync)',
  AMQP:        'AMQP (async)',
  JDBC:        'JDBC',
  TCP:         'TCP',
  interacts:   'Human interaction',
  'deployed-in': 'Deployed in',
};

export const HEALTH_DOWN_COLOR = '#ef4444';
export const HEALTH_UP_COLOR   = '#22c55e';

export const PROTOCOL_ASYNC: Record<Protocol, boolean> = {
  HTTPS:       false,
  HTTP:        false,
  AMQP:        true,
  JDBC:        false,
  TCP:         false,
  interacts:   false,
  'deployed-in': false,
};
