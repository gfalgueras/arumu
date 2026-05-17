-- ============================================================
-- Arumu test data — MySQL
-- Two databases to test sidebar navigation / DB switching
-- ============================================================

CREATE DATABASE IF NOT EXISTS arumu_test   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS arumu_analytics CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── arumu_test ───────────────────────────────────────────────
USE arumu_test;

CREATE TABLE categories (
  id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100)    NOT NULL,
  description TEXT,
  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name)
) ENGINE=InnoDB COMMENT='Product categories';

CREATE TABLE customers (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name       VARCHAR(150)  NOT NULL,
  email      VARCHAR(255)  NOT NULL,
  age        TINYINT UNSIGNED,
  balance    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  is_active  TINYINT(1)    NOT NULL DEFAULT 1,
  notes      TEXT,
  created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_email (email),
  KEY idx_customers_name (name),
  FULLTEXT KEY ft_customers_notes (notes)
) ENGINE=InnoDB COMMENT='Application customers';

CREATE TABLE products (
  id          INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  category_id INT UNSIGNED   NOT NULL,
  name        VARCHAR(200)   NOT NULL,
  sku         VARCHAR(50)    NOT NULL,
  price       DECIMAL(10,2)  NOT NULL,
  stock       INT            NOT NULL DEFAULT 0,
  weight      FLOAT UNSIGNED,
  is_active   TINYINT(1)     NOT NULL DEFAULT 1,
  created_at  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_sku (sku),
  KEY idx_products_category (category_id),
  CONSTRAINT fk_products_category
    FOREIGN KEY (category_id) REFERENCES categories (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE orders (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED  NOT NULL,
  order_date  DATE          NOT NULL,
  total       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status      ENUM('pending','processing','shipped','delivered','cancelled') NOT NULL DEFAULT 'pending',
  notes       VARCHAR(500),
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_orders_customer (customer_id),
  KEY idx_orders_date_status (order_date, status),
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id          INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  order_id    INT UNSIGNED   NOT NULL,
  product_id  INT UNSIGNED   NOT NULL,
  quantity    INT            NOT NULL DEFAULT 1,
  unit_price  DECIMAL(10,2)  NOT NULL,
  PRIMARY KEY (id),
  KEY idx_oi_order (order_id),
  KEY idx_oi_product (product_id),
  CONSTRAINT fk_oi_order
    FOREIGN KEY (order_id)   REFERENCES orders (id)   ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT fk_oi_product
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ── Seed data ────────────────────────────────────────────────

INSERT INTO categories (name, description) VALUES
  ('Electronics',  'Devices and accessories'),
  ('Books',        'Technical and general books'),
  ('Clothing',     'Apparel and accessories'),
  ('Home & Garden','Home improvement supplies'),
  ('Sports',       'Equipment and activewear');

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
  (1, 'Laptop Pro 15"',          'ELEC-001', 1299.99,  45, 2.10),
  (1, 'Wireless Mouse',          'ELEC-002',   29.99, 200, 0.10),
  (1, 'USB-C Hub 7-in-1',        'ELEC-003',   49.99, 150, 0.30),
  (1, 'Mechanical Keyboard',     'ELEC-004',   89.99,  75, 1.20),
  (2, 'Clean Code',              'BOOK-001',   39.99,  30, 0.80),
  (2, 'The Pragmatic Programmer','BOOK-002',   44.99,  25, 0.70),
  (3, 'Developer Hoodie L',      'CLTH-001',   59.99, 100, 0.60),
  (3, 'Logo T-Shirt M',          'CLTH-002',   24.99, 250, 0.30),
  (4, 'Standing Desk Mat',       'HOME-001',   79.99,  60, 2.50),
  (5, 'Ergonomic Cushion',       'SPRT-001',   34.99,  80, 0.90);

INSERT INTO orders (customer_id, order_date, total, status) VALUES
  (1, '2024-01-15', 1359.97, 'delivered'),
  (2, '2024-02-03',   74.98, 'delivered'),
  (1, '2024-03-20',   49.99, 'shipped'),
  (4, '2024-04-11',   84.98, 'processing'),
  (5, '2024-04-15', 1384.97, 'pending'),
  (10,'2024-04-18',  239.95, 'pending');

INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
  (1, 1, 1, 1299.99), (1, 2, 3,   29.99),
  (2, 5, 1,   39.99), (2, 8, 1,   24.99),
  (3, 3, 1,   49.99),
  (4, 5, 1,   39.99), (4, 6, 1,   44.99),
  (5, 1, 1, 1299.99), (5, 4, 1,   89.99),
  (6, 7, 2,   59.99), (6, 9, 1,   79.99), (6, 10, 1, 34.99);

-- ── arumu_analytics ──────────────────────────────────────────
USE arumu_analytics;

CREATE TABLE daily_sales (
  id           INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  sale_date    DATE           NOT NULL,
  revenue      DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
  order_count  INT            NOT NULL DEFAULT 0,
  new_customers INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_daily_sales_date (sale_date),
  KEY idx_daily_sales_revenue (revenue)
) ENGINE=InnoDB;

CREATE TABLE traffic_sources (
  id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name   VARCHAR(50)  NOT NULL,
  visits INT          NOT NULL DEFAULT 0,
  logged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

INSERT INTO daily_sales (sale_date, revenue, order_count, new_customers) VALUES
  ('2024-04-12', 1234.56, 5, 2),
  ('2024-04-13',  890.00, 3, 1),
  ('2024-04-14', 2100.75, 8, 4),
  ('2024-04-15', 1750.25, 6, 0),
  ('2024-04-16',  430.00, 2, 1);

INSERT INTO traffic_sources (name, visits) VALUES
  ('organic', 1520), ('paid_search', 870), ('social', 340), ('referral', 210), ('direct', 640);
