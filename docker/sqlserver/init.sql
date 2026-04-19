-- ============================================================
-- Arumu test data — SQL Server 2022
-- ============================================================

-- ── Database 1 ───────────────────────────────────────────────
CREATE DATABASE arumu_test;
GO

USE arumu_test;
GO

CREATE TABLE categories (
  id          INT           NOT NULL IDENTITY(1,1),
  name        NVARCHAR(100) NOT NULL,
  description NVARCHAR(MAX),
  created_at  DATETIME2     NOT NULL DEFAULT GETDATE(),
  CONSTRAINT pk_categories  PRIMARY KEY (id),
  CONSTRAINT uq_categories_name UNIQUE (name)
);

CREATE TABLE customers (
  id         INT            NOT NULL IDENTITY(1,1),
  name       NVARCHAR(150)  NOT NULL,
  email      NVARCHAR(255)  NOT NULL,
  age        TINYINT,
  balance    DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  is_active  BIT            NOT NULL DEFAULT 1,
  notes      NVARCHAR(MAX),
  created_at DATETIME2      NOT NULL DEFAULT GETDATE(),
  updated_at DATETIME2      NOT NULL DEFAULT GETDATE(),
  CONSTRAINT pk_customers       PRIMARY KEY (id),
  CONSTRAINT uq_customers_email UNIQUE (email)
);

CREATE INDEX idx_customers_name ON customers (name);

CREATE TABLE products (
  id          INT            NOT NULL IDENTITY(1,1),
  category_id INT            NOT NULL,
  name        NVARCHAR(200)  NOT NULL,
  sku         NVARCHAR(50)   NOT NULL,
  price       DECIMAL(10,2)  NOT NULL,
  stock       INT            NOT NULL DEFAULT 0,
  weight      REAL,
  is_active   BIT            NOT NULL DEFAULT 1,
  created_at  DATETIME2      NOT NULL DEFAULT GETDATE(),
  CONSTRAINT pk_products      PRIMARY KEY (id),
  CONSTRAINT uq_products_sku  UNIQUE (sku),
  CONSTRAINT fk_products_category
    FOREIGN KEY (category_id) REFERENCES categories (id)
    ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE INDEX idx_products_category ON products (category_id);

CREATE TABLE orders (
  id          INT            NOT NULL IDENTITY(1,1),
  customer_id INT            NOT NULL,
  order_date  DATE           NOT NULL,
  total       DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  status      NVARCHAR(20)   NOT NULL DEFAULT 'pending',
  notes       NVARCHAR(500),
  created_at  DATETIME2      NOT NULL DEFAULT GETDATE(),
  CONSTRAINT pk_orders          PRIMARY KEY (id),
  CONSTRAINT chk_orders_status  CHECK (status IN ('pending','processing','shipped','delivered','cancelled')),
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE INDEX idx_orders_customer    ON orders (customer_id);
CREATE INDEX idx_orders_date_status ON orders (order_date, status);

CREATE TABLE order_items (
  id         INT           NOT NULL IDENTITY(1,1),
  order_id   INT           NOT NULL,
  product_id INT           NOT NULL,
  quantity   INT           NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  CONSTRAINT pk_order_items  PRIMARY KEY (id),
  CONSTRAINT fk_oi_order
    FOREIGN KEY (order_id)   REFERENCES orders   (id) ON DELETE CASCADE  ON UPDATE NO ACTION,
  CONSTRAINT fk_oi_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE NO ACTION ON UPDATE CASCADE
);

CREATE INDEX idx_oi_order   ON order_items (order_id);
CREATE INDEX idx_oi_product ON order_items (product_id);

-- ── Seed data ────────────────────────────────────────────────

SET IDENTITY_INSERT categories ON;
INSERT INTO categories (id, name, description) VALUES
  (1, 'Electronics',   'Devices and accessories'),
  (2, 'Books',         'Technical and general books'),
  (3, 'Clothing',      'Apparel and accessories'),
  (4, 'Home & Garden', 'Home improvement supplies'),
  (5, 'Sports',        'Equipment and activewear');
SET IDENTITY_INSERT categories OFF;

SET IDENTITY_INSERT customers ON;
INSERT INTO customers (id, name, email, age, balance, is_active, notes) VALUES
  (1,  'Alice Johnson', 'alice@example.com', 29, 1500.00, 1, 'VIP customer, prefers express shipping'),
  (2,  'Bob Smith',     'bob@example.com',   42,  250.50, 1, NULL),
  (3,  'Carol White',   'carol@example.com', 35,    0.00, 0, 'Account suspended pending review'),
  (4,  'David Brown',   'david@example.com', 55,  890.75, 1, NULL),
  (5,  'Eve Davis',     'eve@example.com',   28, 3200.00, 1, 'Newsletter subscriber'),
  (6,  'Frank Miller',  'frank@example.com', 61,  125.00, 1, NULL),
  (7,  'Grace Wilson',  'grace@example.com', 33,    0.00, 1, NULL),
  (8,  'Hank Moore',    'hank@example.com',  47,  670.25, 0, 'Inactive since 2023'),
  (9,  'Ivy Taylor',    'ivy@example.com',   24,   50.00, 1, NULL),
  (10, 'Jack Anderson', 'jack@example.com',  38, 4100.00, 1, 'Corporate account');
SET IDENTITY_INSERT customers OFF;

SET IDENTITY_INSERT products ON;
INSERT INTO products (id, category_id, name, sku, price, stock, weight) VALUES
  (1,  1, 'Laptop Pro 15"',           'ELEC-001', 1299.99,  45, 2.10),
  (2,  1, 'Wireless Mouse',           'ELEC-002',   29.99, 200, 0.10),
  (3,  1, 'USB-C Hub 7-in-1',         'ELEC-003',   49.99, 150, 0.30),
  (4,  1, 'Mechanical Keyboard',      'ELEC-004',   89.99,  75, 1.20),
  (5,  2, 'Clean Code',               'BOOK-001',   39.99,  30, 0.80),
  (6,  2, 'The Pragmatic Programmer', 'BOOK-002',   44.99,  25, 0.70),
  (7,  3, 'Developer Hoodie L',       'CLTH-001',   59.99, 100, 0.60),
  (8,  3, 'Logo T-Shirt M',           'CLTH-002',   24.99, 250, 0.30),
  (9,  4, 'Standing Desk Mat',        'HOME-001',   79.99,  60, 2.50),
  (10, 5, 'Ergonomic Cushion',        'SPRT-001',   34.99,  80, 0.90);
SET IDENTITY_INSERT products OFF;

SET IDENTITY_INSERT orders ON;
INSERT INTO orders (id, customer_id, order_date, total, status) VALUES
  (1, 1,  '2024-01-15', 1359.97, 'delivered'),
  (2, 2,  '2024-02-03',   74.98, 'delivered'),
  (3, 1,  '2024-03-20',   49.99, 'shipped'),
  (4, 4,  '2024-04-11',   84.98, 'processing'),
  (5, 5,  '2024-04-15', 1384.97, 'pending'),
  (6, 10, '2024-04-18',  239.95, 'pending');
SET IDENTITY_INSERT orders OFF;

SET IDENTITY_INSERT order_items ON;
INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES
  (1,  1, 1, 1, 1299.99), (2,  1, 2, 3,   29.99),
  (3,  2, 5, 1,   39.99), (4,  2, 8, 1,   24.99),
  (5,  3, 3, 1,   49.99),
  (6,  4, 5, 1,   39.99), (7,  4, 6, 1,   44.99),
  (8,  5, 1, 1, 1299.99), (9,  5, 4, 1,   89.99),
  (10, 6, 7, 2,   59.99), (11, 6, 9, 1,   79.99), (12, 6, 10, 1, 34.99);
SET IDENTITY_INSERT order_items OFF;
GO

-- ── Database 2 ───────────────────────────────────────────────
CREATE DATABASE arumu_analytics;
GO

USE arumu_analytics;
GO

CREATE TABLE daily_sales (
  id            INT           NOT NULL IDENTITY(1,1),
  sale_date     DATE          NOT NULL,
  revenue       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  order_count   INT           NOT NULL DEFAULT 0,
  new_customers INT           NOT NULL DEFAULT 0,
  CONSTRAINT pk_daily_sales      PRIMARY KEY (id),
  CONSTRAINT uq_daily_sales_date UNIQUE (sale_date)
);

CREATE INDEX idx_daily_sales_revenue ON daily_sales (revenue);

CREATE TABLE traffic_sources (
  id        INT          NOT NULL IDENTITY(1,1),
  name      NVARCHAR(50) NOT NULL,
  visits    INT          NOT NULL DEFAULT 0,
  logged_at DATETIME2    NOT NULL DEFAULT GETDATE(),
  CONSTRAINT pk_traffic_sources PRIMARY KEY (id)
);

INSERT INTO daily_sales (sale_date, revenue, order_count, new_customers) VALUES
  ('2024-04-12', 1234.56, 5, 2),
  ('2024-04-13',  890.00, 3, 1),
  ('2024-04-14', 2100.75, 8, 4),
  ('2024-04-15', 1750.25, 6, 0),
  ('2024-04-16',  430.00, 2, 1);

INSERT INTO traffic_sources (name, visits) VALUES
  ('organic', 1520), ('paid_search', 870), ('social', 340), ('referral', 210), ('direct', 640);
GO
