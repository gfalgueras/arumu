-- Oracle seed data — executed as arumu_test user inside the test beforeAll.
-- No schema prefix needed (current user = ARUMU_TEST).

CREATE TABLE categories (
  id          NUMBER        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        VARCHAR2(100) NOT NULL UNIQUE,
  description CLOB,
  created_at  TIMESTAMP     DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE customers (
  id         NUMBER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR2(150)  NOT NULL,
  email      VARCHAR2(255)  NOT NULL UNIQUE,
  age        NUMBER(3),
  balance    NUMBER(10,2)   DEFAULT 0.00 NOT NULL,
  is_active  NUMBER(1)      DEFAULT 1 NOT NULL CHECK (is_active IN (0,1)),
  notes      CLOB,
  created_at TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL,
  updated_at TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE INDEX idx_customers_name ON customers (name);

CREATE TABLE products (
  id          NUMBER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id NUMBER         NOT NULL
                             CONSTRAINT fk_products_category
                               REFERENCES categories (id)
                               ON DELETE SET NULL,
  name        VARCHAR2(200)  NOT NULL,
  sku         VARCHAR2(50)   NOT NULL UNIQUE,
  price       NUMBER(10,2)   NOT NULL,
  stock       NUMBER(10)     DEFAULT 0 NOT NULL,
  weight      FLOAT,
  is_active   NUMBER(1)      DEFAULT 1 NOT NULL,
  created_at  TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE INDEX idx_products_category ON products (category_id);

CREATE TABLE orders (
  id          NUMBER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id NUMBER         NOT NULL
                             CONSTRAINT fk_orders_customer
                               REFERENCES customers (id),
  order_date  DATE           NOT NULL,
  total       NUMBER(10,2)   DEFAULT 0 NOT NULL,
  status      VARCHAR2(20)   DEFAULT 'pending' NOT NULL
                             CONSTRAINT chk_orders_status
                               CHECK (status IN ('pending','processing','shipped','delivered','cancelled')),
  notes       VARCHAR2(500),
  created_at  TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE INDEX idx_orders_customer    ON orders (customer_id);
CREATE INDEX idx_orders_date_status ON orders (order_date, status);

CREATE TABLE order_items (
  id         NUMBER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id   NUMBER         NOT NULL
                            CONSTRAINT fk_oi_order
                              REFERENCES orders (id) ON DELETE CASCADE,
  product_id NUMBER         NOT NULL
                            CONSTRAINT fk_oi_product
                              REFERENCES products (id),
  quantity   NUMBER(10)     DEFAULT 1 NOT NULL,
  unit_price NUMBER(10,2)   NOT NULL
);

CREATE INDEX idx_oi_order   ON order_items (order_id);
CREATE INDEX idx_oi_product ON order_items (product_id);

INSERT INTO categories (name, description) VALUES ('Electronics',   'Devices and accessories');
INSERT INTO categories (name, description) VALUES ('Books',         'Technical and general books');
INSERT INTO categories (name, description) VALUES ('Clothing',      'Apparel and accessories');
INSERT INTO categories (name, description) VALUES ('Home & Garden', 'Home improvement supplies');
INSERT INTO categories (name, description) VALUES ('Sports',        'Equipment and activewear');

INSERT INTO customers (name, email, age, balance, is_active, notes) VALUES ('Alice Johnson', 'alice@example.com', 29, 1500.00, 1, 'VIP customer, prefers express shipping');
INSERT INTO customers (name, email, age, balance, is_active, notes) VALUES ('Bob Smith',     'bob@example.com',   42,  250.50, 1, NULL);
INSERT INTO customers (name, email, age, balance, is_active, notes) VALUES ('Carol White',   'carol@example.com', 35,    0.00, 0, 'Account suspended pending review');
INSERT INTO customers (name, email, age, balance, is_active, notes) VALUES ('David Brown',   'david@example.com', 55,  890.75, 1, NULL);
INSERT INTO customers (name, email, age, balance, is_active, notes) VALUES ('Eve Davis',     'eve@example.com',   28, 3200.00, 1, 'Newsletter subscriber');
INSERT INTO customers (name, email, age, balance, is_active, notes) VALUES ('Frank Miller',  'frank@example.com', 61,  125.00, 1, NULL);
INSERT INTO customers (name, email, age, balance, is_active, notes) VALUES ('Grace Wilson',  'grace@example.com', 33,    0.00, 1, NULL);
INSERT INTO customers (name, email, age, balance, is_active, notes) VALUES ('Hank Moore',    'hank@example.com',  47,  670.25, 0, 'Inactive since 2023');
INSERT INTO customers (name, email, age, balance, is_active, notes) VALUES ('Ivy Taylor',    'ivy@example.com',   24,   50.00, 1, NULL);
INSERT INTO customers (name, email, age, balance, is_active, notes) VALUES ('Jack Anderson', 'jack@example.com',  38, 4100.00, 1, 'Corporate account');

INSERT INTO products (category_id, name, sku, price, stock, weight) VALUES (1, 'Laptop Pro 15"',           'ELEC-001', 1299.99,  45, 2.10);
INSERT INTO products (category_id, name, sku, price, stock, weight) VALUES (1, 'Wireless Mouse',           'ELEC-002',   29.99, 200, 0.10);
INSERT INTO products (category_id, name, sku, price, stock, weight) VALUES (1, 'USB-C Hub 7-in-1',         'ELEC-003',   49.99, 150, 0.30);
INSERT INTO products (category_id, name, sku, price, stock, weight) VALUES (1, 'Mechanical Keyboard',      'ELEC-004',   89.99,  75, 1.20);
INSERT INTO products (category_id, name, sku, price, stock, weight) VALUES (2, 'Clean Code',               'BOOK-001',   39.99,  30, 0.80);
INSERT INTO products (category_id, name, sku, price, stock, weight) VALUES (2, 'The Pragmatic Programmer', 'BOOK-002',   44.99,  25, 0.70);
INSERT INTO products (category_id, name, sku, price, stock, weight) VALUES (3, 'Developer Hoodie L',       'CLTH-001',   59.99, 100, 0.60);
INSERT INTO products (category_id, name, sku, price, stock, weight) VALUES (3, 'Logo T-Shirt M',           'CLTH-002',   24.99, 250, 0.30);
INSERT INTO products (category_id, name, sku, price, stock, weight) VALUES (4, 'Standing Desk Mat',        'HOME-001',   79.99,  60, 2.50);
INSERT INTO products (category_id, name, sku, price, stock, weight) VALUES (5, 'Ergonomic Cushion',        'SPRT-001',   34.99,  80, 0.90);

INSERT INTO orders (customer_id, order_date, total, status) VALUES (1,  DATE '2024-01-15', 1359.97, 'delivered');
INSERT INTO orders (customer_id, order_date, total, status) VALUES (2,  DATE '2024-02-03',   74.98, 'delivered');
INSERT INTO orders (customer_id, order_date, total, status) VALUES (1,  DATE '2024-03-20',   49.99, 'shipped');
INSERT INTO orders (customer_id, order_date, total, status) VALUES (4,  DATE '2024-04-11',   84.98, 'processing');
INSERT INTO orders (customer_id, order_date, total, status) VALUES (5,  DATE '2024-04-15', 1384.97, 'pending');
INSERT INTO orders (customer_id, order_date, total, status) VALUES (10, DATE '2024-04-18',  239.95, 'pending');

INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (1, 1, 1, 1299.99);
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (1, 2, 3,   29.99);
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (2, 5, 1,   39.99);
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (2, 8, 1,   24.99);
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (3, 3, 1,   49.99);
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (4, 5, 1,   39.99);
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (4, 6, 1,   44.99);
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (5, 1, 1, 1299.99);
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (5, 4, 1,   89.99);
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (6, 7, 2,   59.99);
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (6, 9, 1,   79.99);
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (6, 10, 1,  34.99);

COMMIT;
