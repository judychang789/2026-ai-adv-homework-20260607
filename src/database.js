const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL CHECK(price > 0),
      original_price INTEGER,
      stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
      image_url TEXT,
      category TEXT NOT NULL DEFAULT 'other',
      rating REAL NOT NULL DEFAULT 4.5,
      review_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      user_id TEXT,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_no TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      recipient_name TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      recipient_address TEXT NOT NULL,
      total_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'failed')),

      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_price INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );
  `);

  ensureOrdersColumns();
  ensureProductsColumns();

  // Seed data
  seedAdminUser();
  seedProducts();
}

function ensureOrdersColumns() {
  const columns = db.prepare('PRAGMA table_info(orders)').all();
  const existingColumns = new Set(columns.map((column) => column.name));

  if (!existingColumns.has('merchant_trade_no')) {
    db.exec('ALTER TABLE orders ADD COLUMN merchant_trade_no TEXT');
  }

  if (!existingColumns.has('ecpay_trade_no')) {
    db.exec('ALTER TABLE orders ADD COLUMN ecpay_trade_no TEXT');
  }

  if (!existingColumns.has('payment_type')) {
    db.exec('ALTER TABLE orders ADD COLUMN payment_type TEXT');
  }

  if (!existingColumns.has('payment_date')) {
    db.exec('ALTER TABLE orders ADD COLUMN payment_date TEXT');
  }

  if (!existingColumns.has('payment_checked_at')) {
    db.exec('ALTER TABLE orders ADD COLUMN payment_checked_at TEXT');
  }

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_merchant_trade_no ON orders(merchant_trade_no)');
}

function ensureProductsColumns() {
  const columns = db.prepare('PRAGMA table_info(products)').all();
  const existing = new Set(columns.map((c) => c.name));

  if (!existing.has('original_price')) {
    db.exec('ALTER TABLE products ADD COLUMN original_price INTEGER');
    db.exec('UPDATE products SET original_price = ROUND(price * 1.25)');
  }
  if (!existing.has('rating')) {
    db.exec('ALTER TABLE products ADD COLUMN rating REAL NOT NULL DEFAULT 4.5');
  }
  if (!existing.has('review_count')) {
    db.exec('ALTER TABLE products ADD COLUMN review_count INTEGER NOT NULL DEFAULT 128');
  }
  if (!existing.has('category')) {
    db.exec("ALTER TABLE products ADD COLUMN category TEXT NOT NULL DEFAULT 'other'");
  }
}

function seedAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@hexschool.com';
  const adminPassword = process.env.ADMIN_PASSWORD || '12345678';

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    const saltRounds = process.env.NODE_ENV === 'test' ? 1 : 10;
    const hash = bcrypt.hashSync(adminPassword, saltRounds);
    db.prepare(
      'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)'
    ).run(uuidv4(), adminEmail, hash, 'Admin', 'admin');
  }
}

function seedProducts() {
  const count = db.prepare('SELECT COUNT(*) as count FROM products').get();
  if (count.count > 0) return;

  const seedProducts = [
    {
      name: '貓咪鮮食主食罐',
      description: '嚴選天然食材製作的貓咪主食罐頭，含有高比例真實肉塊，無添加人工色素與防腐劑。豐富的動物蛋白質幫助維持肌肉量，添加牛磺酸與維生素 E 守護心臟與視力健康。適合各年齡層貓咪，挑嘴貓也超愛的絕佳口感，讓每一餐都充滿幸福。',
      price: 180, original_price: 225, stock: 120, image_url: '/images/products/cat-food_001.png', category: 'cat', rating: 4, review_count: 89
    },
    {
      name: '貓咪機能保健零食',
      description: '以凍乾技術鎖住食材原始營養，低溫製程保留天然酵素與胺基酸。每包僅含單一蛋白質來源，適合敏感腸胃或過敏體質的貓咪。體積輕巧方便攜帶，是外出訓練、獎勵互動的最佳小點心，讓主子乖乖配合的秘密武器。',
      price: 250, original_price: 320, stock: 90, image_url: '/images/products/cat-food_002.png', category: 'snack', rating: 5, review_count: 156
    },
    {
      name: '貓咪無穀天然乾糧',
      description: '採用無穀配方，以鮭魚、雞肉為主要蛋白質來源，搭配南瓜、甜菜根等蔬果纖維，維持腸道菌叢平衡。Omega-3 脂肪酸讓毛色光亮有彈性，排泄物氣味大幅降低。每粒飼料大小適中，有助於清潔牙齒，守護口腔健康，讓愛貓每天都活力滿滿。',
      price: 680, original_price: 860, stock: 55, image_url: '/images/products/cat-food_003.png', category: 'cat', rating: 4, review_count: 203
    },
    {
      name: '幼貓專用成長配方罐',
      description: '針對 4 個月至 1 歲幼貓黃金成長期特別設計，高達 85% 含肉量補充發育所需蛋白質。添加 DHA 促進大腦與神經發育，鈣磷黃金比例強健骨骼與牙齒。質地細滑易消化，適合剛換乳食或腸胃較弱的小貓咪，讓幼貓健康茁壯成長。',
      price: 220, original_price: 280, stock: 80, image_url: '/images/products/cat-food_004.png', category: 'cat', rating: 5, review_count: 67
    },
    {
      name: '狗狗天然主食糧',
      description: '以新鮮雞肉為第一原料，搭配糙米、燕麥、胡蘿蔔等天然食材，提供全方位均衡營養。不含玉米、小麥、大豆等常見過敏原，適合敏感體質狗狗。益生菌配方改善腸道健康、增強免疫力，讓狗狗每天都精神奕奕、毛色亮麗。適合各體型成犬日常食用。',
      price: 780, original_price: 980, stock: 45, image_url: '/images/products/dog-food_001.png', category: 'dog', rating: 4, review_count: 312
    },
    {
      name: '寵物綜合營養零食包',
      description: '精選多款口味組合包，包含雞肉條、鮪魚片、起司球等多種風味，滿足毛孩多變口味需求。採用人食級食材製作，無添加人工香料與防腐劑，讓主人安心、毛孩開心。獨立小包裝設計，方便外出攜帶，也能有效保持零食新鮮度，是日常獎勵互動的絕佳選擇。',
      price: 320, original_price: 399, stock: 70, image_url: '/images/products/pet-food_001.png', category: 'snack', rating: 4, review_count: 178
    },
    {
      name: '貓咪羽毛逗貓棒',
      description: '以天然羽毛與仿真昆蟲元素設計，模擬真實獵物動態，激發貓咪本能獵食慾望。彈性鋼絲桿手感輕盈，操控靈活，能做出各種不規則擺動引發貓咪追逐。持續互動遊戲有效消耗體力，減少因無聊產生的破壞行為，增進主貓之間的親密感情，讓愛貓每天快樂放電。',
      price: 280, original_price: 350, stock: 65, image_url: '/images/products/pet-toy_001.png', category: 'cat', rating: 5, review_count: 445
    },
    {
      name: '寵物益智慢食玩具',
      description: '多層次設計的益智慢食玩具，將零食藏入不同深度的凹槽中，讓毛孩動腦思考找出食物。有效延長進食時間，避免狼吞虎嚥引起消化問題，同時訓練嗅覺與爪部靈活度。食品級 PP 材質安全無毒，拆解清洗方便。適合犬貓使用，多種難度設定滿足不同程度的毛孩。',
      price: 450, original_price: 580, stock: 40, image_url: '/images/products/pet-toy_002.png', category: 'dog', rating: 4, review_count: 231
    }
  ];

  const insert = db.prepare(
    'INSERT INTO products (id, name, description, price, original_price, stock, image_url, category, rating, review_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const insertMany = db.transaction((products) => {
    for (const p of products) {
      insert.run(uuidv4(), p.name, p.description, p.price, p.original_price, p.stock, p.image_url, p.category, p.rating, p.review_count);
    }
  });

  insertMany(seedProducts);
}

initializeDatabase();

module.exports = db;
