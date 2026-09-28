// Storage layer: MongoDB (for production, data persists) or local JSON files (for local testing).
// Both expose the same small async API so the rest of the app doesn't care which one is used.
const fs = require('fs');
const path = require('path');

// ---------- tiny query matcher used by the file store ----------
function matchValue(val, cond) {
  if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
    for (const [op, arg] of Object.entries(cond)) {
      if (op === '$in') { if (Array.isArray(val) ? !val.some(v => arg.includes(v)) : !arg.includes(val)) return false; }
      else if (op === '$ne') { if (val === arg) return false; }
      else if (op === '$lt') { if (!(val < arg)) return false; }
      else if (op === '$gt') { if (!(val > arg)) return false; }
      else if (op === '$lte') { if (!(val <= arg)) return false; }
      else if (op === '$gte') { if (!(val >= arg)) return false; }
      else return false;
    }
    return true;
  }
  if (Array.isArray(val)) return val.includes(cond);
  return val === cond;
}
function matches(doc, query = {}) {
  for (const [k, cond] of Object.entries(query)) {
    if (k === '$or') { if (!cond.some(q => matches(doc, q))) return false; continue; }
    if (!matchValue(doc[k], cond)) return false;
  }
  return true;
}
function applySort(list, sort) {
  if (!sort) return list;
  const [[key, dir]] = Object.entries(sort);
  return list.sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
}
const clone = o => JSON.parse(JSON.stringify(o));

class FileStore {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    this.filesDir = path.join(dir, 'files');
    this.data = {};
    this.saveTimer = null;
    this.kind = 'file';
  }
  async init() {
    fs.mkdirSync(this.filesDir, { recursive: true });
    if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
  }
  col(name) { return (this.data[name] ||= []); }
  persist() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    }, 150);
  }
  async find(name, query = {}, opts = {}) {
    let list = this.col(name).filter(d => matches(d, query));
    list = applySort(list, opts.sort);
    if (opts.limit) list = list.slice(0, opts.limit);
    return clone(list);
  }
  async findOne(name, query) { const d = this.col(name).find(x => matches(x, query)); return d ? clone(d) : null; }
  async count(name, query = {}) { return this.col(name).filter(d => matches(d, query)).length; }
  async insert(name, doc) { this.col(name).push(clone(doc)); this.persist(); return doc; }
  async replace(name, id, doc) {
    const list = this.col(name); const i = list.findIndex(d => d._id === id);
    if (i === -1) list.push(clone(doc)); else list[i] = clone(doc);
    this.persist(); return doc;
  }
  async remove(name, query) {
    const list = this.col(name); const keep = list.filter(d => !matches(d, query));
    this.data[name] = keep; this.persist(); return list.length - keep.length;
  }
  async putFile(meta, buffer) {
    fs.writeFileSync(path.join(this.filesDir, meta._id), buffer);
    await this.insert('files', meta); return meta;
  }
  async getFile(id) {
    const meta = await this.findOne('files', { _id: id });
    if (!meta) return null;
    const p = path.join(this.filesDir, id);
    if (!fs.existsSync(p)) return null;
    return { meta, buffer: fs.readFileSync(p) };
  }
  async updateFileMeta(id, patch) {
    const meta = await this.findOne('files', { _id: id }); if (!meta) return;
    await this.replace('files', id, { ...meta, ...patch });
  }
}

class MongoStore {
  constructor(uri, dbName) { this.uri = uri; this.dbName = dbName; this.kind = 'mongo'; }
  async init() {
    const { MongoClient } = require('mongodb');
    this.client = new MongoClient(this.uri, { serverSelectionTimeoutMS: 15000 });
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    await this.db.collection('messages').createIndex({ group: 1, ts: -1 }).catch(() => {});
    await this.db.collection('notifications').createIndex({ to: 1, ts: -1 }).catch(() => {});
  }
  c(name) { return this.db.collection(name); }
  async find(name, query = {}, opts = {}) {
    let cur = this.c(name).find(query, { projection: name === 'files' ? { data: 0 } : undefined });
    if (opts.sort) cur = cur.sort(opts.sort);
    if (opts.limit) cur = cur.limit(opts.limit);
    return cur.toArray();
  }
  async findOne(name, query) { return this.c(name).findOne(query, { projection: name === 'files' ? { data: 0 } : undefined }); }
  async count(name, query = {}) { return this.c(name).countDocuments(query); }
  async insert(name, doc) { await this.c(name).insertOne({ ...doc }); return doc; }
  async replace(name, id, doc) { await this.c(name).replaceOne({ _id: id }, doc, { upsert: true }); return doc; }
  async remove(name, query) { const r = await this.c(name).deleteMany(query); return r.deletedCount; }
  async putFile(meta, buffer) {
    const { Binary } = require('mongodb');
    await this.c('files').insertOne({ ...meta, data: new Binary(buffer) });
    return meta;
  }
  async getFile(id) {
    const doc = await this.c('files').findOne({ _id: id });
    if (!doc) return null;
    const { data, ...meta } = doc;
    return { meta, buffer: Buffer.from(data.buffer) };
  }
  async updateFileMeta(id, patch) { await this.c('files').updateOne({ _id: id }, { $set: patch }); }
}

async function createStore() {
  const uri = process.env.MONGODB_URI;
  const store = uri
    ? new MongoStore(uri, process.env.MONGODB_DB || 'fll_platform')
    : new FileStore(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
  await store.init();
  return store;
}

module.exports = { createStore, matches };
