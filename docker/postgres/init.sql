-- ============================================================
-- Arumu test data — PostgreSQL
-- POSTGRES_DB=arumu_test is created automatically by the image.
-- A second database (arumu_analytics) is created here.
-- ============================================================

-- arumu_analytics must be created outside a transaction
\set ON_ERROR_STOP on

CREATE DATABASE arumu_analytics
  ENCODING 'UTF8'
  LC_COLLATE 'en_US.utf8'
  LC_CTYPE   'en_US.utf8'
  TEMPLATE template0;

-- ── arumu_test ───────────────────────────────────────────────
\c arumu_test

CREATE TABLE categories (
  id          SERIAL        PRIMARY KEY,
  name        VARCHAR(100)  NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE TABLE customers (
  id         SERIAL        PRIMARY KEY,
  name       VARCHAR(150)  NOT NULL,
  email      VARCHAR(255)  NOT NULL UNIQUE,
  age        SMALLINT      CHECK (age BETWEEN 0 AND 150),
  balance    NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  is_active  BOOLEAN       NOT NULL DEFAULT TRUE,
  notes      TEXT,
  created_at TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_name ON customers (name);

CREATE TABLE products (
  id          SERIAL        PRIMARY KEY,
  category_id INT           NOT NULL REFERENCES categories (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  name        VARCHAR(200)  NOT NULL,
  sku         VARCHAR(50)   NOT NULL UNIQUE,
  price       NUMERIC(10,2) NOT NULL,
  stock       INT           NOT NULL DEFAULT 0,
  weight      REAL,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_category ON products (category_id);

CREATE TABLE orders (
  id          SERIAL        PRIMARY KEY,
  customer_id INT           NOT NULL REFERENCES customers (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  order_date  DATE          NOT NULL,
  total       NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  status      VARCHAR(20)   NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','processing','shipped','delivered','cancelled')),
  notes       VARCHAR(500),
  created_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_customer    ON orders (customer_id);
CREATE INDEX idx_orders_date_status ON orders (order_date, status);

CREATE TABLE order_items (
  id         SERIAL        PRIMARY KEY,
  order_id   INT           NOT NULL REFERENCES orders   (id) ON DELETE CASCADE  ON UPDATE CASCADE,
  product_id INT           NOT NULL REFERENCES products (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  quantity   INT           NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL
);

CREATE INDEX idx_oi_order   ON order_items (order_id);
CREATE INDEX idx_oi_product ON order_items (product_id);

-- ── Seed data ────────────────────────────────────────────────

INSERT INTO categories (name, description) VALUES
  ('Electronics',   'Devices and accessories'),
  ('Books',         'Technical and general books'),
  ('Clothing',      'Apparel and accessories'),
  ('Home & Garden', 'Home improvement supplies'),
  ('Sports',        'Equipment and activewear');

INSERT INTO customers (name, email, age, balance, is_active, notes) VALUES
  ('Alice Johnson', 'alice@example.com', 29, 1500.00, TRUE,  'VIP customer, prefers express shipping'),
  ('Bob Smith',     'bob@example.com',   42,  250.50, TRUE,  NULL),
  ('Carol White',   'carol@example.com', 35,    0.00, FALSE, 'Account suspended pending review'),
  ('David Brown',   'david@example.com', 55,  890.75, TRUE,  NULL),
  ('Eve Davis',     'eve@example.com',   28, 3200.00, TRUE,  'Newsletter subscriber'),
  ('Frank Miller',  'frank@example.com', 61,  125.00, TRUE,  NULL),
  ('Grace Wilson',  'grace@example.com', 33,    0.00, TRUE,  NULL),
  ('Hank Moore',    'hank@example.com',  47,  670.25, FALSE, 'Inactive since 2023'),
  ('Ivy Taylor',    'ivy@example.com',   24,   50.00, TRUE,  NULL),
  ('Jack Anderson', 'jack@example.com',  38, 4100.00, TRUE,  'Corporate account');

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

-- ── arumu_analytics ──────────────────────────────────────────
\c arumu_analytics

CREATE TABLE daily_sales (
  id            SERIAL        PRIMARY KEY,
  sale_date     DATE          NOT NULL UNIQUE,
  revenue       NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  order_count   INT           NOT NULL DEFAULT 0,
  new_customers INT           NOT NULL DEFAULT 0
);

CREATE INDEX idx_daily_sales_revenue ON daily_sales (revenue);

CREATE TABLE traffic_sources (
  id        SERIAL      PRIMARY KEY,
  name      VARCHAR(50) NOT NULL,
  visits    INT         NOT NULL DEFAULT 0,
  logged_at TIMESTAMP   NOT NULL DEFAULT NOW()
);

INSERT INTO daily_sales (sale_date, revenue, order_count, new_customers) VALUES
  ('2024-04-12', 1234.56, 5, 2),
  ('2024-04-13',  890.00, 3, 1),
  ('2024-04-14', 2100.75, 8, 4),
  ('2024-04-15', 1750.25, 6, 0),
  ('2024-04-16',  430.00, 2, 1);

INSERT INTO traffic_sources (name, visits) VALUES
  ('organic', 1520), ('paid_search', 870), ('social', 340), ('referral', 210), ('direct', 640);
