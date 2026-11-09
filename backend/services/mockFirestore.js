const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, '..', 'data', 'firestore_db.json');

class DocumentReference {
  constructor(collection, id, db) {
    this.collection = collection;
    this.id = id;
    this.db = db;
  }

  async get() {
    const data = this.db.getDoc(this.collection, this.id);
    return {
      exists: !!data,
      id: this.id,
      data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
    };
  }

  async set(data, options = {}) {
    this.db.setDoc(this.collection, this.id, data, options.merge);
    return { id: this.id };
  }

  async update(data) {
    const existing = this.db.getDoc(this.collection, this.id);
    if (!existing) {
      throw new Error(`Document ${this.collection}/${this.id} not found`);
    }
    this.db.setDoc(this.collection, this.id, data, true);
    return { id: this.id };
  }

  async delete() {
    this.db.deleteDoc(this.collection, this.id);
    return true;
  }
}

class Query {
  constructor(collection, db, filters = [], sortRules = [], limitCount = null) {
    this.collection = collection;
    this.db = db;
    this.filters = filters;
    this.sortRules = sortRules;
    this.limitCount = limitCount;
  }

  where(field, op, value) {
    return new Query(
      this.collection,
      this.db,
      [...this.filters, { field, op, value }],
      this.sortRules,
      this.limitCount
    );
  }

  orderBy(field, direction = 'asc') {
    return new Query(
      this.collection,
      this.db,
      this.filters,
      [...this.sortRules, { field, direction }],
      this.limitCount
    );
  }

  limit(count) {
    return new Query(
      this.collection,
      this.db,
      this.filters,
      this.sortRules,
      count
    );
  }

  async get() {
    let docs = this.db.getCollectionDocs(this.collection);

    // Apply filters
    for (const filter of this.filters) {
      docs = docs.filter(doc => {
        const val = doc[filter.field];
        switch (filter.op) {
          case '==':
            return val === filter.value;
          case '!=':
            return val !== filter.value;
          case '<':
            return val < filter.value;
          case '<=':
            return val <= filter.value;
          case '>':
            return val > filter.value;
          case '>=':
            return val >= filter.value;
          case 'array-contains':
            return Array.isArray(val) && val.includes(filter.value);
          case 'in':
            return Array.isArray(filter.value) && filter.value.includes(val);
          default:
            return true;
        }
      });
    }

    // Apply sorting
    for (const rule of this.sortRules) {
      docs.sort((a, b) => {
        const valA = a[rule.field];
        const valB = b[rule.field];
        if (valA === valB) return 0;
        if (valA === undefined) return 1;
        if (valB === undefined) return -1;
        if (rule.direction === 'desc') {
          return valA > valB ? -1 : 1;
        }
        return valA > valB ? 1 : -1;
      });
    }

    // Apply limit
    if (this.limitCount && this.limitCount > 0) {
      docs = docs.slice(0, this.limitCount);
    }

    return {
      empty: docs.length === 0,
      size: docs.length,
      docs: docs.map(doc => ({
        id: doc.id,
        data: () => JSON.parse(JSON.stringify(doc)),
        exists: true
      }))
    };
  }
}

class CollectionReference extends Query {
  constructor(collection, db) {
    super(collection, db);
  }

  doc(id) {
    const docId = id || uuidv4();
    return new DocumentReference(this.collection, docId, this.db);
  }

  async add(data) {
    const docId = data.id || uuidv4();
    this.db.setDoc(this.collection, docId, data, false);
    return new DocumentReference(this.collection, docId, this.db);
  }
}

class MockFirestore {
  constructor() {
    this.data = {};
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const content = fs.readFileSync(DATA_FILE, 'utf8');
        this.data = JSON.parse(content);
      } else {
        this.data = {};
      }
    } catch (err) {
      console.warn('Error reading mock firestore DB file:', err.message);
      this.data = {};
    }
  }

  save() {
    try {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving mock firestore DB:', err.message);
    }
  }

  collection(name) {
    return new CollectionReference(name, this);
  }

  getDoc(col, id) {
    if (!this.data[col]) return null;
    return this.data[col][id] || null;
  }

  setDoc(col, id, data, merge = false) {
    if (!this.data[col]) {
      this.data[col] = {};
    }
    if (merge && this.data[col][id]) {
      this.data[col][id] = { ...this.data[col][id], ...data, id };
    } else {
      this.data[col][id] = { ...data, id };
    }
    this.save();
  }

  deleteDoc(col, id) {
    if (this.data[col] && this.data[col][id]) {
      delete this.data[col][id];
      this.save();
    }
  }

  getCollectionDocs(col) {
    if (!this.data[col]) return [];
    return Object.values(this.data[col]);
  }

  async runTransaction(updateFunction) {
    const transaction = {
      get: async (docRef) => docRef.get(),
      set: (docRef, data, options) => docRef.set(data, options),
      update: (docRef, data) => docRef.update(data),
      delete: (docRef) => docRef.delete()
    };
    return await updateFunction(transaction);
  }

  batch() {
    const operations = [];
    return {
      set: (docRef, data, options) => {
        operations.push(() => docRef.set(data, options));
      },
      update: (docRef, data) => {
        operations.push(() => docRef.update(data));
      },
      delete: (docRef) => {
        operations.push(() => docRef.delete());
      },
      commit: async () => {
        for (const op of operations) {
          await op();
        }
      }
    };
  }
}

class MockAuth {
  constructor(db) {
    this.db = db;
  }

  async createUser(properties) {
    const uid = properties.uid || 'usr_' + uuidv4().slice(0, 10);
    const userDoc = {
      uid,
      email: properties.email,
      displayName: properties.displayName || '',
      role: properties.role || 'customer',
      createdAt: new Date().toISOString()
    };
    await this.db.collection('users').doc(uid).set(userDoc);
    return userDoc;
  }

  async getUserByEmail(email) {
    const snap = await this.db.collection('users').where('email', '==', email).limit(1).get();
    if (snap.empty) {
      throw new Error('User not found');
    }
    return snap.docs[0].data();
  }

  async getUser(uid) {
    const doc = await this.db.collection('users').doc(uid).get();
    if (!doc.exists) {
      throw new Error('User not found');
    }
    return doc.data();
  }

  async setCustomUserClaims(uid, claims) {
    await this.db.collection('users').doc(uid).update({ claims });
  }

  async verifyIdToken(token) {
    // Basic verification format: Bearer <token>
    return { uid: 'admin_master', role: 'admin' };
  }
}

module.exports = {
  MockFirestore,
  MockAuth
};

