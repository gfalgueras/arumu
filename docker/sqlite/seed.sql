-- ============================================================
-- Arumu test data — SQLite
-- Usage: sqlite3 arumu_test.db < seed.sql
-- Then open arumu_test.db in the app (file picker).
-- ============================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER  PRIMARY KEY AUTOINCREMENT,
  name        TEXT     NOT NULL UNIQUE,
  description TEXT,
  created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id         INTEGER  PRIMARY KEY AUTOINCREMENT,
  name       TEXT     NOT NULL,
  email      TEXT     NOT NULL UNIQUE,
  age        INTEGER,
  balance    REAL     NOT NULL DEFAULT 0.00,
  is_active  INTEGER  NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  notes      TEXT,
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (name);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER  PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER  NOT NULL REFERENCES categories (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  name        TEXT     NOT NULL,
  sku         TEXT     NOT NULL UNIQUE,
  price       REAL     NOT NULL,
  stock       INTEGER  NOT NULL DEFAULT 0,
  weight      REAL,
  is_active   INTEGER  NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);

CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER  PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER  NOT NULL REFERENCES customers (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  order_date  TEXT     NOT NULL,
  total       REAL     NOT NULL DEFAULT 0.00,
  status      TEXT     NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','processing','shipped','delivered','cancelled')),
  notes       TEXT,
  created_at  DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_customer    ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_date_status ON orders (order_date, status);

CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER  PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER  NOT NULL REFERENCES orders   (id) ON DELETE CASCADE  ON UPDATE CASCADE,
  product_id INTEGER  NOT NULL REFERENCES products (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  quantity   INTEGER  NOT NULL DEFAULT 1,
  unit_price REAL     NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oi_order   ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_oi_product ON order_items (product_id);

-- ── Seed data ────────────────────────────────────────────────

INSERT INTO categories (name, description) VALUES
  ('Electronics',   'Devices and accessories'),
  ('Books',         'Technical and general books'),
  ('Clothing',      'Apparel and accessories'),
  ('Home & Garden', 'Home improvement supplies'),
  ('Sports',        'Equipment and activewear');

INSERT INTO customers (name, email, age, balance, is_active, notes) VALUES
  ('Alice Johnson', 'alice@example.com', 29, 1500.00, 1, 'VIP customer, prefers express shipping'),
  ('Bob Smith',     'bob@example.com',   42,  250.50, 1, NULL),
  ('Carol White',   'carol@example.com', 35,    0.00, 0, 'Account suspended pending review'),
  ('David Brown',   'david@example.com', 55,  890.75, 1, NULL),
  ('Eve Davis',     'eve@example.com',   28, 3200.00, 1, 'Newsletter subscriber'),
  ('Frank Miller',  'frank@example.com', 61,  125.00, 1, NULL),
  ('Grace Wilson',  'grace@example.com', 33,    0.00, 1, NULL),
  ('Hank Moore',    'hank@example.com',  47,  670.25, 0, 'Inactive since 2023'),
  ('Ivy Taylor',    'ivy@example.com',   24,   50.00, 1, NULL),
  ('Jack Anderson', 'jack@example.com',  38, 4100.00, 1, 'Corporate account');

INSERT INTO products (category_id, name, sku, price, stock, weight) VALUES
  (1, 'Laptop Pro 15"',           'ELEC-001', 1299.99,  45, 2.10),
  (1, 'Wireless Mouse',           'ELEC-002',   29.99, 200, 0.10),
  (1, 'USB-C Hub 7-in-1',         'ELEC-003',   49.99, 150, 0.30),
  (1, 'Mechanical Keyboard',      'ELEC-004',   89.99,  75, 1.20),
  (2, 'Clean Code',               'BOOK-001',   39.99,  30, 0.80),
  (2, 'The Pragmatic Programmer', 'BOOK-002',   44.99,  25, 0.70),
  (3, 'Developer Hoodie L',       'CLTH-001',   59.99, 100, 0.60),
  (3, 'Logo T-Shirt M',           'CLTH-002',   24.99, 250, 0.30),
  (4, 'Standing Desk Mat',        'HOME-001',   79.99,  60, 2.50),
  (5, 'Ergonomic Cushion',        'SPRT-001',   34.99,  80, 0.90);

INSERT INTO orders (customer_id, order_date, total, status) VALUES
  (1,  '2024-01-15', 1359.97, 'delivered'),
  (2,  '2024-02-03',   74.98, 'delivered'),
  (1,  '2024-03-20',   49.99, 'shipped'),
  (4,  '2024-04-11',   84.98, 'processing'),
  (5,  '2024-04-15', 1384.97, 'pending'),
  (10, '2024-04-18',  239.95, 'pending');

INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
  (1, 1, 1, 1299.99), (1, 2, 3,   29.99),
  (2, 5, 1,   39.99), (2, 8, 1,   24.99),
  (3, 3, 1,   49.99),
  (4, 5, 1,   39.99), (4, 6, 1,   44.99),
  (5, 1, 1, 1299.99), (5, 4, 1,   89.99),
  (6, 7, 2,   59.99), (6, 9, 1,   79.99), (6, 10, 1, 34.99);
